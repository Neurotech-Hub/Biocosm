# Adaptive Social Proximity Logger Simulator — Developer Specification

## 1. Purpose

Build a browser-based simulator for testing adaptive BLE-based social proximity logging strategies in small animals such as mice, rats, voles, and squirrels.

The simulator should visualize animals moving in a 2D enclosure while generating synthetic collar logs. It should allow comparison between different BLE sampling algorithms, including fixed-rate scanning, motion-gated scanning, peer-gated scanning, and adaptive motion-plus-peer sampling.

The goal is to answer:

> Given a known ground-truth social/contact process, how well does a given collar firmware policy recover social proximity structure under battery, scan, advertising, motion, and collar-loss constraints?

The simulator should explicitly separate:

1. **True animal behavior and location**
2. **Radio/physical proximity**
3. **Collar firmware sampling behavior**
4. **Observed proximity logs**
5. **Analysis and graph reconstruction**

This distinction is critical because adaptive sampling can introduce behavior-dependent observation bias.

---

## 2. Recommended Stack

Preferred implementation:

- **React**
- **TypeScript**
- **HTML Canvas** for animal/enclosure visualization
- Optional: Zustand, Redux, or simple React state for app state
- Optional: Web Workers for long simulations or batch sweeps
- Optional: D3 or Recharts for plots and graph summaries

Avoid WebGL unless the simulation targets hundreds or thousands of animals.

---

## 3. Core Design Principle

The simulator should not let the collar firmware access ground-truth state directly except through simulated sensors.

For example:

- The **World Model** knows exact animal positions.
- The **Radio Model** knows true pairwise distance and simulates packet detectability.
- The **Firmware Policy** only sees:
  - motion state
  - scheduled scan/advertising windows
  - detected peers
  - RSSI values
  - battery state
  - internal memory variables such as recent motion drive or peer drive

This keeps the simulator useful for testing real deployable algorithms.

---

## 4. High-Level Architecture

```text
SimulationApp
├── UIControls
├── CanvasVisualizer
├── SimulationEngine
│   ├── WorldModel
│   ├── AnimalBehaviorModel
│   ├── RadioModel
│   ├── FirmwarePolicy
│   ├── BatteryModel
│   └── Logger
├── AnalysisEngine
│   ├── GroundTruthGraph
│   ├── ObservedGraph
│   ├── EffortNormalizedGraph
│   └── ProbabilisticContactGraph
└── ExportEngine
```

---

## 5. Simulation Inputs

All inputs should be available through sliders, toggles, dropdowns, or numeric fields.

### 5.1 Simulation Parameters

| Parameter | Type | Example |
|---|---:|---:|
| Simulation length | number | 7 days |
| Time step | number | 1 minute |
| Playback speed | number | 1x to 1000x |
| Random seed | integer/string | `42` |
| Number of animals | integer | 2–100 |
| Detection radius | number | 0.25–10 m |
| Enable collar loss | boolean | true |
| Collar loss probability | number | 0–1 per day |
| Battery model enabled | boolean | true |

### 5.2 Enclosure Parameters

Support two enclosure modes:

#### Rectangular Enclosure

Useful for lab/semi-natural enclosures.

| Parameter | Type | Example |
|---|---:|---:|
| Width | number | 10 m |
| Height | number | 5 m |
| Wall behavior | enum | reflect, wrap, constrain |
| Number of paths/tunnels | integer | 5–100 |
| Number of nests | integer | 1–10 |
| Number of feeders/resources | integer | 0–10 |

#### Circular Enclosure

Useful for free-ranging or abstract home-range simulations.

| Parameter | Type | Example |
|---|---:|---:|
| Radius | number | 10 m |
| Boundary behavior | enum | reflect, constrain |
| Number of paths/tunnels | integer | 5–100 |
| Number of nests | integer | 1–10 |
| Number of resource nodes | integer | 0–10 |

### 5.3 Movement Path Model

