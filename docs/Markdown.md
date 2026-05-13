# Sweep Update: Constrain and Enrich the <10 mAh/day Policy Region

**Project:** Biocosm  
**Audience:** Developer agent  
**Purpose:** Modify the BLE policy sweep so it better samples practical, deployable settings below ~10 mAh/day, instead of spending too many trials on high-energy schedules that approximate always-on behavior.

---

## 1. User Observation

The user noted:

> “I need instructions for my agent to make this sweep more inclusive of settings that would result in <10 mAh per day. Everything else approximates an always on device. The adaptive algorithm also seems to operate in a pretty narrow band now too.”

This is correct. The current sweep includes many settings that consume >10 mAh/day. Those settings may be useful for defining the high-capture ceiling, but they are not useful for practical deployment with small batteries.

The sweep should shift from:

```text
broad exploration including high-energy schedules
```

toward:

```text
dense exploration of plausible deployable schedules below 10 mAh/day
```

---

## 2. Current Result Pattern

From the latest sweep, the most efficient policies under 10 mAh/day cluster around:

```text
short scan windows:       ~0.5–0.56 s
frequent advertising:     ~1.0–4.0 s
moderate scan intervals:  ~10–20 s nominal
inactivity scan multiplier: often 2× or 5×
```

Examples of high-efficiency low-energy policies include:

```text
sweep-fixed-s10.63-a2.13-w0.5-i5
capture:     ~63.3%
mAh/day:     ~2.06
efficiency:  ~0.307
```

```text
sweep-fixed-s20-a1-w0.5
capture:     ~66.1%
mAh/day:     ~2.23
efficiency:  ~0.296
```

```text
sweep-fixed-s10.63-a1-w0.5-dd
capture:     ~74.9%
mAh/day:     ~2.71
efficiency:  ~0.277
```

This reinforces the same design rule:

```text
frequent advertising
brief scan windows
moderate scan intervals
optional inactivity-based scan downshift
```

---

## 3. Main Change: Add an Energy Feasibility Constraint

Add a first-class sweep/report concept:

```ts
deploymentEnergyCeilingMahPerDay = 10;
```

This should be used for reporting, filtering, and recommendations.

### Required report fields

Every policy should be labeled:

```ts
energyClass:
  | "deployable"       // mAh/day < 10
  | "high_energy"      // 10 <= mAh/day < 20
  | "near_always_on"   // mAh/day >= 20
```

Suggested thresholds:

```ts
if (mAhPerDay < 10) energyClass = "deployable";
else if (mAhPerDay < 20) energyClass = "high_energy";
else energyClass = "near_always_on";
```

### UI behavior

Default plots/tables should emphasize:

```text
deployable policies only
```

with a toggle:

```text
Show high-energy policies
```

High-energy policies are still useful for understanding the capture ceiling, but they should not dominate the decision-making view.

---

## 4. Recommendation Logic Update

All primary recommendations should be selected from:

```text
mAh/day < 10
```

unless the user explicitly chooses to include high-energy policies.

### Recommended candidate classes

#### Best deployable efficiency

Eligibility:

```text
mAh/day < 10
```

Rank:

```text
highest BLE efficiency
```

#### Best deployable balanced

Eligibility:

```text
mAh/day < 10
captureRate >= 0.60
```

Rank:

```text
highest BLE efficiency
```

If no policies meet `captureRate >= 0.60`, lower the threshold to 0.50 and add a warning.

#### Best deployable high-capture

Eligibility:

```text
mAh/day < 10
```

Rank:

```text
highest captureRate
```

#### Best deployable low-energy

Eligibility:

```text
mAh/day < 10
captureRate >= 0.50
```

Rank:

```text
lowest mAh/day
```

#### Capture ceiling

Eligibility:

```text
all policies
```

Rank:

```text
highest captureRate
```

But label clearly:

```text
Capture ceiling, not necessarily deployable
```

---

## 5. Fixed Sweep Grid: Focus on <10 mAh/day

The current sweep is still spending too much effort on long scan windows and aggressive schedules that predict high energy use.

### Recommended fixed sweep grid

Use a dense grid around the efficient region:

```ts
FIXED_SCAN_INTERVALS_SECONDS = [
  7.5,
  10,
  12.5,
  15,
  20,
  30,
  42.5
];

FIXED_ADV_INTERVALS_SECONDS = [
  1.0,
  1.25,
  1.5,
  2.0,
  2.5,
  3.0,
  4.0,
  5.0
];

FIXED_SCAN_WINDOWS_SECONDS = [
  0.25,
  0.35,
  0.5,
  0.75,
  1.0
];

FIXED_ADVERTISING_BURST_SECONDS = 2;
```

This grid strongly samples the plausible deployable region.

