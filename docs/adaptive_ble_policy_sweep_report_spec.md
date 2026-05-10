# Adaptive BLE Policy Sweep + Report Specification

**Project:** Biocosm / Juxta BLE social-proximity simulator  
**Purpose:** Add a small, interpretable adaptive-policy sweep that helps identify promising tradeoffs between BLE capture rate and energy use.  
**Audience:** Developer agent implementing the sweep UI/report and export.

---

## 1. Goal

Implement a lightweight parameter sweep for the adaptive BLE policy.

The sweep should answer:

```text
Which adaptive BLE policy settings improve capture rate, energy use, or capture-per-energy relative to the fixed-rate Juxta baseline?
```

This is a direction-setting tool, not a full optimizer yet.

The output should be a simple report with:

1. Fixed-rate baseline results.
2. Ranked adaptive candidates.
3. A few x-y plots.
4. One recommended energy-saving candidate.
5. One recommended balanced candidate.
6. One recommended high-capture candidate.

---

## 2. Baseline Policy

Use the current fixed-rate Juxta-style schedule as the baseline:

```ts
fixedBaseline = {
  type: "fixed",
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 5,
  advertisingBurstDurationSeconds: 2
};
```

The adaptive policy should remain neutral-anchored to this schedule:

```text
samplingDrive = 0.5 → fixed-rate-equivalent timing
```

---

## 3. Core Output Metrics

### 3.1 BLE Capture Rate

Use the existing system-level unordered dyad-epoch capture rate.

```text
BLE Capture Rate = hit dyad-epochs / true in-range dyad-epochs
```

A hit occurs when an unordered dyad is truly in range during the epoch and at least one BLE detection occurs for that dyad during the same epoch.

Do not redefine this metric for adaptive mode.

---

### 3.2 Energy Use

Report:

```text
mAh/day
```

Use the corrected Juxta energy model, not envelope duty as radio-on duty.

Energy should account for:

```text
scan energy ≈ scan burst duration × internal scan duty × RX current
advertising energy ≈ advertising event count × calibrated advertising event charge
baseline current
logging/write overhead if already modeled
```

If the simulator still includes envelope duty, label it as schedule pressure rather than energy.

---

### 3.3 BLE Efficiency

Define:

```text
BLE Efficiency = BLE Capture Rate / mAh per day
```

This is useful but should not be the only ranking metric, because very low-energy policies can look efficient while capturing too little.

---

### 3.4 Relative Metrics

For every adaptive run, compute:

```text
relativeCapture = adaptiveCaptureRate / fixedCaptureRate
relativeEnergy  = adaptiveMahPerDay / fixedMahPerDay
relativeEfficiency = adaptiveEfficiency / fixedEfficiency
```

Also compute:

```text
energySavedPercent = 100 × (1 - relativeEnergy)
captureChangePercent = 100 × (relativeCapture - 1)
```

---

## 4. Primary Plots

Generate three small x-y plots.

### 4.1 Capture Rate vs Energy

```text
x-axis: mAh/day
y-axis: BLE Capture Rate
```

Interpretation:

```text
upper-left = better capture with lower energy
```

Show the fixed-rate baseline as a large labeled reference point.

---

### 4.2 BLE Efficiency vs Capture Rate

```text
x-axis: BLE Capture Rate
y-axis: BLE Efficiency
```

Interpretation:

```text
upper-right = high capture and high capture-per-energy
```

This plot helps avoid selecting a low-capture policy just because it is efficient.

---

### 4.3 Relative Tradeoff Plot

```text
x-axis: relativeEnergy
y-axis: relativeCapture
```

Add reference lines:

```text
x = 1.0  fixed-rate energy
y = 1.0  fixed-rate capture
```

Quadrants:

```text
upper-left  = better capture, less energy
upper-right = better capture, more energy
lower-left  = worse capture, less energy
lower-right = worse capture, more energy
```

This should be the most consumable plot for quick decision-making.

---

## 5. First-Pass Adaptive Timing Anchors

Hold the timing anchors constant during the first sweep.

```ts
adaptiveTimingAnchors = {
  lowIntensity: {
    scanIntervalSeconds: 60,
    scanWindowSeconds: 0.75,
    advIntervalSeconds: 15
  },

  neutral: {
    scanIntervalSeconds: 20,
    scanWindowSeconds: 1.5,
    advIntervalSeconds: 5
  },

  highIntensity: {
    scanIntervalSeconds: 5,
    scanWindowSeconds: 3.0,
    advIntervalSeconds: 1.5
  },

  advertisingBurstDurationSeconds: 2
};
```

Rationale:

- Low intensity permits meaningful energy saving.
- Neutral equals the fixed-rate baseline.
- High intensity is aggressive but still plausible for short periods.
- The first sweep should test the drive logic before also sweeping scan/advertise bounds.

