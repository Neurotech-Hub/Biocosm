# Spec: In-App Surrogate Optimizer for BLE Policy Sweeps

**Project:** Biocosm  
**Feature:** Browser-based empirical optimizer for BLE scan/advertise policy parameters  
**Audience:** Developer agent  
**Goal:** Use completed sweep results to fit a lightweight response-surface model, predict promising adaptive BLE policies, and verify candidates by simulation.

---

## 1. Purpose

Add an in-app optimization workflow that helps users move from:

```text
manual sweep → observed tradeoff plots
```

to:

```text
empirical model → predicted candidates → verification simulations
```

The optimizer should ingest existing sweep results, fit simple empirical models for BLE capture and energy use, generate new candidate adaptive policies, predict their performance, and recommend a small set of policies for simulation.

This feature is not intended to replace simulation. It proposes **candidate regions** that must be verified by running the simulator.

---

## 2. Why This Belongs in the Browser App

The current sweep datasets are small enough for browser-side modeling:

```text
quick sweep: ~51 policies per seed
report sweep: ~153 rows for 3 seeds
future sweep: hundreds to low thousands of rows
candidate sampling: 10,000–50,000 generated policies
```

This is well within browser capability using TypeScript and standard numeric routines.

Keeping the optimizer in-app gives the best workflow:

```text
Run sweep
→ Fit empirical model
→ Generate predicted Pareto frontier
→ Select candidate policies
→ Simulate recommended candidates
→ Compare predicted vs verified performance
```

Python can remain useful later for publication-grade modeling, cross-validation, Bayesian optimization, or larger analyses, but the first implementation should be in the app.

---

## 3. User-Facing Feature Name

Suggested UI label:

```text
Policy Optimizer
```

or:

```text
Surrogate Optimizer
```

Preferred explanatory subtitle:

```text
Fit an empirical response surface from sweep results, predict promising adaptive policies, and verify them by simulation.
```

---

## 4. Inputs

The optimizer should use the existing sweep summary rows and/or raw rows.

### 4.1 Required input rows

Use sweep summary rows with at least:

```ts
type SweepPolicySummary = {
  policyId: string;
  kind: "baseline_fixed" | "fixed_sweep" | "adaptive";

  meanCaptureRate: number;
  meanMahPerDay: number;
  meanBleEfficiency: number;

  meanRelativeCapture?: number;
  meanRelativeEnergy?: number;
  meanRelativeEfficiency?: number;

  adaptive_baselineDrive?: number;
  adaptive_motionWeight?: number;
  adaptive_peerWeight?: number;
  adaptive_tauPeerSeconds?: number;

  // Optional, if available:
  meanSamplingDrive?: number;
  percentTimeBelowFixed?: number;
  percentTimeNearFixed?: number;
  percentTimeAboveFixed?: number;
};
```

### 4.2 Initial model training data

For v1, train on **adaptive rows only**.

Rationale:

Fixed-rate rows do not have the same parameterization as adaptive rows. Mixing fixed and adaptive rows into one model would require a larger policy-family model and is not necessary for first-pass optimization.

Use:

```ts
trainingRows = summaries.filter(row => row.kind === "adaptive")
```

Each row contributes:

```text
x = [baselineDrive, motionWeight, peerWeight, tauPeerSeconds]
y1 = meanCaptureRate
y2 = meanMahPerDay
```

Do not train directly on efficiency only.

---

## 5. Outputs

The optimizer should produce:

1. A fitted capture model.
2. A fitted energy model.
3. A generated candidate set.
4. Predicted metrics for each candidate.
5. A predicted Pareto frontier.
6. Recommended candidate policies.
7. An option to simulate recommended candidates.
8. A predicted-vs-verified comparison table after simulation.

---

## 6. Core Modeling Approach

### 6.1 Recommended v1 model

Use a quadratic response-surface model with pairwise interactions.

For four parameters:

```text
x1 = baselineDrive
x2 = motionWeight
x3 = peerWeight
x4 = tauPeerSecondsNormalized
```

Use features:

```text
1
x1, x2, x3, x4
x1², x2², x3², x4²
x1*x2, x1*x3, x1*x4, x2*x3, x2*x4, x3*x4
```

This gives 15 features total.

Fit two separate models:

```text
predictedCaptureRate = f(parameters)
predictedMahPerDay = g(parameters)
```

Then compute:

```text
predictedBleEfficiency = predictedCaptureRate / predictedMahPerDay
```

Do not fit efficiency directly as the primary model.

### 6.2 Normalize parameters

Normalize inputs before fitting.

Recommended normalization:

```ts
xNorm = (x - minAllowed) / (maxAllowed - minAllowed)
```

For `tauPeerSeconds`, log scaling may be better:

```ts
tauNorm =
  (log(tauPeerSeconds) - log(minTau)) /
  (log(maxTau) - log(minTau))
```

Use the same transform for training rows and generated candidates.

### 6.3 Regularization

Because the quick sweep may have relatively few adaptive rows, use ridge regression rather than plain least squares.

Implement:

```text
beta = (XᵀX + λI)^-1 Xᵀy
```

Recommended default:

```ts
ridgeLambda = 1e-4
```

Allow this as an advanced setting later, but hard-code for v1.

Do not regularize the intercept if convenient; if simpler, regularizing all coefficients is acceptable for v1.

### 6.4 Output clamping

Clamp predictions to physically plausible ranges:

```ts
predictedCaptureRate = clamp(predictedCaptureRate, 0, 1);
predictedMahPerDay = Math.max(predictedMahPerDay, minEnergyFloor);
predictedBleEfficiency = predictedCaptureRate / predictedMahPerDay;
```

Suggested:

```ts
minEnergyFloor = 0.001;
```

---

## 7. Candidate Generation

### 7.1 Parameter ranges

Generate adaptive candidates within allowed bounds.

Use v1 ranges based on the current sweep design:

```ts
candidateBounds = {
  baselineDrive: { min: 0.05, max: 0.50 },
  motionWeight: { min: 0.10, max: 0.70 },
  peerWeight: { min: 0.20, max: 1.10 },
  tauPeerSeconds: { min: 60, max: 900 }
};
```

These ranges intentionally include but slightly extend the current sweep grid.

### 7.2 Sampling method

Use deterministic random sampling with a seed.

Recommended:

```ts
candidateCount = 20000;
optimizerSeed = "optimizer-001";
```

Sampling rules:

```ts
baselineDrive ~ uniform(0.05, 0.50)
motionWeight ~ uniform(0.10, 0.70)
peerWeight ~ uniform(0.20, 1.10)
tauPeerSeconds ~ logUniform(60, 900)
```

Use log-uniform for `tauPeerSeconds` because decay constants often matter multiplicatively.

### 7.3 Optional grid mode

For debugging, support a deterministic small grid:

```text
baselineDrive: 10 values
motionWeight: 10 values
peerWeight: 10 values
tauPeerSeconds: 10 log-spaced values
```

This yields 10,000 candidates.

Random sampling is preferred for the main UI.

---

## 8. Predicted Metrics

For each generated candidate, compute:

```ts
type PredictedPolicyCandidate = {
  candidateId: string;

  baselineDrive: number;
  motionWeight: number;
  peerWeight: number;
  tauPeerSeconds: number;

  predictedCaptureRate: number;
  predictedMahPerDay: number;
  predictedBleEfficiency: number;

  predictedRelativeCapture: number;
  predictedRelativeEnergy: number;
  predictedRelativeEfficiency: number;

  isPredictedPareto: boolean;

  recommendationTags: string[];
};
```

Relative metrics should be computed against the Juxta baseline summary:

```ts
predictedRelativeCapture = predictedCaptureRate / baseline.meanCaptureRate;
predictedRelativeEnergy = predictedMahPerDay / baseline.meanMahPerDay;
predictedRelativeEfficiency = predictedBleEfficiency / baseline.meanBleEfficiency;
```

Guard against missing or zero baseline values.

---

## 9. Pareto Frontier

Compute the predicted Pareto frontier over:

```text
maximize predictedCaptureRate
minimize predictedMahPerDay
```

A candidate is dominated if another candidate has:

```text
capture >= this.capture
energy <= this.energy
```

with at least one strict improvement.

Implement:

```ts
isParetoEfficient(candidates)
```

For performance, sort by energy ascending and walk maximum capture.

Algorithm:

```ts
sorted = candidates.sort((a, b) => a.predictedMahPerDay - b.predictedMahPerDay)

bestCaptureSoFar = -Infinity

for candidate in sorted:
  if candidate.predictedCaptureRate > bestCaptureSoFar:
    candidate.isPredictedPareto = true
    bestCaptureSoFar = candidate.predictedCaptureRate
  else:
    candidate.isPredictedPareto = false
```

This assumes lower energy is sorted first and higher capture is better.

---

## 10. Recommendation Rules

Produce a small set of named recommended candidates.

### 10.1 Energy-saving candidate

Eligibility:

```text
predictedRelativeEnergy < 1.0
predictedRelativeCapture >= 0.90
```

Rank by:

```text
lowest predictedRelativeEnergy
```

If none qualify, return the closest candidate and mark:

```text
"No candidate met the 90% capture-retention threshold."
```

### 10.2 Balanced candidate

Eligibility:

```text
predictedRelativeCapture >= 1.0
predictedRelativeEnergy <= 1.15
```

Rank by:

```text
highest predictedBleEfficiency
```

If none qualify, return the highest-efficiency candidate with `predictedRelativeCapture >= 0.90`.

### 10.3 High-capture candidate

Eligibility:

```text
all valid predicted candidates
```

Rank by:

```text
highest predictedCaptureRate
```

Always show energy cost.

### 10.4 Max-efficiency candidate

Eligibility:

```text
predictedRelativeCapture >= 0.80
```

Rank by:

```text
highest predictedBleEfficiency
```

This may overlap with other categories.

### 10.5 Pareto knee candidate

Optional but useful.

Find a candidate on the predicted Pareto frontier that is closest to the ideal normalized point:

```text
relativeEnergy = min among Pareto candidates
relativeCapture = max among Pareto candidates
```

A simple approach:

```ts
normalize relativeEnergy and relativeCapture within Pareto set

distanceToIdeal =
  sqrt((normEnergy - 0)^2 + (normCapture - 1)^2)
```

Pick the minimum distance.

---

## 11. Verification Simulation

Predicted candidates should not be treated as final.

Add a button:

```text
Simulate recommended candidates
```

This should run the simulator on the selected predicted candidates using the same sweep/report seeds or current seed.

### 11.1 Verification output

After simulation, show:

```ts
type VerifiedCandidateResult = {
  candidateId: string;
  recommendationRole: string;

  predictedCaptureRate: number;
  verifiedCaptureRate: number;

  predictedMahPerDay: number;
  verifiedMahPerDay: number;

  predictedBleEfficiency: number;
  verifiedBleEfficiency: number;

  capturePredictionError: number;
  energyPredictionError: number;
  efficiencyPredictionError: number;
};
```

Prediction error:

```ts
capturePredictionError = verifiedCaptureRate - predictedCaptureRate;
energyPredictionError = verifiedMahPerDay - predictedMahPerDay;
efficiencyPredictionError = verifiedBleEfficiency - predictedBleEfficiency;
```

### 11.2 Candidate promotion

Use labels:

```text
Predicted candidate
Verified candidate
```

Only after simulation should a candidate be shown as verified.

---

## 12. UI / UX

### 12.1 Placement

Add this below or beside the Sweep Report tab:

```text
Optimizer
```

or as a sub-panel inside the Sweep tab:

```text
Optimize from sweep
```

### 12.2 Controls

Basic controls:

```text
Candidate count: 5,000 / 20,000 / 50,000
Minimum capture retention: 0.80 / 0.90 / custom
Optimizer seed
Run optimizer
Simulate recommended candidates
```

Advanced controls:

```text
baselineDrive min/max
motionWeight min/max
peerWeight min/max
tauPeerSeconds min/max
ridge lambda
```

Default state should work without touching advanced controls.

### 12.3 Main visuals

Add three plots.

#### Plot 1: Observed and predicted capture vs energy

```text
x-axis: mAh/day
y-axis: BLE capture rate
```

Show:

```text
observed sweep points
predicted candidates, faint
predicted Pareto frontier
verified candidates, emphasized
Juxta baseline
```

#### Plot 2: Predicted efficiency vs capture

```text
x-axis: BLE capture rate
y-axis: BLE efficiency
```

Show recommended candidates.

#### Plot 3: Predicted vs verified

After verification:

```text
x-axis: predicted value
y-axis: verified value
```

For:

```text
capture rate
mAh/day
efficiency
```

If space is limited, use a table instead.

---

## 13. Tables

### 13.1 Model fit summary

Show:

```text
Training rows
Feature count
R² capture model
R² energy model
R² efficiency derived, optional
Ridge lambda
```

For model R², use in-sample R² initially.

If easy, add leave-one-out or k-fold cross-validation later.

### 13.2 Recommendation table

Columns:

```text
Role
candidateId
baselineDrive
motionWeight
peerWeight
tauPeerSeconds
predictedCaptureRate
predictedMahPerDay
predictedBleEfficiency
predictedRelativeCapture
predictedRelativeEnergy
isPredictedPareto
verifiedCaptureRate
verifiedMahPerDay
verifiedBleEfficiency
```

---

## 14. Exports

Add exports for:

```text
optimizer_predictions.csv
optimizer_recommendations.csv
optimizer_verification.csv
optimizer_report.md
```

### 14.1 Predictions CSV

One row per generated candidate.

### 14.2 Recommendations CSV