Animals should not move purely randomly. The enclosure should contain a path/tunnel graph.

Represent the enclosure as:

```ts
type PathNode = {
  id: string;
  x: number;
  y: number;
  type: "junction" | "nest" | "feeder" | "shelter" | "resource";
};

type PathEdge = {
  id: string;
  from: string;
  to: string;
  length: number;
};
```

Animals move along edges between nodes.

Initial MVP can generate random connected graphs inside the enclosure. Later versions can allow user-edited paths.

---

## 6. Animal Trait Assignment

At simulation start, assign each animal fixed traits from user-defined distributions.

Each trait should be configurable with:

- min
- max
- peak/mode

Use a triangular distribution or beta-PERT distribution.

### 6.1 Per-Animal Traits

```ts
type AnimalTraits = {
  id: string;
  circadianPhaseOffsetHours: number;
  dailyActivityMinutes: number;
  majorSleepPeriodHours: number;
  sleepBoutMeanMinutes: number;
  movementBoutMeanMinutes: number;
  speedMetersPerMinute: number;
  socialPropensity: number;
  explorationTendency: number;
  nestFidelity: number;
  resourceAttraction: number;
};
```

### 6.2 Suggested Trait Controls

| Trait | Description |
|---|---|
| Circadian phase offset | Individual variation in daily activity rhythm |
| Daily activity minutes | Total expected active/moving time per day |
| Major sleep period | Main rest interval, e.g. light phase for nocturnal animals |
| Sleep bout length | Typical inactive bout before motion resumes |
| Movement bout length | Typical movement episode duration |
| Movement speed | Speed along path edges |
| Social propensity | Probability/bias to approach or remain near peers |
| Nest fidelity | Tendency to return to preferred nest |
| Exploration tendency | Tendency to choose novel/random paths |
| Resource attraction | Tendency to visit feeders/resource nodes |

---

## 7. Circadian and Sleep Model

The simulator should support nocturnal and diurnal profiles.

```ts
type CircadianMode = "nocturnal" | "diurnal" | "custom";
```

For each animal and time step, compute an activity drive:

```text
activity_drive(t) = circadian_component(t)
                  + individual_phase_offset
                  + stochastic_noise
```

Behavior should be bout-based rather than flickering every epoch.

Example states:

```ts
type AnimalState =
  | "sleeping"
  | "awake_stationary"
  | "moving"
  | "social_pause";
```

State transitions should depend on:

- circadian phase
- time already spent in current state
- individual sleep-bout trait
- individual movement-bout trait
- nearby peers
- nest/resource location

---

## 8. Movement Model

Each animal occupies either:

```ts
type AnimalPosition =
  | {
      mode: "node";
      nodeId: string;
      x: number;
      y: number;
    }
  | {
      mode: "edge";
      edgeId: string;
      progress: number; // 0 to 1
      x: number;
      y: number;
    };
```

At each step:

1. Update behavioral state.
2. If moving, advance along current path edge.
3. If reaching a node, select next target edge/node.
4. Target selection should be probabilistic.

Suggested target scoring:

```text
target_score =
    w_explore * novelty
  + w_home * nest_drive
  + w_social * peer_attraction
  + w_resource * resource_drive
  - w_crowding * crowding_penalty
```

The animal should choose among candidate targets using weighted random selection.

---

## 9. Social Behavior Model

Social behavior should influence path choice and pausing.

Parameters:

| Parameter | Meaning |
|---|---|
| Social propensity | Bias toward nearby or recently detected peers |
| Social radius | Distance within which animals are considered socially near |
| Social pause probability | Probability of pausing near another animal |
| Social bout duration | Duration of co-location/social pause |
| Grouping tendency | Optional trait causing animals to follow clusters |

Important: social proximity ground truth is derived from true distance, not BLE detection.

```ts
type TrueContact = {
  time: number;
  animalA: string;
  animalB: string;
  distance: number;
  withinDetectionRadius: boolean;
  withinSocialRadius: boolean;
};
```

