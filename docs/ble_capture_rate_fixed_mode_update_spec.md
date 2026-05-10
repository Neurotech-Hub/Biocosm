# Update Specification: BLE Capture Rate for Fixed-Rate Juxta Simulation

## Purpose

Update the simulator's BLE capture-rate metric so it remains valid with a 60-second simulation epoch while matching the intended fixed-rate Juxta cohort-level analysis.

This update is specifically for the **fixed-rate BLE mode**. Adaptive policy logic will be revisited separately after this baseline is stable.

---

## Current decision summary

The following decisions should guide implementation.

| Topic | Decision |
|---|---|
| Capture-rate level | Use **unordered dyad/system-level capture rate** as the primary metric. |
| Directed capture | Do **not** implement directed A→B / B→A capture metrics yet. |
| Collar loss | For now, assume all collars are retrieved and valid unless the simulator already marks a collar invalid. |
| Scan/advertise arbitration | The simulator's current serial/alternating scheduler is acceptable. It does not need to exactly reproduce firmware timer deconfliction priority. |
| Raw recall estimate | Keep it separate from capture rate; preferably rename it to avoid confusion. |
| Detection radius | Default should be **1 meter** for the new hardware, with an exposed slider control. |
| Main required change | Capture opportunities must be computed across the epoch, not only at the final timestep. |

---

## Key problem to solve

The current capture-rate definition uses a `trueDyads` row at simulation time `t`, where `withinDetectionRadius` is evaluated at the timestep endpoint.

With a default `timeStepSeconds = 60`, this can misclassify opportunities. A pair may be within radio range for part of the minute but not at the endpoint, or vice versa.

For BLE capture-rate evaluation, a pair should count as a true detection opportunity if it was within detection radius **at any time during the epoch**.

---

## Required capture-rate definition

For each unordered animal pair and each simulation epoch:

```text
epochStart = t - dt
epochEnd   = t
```

An epoch-level BLE opportunity exists when:

```text
both collars are valid
AND
distance(A, B) <= detectionRadiusMeters
for any sub-epoch sample or interpolated interval within (epochStart, epochEnd]
```

A hit exists when:

```text
there is at least one DetectionEvent for the unordered pair
within (epochStart, epochEnd]
```

The primary metric is:

```text
bleCaptureRate = hitEpochs / opportunityEpochs
```

where:

```text
opportunityEpochs = count of unordered dyad epochs with any true in-range period
hitEpochs = count of those opportunity epochs with at least one matching detection
```

This remains a **system-level cohort metric**, not an individual collar metric.

---

## Recommended secondary metric

Add or retain a time-weighted version for analysis, but do not make it the primary metric yet.

```text
inRangeSeconds_AB_epoch = total seconds in the epoch where distance(A, B) <= detectionRadiusMeters
```

Then:

```text
timeWeightedCapture = detectedOpportunitySeconds / totalInRangeSeconds
```

However, because a single BLE hit does not necessarily imply the full epoch was captured, use this cautiously. The primary metric should remain interval/epoch-level.

---

## Sub-epoch opportunity sampling

Do **not** require the entire simulation to run at 1-second epochs.

Instead, compute true dyad opportunity using a sub-epoch sampling or interpolation pass.

Suggested approach:

```ts
const opportunitySampleStepSeconds = config.radio.opportunitySampleStepSeconds ?? 1;
```

For each epoch and dyad:

1. Interpolate animal positions between epoch start and epoch end.
2. Sample pairwise distance at `opportunitySampleStepSeconds`.
3. Mark `withinDetectionRadiusAny = true` if any sampled distance is within range.
4. Optionally compute `inRangeSeconds` as the count of in-range samples multiplied by sample step.

For better accuracy, include both epoch boundaries and internal samples:

```text
epochStart, epochStart + sampleStep, ..., epochEnd
```

Use the same interpolation assumptions already used by the BLE radio model where possible.

---

## Data model updates

Current true dyad logs appear to include:

```ts
withinDetectionRadius: boolean
bothCollarsValid: boolean
animalA: string
animalB: string
time: number
```

Extend this to distinguish endpoint truth from epoch-integrated truth.

Recommended fields:

```ts
type TrueDyadLog = {
  time: number;                      // epoch end
  epochStartTime: number;
  epochEndTime: number;

  animalA: string;
  animalB: string;

  bothCollarsValid: boolean;

  // Existing endpoint value may be retained for visualization/debugging.
  withinDetectionRadiusAtEnd: boolean;

  // New value used for capture-rate denominator.
  withinDetectionRadiusAny: boolean;

  // Optional but useful.
  inRangeSeconds: number;
  minDistanceMeters: number;
  endDistanceMeters: number;
};
```

