# Review: BLE Policy Sweep Strategy

**Audience:** Developer agent  
**Subject:** Review of `sweep_procedure_outline.md` as a standalone strategy  
**Goal:** Evaluate whether the sweep design is scientifically and analytically sound without assuming prior discussions or implementation history.

---

## Executive Summary

The sweep strategy is directionally strong. It is practical, interpretable, and well-scoped for a first-pass optimization tool. The key strengths are:

1. It compares fixed-rate and adaptive policies under the same world configuration.
2. It includes the Juxta fixed-rate schedule as a per-seed reference point.
3. It reports both absolute metrics and metrics relative to the Juxta baseline.
4. It keeps the first sweep small enough to interpret.
5. It separates fixed-policy exploration from adaptive-policy exploration.
6. It supports fast single-seed iteration and slower multi-seed report mode.

The main recommendation is to make the sweep report more explicit about **tradeoff interpretation**. The sweep should not merely rank policies by BLE efficiency. It should identify policies in three categories:

```text
best energy-saving policy
best balanced policy
best high-capture policy
```

This avoids selecting a low-energy policy that appears efficient but sacrifices too much capture.

---

## 1. Overall Assessment

The sweep design is sound for a direction-setting analysis.

The procedure compares:

```text
fixed-rate BLE schedules
vs.
motion + peer adaptive BLE schedules
```

under the same animal movement, enclosure, radio, and simulation assumptions.

That is the right framing. The sweep should answer:

```text
Does adaptive sampling produce a better capture-energy tradeoff than simply choosing a better fixed-rate schedule?
```

Including both fixed and adaptive families is important because otherwise adaptive policies may look good merely because the fixed baseline was not well chosen.

---

## 2. Strong Design Choices

### 2.1 Per-seed Juxta baseline normalization

The procedure defines relative metrics per seed using the Juxta fixed baseline row:

```text
kind === "baseline_fixed"
policyId === "sweep-baseline-juxta-fixed"
```

This is a good choice.

Because random seeds can change movement trajectories and opportunity counts, relative metrics should be computed within seed before aggregation. That avoids a policy looking better or worse because it happened to be evaluated against a different random movement scenario.

Keep this.

---

### 2.2 Fast vs Report modes

The two-mode strategy is appropriate:

```text
Fast mode: current seed only
Report mode: fixed seeds 101, 202, 303
```

Fast mode supports interactive development and UI testing.

Report mode provides a minimal check against seed-specific artifacts.

Three seeds is not enough for final statistical claims, but it is enough for first-pass direction setting.

Keep this.

---

### 2.3 Quick vs Full grid

The default quick grid is reasonable:

```text
27 fixed policies + 24 adaptive policies = 51 policies per seed
```

This is small enough to run and interpret.

The full grid is also reasonable as an optional build-time expansion:

```text
100 fixed policies + 90 adaptive policies = 190 policies per seed
```

However, the quick grid should remain the default.

Keep this.

---

### 2.4 Fixed-rate sweep is valuable

Sweeping fixed-rate policies is essential.

If the adaptive policy beats only a single fixed baseline, the result is weaker. If it beats or complements a family of fixed-rate schedules, the result is more compelling.

The fixed sweep allows the report to answer:

```text
Is adaptation useful, or would a different fixed scan/advertise schedule be enough?
```

Keep this.

---

### 2.5 Adaptive timing anchors are interpretable

The adaptive timing anchors are clear:

| Tier | Scan interval | Scan window | Advertise interval |
|---|---:|---:|---:|
| Low | 60 s | 0.75 s | 15 s |
| Neutral | 20 s | 1.5 s | 5 s |
| High | 5 s | 3 s | 1.5 s |

This makes the adaptive policy interpretable:

```text
low = energy-saving
neutral = Juxta-like fixed baseline
high = aggressive capture
```

This is a good structure for the first sweep.

---

## 3. Main Concerns and Recommended Changes

### 3.1 Do not rank only by BLE efficiency

The current summary sorts policies by mean BLE efficiency. That is useful, but it should not be the only decision rule.

BLE efficiency is defined as:

```text
BLE capture rate / mAh per day
```

A very low-energy policy can look efficient while failing to capture enough social-contact opportunities.

Recommendation:

Keep efficiency ranking, but add candidate classes:

```text
Energy-saving candidate:
  relativeEnergy < 1.0
  relativeCapture >= 0.90

Balanced candidate:
  relativeCapture >= 1.0
  relativeEnergy <= 1.15

High-capture candidate:
  highest mean capture rate, with energy cost reported
```

The report should clearly distinguish these from the single highest-efficiency policy.

---

### 3.2 Add a minimum capture threshold to all “best” recommendations

The adaptive candidate selector already uses:

```text
mean capture >= 0.8 × baseline mean capture
```

That is a good minimum threshold for preventing obviously poor capture policies from being selected.

Recommendation:

Apply a similar threshold to fixed-policy recommendations, or at least display when the best-efficiency fixed policy falls below a capture-retention threshold.