---

## 10. Radio Model

The radio model converts true distance and animal state into possible BLE detections.

Inputs:

- true pairwise distance
- detection radius
- scan state of observer collar
- advertising state of peer collar
- RF noise
- body/orientation occlusion
- optional path obstruction

### 10.1 RSSI Model

Use a simple distance-loss model:

```text
RSSI = RSSI_at_1m - 10 * n * log10(distance_m) + noise + occlusion_penalty
```

Suggested defaults:

| Parameter | Default |
|---|---:|
| RSSI at 1 m | -60 dBm |
| Path-loss exponent | 2.0 |
| Noise SD | 4 dB |
| Occlusion penalty range | 0 to -20 dB |
| Minimum distance clamp | 0.05 m |

### 10.2 Detection Probability

Do not use a hard distance threshold only. Instead, support both:

1. Hard radius cutoff
2. Probability based on RSSI

Example:

```text
P(detect) = sigmoid((RSSI - RSSI_threshold) / RSSI_slope)
```

Suggested defaults:

| Parameter | Default |
|---|---:|
| RSSI threshold | -85 dBm |
| RSSI slope | 4 dB |

---

## 11. Collar Firmware Model

Each animal has one virtual collar.

```ts
type CollarState = {
  animalId: string;
  valid: boolean;
  batteryMahRemaining: number;

  scanActive: boolean;
  advActive: boolean;

  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;

  motionDrive: number;
  peerDrive: number;
  samplingDrive: number;

  lastScanTime: number;
  lastAdvTime: number;
  lastPeerDetectionTime?: number;
};
```

### 11.1 Required Firmware Policies

Implement these policies as interchangeable modules:

```ts
interface FirmwarePolicy {
  id: string;
  name: string;
  updateCollar(
    collar: CollarState,
    animalObservation: AnimalObservation,
    detections: DetectionEvent[],
    dtSeconds: number,
    params: FirmwarePolicyParams
  ): CollarState;
}
```

Required policies:

1. **Fixed-rate BLE**
   - Constant advertising interval
   - Constant scan interval/window

2. **Motion-gated BLE**
   - Increases scan/advertising during or after motion

3. **Peer-gated BLE**
   - Increases scan/advertising after recent peer detection

4. **Motion + peer adaptive BLE**
   - Uses both motion drive and peer drive

5. **Randomized role rotation**
   - Subset of animals scan aggressively during rotating epochs
   - All or most animals advertise

---

## 12. Adaptive Sampling Algorithm

For the main adaptive policy, use bounded exponential drive variables.

### 12.1 Drive Update

```text
motion_drive = motion_drive * exp(-dt / tau_motion)
peer_drive   = peer_drive   * exp(-dt / tau_peer)

if motion_detected:
    motion_drive += motion_gain

if peer_detected:
    peer_drive += peer_gain

sampling_drive = clamp(
    w_motion * motion_drive + w_peer * peer_drive,
    0,
    1
)
```

### 12.2 Map Drive to BLE Timing

Use min/max timing bounds.

Because higher scan/advertising rate corresponds to shorter intervals:

```text
scan_rate = scan_rate_min + sampling_drive * (scan_rate_max - scan_rate_min)
adv_rate  = adv_rate_min  + sampling_drive * (adv_rate_max  - adv_rate_min)

scan_interval = 1 / scan_rate
adv_interval  = 1 / adv_rate
```

Alternatively, interpolate intervals directly on a log scale:

```text
scan_interval = exp(
  log(scan_interval_max) * (1 - sampling_drive)
+ log(scan_interval_min) * sampling_drive
)
```

Log-scale interpolation is preferred because BLE intervals span orders of magnitude.

### 12.3 Example Parameters

| Parameter | Default |
|---|---:|
| Scan interval max | 300 s |
| Scan interval min | 10 s |
| Scan window min | 0.5 s |
| Scan window max | 5 s |
| Adv interval max | 2 s |
| Adv interval min | 0.1 s |
| tau_motion | 10 min |
| tau_peer | 30 min |
| motion_gain | 0.2 |
| peer_gain | 0.35 |
| w_motion | 0.5 |
| w_peer | 0.5 |