If renaming the existing field is disruptive, keep `withinDetectionRadius` as an alias temporarily, but update capture-rate code to use the epoch-integrated field.

---

## Capture-rate code update

Update `computeBleCapture` so opportunities use:

```ts
row.withinDetectionRadiusAny === true
```

instead of endpoint-only `withinDetectionRadius`.

Hit logic can stay mostly the same:

```text
pairKey(observerId, peerId) === pairKey(animalA, animalB)
AND
epochStart < detection.time <= epochEnd
```

Continue using unordered pair keys.

A detection from either direction counts as a hit for the unordered pair:

```text
A detects B -> hit for pair A|B
B detects A -> hit for pair A|B
```

---

## Fixed-rate BLE baseline settings

The fixed Juxta-like baseline should remain:

```ts
juxtaMainCMode0FixedPolicy = {
  type: "fixed",
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 5,
  advertisingBurstDurationSeconds: 2
};
```

The BLE scheduler may continue to use serial scan/advertise burst generation.

The simulator does not need to exactly copy firmware tie-breaking where scan wins over advertise when both are due. For this app, the alternating serial method is acceptable as long as it is deterministic and documented.

---

## Radio defaults for new hardware

Set the hardware default detection radius to:

```ts
detectionRadiusMeters: 1.0
```

Keep this user-editable through the existing slider.

Suggested slider range:

```ts
min: 0.01
max: 2.0
step: 0.01
default: 1.0
```

If the UI needs a broader exploratory mode, allow an advanced max up to 5 m, but the Juxta preset should default to 1 m.

---

## Metrics naming

The current `recallEstimate` is not the same as interval-level capture rate because it uses total detection count divided by true opportunity count.

To avoid confusion, rename it to:

```ts
rawDetectionDensity
```

or hide it from the main UI.

Primary UI metric should be:

```text
BLE capture rate
```

with a tooltip such as:

```text
Fraction of in-range valid dyad epochs where the simulated BLE system recorded at least one detection for that unordered pair during the same epoch.
```

Recommended supporting UI values:

```text
Opportunity epochs
Hit epochs
Missed epochs
Detection radius
Simulation epoch length
Opportunity sample step
```

---

## Acceptance tests

Add tests that specifically protect against 60-second epoch artifacts.

### 1. In-range only at epoch start

Given a pair is within detection radius at `epochStart` but outside radius at `epochEnd`:

```text
withinDetectionRadiusAny should be true
withinDetectionRadiusAtEnd should be false
opportunityEpochs should increment
```

### 2. In-range only mid-epoch

Given a pair is outside range at both endpoints but within range at an internal sample:

```text
withinDetectionRadiusAny should be true
opportunityEpochs should increment
```

### 3. Never in range

Given a pair is outside radius for all sub-epoch samples:

```text
withinDetectionRadiusAny should be false
opportunityEpochs should not increment
```

### 4. Detection in same epoch counts

Given an opportunity epoch and a detection for the same unordered pair in `(epochStart, epochEnd]`:

```text
hitEpochs should increment
```

### 5. Detection in adjacent epoch does not count

Given an opportunity epoch but only a detection outside `(epochStart, epochEnd]`:

```text
hitEpochs should not increment
```

### 6. Direction does not matter

Given an opportunity for pair A|B:

```text
A detects B should count as a hit
B detects A should count as a hit
```

### 7. Endpoint-only regression

Create a regression where the old endpoint-only method gives zero opportunities but the new epoch-integrated method gives nonzero opportunities.

This test is especially important because it validates the 60-second epoch design.

---

## Out of scope for this update

Do not add these yet:

- Directed A→B / B→A capture-rate metrics.
- Complex collar-loss modeling.
- Separate masks for alive, transmitting, scanner recovered, and clock valid.
- Exact hardware scan-over-advertise tie-breaking.
- Adaptive motion/peer policy changes.
- Microarousal-driven BLE policy changes.

These can be revisited after the fixed-rate baseline metric is stable.

---

## Implementation priority

1. Add epoch-integrated `withinDetectionRadiusAny`.
2. Update `computeBleCapture` denominator to use epoch-integrated opportunities.
3. Keep unordered pair hit logic.
4. Set Juxta hardware detection radius default to 1 m.
5. Rename or hide `recallEstimate`.
6. Add acceptance tests.
7. Update UI tooltips/labels.

---

## Final expected behavior

With a 60-second simulation epoch, BLE capture rate should answer:

```text
Across all valid unordered dyad-epochs where two animals came within radio range at any point during that epoch, what fraction had at least one BLE detection logged during that same epoch?
```

This is the intended fixed-rate baseline metric for evaluating cohort-wide BLE sampling strategies.