---

## 6. Parameter Grid (implementation)

Sweep only four adaptive parameters. The codebase uses **two grids** relative to fixed Juxta:

**Quick grid** (default interactive; anchors on Juxta as a sensible midpoint):

| Parameter | Values | Reason |
|---|---:|---|
| `baselineDrive` | `0.12`, `0.28`, `0.45` | Low / mid / higher floor — energy-down vs near-Juxta vs capture-up regimes. |
| `motionWeight` | `0.22`, `0.50` | Weak vs strong motion coupling (matches legacy sweep’s upper motion weight). |
| `peerWeight` | `0.35`, `0.85` | Moderate vs strong peer pull for upscale-capable corners. |
| `tauPeerSeconds` | `120`, `600` | Short vs longer peer persistence. |

```text
3 × 2 × 2 × 2 = 24 adaptive policies + fixed baseline per seed
```

**Full grid** (`VITE_SWEEP_FULL_GRID=true`):

| Parameter | Values |
|---|---|
| `baselineDrive` | `0.08`, `0.2`, `0.32`, `0.42`, `0.5` |
| `motionWeight` | `0.15`, `0.35`, `0.55` |
| `peerWeight` | `0.25`, `0.50`, `0.85` |
| `tauPeerSeconds` | `120`, `600` |

```text
5 × 3 × 3 × 2 = 90 adaptive policies + fixed baseline per seed
```

The original spec used `3 × 2 × 3 × 3 = 54`; the implementation keeps **90** cells and **brackets** fixed Juxta on the capture–energy plane: some policies sit southwest (lower duty), some northeast (higher capture / higher energy), not only one side of the baseline.

---

## 7. Held-Constant Adaptive Parameters

Hold these constant initially:

```ts
heldConstantAdaptiveParams = {
  tauMotionSeconds: 120,
  motionGain: 0.35,
  peerGain: 0.50,
  peerMissPenalty: 0.25,
  allowEnergySavingDownscale: true
};
```

Do not sweep these yet unless the first-pass results are obviously uninformative.

---

## 8. Recommended Candidate Labels

After running the sweep, identify three candidates.

### 8.1 Energy-Saving Candidate

Definition:

```text
relativeEnergy < 1.0
relativeCapture >= 0.90
```

Rank by:

```text
lowest relativeEnergy among policies that retain at least 90% of fixed-rate capture
```

If none meet the threshold, report the closest policy and mark it as not meeting the threshold.

---

### 8.2 Balanced Candidate

Definition:

```text
relativeCapture >= 1.0
relativeEnergy <= 1.15
```

Rank by:

```text
highest relativeEfficiency
```

This candidate should show whether adaptive mode can improve capture without a large energy penalty.

---

### 8.3 High-Capture Candidate

Definition:

```text
highest BLE Capture Rate
```

but include energy cost clearly.

Use this candidate to define the upper performance envelope, not necessarily the recommended firmware setting.

---

## 9. Guardrails

### 9.1 Do Not Rank by Efficiency Alone

A low-energy, low-capture policy may have high efficiency but be scientifically useless.

Use a minimum acceptable capture threshold.

For first-pass sweeps:

```text
minimum acceptable capture = 0.80 × fixedBaselineCaptureRate
```

Only policies above this threshold should be eligible for primary recommendations.

---

### 9.2 Report Absolute and Relative Values

Every ranked policy should show both:

```text
BLE Capture Rate
mAh/day
BLE Efficiency
relativeCapture
relativeEnergy
relativeEfficiency
```

This prevents misleading conclusions from relative metrics alone.

---

### 9.3 Fixed Baseline Must Always Be Visible

Every plot should include the fixed-rate baseline as a highlighted reference point.

Suggested label:

```text
Fixed Juxta baseline
```

---

## 10. Simulation Repeats

For the first implementation, support two modes.

### 10.1 Fast Preview Mode

```ts
seeds = [currentSeed]
```

Use this for interactive UI.

### 10.2 Report Mode

```ts
seeds = [101, 202, 303]
```

For each policy, run all seeds and report:

```text
mean
standard deviation
```

for:

```text
BLE Capture Rate
mAh/day
BLE Efficiency
relativeCapture
relativeEnergy
```

Three seeds are enough for direction-setting without making the sweep slow.

---

## 11. Report Structure

Generate a single downloadable report.

Suggested format:

```text
Adaptive BLE Policy Sweep Report

1. Simulation settings
2. Fixed-rate baseline
3. Top recommendations
4. Candidate table
5. Plots
6. Notes and caveats
7. Full parameter grid results
```

### 11.1 Simulation Settings

Include:

```text
simulation length
time step
animal count
species preset
enclosure geometry
detection radius
fixed baseline settings
adaptive timing anchors
number of seeds
```

