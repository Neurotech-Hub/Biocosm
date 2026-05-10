# BLE Scan / Advertising Implementation Overview

**Audience:** code review agent comparing this simulator to real collar firmware and hardware.

**Purpose:** document how scan vs advertisement timing, overlap detection, and user-visible controls are implemented so you can flag overestimation, missing failure modes, and calibration targets.

---

## Where the logic lives

| Concern | Primary file(s) |
|--------|------------------|
| Burst scheduling (serial scan vs advertise) | [`src/simulation/radio.ts`](../src/simulation/radio.ts) |
| Per-epoch orchestration, burst generation, detection call | [`src/simulation/engine.ts`](../src/simulation/engine.ts) |
| Policy timing written onto collars | [`src/simulation/policies/fixedRate.ts`](../src/simulation/policies/fixedRate.ts), [`src/simulation/policies/adaptive.ts`](../src/simulation/policies/adaptive.ts) |
| Default intervals / radio model params | [`src/simulation/config.ts`](../src/simulation/config.ts) |
| UI: BLE and policy controls | [`src/components/ControlsPanel.tsx`](../src/components/ControlsPanel.tsx) |
| Energy (baseline × collars, listen RX, µC/adv events) | [`src/simulation/energy.ts`](../src/simulation/energy.ts), [`radio.ts`](../src/simulation/radio.ts) (burst → listen windows / packet grid) |
| Firmware-minute aggregation (metrics) | [`src/simulation/analysis.ts`](../src/simulation/analysis.ts) (`buildFirmwareMinuteRecords`) |
| Review feedback (Juxta energy calibration) | [`juxta_ble_energy_model_mismatch_feedback.md`](juxta_ble_energy_model_mismatch_feedback.md) |

---

## Simulation time step vs radio detail

- The **main step** is `config.timeStepSeconds` (default **60 s**). Each `stepSimulation` advances one such epoch.
- BLE activity for that epoch is simulated on a **sub-epoch timeline** from `epochStart = time - dtSeconds` to `epochEnd = time` (so by default a 60 s window).
- `radioStepSeconds` exists on config but burst construction does **not** iterate in 1 s engine steps; fine structure is encoded inside `radio.ts` (listen windows, packet spacing).

---

## Serial scan vs advertise (burst state machine)

Implemented in `createBleBurstEvents` in [`radio.ts`](../src/simulation/radio.ts).

- Each valid collar alternates **one activity at a time**: the next event is either a **scan burst** or an **advertise burst**, whichever is due first (`scanDueAt` vs `advDueAt`). **Tie:** `scanDueAt <= advDueAt` chooses scan, matching scan-first firmware checks.
- After each burst, `cursor` advances by `bleScheduling.interBurstDelaySeconds` plus deterministic jitter in `[bleScheduling.randomPostIdleJitterMinSeconds, randomPostIdleJitterMaxSeconds]`.
- **Scan burst duration** uses `animal.collar.scanWindowSeconds` (policy-dependent).
- **Advertise burst duration** uses `animal.collar.advertisingBurstDurationSeconds` (from fixed or adaptive policy, default **2 s**).
- After an **advertise** burst, the next **scan** start is delayed by `bleScheduling.scanPreStartRadioStabilizationSeconds` (default **200 ms**), matching radio settle time before scanning.
- **Next due times** use `lastScanTime` / `lastAdvTime` maintained on the collar; scheduling is interval-based from end of prior burst.

**`BleSchedulingConfig`** (on [`SimulationConfig`](../src/simulation/types.ts)) holds inter-burst delay, post-idle jitter range, minute safe-zone width, and scan pre-start delay.

**JUXTA `main.c` default fixed policy** — [`juxtaMainCMode0FixedPolicy`](../src/simulation/config.ts) is the default `activePolicy`: 20 s scan interval, 5 s advertise interval, 1.5 s scan window, 2 s advertise burst.

---

## From bursts to “listen windows” and “ad packets”

Constants in [`radio.ts`](../src/simulation/radio.ts):

| Constant | Value | Role |
|---------|-------|------|
| `SCAN_LISTEN_INTERVAL_SECONDS` | 0.05 | spacing of scan sub-windows inside a scan burst |
| `SCAN_LISTEN_WINDOW_SECONDS` | 0.0125 | duration of each listen window |
| `DEFAULT_ADVERTISING_EVENT_INTERVAL_SECONDS` | 0.15 | spacing of synthetic ad packets; must match `EnergyConfig.advertisingEventIntervalSeconds` (`ADVERTISING_PACKET_INTERVAL_SECONDS` is a deprecated alias) |
| `bleScheduling.interBurstDelaySeconds` | 0.1 (default) | gap after a burst before the next scheduling step |