Trial count:

```text
7 × 8 × 5 = 280 fixed schedules
```

If too large for fast mode, use the reduced grid below.

### Reduced smoke-test grid

```ts
FIXED_SCAN_INTERVALS_SECONDS = [
  10,
  15,
  20,
  30,
  42.5
];

FIXED_ADV_INTERVALS_SECONDS = [
  1.0,
  1.25,
  2.13,
  4.0,
  5.0
];

FIXED_SCAN_WINDOWS_SECONDS = [
  0.35,
  0.5,
  0.75
];

FIXED_ADVERTISING_BURST_SECONDS = 2;
```

Trial count:

```text
5 × 5 × 3 = 75 fixed schedules
```

This is a much better smoke-test grid than one that includes many high-energy scan windows.

---

## 6. Inactivity Multiplier Grid

The inactivity scan downshift has become a useful quasi-adaptive feature, but the current multiplier choices are too sparse.

### Recommended multipliers

```ts
INACTIVE_SCAN_INTERVAL_MULTIPLIERS = [
  1,    // disabled / fixed
  1.5,
  2,
  3,
  5
];
```

However, avoid multiplying the full fixed grid by all values if runtime becomes too large.

### Efficient implementation option

For each fixed schedule, evaluate:

```text
1× and 2×
```

by default.

Then add:

```text
3× and 5×
```

only for schedules whose fixed version has:

```text
mAh/day < 6
captureRate >= 0.45
```

This is a two-stage sweep and is more efficient.

### Simple implementation option

If two-stage sweep is too much for now, use:

```ts
INACTIVE_SCAN_INTERVAL_MULTIPLIERS = [1, 2, 5];
```

That matches current behavior and remains interpretable.

---

## 7. Adaptive Sweep Problem

The adaptive algorithm is operating in a narrow band because the timing anchors constrain it.

Current adaptive outputs are clustered around:

```text
mean scan interval:     ~20–33 s
mean scan window:       ~1.2–1.6 s
mean advertise interval: ~4.5–5.0 s
```

That is not exploring the same efficient region as the fixed policies, where strong results often involve:

```text
scan window:       0.35–0.5 s
advertise interval: 1.0–2.5 s
```

So the adaptive policy is not being given access to the best schedule family.

---

## 8. Adaptive Anchors: Add a Deployable/Efficient Anchor Set

Create an adaptive anchor preset specifically for low-energy efficient discovery.

### New anchor preset: `efficientDiscoveryAdaptiveAnchors`

```ts
efficientDiscoveryAdaptiveAnchors = {
  lowIntensity: {
    scanIntervalSeconds: 45,
    scanWindowSeconds: 0.35,
    advIntervalSeconds: 2.5
  },

  neutral: {
    scanIntervalSeconds: 20,
    scanWindowSeconds: 0.5,
    advIntervalSeconds: 1.25
  },

  highIntensity: {
    scanIntervalSeconds: 7.5,
    scanWindowSeconds: 0.75,
    advIntervalSeconds: 1.0
  },

  advertisingBurstDurationSeconds: 2
};
```

This anchor set lets adaptive policies explore the same efficient regime as the best fixed policies.

### Keep existing anchor preset as optional

The current anchor set:

```text
low 60 / 0.75 / 5
neutral 20 / 1.5 / 5
high 5 / 3 / 1.5
```

should remain available but should not be the only adaptive sweep region. It is too wide in scan window and too narrow around advertise interval.

---

## 9. Adaptive Parameter Grid: Broaden the Band

The current adaptive parameter grid should include lower baseline drive and more varied peer/motion balance.

### Recommended adaptive grid

```ts
ADAPTIVE_BASELINE_DRIVES = [
  0.05,
  0.10,
  0.15,
  0.25,
  0.35
];

ADAPTIVE_MOTION_WEIGHTS = [
  0.15,
  0.30,
  0.45
];

ADAPTIVE_PEER_WEIGHTS = [
  0.25,
  0.55,
  0.85
];

ADAPTIVE_TAU_PEER_SECONDS = [
  180,
  300,
  600,
  900
];
```

Full count:

```text
5 × 3 × 3 × 4 = 180 adaptive policies
```

### Reduced smoke-test adaptive grid

```ts
ADAPTIVE_BASELINE_DRIVES = [
  0.05,
  0.15,
  0.25
];

ADAPTIVE_MOTION_WEIGHTS = [
  0.15,
  0.45
];

ADAPTIVE_PEER_WEIGHTS = [
  0.25,
  0.55,
  0.85
];

ADAPTIVE_TAU_PEER_SECONDS = [
  300,
  900
];
```

Count:

```text
3 × 2 × 3 × 2 = 36 adaptive policies
```

