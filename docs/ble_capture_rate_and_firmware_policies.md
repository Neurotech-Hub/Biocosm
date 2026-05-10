# BLE capture rate and firmware policies (Biocosm)

This document specifies how **interval-level BLE capture rate** is computed in metrics, how **Fixed-rate** vs **Motion + peer adaptive** firmware policies update collar timing before BLE bursts are scheduled, and **which parameters exist for tuning** (including what the simulator UI exposes vs code-only defaults). Behavior matches the implementation in `src/simulation/analysis.ts`, `src/simulation/policies/`, `src/simulation/radio.ts`, `src/simulation/engine.ts`, `src/simulation/types.ts` (`FixedPolicyConfig`, `MotionPeerAdaptivePolicyConfig`), `src/components/ControlsPanel.tsx`, and defaults in `src/simulation/config.ts`.

---

## 1. BLE capture rate (interval-level)

### 1.1 Purpose

Capture rate answers: *Across the whole run, when ground truth says a pair was in detection range with valid collars, how often did the simulated BLE stack record at least one detection in the same simulation timestep?*

It is **not** the same as raw “detections ÷ opportunities” using only detection counts without the per-interval alignment (see **recall estimate** below).

### 1.2 Inputs

- **`logs.trueDyads`**: one row per unordered animal pair per timestep, derived from true positions (see `computeTrueContacts` / `createTrueDyadLogs` in the engine). Each row includes `withinDetectionRadius`, `bothCollarsValid`, `animalA`, `animalB`, and `time` (end of the simulation step).
- **`logs.detections`**: all simulated `DetectionEvent`s over the run (`observerId`, `peerId`, `time`, …).

### 1.3 Opportunities

An **opportunity** is counted for each `trueDyads` row where:

- `withinDetectionRadius === true` (center distance ≤ `radio.detectionRadiusMeters` at that step), and  
- `bothCollarsValid === true`.

So the denominator is **only** in-range intervals with both collars valid—not every dyad row.

### 1.4 Hits

Let `dt = config.timeStepSeconds` and let each dyad row be at simulation time `t`.

Define an unordered pair key `pairKey(a, b)` as the sorted concatenation `min(a,b)|max(a,b)` (same key used for observer/peer in detections).

A **hit** for that row occurs if **some** detection satisfies:

- `pairKey(observerId, peerId) === pairKey(animalA, animalB)`, and  
- `epochStart < event.time ≤ t` where `epochStart = t - dt`.

So the detection must fall in **the step’s epoch** ending at `t` (aligned with the discrete timestep), not anywhere in the past.

### 1.5 Metric definition

```
bleCaptureOpportunities = number of qualifying trueDyads rows (§1.3)
bleCaptureHits          = number of those rows that also satisfy §1.4
bleCaptureRate          = bleCaptureHits / bleCaptureOpportunities   (0 if denominator is 0)
```

Equivalently: **hits / (hits + misses)** over those in-range, valid-collar intervals—each interval is either a hit or a miss.

### 1.6 Related metric: recall estimate (different formula)

`computeMetricsFromLogs` also computes **`recallEstimate`** as:

`logs.detections.length / trueDetectionOpportunities`,

where `trueDetectionOpportunities` counts `trueDyads` rows with `withinDetectionRadius && bothCollarsValid`.

That uses **total detection events** in the numerator (not interval-aligned hits). Do not confuse it with **BLE capture rate**.

---

## 2. How simulated detections are produced (shared by both policies)

Policies only change **when** each collar scans and advertises. Given bursts for an epoch, detection logic is the same.

Each timestep, **`applyFirmwarePolicy`** runs **before** BLE bursts are scheduled for that epoch. Burst scheduling uses the collar fields **`scanIntervalSeconds`**, **`scanWindowSeconds`**, **`advIntervalSeconds`**, and **`advertisingBurstDurationSeconds`** (`createBleBurstEvents` in `src/simulation/radio.ts`).

1. **Burst schedule** (`createBleBurstEvents`): each valid collar alternates **scan** and **advertise** bursts over `[epochStart, epochEnd)` using its current `scanIntervalSeconds`, `scanWindowSeconds`, `advIntervalSeconds`, and `advertisingBurstDurationSeconds`, with serial-radio rules (inter-burst delay, optional jitter, scan pre-start stabilization after advertise—see `BleSchedulingConfig`).

2. **Scan listen windows** are sliced from scan bursts (`SCAN_LISTEN_INTERVAL_SECONDS` / `SCAN_LISTEN_WINDOW_SECONDS`).

3. **Advertising events** are emitted from advertise bursts at `advertisingEventIntervalSeconds`.

4. For each ordered pair **(observer, peer)**, the model looks for a **listen window** of the observer that overlaps an **advertising event** of the peer in time. Distance at overlap time uses **interpolated positions** between epoch start/end.

