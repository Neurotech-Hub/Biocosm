# BLE policy sweep procedure (implementation outline)

This document summarizes **what the Biocosm simulator does today** when you run a sweep: grids, trial ordering, metrics, aggregation, recommendations, and exports. It is intended for **design / QA review** against [`adaptiveBleSweep.ts`](../src/simulation/sweep/adaptiveBleSweep.ts), [`sweepCandidates.ts`](../src/simulation/sweep/sweepCandidates.ts), and the Sweep UI.

---

## 1. Purpose

A sweep compares **fixed-rate BLE schedules** (including the **Juxta 5.6** reference) against **motion + peer adaptive** policies under the **same world configuration** as the currently built simulation (`SimulationConfig` from the Simulator tab). Each trial runs one policy + one RNG seed to completion, records BLE capture and energy-related metrics, then scales results **relative to the Juxta baseline for that seed**.

---

## 2. Inputs and modes

| Input | Role |
|--------|------|
| **Built simulation config** | Animals, enclosure, radio, length, timestep, species preset, etc. Trials override only `seed`, `activePolicy`, and (implicitly) derived simulation state. |
| **Sweep mode: Fast vs Report** | **Fast:** one seed — the built config’s `seed` string. **Report:** three fixed seeds `101`, `202`, `303` ([`SWEEP_REPORT_SEEDS`](../src/simulation/sweep/adaptiveBleSweep.ts)). |
| **`VITE_SWEEP_FULL_GRID`** | Build-time flag. **`true`** → larger Cartesian grids for both fixed and adaptive axes; **default / absent** → **quick** grids for interactive iteration. |

Trial count: **`sweepTrialCount(mode)`** = `(fixed policies + adaptive policies) × number of seeds` for that mode.

---

## 3. Policy grids

Literals below match **[`adaptiveBleSweep.ts`](../src/simulation/sweep/adaptiveBleSweep.ts)** (same names as exported constants).

### 3.1 Fixed-rate sweep

- **Axes:** scan interval × **advertise interval** × scan window (listen duration). Nested loop order when enumerating trials: **scan → advertise → window** ([`buildFixedSweepTrialDefs`](../src/simulation/sweep/adaptiveBleSweep.ts)).
- **Held for every fixed trial:** `advertisingBurstDurationSeconds = 2` (`SWEEP_FIXED_BURST_SECONDS`).
- **Juxta 5.6** matches [`juxtaMainCMode0FixedPolicy`](../src/simulation/config.ts): **20** s scan / **1.5** s window / **5** s advertise. That triple appears **once** in the Cartesian product; it is tagged **`baseline_fixed`**, policy id **`sweep-baseline-juxta-fixed`**. Other combos are **`fixed_sweep`**, ids `sweep-fixed-s{s}-a{a}-w{w}`.

#### Quick grid (default build)

| Axis | Values (s) | Constant |
|------|------------|----------|
| Scan interval | **10, 20, 40** | `SWEEP_QUICK_FIXED_SCAN_INTERVALS` |
| Advertise interval | **5, 10, 15** | `SWEEP_QUICK_FIXED_ADV_INTERVALS` |
| Scan window | **1.0, 1.5, 2.5** | `SWEEP_QUICK_FIXED_SCAN_WINDOWS` |

**3 × 3 × 3 = 27** fixed policies per seed (includes Juxta).

#### Full grid (`VITE_SWEEP_FULL_GRID=true`)

| Axis | Values (s) | Constant |
|------|------------|----------|
| Scan interval | **5, 10, 15, 20, 30** | `SWEEP_FULL_FIXED_SCAN_INTERVALS` |
| Advertise interval | **5, 10, 15, 20** | `SWEEP_FULL_FIXED_ADV_INTERVALS` |
| Scan window | **0.5, 1.0, 1.5, 2.0, 2.5** | `SWEEP_FULL_FIXED_SCAN_WINDOWS` |

**5 × 4 × 5 = 100** fixed policies per seed.

---

### 3.2 Adaptive sweep

- **Axes:** `baselineDrive` × `motionWeight` × `peerWeight` × `tauPeerSeconds`, nested in that order ([`buildSweepGridPolicies`](../src/simulation/sweep/adaptiveBleSweep.ts)).

#### Quick grid (default build)

| Axis | Values | Constant |
|------|--------|----------|
| `baselineDrive` | **0.12, 0.28, 0.45** | `SWEEP_QUICK_BASELINE_DRIVES` |
| `motionWeight` | **0.22, 0.5** | `SWEEP_QUICK_MOTION_WEIGHTS` |
| `peerWeight` | **0.35, 0.6, 0.85** | `SWEEP_QUICK_PEER_WEIGHTS` |
| `tauPeerSeconds` | **120, 300, 600** | `SWEEP_QUICK_TAU_PEER_SECONDS` |