### 11.2 Fixed-Rate Baseline

Show:

```text
BLE Capture Rate
mAh/day
BLE Efficiency
opportunity epochs
hit epochs
missed epochs
```

### 11.3 Top Recommendations

Include one card/table row each for:

```text
Energy-saving candidate
Balanced candidate
High-capture candidate
```

### 11.4 Candidate Table

Adaptive rows may include an inline **Simulate** control in the policy column: it loads that sweep cell’s adaptive parameters into the Simulator as **draft** settings (user rebuilds the timeline to inspect).

Columns:

```text
rank
label
baselineDrive
motionWeight
peerWeight
tauPeerSeconds
BLE Capture Rate
mAh/day
BLE Efficiency
relativeCapture
relativeEnergy
relativeEfficiency
meanSamplingDrive
percentTimeBelowFixed
percentTimeNearFixed
percentTimeAboveFixed
```

Define:

```text
below fixed = samplingDrive < 0.45
near fixed  = 0.45 <= samplingDrive <= 0.55
above fixed = samplingDrive > 0.55
```

### 11.5 Plots

Include:

1. Capture Rate vs Energy.
2. Efficiency vs Capture Rate.
3. Relative Capture vs Relative Energy.

### 11.6 Notes and Caveats

Include:

```text
This is a direction-setting sweep, not a final firmware optimizer.
Results depend on the selected movement, social, and radio assumptions.
BLE efficiency should not be interpreted without the capture-rate threshold.
Adaptive policy is evaluated using the same capture-rate metric as fixed-rate mode.
```

---

## 12. UI/UX Recommendation

Add a button near the adaptive policy controls:

```text
Run adaptive sweep
```

Options:

```text
Fast preview
Report mode
```

Outputs:

```text
Inline summary table
Simulate-from-row (policy column) to port a cell into the Simulator tab
Three plots
Download report
Download raw CSV
```

The UI should not expose the full combinatorial grid at first. Use the preset grid above (quick vs full via build flag).

Advanced users can later unlock custom sweep ranges.

---

## 13. Raw Export

Export a CSV with one row per policy per seed.

Required columns:

```text
policyId
seed
baselineDrive
motionWeight
peerWeight
tauPeerSeconds
tauMotionSeconds
motionGain
peerGain
peerMissPenalty
allowEnergySavingDownscale

captureRate
mAhPerDay
bleEfficiency

relativeCapture
relativeEnergy
relativeEfficiency

opportunityEpochs
hitEpochs
missedEpochs

meanSamplingDrive
percentTimeBelowFixed
percentTimeNearFixed
percentTimeAboveFixed

meanScanIntervalSeconds
meanScanWindowSeconds
meanAdvIntervalSeconds
```

Also export a summarized CSV with one row per policy averaged across seeds.

---

## 14. Acceptance Criteria

### 14.1 Baseline visibility

The fixed-rate baseline appears in every plot and table.

### 14.2 Grid size

Quick mode runs **24 adaptive policies + fixed baseline** per seed. Full-grid mode (**`VITE_SWEEP_FULL_GRID=true`**) runs **90 adaptive policies + fixed baseline** per seed.

### 14.3 Neutral anchor

All adaptive policies use the same neutral timing as the fixed baseline.

### 14.4 Metrics consistency

Capture rate is computed the same way for fixed and adaptive policies.

### 14.5 Candidate selection

The report identifies:

```text
energy-saving candidate
balanced candidate
high-capture candidate
```

or explicitly states when no policy satisfies the candidate threshold.

### 14.6 Exportability

The user can download:

```text
markdown or HTML report
raw CSV
summary CSV
```

---

## 15. Out of Scope for This Pass

Do not implement these yet:

```text
genetic algorithms
Bayesian optimization
large parameter grids
full scan/advertise timing anchor sweeps
directed capture metrics
collar-loss models
dyad-specific contact probability optimization
firmware auto-generation
```

Those can come after the first report clarifies whether adaptive sampling is promising.

---

## 16. Recommended Implementation Approach

This does not require an expensive AI model if the task is scoped as above.

Cursor auto mode should be sufficient for:

```text
adding the fixed parameter grid
running repeated simulations
collecting metrics
building the summary table
exporting CSV
creating basic scatter plots
adding a downloadable report
```

Use a stronger model only for:

```text
reviewing metric correctness
debugging subtle stochastic/reproducibility issues
refactoring the simulation engine
checking energy-model assumptions
designing the next optimization phase
```

Recommended workflow:

1. Implement with Cursor auto mode.
2. Run tests and inspect a small sweep.
3. Use a stronger reasoning model for review only if plots look suspicious or metrics disagree with expectations.
4. Keep this first sweep deterministic and small.