---

## 13. Motion Sensor Model

The firmware should not get exact speed. It should get a simulated motion signal.

```ts
type AnimalObservation = {
  time: number;
  animalId: string;
  motionDetected: boolean;
  motionMagnitude: number;
  collarValid: boolean;
};
```

Motion can be derived from true movement plus noise:

```text
motionMagnitude = true_speed + sensor_noise
motionDetected = motionMagnitude > motion_threshold
```

Optional false positives/negatives:

| Parameter | Meaning |
|---|---|
| Motion false positive rate | Stationary collar reports motion |
| Motion false negative rate | Moving animal fails to trigger motion |
| Motion threshold | Minimum movement magnitude |

---

## 14. Battery Model

Implement a simple current integration model.

```ts
type BatteryParams = {
  capacityMah: number;
  sleepCurrentMa: number;
  advertisingCurrentMa: number;
  scanningCurrentMa: number;
  motionSensorCurrentMa: number;
  cpuActiveCurrentMa: number;
};
```

At each step:

```text
current = sleep_current
        + adv_active ? advertising_current : 0
        + scan_active ? scanning_current : 0
        + motion_sensor_current
        + cpu_active_current_if_processing

battery_mah -= current * dt_hours
```

If battery reaches zero:

```text
collar.valid = false
```

The simulator should separately support random collar loss:

```text
collar.valid = false after sampled dropout time
```

Battery death and collar loss should be distinguishable in logs.

---

## 15. Collar Loss / Missing Data

Collar loss is expected and must be modeled.

Each collar should have:

```ts
type CollarValidity = {
  valid: boolean;
  invalidReason?: "battery_depleted" | "lost" | "manual_censor";
  invalidStartTime?: number;
};
```

Analysis must mask dyads where either collar is invalid.

For a dyad A-B, valid analysis windows require:

```text
valid_A(t) && valid_B(t)
```

The simulator should allow:

- no collar loss
- random loss probability per day
- scheduled loss time per animal
- battery-driven loss

---

## 16. Logs and Data Outputs

The simulator should generate both ground-truth logs and collar-observed logs.

### 16.1 Animal State Log

One row per animal per time step.

```ts
type AnimalStateLog = {
  time: number;
  animalId: string;
  x: number;
  y: number;
  nodeId?: string;
  edgeId?: string;
  behavioralState: AnimalState;
  trueSpeed: number;
  motionDetected: boolean;
  sleeping: boolean;
};
```

### 16.2 Collar State Log

One row per animal per time step.

```ts
type CollarStateLog = {
  time: number;
  animalId: string;
  collarValid: boolean;
  invalidReason?: string;

  batteryMahRemaining: number;

  scanActive: boolean;
  advActive: boolean;
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;

  motionDrive: number;
  peerDrive: number;
  samplingDrive: number;
};
```

### 16.3 True Dyadic Proximity Log

One row per dyad per time step.

```ts
type TrueDyadLog = {
  time: number;
  animalA: string;
  animalB: string;
  distance: number;
  withinDetectionRadius: boolean;
  withinSocialRadius: boolean;
  bothCollarsValid: boolean;
};
```

### 16.4 BLE Detection Log

One row per detected packet/event.

```ts
type DetectionEvent = {
  time: number;
  observerId: string;
  peerId: string;
  trueDistance: number;
  rssi: number;
  channel?: number;
  scanPolicyId: string;
};
```

### 16.5 Negative Scan Window Log

This is essential.

Log scan windows even when no peer is detected.

```ts
type ScanWindowLog = {
  startTime: number;
  endTime: number;
  observerId: string;
  scanPolicyId: string;
  detectedPeerIds: string[];
  detectedAnyPeer: boolean;
};
```

This allows analysis to distinguish:

- no peer nearby
- peer nearby but missed
- collar not scanning
- collar invalid/lost

---

## 17. Visualization Requirements

The app should provide full visualization of each animal moving in the enclosure.

### 17.1 Enclosure View

Display:

- enclosure boundary
- path/tunnel graph
- nest/resource nodes
- animals moving along paths
- optional detection radius around selected animal
- optional social radius
- current simulation time
- day/night phase
- playback speed

### 17.2 Animal Visual State

For each animal, show:

- ID label
- position
- behavioral state
- motion state
- collar valid/invalid
- battery level indicator
- optional trail/history

Example visual encodings:

| State | Display |
|---|---|
| sleeping | dimmed or small resting icon |
| moving | bright marker with trail |
| social pause | marker with ring |
| collar lost/dead | outlined or hidden with warning |
| scanning | pulsing ring |
| advertising | small halo |

### 17.3 Detection Visualization

At each visible time step:

- draw edges/lines between animals with true contact
- draw separate edges/lines for observed BLE detections
- allow toggling true vs observed proximity
- show RSSI when hovering over observed detection

### 17.4 Time Controls

Required:

- play/pause
- reset
- step forward
- scrubber timeline
- speed multiplier
- jump to day/hour
- run full simulation instantly without animation

### 17.5 Side Panels

Suggested panels:

1. **Simulation settings**
2. **Animal traits**
3. **Firmware policy parameters**
4. **Live collar states**
5. **Graph metrics**
6. **Export/download**

---

## 18. Analysis Requirements

The simulator should compare ground truth and observed/reconstructed proximity.

### 18.1 Graphs

Compute at least three graphs:

1. **True social graph**
   - Based on true distance within social/detection radius

2. **Observed BLE graph**
   - Based only on detection events

3. **Effort-normalized graph**
   - Detection events divided by observation opportunity

4. **Probabilistic reconstructed graph**
   - Optional but recommended

### 18.2 Effort Normalization

For directed detection A→B:

```text
opportunity_A_to_B(t) =
  scan_active_A(t) && adv_active_B(t) && valid_A(t) && valid_B(t)
```

For undirected dyad A-B:

```text
opportunity_AB(t) =
  opportunity_A_to_B(t) OR opportunity_B_to_A(t)
```

Edge weight:

```text
observed_edge_AB =
  detections_AB / total_opportunity_AB
```

Alternative weighted opportunity:

```text
opportunity_AB(t) ≈ scan_effort_A(t) * adv_effort_B(t)
                + scan_effort_B(t) * adv_effort_A(t)
```

### 18.3 Probabilistic Contact Reconstruction

For each dyad A-B, estimate:

```text
P(contact_AB at time t)
```

Rules:

- Positive detection increases probability.
- Negative scan window decreases probability.
- No scan does not equal absence.
- Probability decays between observations.
- Dyad is masked when either collar is invalid.

Example:

```text
if detection:
    P = max(P, P_detected)

else if valid negative scan:
    P = min(P, P_negative)

else:
    P = P * exp(-dt / tau_contact)
```

Suggested defaults:

| Parameter | Default |
|---|---:|
| P_detected | 0.95 |
| P_negative | 0.05 |
| tau_contact | 10–60 min |

### 18.4 Metrics

Compute:

| Metric | Description |
|---|---|
| Edge-weight correlation | Correlation between true and reconstructed dyadic weights |
| Degree-rank preservation | Correlation of true vs observed node degree |
| False positive rate | Observed contact when no true contact |
| False negative rate | True contact not observed |
| Contact duration error | Difference between true and reconstructed durations |
| Neighbor-over-time accuracy | Per-time-bin agreement |
| Detections per mAh | Efficiency metric |
| Battery life | Mean and per-animal |
| Valid data fraction | Fraction of animal-time and dyad-time retained |
| Bias vs motion | Whether high-motion animals have inflated observed degree |
| Bias vs social propensity | Whether highly social animals are over/under-estimated |