**3 × 2 × 3 × 3 = 54** adaptive policies per seed.

**Baseline drive (quick grid):** values are **all below 0.5** on purpose: the adaptive collar’s idle / low-activity state stays **energy-saving** vs the neutral timing anchor; motion and peer weighting then ramps sampling toward or above fixed-rate intensity when the scenario demands it.

#### Full grid (`VITE_SWEEP_FULL_GRID=true`)

| Axis | Values | Constant |
|------|--------|----------|
| `baselineDrive` | **0.08, 0.2, 0.32, 0.42, 0.5** | `SWEEP_FULL_BASELINE_DRIVES` |
| `motionWeight` | **0.15, 0.35, 0.55** | `SWEEP_FULL_MOTION_WEIGHTS` |
| `peerWeight` | **0.25, 0.5, 0.85** | `SWEEP_FULL_PEER_WEIGHTS` |
| `tauPeerSeconds` | **120, 600** | `SWEEP_FULL_TAU_PEER_SECONDS` |

**5 × 3 × 3 × 2 = 90** adaptive policies per seed.

---

### 3.3 Adaptive timing anchors (shared by all adaptive trials)

These define low / neutral / high schedule shapes; not Cartesian-multiplied themselves (`ADAPTIVE_SWEEP_TIMING_ANCHORS`):

| Tier | Scan interval (s) | Scan window (s) | Advertise interval (s) |
|------|-------------------|-------------------|-------------------------|
| Low | 60 | 0.75 | 15 |
| Neutral | 20 | 1.5 | 5 |
| High | 5 | 3 | 1.5 |

**Burst:** `advertisingBurstDurationSeconds = 2` (same constant family as fixed sweep).

---

### 3.4 Held adaptive parameters (not swept)

All adaptive grid cells share **`SWEEP_HELD_ADAPTIVE`**:

| Parameter | Value |
|-----------|--------|
| `tauMotionSeconds` | 120 |
| `motionGain` | 0.35 |
| `peerGain` | 0.5 |
| `peerMissPenalty` | 0.25 |
| `allowEnergySavingDownscale` | true |
| `peerDetectionCountSaturation` | 1 |
| `motionEventCountSaturation` | 1 |

---

## 4. Trial list construction

[`buildSweepTrials(mode, currentSeed)`](../src/simulation/sweep/adaptiveBleSweep.ts):

1. Resolve **seed list**: fast → `[currentSeed]`; report → `["101","202","303"]`.
2. For **each seed**, append **all fixed trial defs** (same order as §3.1), then **all adaptive policies** (same order as §3.2).

Execution order is **sequential** ([`runSweepTrialsChunked`](../src/simulation/sweep/adaptiveBleSweep.ts)): each trial clones the base config, sets `config.seed` and `config.activePolicy`, runs the simulation to the end (chunked for UI), appends a raw row.

---

## 5. Raw row metrics (per trial)

From [`computeSweepRowFromRun`](../src/simulation/sweep/adaptiveBleSweep.ts) (representative collar / merged logs):

- **BLE capture rate**, **mAh/day** (from cumulative mAh and simulated wall time), **BLE efficiency** = capture / mAh·day when the energy estimate is positive.
- **Opportunity / hit / miss** counts for BLE capture.
- **Adaptive-only** (from timeline): mean sampling drive, % time below / near / above “fixed band”, etc.
- **Mean scan / window / advertise** intervals as observed in the timeline (`computeMeanCollarTimingsFromTimeline`).

Fixed trials populate scheduled scan/window/advertise columns; adaptive trials leave those null and fill swept adaptive parameters.

---

## 6. Relative metrics (per seed)

[`attachRelativesToRows`](../src/simulation/sweep/adaptiveBleSweep.ts) runs **after** all partial rows exist:

- For each **seed**, the row with **`kind === "baseline_fixed"`** defines the reference: capture rate, mAh/day, BLE efficiency.
- Every row (including other fixed and adaptive) gets **relative capture**, **relative energy**, **relative efficiency** vs that seed’s baseline.

If the baseline row for a seed is missing or degenerate, relatives fall back to safe zeros / partial ratios (same function).

---

## 7. Aggregation to summaries

[`aggregateSweepRows`](../src/simulation/sweep/adaptiveBleSweep.ts) groups raw rows by **`policyId`**, computes means (and capture-rate **std** across seeds in report mode), builds **`SweepPolicySummary`** with **`params`** (discriminated fixed vs adaptive for Simulate/export).

[`buildSweepResultBundle`](../src/simulation/sweep/adaptiveBleSweep.ts) then runs [`attachParetoEfficiency`](../src/simulation/sweep/sweepCandidates.ts): each policy is **`isParetoEfficient`** if no other policy (including Juxta) **dominates** it on **mean capture rate** vs **mean mAh/day** (maximize capture, minimize energy; standard Pareto definition).

