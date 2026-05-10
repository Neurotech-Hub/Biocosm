# Biocosm: implementation review (supervisor / agent handoff)

This document summarizes what the Biocosm web simulator implements today, with emphasis on **BLE firmware policies (fixed vs motion + peer adaptive)**, **analysis metrics**, **logging/export**, and **UI**. It is intended for a supervisor or automated review agent. Detailed metric definitions remain in [`ble_capture_rate_and_firmware_policies.md`](ble_capture_rate_and_firmware_policies.md); the adaptive **design** goals are in [`adaptive_ble_policy_core_implementation_spec.md`](adaptive_ble_policy_core_implementation_spec.md).

---

## 1. Executive summary

- **Two BLE policy modes:** **fixed-rate** (constant scan/advertise schedule) and **motion + peer adaptive** (drives + piecewise mapping to the same collar timing fields).
- **Primary comparison metric:** **interval-level BLE capture rate** is unchanged by policy type; it still compares true in-range dyad epochs to **detection events in the same epoch** (see `computeBleCapture` in `src/simulation/analysis.ts`).
- **Adaptive policy** adds **rest drive**, **neutral-anchored timing** (sampling drive `0.5` ↔ Juxta-style neutral schedule), **observer-local peer signal**, **empty-scan peer penalty**, **downscale toggle**, **per-epoch `AdaptiveBlePolicyLog` rows**, and **UI** (presets, advanced controls, sidebar mini panel, time-series plots).
- **Path graph** node placement uses **~2% inset** from enclosure edges (was ~8%–92%), improving use of the configured physical size without changing the number of RNG calls (seed stability / tests).

---

## 2. Fixed-rate BLE policy

- **Type:** `FixedPolicyConfig` (`activePolicy.type === "fixed"`).
- **Behavior:** `applyFixedRatePolicy` copies `scanIntervalSeconds`, `scanWindowSeconds`, `advIntervalSeconds`, and `advertisingBurstDurationSeconds` onto each collar every step.
- **Default reference:** `juxtaMainCMode0FixedPolicy` — 20 s scan interval, 1.5 s scan window, 5 s advertise interval, 2 s advertise burst (`src/simulation/config.ts`).

**Code:** `src/simulation/policies/fixedRate.ts`

---

## 3. Motion + peer adaptive BLE policy

### 3.1 Drives and sampling intensity

- **Motion drive / peer drive:** Exponential decay with `tauMotionSeconds` / `tauPeerSeconds`; increments from motion (with optional count saturation) and from **observer-local** detections in the **previous** epoch (`state.detections` filtered by `observerId`).
- **Empty scan:** If any **previous-epoch** scan window for this observer has `detectedAnyPeer === false`, apply `peerMissPenalty` to peer drive (from `state.scanWindows` via `adaptivePolicyInputsForAnimal`).
- **Sampling drive:**  
  `clamp01(restDrive + motionWeight * motionDrive + peerWeight * peerDrive)`  
  If `allowEnergySavingDownscale` is false: `max(0.5, raw)` (upscale-only mode).

### 3.2 Timing mapping (neutral anchor at 0.5)

- **`MotionPeerAdaptivePolicyConfig`** uses **`timingAnchors`:** `lowIntensity`, `neutral`, `highIntensity`, plus shared **`advertisingBurstDurationSeconds`**.
- **`neutral`** defaults align with **`juxtaMainCMode0FixedPolicy`** so drive **0.5** matches the fixed-rate “social mode” schedule.
- **`mapAdaptiveTiming`:** Piecewise mapping — `[0, 0.5]` interpolates low→neutral; `(0.5, 1]` interpolates neutral→high. Log interpolation for intervals; linear for scan window.

### 3.3 Constraints

- **`constrainAdaptiveTiming`:** Enforces minimum scan/advertise intervals, caps scan window to interval, minimum burst duration (see `src/simulation/policies/adaptive.ts`).

### 3.4 Defaults (`defaultAdaptivePolicy`)

- Anchors, `restDrive: 0.25`, taus, gains, weights, `peerMissPenalty`, saturations, `allowEnergySavingDownscale: true` — see `src/simulation/config.ts`.

**Code:** `src/simulation/policies/adaptive.ts`, types in `src/simulation/types.ts` (`MotionPeerAdaptivePolicyConfig`, `AdaptiveBleTimingAnchors`).

---

## 4. Engine ordering (why “previous epoch” inputs)

Each step, **`applyFirmwarePolicy`** runs **before** burst scheduling. It receives **`state.detections`** and **`state.scanWindows`** from the **incoming** state — i.e. **last completed epoch**, not the full merged log.

**Code:** `stepSimulation` in `src/simulation/engine.ts`.

---

## 5. Logging and export