One row per recommended candidate.

### 14.3 Verification CSV

One row per candidate that was actually simulated.

### 14.4 Markdown report

Include:

1. Sweep source summary.
2. Model fit summary.
3. Candidate generation bounds.
4. Recommended candidates.
5. Verification results if present.
6. Caveats.

---

## 15. Caveats to Display in UI

Include this text in the panel or report:

```text
The optimizer fits an empirical model to completed simulation sweeps. Recommendations are predicted candidates, not final firmware settings. Candidate policies should be verified by simulation and validated on hardware before deployment.
```

Also include:

```text
The model is trained under the current movement, sociality, radio, and energy assumptions. Changing species, enclosure, detection radius, or energy model may change the recommended policy.
```

---

## 16. Acceptance Criteria

### 16.1 Model fitting

- The optimizer trains on adaptive sweep rows only.
- It fits separate models for capture rate and mAh/day.
- It computes efficiency from predicted capture and predicted energy.

### 16.2 Candidate generation

- It generates at least 5,000 candidate adaptive policies.
- Candidate generation is deterministic for a given optimizer seed.
- `tauPeerSeconds` is sampled log-uniformly.

### 16.3 Pareto computation

- Each candidate has `isPredictedPareto`.
- Pareto frontier maximizes capture and minimizes energy.
- The UI shows the predicted frontier.

### 16.4 Recommendations

The optimizer reports at least:

```text
Energy-saving candidate
Balanced candidate
High-capture candidate
Max-efficiency candidate
```

If no candidate meets a rule, the UI explicitly says so.

### 16.5 Verification

- The user can simulate recommended candidates.
- Verification results are displayed alongside predictions.
- Verified candidates are clearly distinguished from predicted candidates.

### 16.6 Exports

The user can export predictions, recommendations, and verification results.

---

## 17. Implementation Notes

### 17.1 Suggested files

Add:

```text
src/simulation/optimizer/responseSurface.ts
src/simulation/optimizer/candidateGeneration.ts
src/simulation/optimizer/pareto.ts
src/simulation/optimizer/recommendations.ts
src/simulation/optimizer/optimizerExport.ts
src/components/OptimizerPanel.tsx
```

### 17.2 Response surface API

Suggested interface:

```ts
type OptimizerTrainingRow = {
  baselineDrive: number;
  motionWeight: number;
  peerWeight: number;
  tauPeerSeconds: number;
  captureRate: number;
  mahPerDay: number;
};

type ResponseSurfaceModel = {
  featureNames: string[];
  captureCoefficients: number[];
  energyCoefficients: number[];
  captureR2: number;
  energyR2: number;
  bounds: OptimizerBounds;
  ridgeLambda: number;
};

function fitResponseSurface(
  rows: OptimizerTrainingRow[],
  bounds: OptimizerBounds,
  ridgeLambda?: number
): ResponseSurfaceModel;

function predictResponseSurface(
  model: ResponseSurfaceModel,
  params: AdaptiveCandidateParams
): {
  captureRate: number;
  mahPerDay: number;
  bleEfficiency: number;
};
```

### 17.3 Matrix math

Avoid heavy dependencies if possible.

For a 15-feature ridge regression, a small matrix utility is enough:

```text
transpose
multiply
add diagonal lambda
solve linear system
```

Use Gaussian elimination or a small numeric package if already present.

If adding a dependency, prefer a small, maintained linear algebra package.

---

## 18. Out of Scope for v1

Do not implement yet:

```text
Bayesian optimization
neural networks
random forest regressors
XGBoost / LightGBM
uncertainty estimates
automatic iterative optimization loops
species-conditioned global models
cross-study historical model training
```

These can come after the response-surface workflow proves useful.

---

## 19. Future Upgrade Path

If v1 works, the natural next step is:

```text
1. Run initial sweep.
2. Fit response surface.
3. Generate candidates.
4. Simulate top recommendations.
5. Add verified candidates back into the training set.
6. Refit.
7. Repeat until the Pareto frontier stabilizes.
```

This becomes an active-learning loop.

Later, this could be upgraded to:

```text
multi-objective Bayesian optimization
expected hypervolume improvement
NSGA-II evolutionary optimization
random forest surrogate modeling
uncertainty-aware candidate selection
```

But those are not needed for v1.

---

## 20. Final Recommendation

Implement the optimizer directly in the browser app using a quadratic response-surface model with pairwise interactions.

This gives the best balance of:

```text
speed
transparency
debuggability
low dependency burden
direct integration with existing sweep UI
```

The optimizer should be treated as a recommendation engine that proposes candidates for simulation, not as a final authority on firmware settings.