5. If distance ≤ `detectionRadiusMeters`, **RSSI** is drawn from path loss + noise; a **logistic** function of RSSI vs `rssiThreshold` / `rssiSlope` yields a Bernoulli trial. Success adds a `DetectionEvent` (first success per pair/epoch short-circuits in implementation).

---

## 3. Fixed-rate BLE policy

**Type:** `FixedPolicyConfig` (`activePolicy.type === "fixed"`).

**Behavior** (`applyFixedRatePolicy` in `src/simulation/policies/fixedRate.ts`): each timestep, the collar’s timing fields are set **directly from policy constants**. Motion and peer history **do not** change these numbers. Scan/advertise **activity flags** on the collar are cleared to `false` in this helper; actual on-air activity comes from the burst scheduler in `createBleBurstEvents`.

| Parameter | Meaning |
|-----------|---------|
| `scanIntervalSeconds` | Wall-clock spacing between scan bursts for that collar’s schedule. |
| `scanWindowSeconds` | Duration of each scan burst (passive listening window). |
| `advIntervalSeconds` | Wall-clock spacing between advertise bursts. |
| `advertisingBurstDurationSeconds` | On-air length of each advertise burst (default **2 s** if omitted). |

**Example default** (`juxtaMainCMode0FixedPolicy` in `src/simulation/config.ts`): **20 s** scan interval, **1.5 s** scan window, **5 s** advertise interval, **2 s** advertise burst—documented as matching a JUXTA `main.c` mode style schedule.

### 3.1 Tunable in the app (Controls → Device / BLE)

When **Fixed-rate BLE** is selected, sliders adjust:

| Control | Range |
|---------|--------|
| Scan interval | 5–60 s, step 5 |
| Scan burst duration | 0.5–5 s, step 0.5 |
| Advertise interval | 5–50 s, step 5 |
| Advertise burst duration | 0.5–5 s, step 0.5 |

---

## 4. Motion + peer adaptive BLE policy

**Type:** `MotionPeerAdaptivePolicyConfig` (`activePolicy.type === "motion_peer_adaptive"`).

**Behavior** (`applyMotionPeerAdaptivePolicy` in `src/simulation/policies/adaptive.ts`): collar intervals are **recomputed every timestep** from two drives that decay over time and spike on events.

1. **Motion drive** — Exponential decay with time constant **`tauMotionSeconds`** over `dtSeconds`, plus **`motionGain`** if the motion observation for this animal reports **`motionDetected`** (from `computeMotionObservations` vs `motionSensor.thresholdMetersPerStep` and noise in `src/simulation/motionSensor.ts`).

2. **Peer drive** — Exponential decay with **`tauPeerSeconds`**, plus **`peerGain`** if the incoming **`state.detections`** list contains **any** event with **`observerId`** equal to this animal’s id.

3. **Combined drive** — `samplingDrive = clamp01(motionWeight * motionDrive + peerWeight * peerDrive)`. Weights are **not** forced to sum to 1 in code; defaults use **0.5 / 0.5**.

4. **Map drive → collar timing** (higher `samplingDrive` ⇒ **more aggressive** sampling):

   - **Scan interval** — **Log** interpolate between **`scanIntervalMaxSeconds`** (low drive) and **`scanIntervalMinSeconds`** (high drive).
   - **Scan window** — **Linear** interpolate between **`scanWindowMinSeconds`** and **`scanWindowMaxSeconds`**.
   - **Advertise interval** — **Log** interpolate between **`advIntervalMaxSeconds`** (low drive) and **`advIntervalMinSeconds`** (high drive).

5. **Advertise burst length** — Taken from **`advertisingBurstDurationSeconds`** on the policy (default **2 s** if omitted via `DEFAULT_ADVERTISING_BURST_DURATION_SECONDS` in `fixedRate.ts`). It is **not** varied by `samplingDrive` in the current implementation.

**Important — peer signal scope:** In `stepSimulation`, `applyFirmwarePolicy` receives **`state.detections` from the incoming simulation state**, which holds **detections from the previous timestep’s epoch only**, not the full merged log. So peer boosting is **edge-to-edge with the last epoch’s detection list**, not a long rolling window over the whole run.

### 4.1 Full parameter list (`MotionPeerAdaptivePolicyConfig`)