- **`SimulationLogs.adaptiveBlePolicy`:** `AdaptiveBlePolicyLog[]` — one row per animal per timestep when the active policy is adaptive (inputs + drives + mapped timings + `combinedEnvelopeDuty` + `saturatedScheduleWarning`).
- **Raw export:** JSON and CSV bundle include `adaptiveBlePolicy` (see `src/components/RawDataPanel.tsx`).

**Types:** `AdaptiveBlePolicyLog` in `src/simulation/types.ts`.

---

## 6. Metrics and capture rate

- **`bleCaptureRate` / hits / opportunities:** Still computed from **`logs.trueDyads`** and **`logs.detections`** with epoch alignment; **not** derived from adaptive logs or drive state.
- **Adaptive rows do not count as BLE hits** unless there is a real `DetectionEvent` in the epoch.

**Code:** `computeBleCapture`, `computeMetrics` in `src/simulation/analysis.ts`.

---

## 7. UI (controls + visualization)

### 7.1 Controls (`ControlsPanel.tsx`)

- Policy select: fixed vs adaptive (switching resets adaptive branch to `defaultAdaptivePolicy` when selecting adaptive).
- **Adaptive:** range preset (conservative / balanced / aggressive), motion/peer influence tiers, **allow energy-saving downscale**, **Adaptive details** (motion sensitivity, rest drive, gains, taus, weights, penalty, low/high anchor numerics, optional **unlock neutral anchor** for editing neutral timing).

### 7.2 Sidebar: Adaptive Policy mini panel (`AdaptivePolicyMiniPanel.tsx`)

- Cohort vs single-animal view; sparkline and decomposition; schedule chips; duty warning when envelope duty is high; relative intensity vs neutral duty estimate.

### 7.3 Time series (`TimeSeriesPanel.tsx` + `timeSeries.ts`)

- **Main chart:** Light/dark bands, moving fraction (10 min trailing avg), cumulative energy; **y-axis titles:** primary “Moving fraction (0–1)”, secondary “Energy (mAh)”.
- **Adaptive policy chart** (when adaptive): cohort mean **sampling drive** and **mean scan interval**; axis titles for primary/secondary.
- **Fixed-rate BLE schedule chart** (when fixed): flat lines for scan interval, advertise interval, scan window (seconds, primary) and **envelope duty** (0–1, secondary); axis titles “Seconds (schedule)” and “Duty (0–1)”.

**Builders:** `buildAdaptiveBleTimeSeries`, `buildFixedBleTimeSeries`, `buildTimeSeries` in `src/simulation/timeSeries.ts`; wired in `src/App.tsx` (`SimulationBuild`).

---

## 8. World / path graph vs enclosure size

- Nodes are placed uniformly in **`[margin, width − margin] × [margin, height − margin]`** with **`PATH_NODE_MARGIN_FRAC = 0.02`** (2% inset per edge).
- **Rationale:** Previously ~8%–92% left unused margin; 2% uses more of the physical box. Corner-only anchoring was avoided because it changes RNG consumption order and breaks seeded reproducibility tests.

**Code:** `createPathGraph` in `src/simulation/world.ts`.

---

## 9. Tests

- **Vitest** suite includes policy mapping tests, observer-local peer behavior, empty-scan penalty, capture-rate invariants, BLE firmware alignment, etc. (`npm test`).
- Key adaptive coverage: `src/simulation/engine.test.ts`.

---

## 10. File map (quick reference)

| Area | Location |
|------|-----------|
| Adaptive + dispatch | `src/simulation/policies/adaptive.ts` |
| Fixed policy | `src/simulation/policies/fixedRate.ts` |
| Step loop + adaptive logs | `src/simulation/engine.ts` |
| Defaults | `src/simulation/config.ts` |
| Types / logs | `src/simulation/types.ts` |
| Metrics / capture | `src/simulation/analysis.ts` |
| Path graph | `src/simulation/world.ts` |
| Time series builders | `src/simulation/timeSeries.ts` |
| App shell + build | `src/App.tsx` |
| Controls | `src/components/ControlsPanel.tsx` |
| Mini panel | `src/components/AdaptivePolicyMiniPanel.tsx` |
| Plots | `src/components/TimeSeriesPanel.tsx` |
| Export | `src/components/RawDataPanel.tsx` |

---

## 11. Related documentation

- [`ble_capture_rate_and_firmware_policies.md`](ble_capture_rate_and_firmware_policies.md) — capture metric + policy behavior + UI knobs.
- [`adaptive_ble_policy_core_implementation_spec.md`](adaptive_ble_policy_core_implementation_spec.md) — original adaptive policy product/spec intent.

---

*Generated for supervisor/agent review; behavior should match the cited source files at repo HEAD.*