---

## 19. Batch Comparison Mode

The app should eventually support running multiple policies on the same simulated world.

Example policies:

- fixed low-power
- fixed high-power
- motion-only adaptive
- peer-only adaptive
- motion + peer adaptive
- random scanner role rotation

All policies should use the same:

- random seed
- animal traits
- path graph
- true animal movement
- collar loss schedule

This allows fair comparison.

Output comparison table:

| Policy | Graph correlation | FN rate | FP rate | Battery life | Detections/mAh |
|---|---:|---:|---:|---:|---:|

---

## 20. Export Requirements

Allow export as:

- JSON simulation configuration
- CSV animal state log
- CSV collar state log
- CSV true dyad log
- CSV BLE detection log
- CSV scan window log
- JSON analysis summary
- PNG/SVG graph snapshot
- Optional MP4/WebM animation export

Minimum MVP export:

1. configuration JSON
2. detection log CSV
3. collar state log CSV
4. analysis summary JSON

---

## 21. Reproducibility Requirements

The simulator should be deterministic given:

- random seed
- configuration
- policy version

Use a seeded pseudo-random number generator instead of `Math.random()`.

Suggested library:

- `seedrandom`

Every export should include:

```ts
type SimulationMetadata = {
  simulatorVersion: string;
  randomSeed: string;
  createdAt: string;
  policyIds: string[];
  timeStepSeconds: number;
  simulationLengthSeconds: number;
};
```

---

## 22. Suggested MVP Scope

### MVP Features

- Rectangular enclosure
- Optional circular enclosure
- Random generated path graph
- 5–30 animals
- Day/night activity cycle
- Sleep/movement bouts
- Social attraction
- BLE detection radius + RSSI noise
- Fixed BLE policy
- Motion + peer adaptive BLE policy
- Collar battery state
- Random collar loss
- Canvas visualization
- True vs observed graph comparison
- CSV/JSON export

### Defer Until Later

- User-drawn path graphs
- Web Workers
- Batch sweeps
- Sophisticated RF multipath
- Real public dataset import
- Statistical model fitting
- Video export
- Multiple enclosure zones
- Predator/risk/resource ecology

---

## 23. Suggested TypeScript Interfaces

```ts
type EnclosureMode = "rectangle" | "circle";

type EnclosureConfig =
  | {
      mode: "rectangle";
      width: number;
      height: number;
      boundaryBehavior: "reflect" | "constrain" | "wrap";
    }
  | {
      mode: "circle";
      radius: number;
      boundaryBehavior: "reflect" | "constrain";
    };

type SimulationConfig = {
  seed: string;
  simulationLengthDays: number;
  timeStepSeconds: number;
  animalCount: number;
  enclosure: EnclosureConfig;
  pathGraph: PathGraphConfig;
  behavior: BehaviorConfig;
  radio: RadioConfig;
  firmwarePolicies: FirmwarePolicyConfig[];
  battery: BatteryParams;
  collarLoss: CollarLossConfig;
};

type PathGraph = {
  nodes: PathNode[];
  edges: PathEdge[];
};

type Animal = {
  id: string;
  traits: AnimalTraits;
  state: AnimalState;
  position: AnimalPosition;
  collar: CollarState;
};

type RadioConfig = {
  detectionRadiusMeters: number;
  socialRadiusMeters: number;
  rssiAtOneMeter: number;
  pathLossExponent: number;
  rssiNoiseSd: number;
  rssiThreshold: number;
  rssiSlope: number;
  occlusionEnabled: boolean;
};

type FirmwarePolicyConfig = {
  id: string;
  type:
    | "fixed"
    | "motion_gated"
    | "peer_gated"
    | "motion_peer_adaptive"
    | "role_rotation";
  params: Record<string, number | string | boolean>;
};
```

---

## 24. Simulation Loop Pseudocode