- **Scan:** each `scan` burst is expanded into many short `ScanWindowEvent`s via `createScanListenWindows` (not the whole burst treated as one continuous receiver-on interval at full duty cycle—listen is piecewise).
- **Advertise:** each `advertise` burst generates discrete `AdvertisingEvent` timestamps using `createAdvertisingEventsFromBursts(bursts, config.energy.advertisingEventIntervalSeconds)` (engine passes energy config).

---

## Detection rule (capture condition)

`simulateBleDetections` in [`radio.ts`](../src/simulation/radio.ts) iterates all valid collar pairs (not only dyads in-range at frame end).

1. For observer **A** and peer **B**, find scan listen windows for **A** and ad packet times for **B** (and symmetrically B observing A).
2. **Time overlap:** an ad packet time `t` must satisfy `window.startTime <= t <= window.endTime`.
3. **Distance at `t`:** positions are **linearly interpolated** between the animal snapshot at `epochStart` and `epochEnd` (frame start/end). If interpolated distance exceeds `detectionRadiusMeters`, the hit is skipped.
4. **RF:** RSSI from path loss + noise, then Bernoulli trial via `detectionProbability(rssi)`.
5. **At most one** detection per observer–peer **direction** per epoch (`break` after first successful window for that ordered pair).

**Constants** `SCAN_LISTEN_*` and `DEFAULT_ADVERTISING_EVENT_INTERVAL_SECONDS` are exported from `radio.ts` for tests and energy accounting.

### Firmware-shaped minute records

[`buildFirmwareMinuteRecords`](../src/simulation/analysis.ts) collapses raw detections into wall-clock **minute buckets**: for each observer and minute, **unique peers** with **max RSSI** kept (FRAM-style). Metrics and the metrics panel distinguish this from interval-level BLE capture rate.

There is still **no** explicit model of:

- Channel hopping / advertising channels 37, 38, 39 separately  
- Scanner not seeing all channels every window  
- Connectable vs non-connectable PDU differences  
- CRC / whitelist / MAC filter losses  

So overlap + probabilistic RSSI remains the core “PHY” abstraction (plus linear motion between frame endpoints).

---

## Policies and what they change

### Fixed-rate (`applyFixedRatePolicy`)

- Collar fields set each step from policy: `scanIntervalSeconds`, `scanWindowSeconds`, `advIntervalSeconds`, optional `advertisingBurstDurationSeconds` (default 2 s).
- `scanActive` / `advActive` are forced false here; **actual** active flags for the frame come from `applyBurstState` in `engine.ts` based on whether bursts occurred in that epoch.

### Motion + peer adaptive (`applyMotionPeerAdaptivePolicy`)

- Updates `motionDrive`, `peerDrive`, `samplingDrive` from motion observation and whether this animal was an **observer** in `recentDetections` (previous frame’s detections passed in).
- Maps drive to **shorter intervals / longer windows when more active** via `logInterpolate` / `linearInterpolate` on scan interval, scan window, advertise interval bounds from config (`defaultAdaptivePolicy` in [`config.ts`](../src/simulation/config.ts)).

Adaptive policy still uses the **same** burst generator and detection path as fixed-rate; only the timing parameters change.

---

## Engine hook sequence (per step)

From [`engine.ts`](../src/simulation/engine.ts) (simplified):

1. Move animals, motion sensor, `applyFirmwarePolicy` (sets interval/window/adv-burst parameters on collar).
2. `createBleBurstEvents(animals, policyId, epochStart, epochEnd, config.bleScheduling)`.
3. `applyBurstState`: sets `scanActive` / `advActive` if that animal had any scan vs advertise burst in the epoch (UI / logging).
4. `computeTrueContacts` at frame time (epoch-end positions).
5. `simulateBleDetections(…, bleBursts, advertisingEventIntervalSeconds)` — distance uses interpolated positions between epoch start and end; advertising times use the same interval as energy.
6. Scan window logs for metrics combine scan events with which peers were detected in those windows.
7. `computeEnergyLog`: **one representative collar** (first valid animal): **baseline** `baselineCurrentMicroAmps` × epoch hours; **scan** = RX mA × that collar’s listen-window seconds; **advertising** = packet count × `advEventChargeMicroCoulombs` (`µC / 3_600_000` per mAh), with optional `componentBleActivityScale` on the BLE terms only. **empiricalAverage** uses `measuredSocial5s20sTotalMicroAmps` as total draw minus baseline. See [`juxta_ble_energy_model_mismatch_feedback.md`](juxta_ble_energy_model_mismatch_feedback.md).

---

## Main user controls (BLE-facing)

In [`ControlsPanel.tsx`](../src/components/ControlsPanel.tsx), **Device / BLE** section:

- **Policy type:** fixed-rate vs motion + peer adaptive.
- **Detection radius** and **social radius** (ground-truth geometry for contacts and metrics; not radio “range” alone—RSSI model uses distance). Defaults are **1 m** each for newer devices (`defaultSimulationConfig.radio` in [`config.ts`](../src/simulation/config.ts)).
- **Fixed policy** (when selected): scan interval, scan burst duration, advertise interval, **advertise burst duration** (default timings match JUXTA `main.c` mode 0).
- **Adaptive policy:** exposes motion threshold, peer gain, decay via controls; full adaptive parameter set is in [`config.ts`](../src/simulation/config.ts).

- **Energy / Battery:** TX power (dBm) for labeling; battery, voltage; **baseline µA** per collar; **RX mA** for scan; **advertising event spacing** (must match the synthetic packet grid); **µC/event** for advertising energy; **energy model** (component vs empirical average bench total for 5s/20s). Metrics can warn when the component estimate ≫3× the bench reference for the default Juxta policy.

**Defaults** (from [`config.ts`](../src/simulation/config.ts)):

- Fixed: default is JUXTA mode 0 (`scanIntervalSeconds: 20`, `advIntervalSeconds: 5`, `scanWindowSeconds: 1.5`, `advertisingBurstDurationSeconds: 2`).
- Energy: **Juxta v5/6 preset** (`juxtaV56EnergyPreset`): baseline ~78 µA, RX ~6.4 mA, 13 µC/adv event, 0.15 s event spacing, component model, bench total ~233 µA for 5s/20s (`measuredSocial5s20sTotalMicroAmps`).
- Radio: e.g. `detectionRadiusMeters: 1`, `socialRadiusMeters: 1`, RSSI path loss + logistic detection curve parameters.

Species / biology controls are separate and do **not** change BLE timing except indirectly if you add future coupling (currently they do not).

---

## Metrics that depend on this model

- **BLE capture rate (interval-level)** compares **true in-range dyad intervals** (epoch-end `trueDyads` logs) to detections in that interval.
- **Firmware-minute peer entries** come from [`buildFirmwareMinuteRecords`](../src/simulation/analysis.ts) (unique peers per observer per clock minute, max RSSI).
- Canvas / raw data indicators reflect **detections** (observer had a successful scan hit, peer had an adv time aligned with a listen window—see UI legend and `CanvasVisualizer`).

---

## Likely overestimation / mismatch vectors vs real hardware

Use this list when reconciling with your `main.c` or nRF behavior:

1. **Advertise burst length** is policy-driven (default 2 s, JUXTA preset matches `ADV_BURST_DURATION_MS`).
2. **Regular 0.15 s ad packet grid** may exceed or underestimate your effective packet rate (connection intervals, extended advertising, random backoff).
3. **Scan modeled as repeating 12.5 ms listens every 50 ms** inside the scan burst—real scanner duty cycle, scan window params, and channel map may differ a lot.
4. **Single-channel abstraction:** one timeline overlap ignores three advertising channels and whether the observer was listening on the channel the packet used.
5. **Perfect clock alignment within the epoch:** deterministic jitter is small; real boards have clock drift, scheduler slip, and interrupt latency.
6. **Detection given overlap:** logistic RSSI model may be too optimistic or pessimistic vs your measured PER; there is no retry / missed packet accumulation beyond re-rolling each candidate window/packet pair behavior inside the loop.
7. **At most one detection per observer–peer direction per epoch** (`break` after first hit along ordered pairs).
8. **Collateral “valid collar”** is binary; no partial stick, reset, or stack overflow causing silent scan-off.
9. **Energy** model is parameterized; peak TX mA is not multiplied by full advertise **burst** wall time for the radio term (only packet on-air time × channels).

Further review context: [`ble_firmware_vs_simulator_review.md`](ble_firmware_vs_simulator_review.md).

---

## Suggested review workflow for your agent

1. Map `createBleBurstEvents` scheduling to your firmware’s state machine (who wins scan vs advertise, post-burst delays, intervals).
2. Compare `scanListenIntervalSeconds` / `scanListenWindowSeconds` / `advertisingPacketIntervalSeconds` to your measured or configured radio parameters.
3. Decide whether overlap detection should require channel + PHY parameters, or empirical “probability of hearing one adv during one scan burst” fit from bench data.
4. Validate fixed vs adaptive parameter ranges in UI against what you ship in production.
5. If capture rate is systematically high or low vs field logs, tune RSSI curve, burst durations, or add explicit **miss** terms (collision, duty cycle cap).

---

## File reference quick links

- Burst + detection core: [`../src/simulation/radio.ts`](../src/simulation/radio.ts)
- Epoch wiring: [`../src/simulation/engine.ts`](../src/simulation/engine.ts)
- Policy timing: [`../src/simulation/policies/fixedRate.ts`](../src/simulation/policies/fixedRate.ts), [`../src/simulation/policies/adaptive.ts`](../src/simulation/policies/adaptive.ts)

This document is descriptive only; it is not a specification of correct biology or radio physics.
