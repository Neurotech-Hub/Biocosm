# Biocosm BLE Policy Baseline Simplification + 5.5 mAh Adaptive Sweep

**Audience:** Developer agent  
**Purpose:** Simplify the BLE policy baseline UI and add a focused sweep of ~100 settings around a practical ~5.5 mAh/day deployment budget.

---

## 1. Simplify BLE Policy Baselines

The current UI has too many baseline choices:

```html
<label>BLE policy baseline
  <select aria-describedby="ble-baseline-help">
    <option value="general-discovery">General discovery</option>
    <option value="general-low-power">General low-power</option>
    <option value="general-high-capture">General high-capture</option>
    <option value="symmetric-example">Symmetric example</option>
    <option value="juxta-v56-social">Juxta v5/6 social mode</option>
    <option value="custom">Custom schedule</option>
  </select>
</label>
```

Reduce this to **at most three choices**:

```html
<label>BLE policy baseline
  <select aria-describedby="ble-baseline-help">
    <option value="balanced-adaptive">Balanced adaptive</option>
    <option value="low-power">Low-power</option>
    <option value="high-capture">High-capture</option>
  </select>
</label>
```

Remove or hide these as public baseline options:

```text
General discovery
General low-power
General high-capture
Symmetric example
Juxta v5/6 social mode
Custom schedule
```

The app can still keep old presets internally for migration/backward compatibility, but the user-facing baseline dropdown should only expose the three above.

---

## 2. Recommended Three Baselines

### 2.1 Balanced adaptive

This should be the default.

It targets the current practical battery constraint while still preserving meaningful capture.

```ts
const BALANCED_ADAPTIVE_BASELINE = {
  id: "balanced-adaptive",
  label: "Balanced adaptive",
  scanIntervalSeconds: 30,
  scanWindowSeconds: 0.5,
  advIntervalSeconds: 7.5,
  advertisingBurstDurationSeconds: 2
};
```

Use help text:

```text
Recommended starting point for adaptive mode under a small-battery budget.
```

---

### 2.2 Low-power

This is for longer deployment or stricter battery life, accepting lower capture.

```ts
const LOW_POWER_BASELINE = {
  id: "low-power",
  label: "Low-power",
  scanIntervalSeconds: 60,
  scanWindowSeconds: 0.35,
  advIntervalSeconds: 10,
  advertisingBurstDurationSeconds: 2
};
```

Use help text:

```text
Lower-energy schedule with reduced scan effort and slower advertising.
```

---

### 2.3 High-capture

This is for users willing to spend more energy.

```ts
const HIGH_CAPTURE_BASELINE = {
  id: "high-capture",
  label: "High-capture",
  scanIntervalSeconds: 15,
  scanWindowSeconds: 0.75,
  advIntervalSeconds: 5,
  advertisingBurstDurationSeconds: 2
};
```

Use help text:

```text
Higher-capture schedule with more frequent scanning and advertising.
```

---

## 3. Default Adaptive Timing Anchors

For the default **Balanced adaptive** baseline, use:

```ts
const DEFAULT_ADAPTIVE_TIMING_ANCHORS = {
  lowIntensity: {
    scanIntervalSeconds: 90,
    scanWindowSeconds: 0.35,
    advIntervalSeconds: 10
  },

  neutral: {
    scanIntervalSeconds: 30,
    scanWindowSeconds: 0.5,
    advIntervalSeconds: 7.5
  },

  highIntensity: {
    scanIntervalSeconds: 15,
    scanWindowSeconds: 0.75,
    advIntervalSeconds: 5
  },

  advertisingBurstDurationSeconds: 2
};
```

This is the main candidate baseline for the ~5.5 mAh/day regime.

Rationale:

```text
scan 20 / adv 5 is around or above the current practical battery target
scan 60 / adv 5 gets under budget but capture drops hard
scan 30 / adv 7.5 is a reasonable adaptive midpoint
```

---

## 4. Recommended Starting Adaptive Parameters

Use these as defaults for adaptive mode:

```ts
const DEFAULT_ADAPTIVE_PARAMS = {
  baselineDrive: 0.25,
  motionWeight: 0.20,
  peerWeight: 0.50,
  tauPeerSeconds: 200,
  tauMotionSeconds: 180,
  motionGain: 0.35,
  peerGain: 0.45,
  peerMissPenalty: 0.20,
  allowEnergySavingDownscale: true,
  peerDetectionCountSaturation: 1,
  motionEventCountSaturation: 1
};
```

Primary design intent:

```text
Keep the average policy near scan 30 / adv 7.5.
Drop toward scan 90 / adv 10 during low-information periods.
Briefly rise toward scan 15 / adv 5 when motion or peer state suggests social opportunity.
```

---

## 5. Focused Sweep: Approximately 100 Settings

The next sweep should focus around the 5.5 mAh/day region and not waste many trials on near-always-on schedules.

Use a sweep with:

```text
45 fixed-style policies
54 adaptive policies
= 99 total policies per seed
```

This is small enough for run speed but broad enough to test the useful design space.

---

## 6. Fixed-Style Sweep Grid

Use this fixed grid:

```ts
const FIXED_SCAN_INTERVALS_SECONDS = [
  20,
  30,
  45,
  60,
  90
];

const FIXED_ADV_INTERVALS_SECONDS = [
  5,
  7.5,
  10
];

const FIXED_SCAN_WINDOWS_SECONDS = [
  0.35,
  0.5,
  0.75
];

const FIXED_ADVERTISING_BURST_SECONDS = 2;
```

Trial count:

```text
5 × 3 × 3 = 45 fixed policies
```

This intentionally excludes very aggressive settings such as:

```text
scan interval 5–10 s
adv interval 1–2 s
scan windows > 1 s
```

Those settings are useful for capture-ceiling exploration, but they are not the target for a ~5.5 mAh/day deployment budget.

---

## 7. Inactivity Scan Multipliers

For this focused sweep, apply only one inactivity multiplier variant to fixed policies:

```ts
const INACTIVE_SCAN_INTERVAL_MULTIPLIER = 3;
```

Do not multiply the full fixed grid by multiple inactivity factors in this run.

For fixed policies, generate:

```text
fixed with inactivity scan x3
```

rather than all of:

```text
1×, 2×, 3×, 5×
```

This keeps the sweep compact and aligned to the current battery target.

If the app needs a non-adaptive fixed reference, include only the selected baseline row separately.

---

## 8. Adaptive Sweep Anchors

Use the same timing anchors for all adaptive policies in this sweep:

```ts
const ADAPTIVE_SWEEP_TIMING_ANCHORS = {
  lowIntensity: {
    scanIntervalSeconds: 90,
    scanWindowSeconds: 0.35,
    advIntervalSeconds: 10
  },

  neutral: {
    scanIntervalSeconds: 30,
    scanWindowSeconds: 0.5,
    advIntervalSeconds: 7.5
  },

  highIntensity: {
    scanIntervalSeconds: 15,
    scanWindowSeconds: 0.75,
    advIntervalSeconds: 5
  },

  advertisingBurstDurationSeconds: 2
};
```

Do not sweep timing anchors yet. Keep them fixed for this pass.

---

## 9. Adaptive Parameter Sweep Grid

Use this adaptive grid:

```ts
const ADAPTIVE_BASELINE_DRIVES = [
  0.15,
  0.25,
  0.35
];

const ADAPTIVE_MOTION_WEIGHTS = [
  0.10,
  0.20,
  0.30
];

const ADAPTIVE_PEER_WEIGHTS = [
  0.40,
  0.50,
  0.60
];

const ADAPTIVE_TAU_PEER_SECONDS = [
  120,
  200
];
```

Trial count:

```text
3 × 3 × 3 × 2 = 54 adaptive policies
```

Held constants:

```ts
const HELD_ADAPTIVE_CONSTANTS = {
  tauMotionSeconds: 180,
  motionGain: 0.35,
  peerGain: 0.45,
  peerMissPenalty: 0.20,
  allowEnergySavingDownscale: true,
  peerDetectionCountSaturation: 1,
  motionEventCountSaturation: 1
};
```