This is similar in size to the current grid but covers a wider operating range.

---

## 10. Adaptive Held Constants

Use the softer current constants:

```ts
tauMotionSeconds = 180;
motionGain = 0.35;
peerGain = 0.45;
peerMissPenalty = 0.2;
allowEnergySavingDownscale = true;
peerDetectionCountSaturation = 1;
motionEventCountSaturation = 1;
```

But add one more experimental setting later:

```ts
peerMissPenalty = 0.1
```

Reason: when scan windows are short and scan intervals are stretched during low intensity, absence of detection is weak negative evidence. Penalizing peer drive too strongly may collapse adaptive sampling prematurely.

For now, keep 0.2 unless adding a larger adaptive grid.

---

## 11. Report Visuals: Add an Energy Ceiling Line

For the capture-vs-energy plot:

```text
x-axis: mAh/day
y-axis: capture rate
```

Add vertical reference lines:

```text
x = 5 mAh/day
x = 10 mAh/day
```

Label:

```text
practical small-battery region
```

The 10 mAh/day line is especially important. Policies to the right of this line should be visually de-emphasized by default.

---

## 12. Report Tables: Default Sort and Filters

### Default table filter

```text
mAh/day < 10
```

### Default sort

```text
BLE efficiency descending
```

### Secondary sort options

```text
capture rate descending
mAh/day ascending
relative capture descending
Pareto only
```

### Required table columns

```text
policyId
kind
captureRate
mAhPerDay
bleEfficiency
relativeCapture
relativeEnergy
scanInterval
scanWindow
advertiseInterval
inactiveScanMultiplier
meanScanInterval
meanScanWindow
meanAdvertiseInterval
energyClass
```

For adaptive rows, include:

```text
baselineDrive
motionWeight
peerWeight
tauPeerSeconds
meanSamplingDrive
percentTimeBelowFixed
percentTimeNearFixed
percentTimeAboveFixed
```

---

## 13. Pareto Frontier Should Use Deployable Filter

Compute two Pareto frontiers:

### 13.1 Full frontier

All policies.

### 13.2 Deployable frontier

Only policies where:

```text
mAh/day < 10
```

The deployable frontier should be shown by default.

This prevents high-energy policies from visually dominating the frontier.

---

## 14. Optimizer Updates

The surrogate optimizer should also support an energy ceiling.

Add:

```ts
optimizerEnergyCeilingMahPerDay = 10;
```

Recommendation candidates should be generated and ranked with:

```text
predicted mAh/day < 10
```

unless the user disables the energy ceiling.

The optimizer should report:

```text
best predicted deployable efficiency
best predicted deployable balanced
best predicted deployable high-capture
```

---

## 15. Acceptance Criteria

### 15.1 Sweep includes deployable efficient region

The fixed sweep must include policies near:

```text
scan interval: 10–20 s
scan window: 0.35–0.5 s
advertise interval: 1–2.5 s
```

### 15.2 Adaptive sweep can reach efficient region

Adaptive anchors must include a neutral region near:

```text
scan interval: 20 s
scan window: 0.5 s
advertise interval: 1.25 s
```

or the adaptive algorithm will remain artificially narrow and miss the best-performing regime.

### 15.3 Report highlights <10 mAh/day

Default report tables and plots should emphasize:

```text
mAh/day < 10
```

High-energy policies should be available but not dominant.

### 15.4 Recommendations respect energy ceiling

Primary recommendations should not select policies above:

```text
10 mAh/day
```

unless no qualifying policies exist or the user explicitly disables the ceiling.

### 15.5 Include energy-class labels

Each policy row should include:

```text
deployable
high_energy
near_always_on
```

based on mAh/day thresholds.

---

## 16. Suggested Implementation Order

1. Add `deploymentEnergyCeilingMahPerDay = 10`.
2. Add energy-class labeling to sweep summaries.
3. Add report/table filter for `<10 mAh/day`.
4. Add vertical 5 and 10 mAh/day lines to capture-vs-energy plots.
5. Replace or add fixed sweep grid focused on short scan windows and frequent advertising.
6. Add efficient adaptive anchor preset.
7. Expand adaptive baseline/weight/tau ranges.
8. Update recommendation logic to select deployable candidates.
9. Add deployable Pareto frontier.
10. Update optimizer to honor energy ceiling.

---

## 17. Final Direction

The current exercise should stop spending many trials on policies that consume >10 mAh/day unless explicitly exploring the capture ceiling.

For practical small-animal wearables, the sweep should concentrate on:

```text
brief scan windows
frequent advertising
moderate scan intervals
inactivity-based scan downshift
mAh/day < 10
```

The adaptive policy should be given access to this same regime. Otherwise it is being compared unfairly from a narrow and less efficient schedule band.
