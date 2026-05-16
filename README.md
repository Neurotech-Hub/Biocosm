# Biocosm: Adaptive Social Proximity Logger Simulator

**Biocosm** is a browser-based, seed-deterministic simulator for evaluating BLE collar firmware policies in small-animal social proximity studies. It separates ground-truth animal behavior, radio physics, deployable firmware scheduling, observed logs, and downstream analysis so researchers can ask:

> Given a known social-contact process and enclosure geometry, how well does a collar policy recover proximity structure under battery, scan/advertise duty, motion sensing, and observation constraints?

The tool supports interactive single-run exploration, batch **policy sweeps** over fixed and adaptive schedules, and an in-app **surrogate optimizer** that proposes adaptive candidates from sweep data and verifies them with full simulations.

**Live demo:** [https://neurotech-hub.github.io/Biocosm/](https://neurotech-hub.github.io/Biocosm/)  
**Stack:** React, TypeScript, Vite, HTML Canvas, Vitest (no backend required for core workflows).

---

## Research utility (paper framing)

Biocosm is intended for **design-space exploration** before field deployment of social loggers (e.g. nRF52 wearables). Typical uses:


| Use case          | What Biocosm provides                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Policy comparison | Interval-level **BLE capture rate** vs **mAh/day** under identical animal worlds         |
| Adaptive vs fixed | Motion/peer-driven schedules vs constant scan/advertise intervals                        |
| Parameter sweeps  | Factorial grids over scan interval, advertise interval, scan window, and adaptive drives |
| Energy budgeting  | Bench-calibrated duty models tied to measured collar currents                            |
| Reproducibility   | Seeded RNG, exportable logs, workspace save/load                                         |


It is **not** a packet-level Bluetooth stack simulator; it abstracts firmware timing, listen/advertise overlap, RSSI-based detection, and energy from realized burst duties.

---

## Core design principle

Collar firmware never reads ground-truth positions. Information flows in one direction:

```text
World (true positions, movement, circadian state)
  → Radio (distance, RSSI, detection trials)
  → Firmware policy (scan/adv intervals, burst lengths, adaptive drives)
  → Observed logs (detections, scan windows, energy)
  → Metrics & analysis (capture rate, efficiency, Pareto tradeoffs)
```

This separation is essential when studying **adaptive** policies: observation intensity can covary with behavior, so metrics must be defined against explicit ground-truth dyad epochs, not raw detection counts alone.

---

## Key features

### Simulation world and behavior

- **Rectangular enclosure** with a generated path/tunnel graph; animals move along edges with species- and trait-driven bout structure.
- **Species presets** (13 taxa archetypes, e.g. lab mouse, prairie vole, squirrels, human) with circadian activity/rest windows, social propensity, movement bouts, and optional advanced distribution overrides.
- **Seeded trait sampling** per animal (activity minutes, phase offset, bout lengths, social tendency) from preset priors and global modifiers.
- **Circadian and ultradian modulation** of movement and social pausing; configurable nocturnal/diurnal mode.
- **Motion sensor model** with threshold, noise, and configurable false-positive / false-negative rates feeding adaptive policies.

### BLE radio and detection

- **True dyads** each timestep: pairwise distance, detection-radius membership, collar validity.
- **Serial scan/advertise scheduling** per collar per epoch: scan and advertise bursts do not overlap; when both are due, **scan is prioritized** (aligned with production nRF52 state machine).
- **Passive scan bursts** expanded into sub-windows (12.5 ms listen every 50 ms inside the configured scan window).
- **Non-connectable advertise bursts** with synthetic packet spacing (`advertisingEventIntervalSeconds`, default 0.15 s).
- **Detection** requires temporal overlap between an observer’s listen window and a peer’s advertising event; distance is interpolated within the epoch; RSSI from path loss + noise; success via logistic detection probability.
- **Per-collar phase offsets and deterministic jitter** for burst placement; optional minute-boundary safe zones and post-advertise scan stabilization delay.

### Firmware policies

**Fixed-rate** (`FixedPolicyConfig`): each timestep copies `scanIntervalSeconds`, `scanWindowSeconds`, `advIntervalSeconds`, and `advertisingBurstDurationSeconds` to the collar. Optional **inactive scan stretch**: after sustained no-motion (per animal movement-bout mean), scan interval multiplies (×2–×5) or scan window goes to zero (`inactiveScanIntervalMultiplier: "inf"`).

**Motion + peer adaptive** (`MotionPeerAdaptivePolicyConfig`):

- Exponential **motion drive** and **peer drive** with configurable time constants.
- **Observer-local** peer signal from prior-epoch detections; **empty-scan penalty** when the observer scanned but saw no peer.
- **Sampling drive** = `baselineDrive + motionWeight×motionDrive + peerWeight×peerDrive` (clamped; optional upscale-only floor at 0.5).
- **Piecewise timing map** between low / neutral / high anchors (log interpolation for intervals, linear for scan window).
- Default **neutral anchor** matches the balanced BLE catalog preset (30 s scan / 3 s window / 10 s adv).

**Production-aligned burst assumptions** (Juxta5-8-nRF `main.c`):


| Parameter           | Simulator default | Firmware reference     |
| ------------------- | ----------------- | ---------------------- |
| Scan burst (window) | 3 s               | `SCAN_BURST_MS` = 3000 |
| Advertise burst     | 1 s               | `ADV_BURST_MS` = 1000  |


Catalog presets (`balanced-adaptive`, `low-power`, `high-capture`) and sweep grids use these bursts unless explicitly overridden.

### Metrics (primary outcomes)

**BLE capture rate (interval-level)** — canonical comparison metric:

- **Opportunity:** each `trueDyads` row where both collars are valid and pair distance ≤ detection radius at that timestep.
- **Hit:** at least one `DetectionEvent` for that unordered pair with event time in `(t − dt, t]` (same simulation epoch).
- **Rate:** hits / opportunities.

Do **not** confuse with **recall estimate** (`detections.length / opportunities`), which counts raw events and is not epoch-aligned.

**Energy:** mAh per simulated day from per-epoch energy logs (cohort-mean collar draw), battery capacity, and optional LiPo voltage curve.

**BLE efficiency:** capture rate divided by mAh/day (higher = more capture per energy).

**Adaptive diagnostics:** mean sampling drive, fraction of time below/near/above fixed-equivalent drive, mean realized scan/adv intervals (from timeline).

### Energy models

Hardware energy is decoupled from BLE schedule presets (`hardwareEnergyProfileId` vs `blePolicyPresetId`). Default profile: **generic nRF52840 BLE wearable** (40 mAh, +8 dBm assumption for RSSI).


| Model                               | Role                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `bench_routine_linear_v1` (default) | Mean µA = intercept + scanDutyCoeff×(scan wall s / epoch) + advDutyCoeff×(adv wall s / epoch). Coefficients fit to mixed bench routines. |
| `bench_duration`                    | Shelf µA plus calibrated increments × advertise/scan **burst wall seconds**.                                                             |
| `component`                         | RX mA × listen-window seconds + µC/event × packet count; optional scale; warns if ≫3× bench reference for discovery schedule.            |


Bench table anchors (shelf ~8.7 µA; production routine reference ~468 µA at 1 s adv / 20 s scan) come from Juxta5-8-nRF measured currents.

### Policy sweep

Three workspace tabs: **Simulator**, **Sweep**, **Policy Optimizer** (after sweep).

**Fixed-rate factorial** (per seed, plus inactive-scan ×3 and ×5 variants for each distinct schedule):

- Scan intervals: **10, 30, 60** s  
- Advertise intervals: **5, 10, 20** s  
- Scan windows: **1, 3, 5** s  
- Advertise burst held constant at **1** s

**Adaptive grid** (24 policies per seed): `baselineDrive` ∈ {0.15, 0.25, 0.35}, `motionWeight` ∈ {0.2, 0.4}, `peerWeight` ∈ {0.2, 0.4}, `tauPeerSeconds` ∈ {120, 200}, with held gains/decays and shared timing anchors (60→30→10 s scan, 1→3→5 s window).

**Modes:** single built seed (fast) or aggregate over pool seeds 101–505 (report). Outputs: ranked summaries, Pareto efficiency flags, role-based candidates (energy-saving, balanced, high-capture), CSV/Markdown export.

**Typical scale:** ~~**105** policies per seed when the comparison baseline lies on the factorial grid (~~81 fixed + 24 adaptive).

### Surrogate policy optimizer

After a sweep:

1. Ridge response surfaces fit **adaptive** sweep rows only (capture and energy vs normalized parameters).
2. Thousands of **predicted_adaptive** candidates sampled in bounds (with coverage warnings outside the sweep hull).
3. **Observed_fixed** candidates taken from discrete sweep rows (no surrogate over fixed schedules).
4. Pareto-style recommendations; **verification** runs one full simulation per role on the built world seed.
5. Layered capture-vs-energy plot, calibration scatter, tables, CSV/Markdown downloads.

The optimizer proposes regions of interest; **verification simulations are authoritative**.

### User interface and workflow

- Controls grouped: **Simulation**, **Device/BLE**, **Animal/Biology**; species advanced parameters in a modal.
- **Build Simulation** stages config changes (avoids rebuilding timeline on every slider move).
- **60 s review epochs** for canvas/metrics; **1 s** internal resolution for BLE overlap and detection.
- Canvas: enclosure, paths, animals, true proximity vs observed detections, scan/adv indicators.
- Timeline scrubbing, time-series (movement fraction, energy, adaptive drive or fixed schedule duty).
- Metrics, assumptions, and raw JSON/CSV export (species, traits, logs, adaptive policy rows).
- **Workspace files** (v2): save/load simulator config, view flags, sweep settings.

---

## Implementation nuances (important for interpretation)

These details matter when writing methods sections or comparing to field data:

1. **Epoch-aligned capture** — A dyad can be in range for many minutes but only count as one opportunity per timestep; a single detection in that epoch counts as a hit.
2. **Adaptive feedback uses the previous epoch** — Motion observations and peer/scan inputs come from the last completed step, not the current burst outcome (matches discrete-time firmware review).
3. **Scan window ≠ scan interval** — Window is on-air passive listen duration per burst; interval is spacing between bursts. Sweep varies window explicitly (1–3–5 s); energy and capture scale with realized wall time.
4. **No simultaneous scan + advertise** — Serial radio; not modeling full dual-radio concurrency.
5. **Synthetic advertising grid** — Packets every ~0.15 s inside the advertise burst approximate a 100–200 ms controller interval; not bit-accurate extended advertising.
6. **Listen duty inside scan burst** — ~25% of scan wall time at default sub-window parameters (12.5 ms / 50 ms), not 100% RX current for the full 3 s unless using `bench_duration` semantics differently from `component`.
7. **Detection radius vs social radius** — Capture metric uses **detection** radius; separate **social** radius for other analyses.
8. **Determinism** — Same seed + config ⇒ same trajectories and logs; do not introduce `Math.random()` on the simulation path.
9. **Energy model scope** — `bench_routine_linear_v1` is a **routine-level** fit; extrapolating to extreme duties (e.g. 5 s window / 10 s interval) is comparative, not metrology.
10. **Inactive scan stretch** — Models firmware-adjacent power-saving: longer scan spacing or zero scan window after bout-length inactivity; advertising unchanged.

---

## Default configuration snapshot


| Setting                   | Default                                                |
| ------------------------- | ------------------------------------------------------ |
| Time step                 | 60 s                                                   |
| Simulation length         | 24 h                                                   |
| Animals                   | 6                                                      |
| Detection / social radius | 1 m                                                    |
| BLE preset                | `balanced-adaptive` (30 s / 3 s / 10 s, 1 s adv burst) |
| Active policy             | Fixed schedule from preset                             |
| Energy model              | `bench_routine_linear_v1`                              |
| Battery                   | 40 mAh                                                 |


---

## Run locally

```sh
npm install
npm run dev
```

Open the URL printed by Vite (local base `/`).

### Verify

```sh
npm test
npm run build
```

**Environment:** Vite 5 and Vitest 1 target Node 20.10+; newer toolchains may need Node 20.2+ or 22+.

---

## GitHub Pages deployment

Production builds use `base: '/Biocosm/'` for [https://neurotech-hub.github.io/Biocosm/](https://neurotech-hub.github.io/Biocosm/).

Deploy workflow: [.github/workflows/deploy.yml](.github/workflows/deploy.yml) (push to `main` or manual dispatch). One-time repo setup: **Settings → Pages → Source: GitHub Actions**. Details: [docs/biocosm_github_pages_deploy_yml_instructions.md](docs/biocosm_github_pages_deploy_yml_instructions.md).

---

## Project structure


| Path                                       | Responsibility                                  |
| ------------------------------------------ | ----------------------------------------------- |
| `src/simulation/types.ts`                  | Contracts for config, policies, logs, metrics   |
| `src/simulation/world.ts`                  | Path graph, traits, movement, animal state      |
| `src/simulation/speciesPresets.ts`         | Species priors                                  |
| `src/simulation/engine.ts`                 | Timestep orchestration, logging                 |
| `src/simulation/motionSensor.ts`           | Collar-visible motion observations              |
| `src/simulation/radio.ts`                  | Dyads, bursts, detections, listen windows       |
| `src/simulation/policies/fixedRate.ts`     | Fixed-rate and inactive stretch                 |
| `src/simulation/policies/adaptive.ts`      | Adaptive drives and timing map                  |
| `src/simulation/blePolicyPresets.ts`       | Catalog baselines and sweep anchors             |
| `src/simulation/bleTimingAssumptions.ts`   | Shared 3 s scan / 1 s advertise burst constants |
| `src/simulation/energy.ts`                 | Epoch energy accounting                         |
| `src/simulation/hardwareEnergyProfiles.ts` | Bench-calibrated pack parameters                |
| `src/simulation/analysis.ts`               | Capture rate, metrics, firmware-minute records  |
| `src/simulation/sweep/`                    | Trial grids, bundles, export                    |
| `src/simulation/optimizer/`                | Ridge surrogate, candidates, verification       |
| `src/components/`                          | Simulator, sweep, optimizer UI                  |
| `src/workspace/workspaceFile.ts`           | Save/load workspace JSON                        |
| `docs/`                                    | Detailed specifications and review notes        |


---

## Authoritative specifications

Use these when extending the simulator or drafting paper supplements:


| Document                                                                                                           | Topic                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| [docs/adaptive_social_proximity_logger_simulator_spec.md](docs/adaptive_social_proximity_logger_simulator_spec.md) | Overall architecture and planned analysis layers  |
| [docs/ble_capture_rate_and_firmware_policies.md](docs/ble_capture_rate_and_firmware_policies.md)                   | Capture metric and policy parameters              |
| [docs/ble_scan_advertise_implementation_overview.md](docs/ble_scan_advertise_implementation_overview.md)           | Burst scheduling and mismatch vectors vs hardware |
| [docs/ble_firmware_vs_simulator_review.md](docs/ble_firmware_vs_simulator_review.md)                               | Firmware alignment checklist                      |
| [docs/energy_epoch_api_spec.md](docs/energy_epoch_api_spec.md)                                                     | Energy log fields and models                      |
| [docs/adaptive_ble_policy_sweep_report_spec.md](docs/adaptive_ble_policy_sweep_report_spec.md)                     | Sweep outputs and candidate roles                 |
| [docs/biocosm_in_app_surrogate_optimizer_spec.md](docs/biocosm_in_app_surrogate_optimizer_spec.md)                 | Optimizer pipeline and verification               |
| [docs/sweep_procedure_outline.md](docs/sweep_procedure_outline.md)                                                 | Sweep trial construction                          |
| [docs/implementation_review_for_supervisor.md](docs/implementation_review_for_supervisor.md)                       | Current implementation handoff summary            |
| [docs/circadian_model_spec.md](docs/circadian_model_spec.md)                                                       | Species circadian behavior                        |
| [docs/juxta_ble_energy_model_mismatch_feedback.md](docs/juxta_ble_energy_model_mismatch_feedback.md)               | Energy model calibration notes                    |


---

## Suggested paper outline (template)

1. **Introduction** — Social proximity logging on small wearables; need for policy design under battery constraints.
2. **Related work** — BLE beaconing, contact logging, adaptive sensing, agent-based animal movement models.
3. **Ground-truth model** — Enclosure, species presets, dyads, motion sensor.
4. **Observation model** — Serial bursts, RSSI detection, epoch-aligned capture metric.
5. **Policies** — Fixed factorial vs motion/peer adaptive; firmware-aligned timings.
6. **Energy model** — Bench-linear duties vs component/bench-duration alternatives.
7. **Experimental framework** — Sweep grids, seeds, Pareto analysis, surrogate optimizer + verification.
8. **Results** — (Your sweeps: capture–energy frontiers, adaptive vs fixed, sensitivity to scan window).
9. **Discussion** — Observation bias in adaptive mode, simulator limits, deployment implications.
10. **Future work** — See below.

---

## Future directions

Planned or natural extensions (not all implemented):

- **Validation against field datasets** — Compare simulated capture and contact graphs to collar logs from real cohorts.  
- **Packet-level or connection-aware BLE** — Connection intervals, extended advertising, channel map effects.  
- **Multi-gateway / asymmetric roles** — Hub vs collar schedules (partially sketched in firmware, optional gateway adv).  
- **Effort-normalized and probabilistic contact graphs** — Spec § analysis layers; graph reconstruction from logs.  
- **Spatially explicit radio** — Obstacles, body blocking, orientation-dependent path loss.  
- **Collar loss and population turnover** — Stochastic invalid collars, replacement events.  
- **Larger enclosures and taxa scaling** — Stress-test detection radius vs density.  
- **Bayesian or GP optimization** — Replace ridge surrogate with rigorous uncertainty; export to Python/R.  
- **Cross-validation across seed pools** — Hold-out worlds for optimizer generalization metrics.  
- **Circadian policy coupling** — Policies that read clock phase directly, not only motion/peer.  
- **Minute-level firmware export fidelity** — Tighter match to on-device JXB/JXS log formats.  
- **Web Worker / batch HPC** — Longer horizons and larger sweeps without blocking the UI.  
- **Workspace v3** — Persist sweep bundles and optimizer results in workspace files.

---

## Tips for developer agents

- Preserve the **world → radio → policy → logs → analysis** module boundaries.  
- Use **seeded** randomness only (`src/simulation/random.ts`).  
- Keep **scan-window logs** even when empty (negative evidence for peer penalty).  
- Add new policies under `src/simulation/policies/`, not inside `world.ts` or `radio.ts`.  
- When changing burst timings, update `bleTimingAssumptions.ts`, presets, sweep constants, tests, and README together.  
- Run `npm test` and `npm run build` after substantive changes.

---

## Citation and attribution

When describing Biocosm in publications, report the **simulator version** (`package.json`), **commit hash**, **seed(s)**, **species preset**, **sweep grid constants** (from `src/simulation/sweep/adaptiveBleSweep.ts`), **energy model** (`energy.energyModel`), and **BLE burst assumptions** (3 s scan / 1 s advertise unless varied). Include a screenshot or exported sweep CSV for reproducibility supplements.

---

## License

ISC (see `package.json`). Firmware and bench data references: [Juxta5-8-nRF](https://github.com/Neurotech-Hub/Juxta5-8-nRF) production application measurements.