Suggested threshold:

```text
minimumCaptureRetention = 0.80 × Juxta baseline capture
```

For a stricter report-level recommendation:

```text
preferredCaptureRetention = 0.90 × Juxta baseline capture
```

Use 0.80 as a hard eligibility floor and 0.90 as a “good retention” label.

---

### 3.3 Report Pareto candidates, not only ranks

A ranked table is useful, but optimization tradeoffs are easier to understand with a Pareto frontier.

Add a simple Pareto classification over:

```text
maximize meanCaptureRate
minimize meanMahPerDay
```

A policy is Pareto-dominated if another policy has:

```text
capture >= this policy's capture
energy <= this policy's energy
```

with at least one strict improvement.

Recommended addition:

```text
isParetoEfficient: boolean
```

for each summary row.

In the plots, visually emphasize Pareto-efficient policies.

This will make the report much more consumable.

---

### 3.4 Adaptive quick grid may under-sample peerWeight

The quick adaptive grid uses:

```text
peerWeight = 0.35, 0.85
```

That gives low-ish and high-ish peer influence, but skips a middle value.

Because peer persistence is likely one of the most important adaptive mechanisms, consider adding:

```text
peerWeight = 0.60
```

That would make the quick adaptive grid:

```text
3 × 2 × 3 × 2 = 36 adaptive policies
```

The total quick sweep becomes:

```text
27 fixed + 36 adaptive = 63 policies per seed
```

Still very manageable.

Recommendation:

Add a middle peer-weight value unless runtime is already a problem.

---

### 3.5 Adaptive quick grid may under-sample tauPeerSeconds

The quick grid uses:

```text
tauPeerSeconds = 120, 600
```

That tests short and long peer persistence, but not a middle condition.

A middle value is scientifically useful because peer persistence is likely to have a non-linear tradeoff:

```text
too short  = loses co-resting / nesting continuity
middle     = preserves ongoing social contact
too long   = wastes energy after contact ends
```

Consider:

```text
tauPeerSeconds = 120, 300, 600
```

That would make the adaptive quick grid:

```text
3 × 2 × 2 × 3 = 36 policies
```

If both peerWeight and tauPeer add middle values:

```text
3 × 2 × 3 × 3 = 54 adaptive policies
```

Total quick sweep:

```text
27 fixed + 54 adaptive = 81 policies per seed
```

Still reasonable for a report mode if runtime is acceptable.

Recommendation:

At minimum, add a middle value for either `peerWeight` or `tauPeerSeconds`. Ideally add both if performance remains acceptable.

---

### 3.6 BaselineDrive quick values are plausible but should be explained

Current quick values:

```text
baselineDrive = 0.12, 0.28, 0.45
```

These are strongly energy-saving by default because all are below the neutral 0.5 anchor.

That is not wrong, but the report should explicitly explain it:

```text
The adaptive sweep intentionally tests policies whose inactive state is below fixed-rate intensity.
Motion and peer detections then push sampling back toward or above the fixed-rate schedule.
```

If the goal is to include an adaptive policy that defaults exactly to fixed-rate when idle, add:

```text
baselineDrive = 0.50
```

Recommendation:

Either:

1. keep the current values and explain that all adaptive baselines are energy-saving, or
2. include 0.50 in the quick grid.

A good quick set would be:

```text
baselineDrive = 0.12, 0.28, 0.45, 0.50
```

But this increases grid size. If keeping only three, use:

```text
baselineDrive = 0.20, 0.40, 0.50
```

This is easier to interpret.

---

## 4. Metrics Review

### 4.1 BLE capture rate

The core capture-rate metric is appropriate as long as it is epoch-integrated:

```text
opportunity = dyad was within detection radius at any point during the epoch
hit = at least one detection occurred for that unordered dyad in the same epoch
```

This is the right primary metric for system-level performance.

Recommendation:

In the sweep report, include these raw values:

```text
opportunityEpochs
hitEpochs
missedEpochs
```

Do not only show capture rate.

---

### 4.2 mAh/day

The energy metric is appropriate if the energy estimator is hardware-faithful.

Important caution:

```text
advertising burst duration should not be treated as continuous TX current
scan burst duration should account for internal scan duty
```

Recommendation:

The report should include a short note:

```text
Energy estimates depend on the configured Juxta radio-energy model and should be validated against empirical current measurements.
```

---

### 4.3 BLE efficiency

BLE efficiency is useful:

```text
BLE efficiency = capture rate / mAh per day
```

But it is a composite metric. It should be interpreted alongside capture and energy separately.

Recommendation:

Display efficiency, but do not let it replace the capture-vs-energy plot.

---

### 4.4 Relative metrics

Relative metrics are one of the strongest parts of the design.

Continue reporting:

```text
relativeCapture
relativeEnergy
relativeEfficiency
```

These make results easier to interpret than absolute values alone.

---

## 5. Plot Recommendations

The sweep UI should include at least these plots.

### 5.1 Capture rate vs mAh/day