- **`baselineSummary`**: the **`baseline_fixed`** policy’s aggregate (Juxta reference).
- **`summaries`**: every **other** policy id (`fixed_sweep` + `adaptive`), sorted by **mean BLE efficiency** descending.

---

## 8. Recommendations (best fixed vs best adaptive)

[`pickSweepCandidates`](../src/simulation/sweep/sweepCandidates.ts):

| Role | Pool | Selection rule |
|------|------|----------------|
| **bestFixed** | Juxta baseline summary **plus** all **`fixed_sweep`** summaries | Highest **mean BLE efficiency** among that pool. |
| **bestAdaptive** | **`adaptive`** summaries only | Among adaptives with **mean capture ≥ 0.8 × baseline mean capture**, pick highest mean BLE efficiency. If **none** qualify, fall back to **best efficiency overall** and attach an explanatory note. |

Baseline capture used for the threshold is **`baselineSummary.meanCaptureRate`** from the aggregate bundle.

---

## 9. Report UI (Sweep tab)

Implemented primarily in [`SweepReportPanel.tsx`](../src/components/SweepReportPanel.tsx).

- **Efficiency comparison cards:** the two **`CandidatePick`** results from §8.
- **Scatter plots:** summaries-only point clouds plus a separate **Juxta reference** marker (dashed gold); **fixed** vs **adaptive** by fill color; **violet ring** = matches built simulator policy; **green ring** = **Pareto-efficient** on mean capture vs mean mAh/day. Each figure includes an **in-chart legend** listing those glyphs.
- **Candidate table:** **baseline + all sweep summaries** sorted together by **mean BLE efficiency** (rank 1 = best). **Alg** column: **J** = Juxta reference fixed row, **F** = other fixed, **A** = adaptive. **Pareto** column mirrors the plot/csv flag.
- **Cell heatmaps:** column-wise red–yellow–green within the table (sentiment rules documented in the UI popover).

**Simulate** on a row rebuilds a **`FirmwarePolicyConfig`** via [`firmwarePolicyFromSweepSummary`](../src/simulation/sweep/adaptiveBleSweep.ts) and loads it into the Simulator tab.

---

## 10. Exports

| Artifact | Source |
|----------|--------|
| **Raw CSV** | One row per **trial** (policy × seed): [`serializeSweepRawCsv`](../src/simulation/sweep/sweepExport.ts). |
| **Summary CSV** | One row per **policy**, sorted by **mean BLE efficiency** with numeric **rank** 1…N **including Juxta**, plus **`isParetoEfficient`**: [`serializeSweepSummaryCsv`](../src/simulation/sweep/sweepExport.ts). |
| **Markdown** | High-level report stub + settings + baseline metrics + recommendation bullets: [`buildSweepMarkdownReport`](../src/simulation/sweep/sweepExport.ts). |

---

## 11. Quick reference counts

| Build | Fixed / seed | Adaptive / seed | Total / seed | Fast trials | Report trials (3 seeds) |
|-------|----------------|-----------------|---------------|-------------|-------------------------|
| **Quick** (default) | 27 | 54 | **81** | **81** | **243** |
| **Full** (`VITE_SWEEP_FULL_GRID=true`) | 100 | 90 | **190** | **190** | **570** |

Report seeds are always **`101`, `202`, `303`** ([`SWEEP_REPORT_SEEDS`](../src/simulation/sweep/adaptiveBleSweep.ts)). Fast mode uses the built simulator seed once.

Authoritative counts: `fixedSweepPolicyCount()`, `adaptiveSweepPolicyCount()`, `policiesPerSweepSeed()`, `sweepTrialCount(mode)` in code.

---

## 12. Files to read for a deep review

| Area | File |
|------|------|
| Grids, trials, run loop, aggregation | [`src/simulation/sweep/adaptiveBleSweep.ts`](../src/simulation/sweep/adaptiveBleSweep.ts) |
| Best fixed / best adaptive | [`src/simulation/sweep/sweepCandidates.ts`](../src/simulation/sweep/sweepCandidates.ts) |
| CSV / Markdown | [`src/simulation/sweep/sweepExport.ts`](../src/simulation/sweep/sweepExport.ts) |
| Sweep orchestration in app | [`src/App.tsx`](../src/App.tsx) |
| Controls copy / counts | [`src/components/SweepControlsPanel.tsx`](../src/components/SweepControlsPanel.tsx) |
| Report table / plots | [`src/components/SweepReportPanel.tsx`](../src/components/SweepReportPanel.tsx) |

---

*Generated from the codebase as an outline for human or agent review; behavior should be verified against tests in [`src/simulation/sweep/adaptiveBleSweep.test.ts`](../src/simulation/sweep/adaptiveBleSweep.test.ts), [`src/simulation/sweep/sweepCandidates.test.ts`](../src/simulation/sweep/sweepCandidates.test.ts), and related suites.*