```ts
function stepSimulation(sim: SimulationState, dtSeconds: number): SimulationState {
  const time = sim.time + dtSeconds;

  updateCircadianAndBehavior(sim.animals, time, dtSeconds, sim.config.behavior);

  updateAnimalPositions(
    sim.animals,
    sim.pathGraph,
    sim.config.enclosure,
    dtSeconds
  );

  const trueDyads = computeTrueDyadicDistances(
    sim.animals,
    sim.config.radio
  );

  const animalObservations = computeMotionObservations(
    sim.animals,
    sim.config.behavior.motionSensor
  );

  updateCollarSchedules(
    sim.animals,
    animalObservations,
    sim.lastDetectionEvents,
    dtSeconds,
    sim.config.firmwarePolicies
  );

  const detectionEvents = simulateBleDetections(
    sim.animals,
    trueDyads,
    sim.config.radio,
    time
  );

  updateBatteryStates(
    sim.animals,
    dtSeconds,
    sim.config.battery
  );

  applyCollarLoss(
    sim.animals,
    time,
    sim.config.collarLoss
  );

  writeLogs(
    sim.logs,
    time,
    sim.animals,
    trueDyads,
    detectionEvents
  );

  return {
    ...sim,
    time,
    lastDetectionEvents: detectionEvents
  };
}
```

---

## 25. Important Analysis Notes

The app should communicate that adaptive BLE sampling is not neutral.

A detection event means:

```text
observed detection =
  true proximity
  × probability of sampling
  × radio detectability
```

With motion- or peer-dependent sampling, the sampling probability is behavior-dependent. Therefore, raw detections should not be interpreted directly as unbiased social contact.

The app should always present:

1. **Raw observed detections**
2. **Sampling effort**
3. **Effort-normalized proximity**
4. **Ground truth comparison when available**

This is one of the main scientific purposes of the simulator.

---

## 26. UI Layout Suggestion

```text
┌─────────────────────────────────────────────────────────────┐
│ Top Bar: Play/Pause | Time | Speed | Seed | Export          │
├───────────────────────────────┬─────────────────────────────┤
│                               │ Settings Panel              │
│ Canvas Enclosure View          │ - Enclosure                 │
│                               │ - Animals                   │
│                               │ - Behavior                  │
│                               │ - BLE policy                │
│                               │ - Battery/dropout           │
├───────────────────────────────┴─────────────────────────────┤
│ Metrics Panel                                                │
│ True Graph | Observed Graph | Normalized Graph | Battery     │
└─────────────────────────────────────────────────────────────┘
```

---

## 27. Acceptance Criteria

The MVP is acceptable when a user can:

1. Choose rectangular or circular enclosure.
2. Set animal count, simulation length, and time step.
3. Generate path/tunnel structure.
4. Assign animal traits from min/max/peak distributions.
5. Run/pause/scrub a visible animated simulation.
6. See every animal moving in the enclosure.
7. Toggle true proximity and observed BLE detections.
8. Compare fixed BLE sampling against adaptive motion+peer BLE sampling.
9. Simulate collar loss or battery death.
10. Export logs and analysis summaries.
11. Re-run the same simulation from a seed and get identical results.

---

## 28. Future Extensions

Potential later features:

- Import real animal path data.
- Import public RFID or BLE datasets.
- Fit simulator parameters to real data.
- Add sex/age/social hierarchy effects.
- Add mating/territorial/avoidance behavior.
- Add environmental resources and depletion.
- Add obstacles and RF shadowing.
- Add multiple collars per animal or base-station receivers.
- Add BLE channel-specific packet loss.
- Add firmware OTA/update simulation.
- Add visualization of uncertainty over time.
- Add automated parameter sweeps with downloadable reports.

---

## 29. Summary

This simulator should function as both:

1. A visual intuition-building tool for adaptive social proximity logging.
2. A quantitative sandbox for testing whether BLE firmware policies recover social structure without unacceptable motion/sampling bias.

The most important implementation principle is to keep ground truth, radio detection, collar firmware, and analysis strictly separated.