```text
x-axis: mAh/day
y-axis: BLE capture rate
```

Interpretation:

```text
upper-left = better
```

This should be the primary optimization plot.

---

### 5.2 Relative capture vs relative energy

```text
x-axis: relativeEnergy
y-axis: relativeCapture
```

Add reference lines:

```text
x = 1
y = 1
```

Quadrants:

```text
upper-left  = better capture, lower energy
upper-right = better capture, higher energy
lower-left  = lower capture, lower energy
lower-right = lower capture, higher energy
```

This is probably the most digestible plot for non-technical users.

---

### 5.3 BLE efficiency vs capture rate

```text
x-axis: BLE capture rate
y-axis: BLE efficiency
```

This plot helps identify the efficiency sweet spot.

Avoid using efficiency alone because a low-capture point can look deceptively good.

---

### 5.4 Optional: sampling-drive behavior plot

For adaptive policies, add a small plot or table fields:

```text
meanSamplingDrive
percentTimeBelowFixed
percentTimeNearFixed
percentTimeAboveFixed
```

This helps explain why a policy performed well or poorly.

---

## 6. Candidate Selection Recommendations

The current candidate selection includes:

```text
bestFixed = highest mean BLE efficiency among fixed policies
bestAdaptive = highest mean BLE efficiency among adaptives with capture >= 0.8 × baseline
```

This is acceptable for a first implementation, but the final report should be richer.

Recommended candidate classes:

### 6.1 Best fixed-efficiency policy

Pool:

```text
Juxta baseline + fixed_sweep policies
```

Rule:

```text
highest mean BLE efficiency
```

Report capture-retention status:

```text
relativeCapture >= 0.8
relativeCapture >= 0.9
```

---

### 6.2 Best adaptive-efficiency policy

Pool:

```text
adaptive policies
```

Rule:

```text
highest mean BLE efficiency among policies with relativeCapture >= 0.8
```

Current behavior already does this.

---

### 6.3 Energy-saving adaptive candidate

Rule:

```text
relativeEnergy < 1.0
relativeCapture >= 0.90
```

Rank by lowest relative energy.

---

### 6.4 Balanced adaptive candidate

Rule:

```text
relativeCapture >= 1.0
relativeEnergy <= 1.15
```

Rank by highest BLE efficiency.

---

### 6.5 High-capture adaptive candidate

Rule:

```text
highest mean capture rate
```

Always display energy penalty clearly.

---

## 7. Recommended Changes to the Current Outline

### Must-have

1. Add explicit candidate classes beyond “best efficiency.”
2. Show capture threshold status for both fixed and adaptive recommendations.
3. Add or compute Pareto-efficient flags.
4. Include opportunity, hit, and miss counts in the report table.
5. Ensure the markdown export includes the same recommendations shown in the UI.

### Should-have

1. Add a middle `peerWeight` value.
2. Add a middle `tauPeerSeconds` value.
3. Consider including `baselineDrive = 0.50`, or adjust to a simpler set such as `0.20, 0.40, 0.50`.
4. Include percent time below/near/above fixed-rate in the summary table.
5. Add explanatory text for how to interpret relative-energy and relative-capture plots.

### Nice-to-have

1. Add Pareto frontier highlighting in scatter plots.
2. Add warning labels for policies with high capture but large energy penalties.
3. Add repeated-seed confidence intervals once more seeds are available.
4. Add a “simulate this policy” button to all recommendation cards, not only table rows.

---

## 8. Scientific Interpretation Guidance

The sweep should be presented as a first-pass design-space search, not as a final optimizer.

Use language like:

```text
This sweep identifies candidate policy regions that appear promising under the current simulated movement, sociality, radio, and energy assumptions.
```

Avoid language like:

```text
This sweep identifies the optimal BLE policy.
```

Because the results depend on:

```text
species behavior model
enclosure geometry
animal density
detection radius
radio calibration
energy model
simulation length
random seed
```

The correct conclusion is usually a candidate region, not a single universal policy.

---

## 9. Overall Verdict

This sweep strategy is solid and appropriate for the current stage.

It is especially strong because it compares adaptive policies against both:

```text
the Juxta baseline
and
a family of alternative fixed-rate schedules
```

That makes the adaptive comparison much more meaningful.

The main weakness is that the current recommendation logic appears too centered on BLE efficiency. Efficiency is important, but the report should explicitly separate:

```text
energy saving
balanced performance
maximum capture
```

Once those candidate classes and Pareto markers are added, the sweep will be much easier to interpret and more scientifically defensible.

---

## 10. Suggested Next Implementation Step

Implement the following small update:

```text
1. Add Pareto-efficient flag to each summary row.
2. Add energy-saving, balanced, and high-capture candidate cards.
3. Add capture-retention threshold badges.
4. Add a middle peerWeight or tauPeerSeconds value to the quick adaptive grid.
5. Update markdown export to include all candidate classes and interpretation notes.
```

This would make the sweep report useful for decision-making without turning it into a heavy optimization framework.