| Parameter | Role |
|-----------|------|
| `scanIntervalMinSeconds` / `scanIntervalMaxSeconds` | Envelope for scan repetition rate vs. `samplingDrive` (log mapping). |
| `scanWindowMinSeconds` / `scanWindowMaxSeconds` | Envelope for scan burst duration vs. `samplingDrive` (linear mapping). |
| `advIntervalMinSeconds` / `advIntervalMaxSeconds` | Envelope for advertise repetition rate vs. `samplingDrive` (log mapping). |
| `motionGain` | Increment to **motionDrive** when motion is detected this step. |
| `peerGain` | Increment to **peerDrive** when this animal had any observer-role detection in the prior-step detection list. |
| `tauMotionSeconds` | Time constant (seconds) for exponential decay of **motionDrive**. |
| `tauPeerSeconds` | Time constant (seconds) for exponential decay of **peerDrive**. |
| `motionWeight` / `peerWeight` | How much each drive contributes to **samplingDrive** before clamping to \[0, 1\]. |
| `advertisingBurstDurationSeconds` | Fixed on-air advertise burst length (optional). |

### 4.2 Defaults (`defaultAdaptivePolicy` in `src/simulation/config.ts`)

| Field | Default |
|-------|---------|
| `scanIntervalMinSeconds` | 10 |
| `scanIntervalMaxSeconds` | 60 |
| `scanWindowMinSeconds` | 0.5 |
| `scanWindowMaxSeconds` | 1.5 |
| `advIntervalMinSeconds` | 5 |
| `advIntervalMaxSeconds` | 50 |
| `tauMotionSeconds` | 600 (10 min) |
| `tauPeerSeconds` | 1800 (30 min) |
| `motionGain` | 0.2 |
| `peerGain` | 0.35 |
| `motionWeight` | 0.5 |
| `peerWeight` | 0.5 |
| `advertisingBurstDurationSeconds` | 2 |

### 4.3 Tunable in the app today (Controls → Device / BLE → **Adaptive details**)

The UI exposes only a **subset** of the adaptive policy; the rest stay at **`defaultAdaptivePolicy`** unless changed in code or config loading.

| Control | Maps to | Notes |
|---------|---------|--------|
| **Motion sensitivity** | `motionSensor.thresholdMetersPerStep` | Lower ⇒ easier to flag motion (feeds **`motionGain`** indirectly via `motionDetected`). Range **0.01–0.3** m/step. |
| **Peer boost** | `peerGain` | Range **0–1**, step 0.05. |
| **Decay time** (minutes) | `tauMotionSeconds` = slider × 60; **`tauPeerSeconds` = slider × 180** | Single control ties motion decay and peer decay in a **1 : 3** ratio (e.g. 10 min motion vs 30 min peer when slider is 10). Range **1–60** minutes. |

**Not exposed in the UI** (tune via code / future controls): **`motionGain`**, **`motionWeight`**, **`peerWeight`**, all **min/max interval** envelopes, **`advertisingBurstDurationSeconds`**.

### 4.4 Practical tuning intuition

- **Fixed-rate** — Adjust duty cycle directly; behavior and environment do not change the schedule.
- **Adaptive** — Envelopes define **best-case** (high drive → shorter scan/advertise intervals, wider scan window) vs **idle** (low drive → longer intervals). Increasing **`peerGain`** or lowering motion threshold tends to keep **`samplingDrive`** elevated after activity or contacts; larger **`tau`** values slow decay back toward idle scheduling.

---

## 5. Summary table

| Concept | Meaning in Biocosm |
|--------|---------------------|
| **BLE capture rate** | Fraction of **in-range + valid-collar** `trueDyads` intervals that also have a matching detection in `(t−dt, t]`. |
| **Fixed-rate policy** | Constant scan/adv intervals from policy config every step; full set of interval sliders in UI (§3.1). |
| **Adaptive policy** | Motion + peer drives decay and spike; drives map to scan/adv intervals each step; peer spike uses **previous epoch’s** `state.detections` only. UI: motion threshold, `peerGain`, linked taus (§4.3); other fields default (§4.2). |
| **Recall estimate** (logs-only helper) | Total detection count / in-range dyad row count—not interval-aligned capture. |

---

## 6. Code references

| Topic | Primary location |
|-------|------------------|
| Capture rate | `computeBleCapture` in `src/simulation/analysis.ts` |
| Metrics aggregation | `computeMetrics` in `src/simulation/analysis.ts` |
| Policy dispatch | `applyFirmwarePolicy` in `src/simulation/policies/adaptive.ts` |
| Fixed intervals | `applyFixedRatePolicy` in `src/simulation/policies/fixedRate.ts` |
| Adaptive drives | `applyMotionPeerAdaptivePolicy` in `src/simulation/policies/adaptive.ts` |
| Burst schedule & detection | `createBleBurstEvents`, `simulateBleDetections`, `maybeDetectPair` in `src/simulation/radio.ts` |
| Step order | `stepSimulation` in `src/simulation/engine.ts` |
| Default policies | `src/simulation/config.ts` (`juxtaMainCMode0FixedPolicy`, `defaultAdaptivePolicy`) |
| Policy UI (fixed vs adaptive sliders) | `src/components/ControlsPanel.tsx` |