---

## 10. Total Sweep Size

```text
Fixed-style policies: 45
Adaptive policies:    54
Total:                99 policies per seed
```

If a baseline reference row is added separately:

```text
Total: 100 policies per seed
```

That is acceptable.

---

## 11. Primary Goal for This Sweep

Optimize for:

```text
maximum capture under approximately 5.5 mAh/day
```

The report should still show capture rate, mAh/day, and BLE efficiency, but the sweep itself should focus on the policy region that could plausibly satisfy the battery constraint.

---

## 12. Must-Include Policies

Ensure these specific schedules are included either as baseline/reference rows or as part of the fixed grid:

```ts
const MUST_INCLUDE_POLICIES = [
  {
    label: "balanced-adaptive-baseline",
    scanIntervalSeconds: 30,
    scanWindowSeconds: 0.5,
    advIntervalSeconds: 7.5,
    advertisingBurstDurationSeconds: 2
  },
  {
    label: "low-power-baseline",
    scanIntervalSeconds: 60,
    scanWindowSeconds: 0.35,
    advIntervalSeconds: 10,
    advertisingBurstDurationSeconds: 2
  },
  {
    label: "high-capture-baseline",
    scanIntervalSeconds: 15,
    scanWindowSeconds: 0.75,
    advIntervalSeconds: 5,
    advertisingBurstDurationSeconds: 2
  }
];
```

The fixed grid includes the first two directly. The high-capture baseline is slightly outside the fixed grid because scan interval 15 is intentionally aggressive; include it as a reference row if desired.

---

## 13. Implementation Notes

### 13.1 Rename old presets carefully

Map old user-facing presets to the new simplified choices:

```ts
const LEGACY_PRESET_MIGRATION = {
  "general-discovery": "balanced-adaptive",
  "general-low-power": "low-power",
  "general-high-capture": "high-capture",
  "juxta-v56-social": "balanced-adaptive",
  "symmetric-example": "balanced-adaptive",
  "custom": "balanced-adaptive"
};
```

If a saved workspace contains a truly custom schedule, preserve its numeric schedule internally, but do not expose `Custom schedule` in the simplified dropdown unless the app already has a dedicated advanced editor.

### 13.2 Avoid Juxta-specific labels

Do not use “Juxta baseline” in this UI.

Use:

```text
Balanced adaptive
Low-power
High-capture
```

### 13.3 Keep hardware energy profile separate

This change is only about BLE policy baselines and sweep settings.

Do not merge BLE policy baseline with hardware energy profile.

---

## 14. Acceptance Criteria

1. The BLE policy baseline dropdown has no more than three user-facing choices:
   - Balanced adaptive
   - Low-power
   - High-capture

2. The default baseline is:
   - Balanced adaptive

3. The default adaptive anchors are:
   - low: scan 90 / window 0.35 / adv 10
   - neutral: scan 30 / window 0.5 / adv 7.5
   - high: scan 15 / window 0.75 / adv 5

4. The focused sweep generates approximately 99–100 policies per seed.

5. The adaptive sweep uses 54 adaptive parameter combinations.

6. The fixed-style sweep uses 45 fixed-style combinations.

7. The sweep is centered around policies likely to fall near or below a ~5.5 mAh/day battery target.

8. Old presets are either migrated or hidden from the user-facing dropdown.

---

## 15. Final Direction

The simulator should stop presenting many baseline presets. Use a small, opinionated set:

```text
Balanced adaptive
Low-power
High-capture
```

For the current battery-constrained development phase, the most important default is:

```text
scan 30 s / window 0.5 s / advertise 7.5 s / burst 2 s
```

and the most important adaptive anchor set is:

```text
low:     scan 90 / window 0.35 / adv 10
neutral: scan 30 / window 0.5 / adv 7.5
high:    scan 15 / window 0.75 / adv 5
```

The next sweep should test roughly 100 policies around this region.
