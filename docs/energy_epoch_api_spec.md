# Energy Epoch API Spec

This document describes the simulator data available to an energy model at each simulation epoch, the current integration point, and a proposed clean API for a deterministic bench-calibrated model.

The goal is to make the simulator's energy accounting replaceable with bench-tested models while keeping the simulator responsible for behavior, BLE scheduling, radio detections, and per-animal state. Energy should be a deterministic function of the epoch activity record plus calibrated coefficients.

## Goals

- Compute energy per animal per epoch, then aggregate to cohort mean for UI and metrics.
- Support deterministic bench-calibrated models for scan, advertise, idle/shelf, and any future measured components.
- Keep model inputs explicit and unit-labeled.
- Remove legacy parameters that are not used by the selected energy model.
- Avoid hidden calibration scales once bench coefficients exist.
- Keep the model stable across common epoch lengths, such as 30 s and 60 s.

## Current Simulator Boundary

The energy model is currently called inside `stepSimulation()` after policy application and BLE burst scheduling.

Current flow per epoch:

1. Advance animals and compute motion observations.
2. Apply the active firmware policy to each animal.
3. Create scheduled BLE bursts for the epoch.
4. Derive scan windows and advertising events from those bursts.
5. Simulate detections.
6. Call the energy model once per animal with that animal's bursts.
7. Average per-animal energy rows into a cohort-mean `EnergyLog`.

Current call shape:

```ts
computeEnergyLog(
  time: number,
  epochSeconds: number,
  bursts: BleBurstEvent[],
  config: EnergyConfig,
  previousCumulativeMah = 0
): EnergyLog
```

Current call site:

```ts
const perAnimalEnergyLogs = animalsWithBurstState.map((animal) => {
  const burstsForAnimal = bleBursts.filter((burst) => burst.animalId === animal.id);
  const prevCumulative = state.animalEnergyCumulativeMah[animal.id] ?? 0;
  return computeEnergyLog(time, dtSeconds, burstsForAnimal, state.config.energy, prevCumulative);
});
```

Important current behavior:

- Energy is computed per animal, not directly for the cohort.
- `state.energy` and `logs.energy[]` store the element-wise mean of per-animal energy rows.
- `state.animalEnergyCumulativeMah` keeps per-animal cumulative energy.
- The energy model currently receives only the animal's BLE bursts, epoch length, energy config, and previous cumulative mAh.
- The current model does not directly receive motion observations, detections, scan window logs, collar timing fields, battery voltage, or true dyads.

## Current Epoch Data Available In The Simulator

The simulator has more data at epoch time than the current energy function receives. A cleaner API can expose a curated subset.

### Epoch Timing

Available each epoch:

- `epochStartSeconds`: simulation-relative start time for the epoch.
- `epochEndSeconds`: simulation-relative end time for the epoch.
- `epochSeconds`: duration, usually `config.timeStepSeconds`.
- `absoluteTimeSeconds`: wall-clock simulation time is `config.startTimeSeconds + epochEndSeconds`.

Current `computeEnergyLog()` receives:

- `time`: epoch end time.
- `epochSeconds`: duration.

### Per-Animal BLE Schedule Bursts

The most important current energy input is `BleBurstEvent[]`, filtered to one animal.

Current type:

```ts
type BleBurstEvent = {
  kind: "scan" | "advertise";
  startTime: number;
  endTime: number;
  animalId: string;
  policyId: string;
};
```

Semantics:

- Times are simulation-relative seconds.
- Bursts are clipped to the epoch.
- A scan burst's wall duration is `endTime - startTime`.
- An advertise burst's wall duration is `endTime - startTime`.
- If scan is off, such as Inf inactive mode with zero scan window, no positive-duration scan burst is emitted.
- Bursts already include scheduler effects such as safe-zone avoidance, jitter, and radio stabilization delays.

Current derived quantities used by `bench_duration`:

- `scanBurstWallSeconds = sum(endTime - startTime)` for scan bursts.
- `advertisingBurstWallSeconds = sum(endTime - startTime)` for advertise bursts.

Current derived quantities used by `component`:

- `scanListenWindowCount`: number of 12.5 ms listen windows within scan bursts.
- `scanListenWindowSeconds`: `scanListenWindowCount * 0.0125`.
- `advertisingPacketCount`: synthetic advertising packets spaced by `advertisingEventIntervalSeconds`.

### Scan Windows

The simulator derives scan windows from scan bursts.

Current type:

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

These are currently used for logs and adaptive policy feedback, not for energy. They may be useful if the bench model wants to distinguish listen windows from scan burst wall time. If bench measurements are at the firmware routine level, prefer burst wall seconds over synthetic listen-window microstructure unless that microstructure is physically measured.

### Advertising Events

The simulator derives synthetic advertising packet events from advertise bursts.

Current type:

```ts
type AdvertisingEvent = {
  time: number;
  animalId: string;
};
```

These are currently used for detection simulation and the legacy component energy model. If the bench model is based on measured advertise burst wall time, packet counts should not be required.

### Detections

Detections are available after radio simulation.

Current type:

```ts
type DetectionEvent = {
  time: number;
  observerId: string;
  peerId: string;
  trueDistance: number;
  rssi: number;
  scanPolicyId: string;
};
```

Detections are not currently used by energy. A future model could include per-detection logging/write cost, but this should be a separately benchmarked coefficient. Do not implicitly charge energy for detections unless there is a measured reason to do so.

### Motion Observation

Each animal has a motion observation for the epoch.

Current type:

```ts
type AnimalObservation = {
  time: number;
  animalId: string;
  motionDetected: boolean;
  motionMagnitude: number;
  collarValid: boolean;
};
```

Motion currently affects energy indirectly through policy changes: scan interval, scan window, and advertise interval can change before bursts are generated. If accelerometer processing energy is modeled later, expose motion observation and charge it explicitly.

### Collar Timing State

The simulator logs collar state after policy application.

Current type:

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

For energy, the schedule parameters are useful diagnostics but should not be the primary energy input. Actual scheduled bursts are more precise because they include clipping, jitter, collision with other radio activity, and disabled scan windows.

## Current Energy Output

Current type:

```ts
type EnergyLog = {
  time: number;
  steadyMah: number;
  scanMah: number;
  advertisingMah: number;
  totalMah: number;
  cumulativeMah: number;
  remainingMah: number;
  remainingPercent: number;
  estimatedVoltage: number;
};
```

Semantics:

- `steadyMah`: idle/shelf/baseline contribution for this epoch.
- `scanMah`: scan contribution for this epoch.
- `advertisingMah`: advertising contribution for this epoch.
- `totalMah`: epoch total.
- `cumulativeMah`: previous cumulative plus epoch total.
- `remainingMah`: battery capacity minus cumulative.
- `remainingPercent`: remaining mAh divided by capacity.
- `estimatedVoltage`: approximate LiPo voltage curve from state of charge.

The UI and metrics mostly consume `totalMah`, `cumulativeMah`, `remainingPercent`, estimated voltage, and aggregate capture-per-energy values.

## Proposed Clean API

Replace the current `computeEnergyLog(time, epochSeconds, bursts, config, previousCumulativeMah)` boundary with an explicit epoch input object and a model object.

Recommended interface:

```ts
export type EnergyModelId = "bench_linear_v1";

export type EnergyEpochInput = {
  epochStartSeconds: number;
  epochEndSeconds: number;
  epochSeconds: number;
  animalId: string;
  policyId: string;
  collarValid: boolean;
  previousCumulativeMah: number;
  batteryCapacityMah: number;
  startingVoltage: number;
  schedule: {
    scanIntervalSeconds: number;
    scanWindowSeconds: number;
    advIntervalSeconds: number;
    advertisingBurstDurationSeconds: number;
  };
  bursts: BleBurstEvent[];
  derived: {
    scanBurstWallSeconds: number;
    advertisingBurstWallSeconds: number;
    scanBurstCount: number;
    advertisingBurstCount: number;
    scanListenWindowCount: number;
    scanListenWindowSeconds: number;
    advertisingPacketCount: number;
  };
  observations?: {
    motionDetected: boolean;
    motionMagnitude: number;
  };
  detections?: {
    observedPeerCount: number;
    detectionCount: number;
  };
};

export type EnergyEpochOutput = {
  time: number;
  componentsMah: {
    shelf: number;
    scan: number;
    advertise: number;
    logging?: number;
    sensor?: number;
    other?: number;
  };
  totalMah: number;
  cumulativeMah: number;
  remainingMah: number;
  remainingPercent: number;
  estimatedVoltage: number;
  diagnostics: {
    modelId: EnergyModelId;
    modelVersion: string;
    scanBurstWallSeconds: number;
    advertisingBurstWallSeconds: number;
    meanCurrentMicroAmpsThisEpoch: number;
  };
};

export type DeterministicEnergyModel = {
  id: EnergyModelId;
  version: string;
  computeEpoch(input: EnergyEpochInput, coefficients: BenchEnergyCoefficients): EnergyEpochOutput;
};
```

The current `EnergyLog` can be preserved as the UI-facing projection:

```ts
function energyLogFromEpochOutput(output: EnergyEpochOutput): EnergyLog {
  return {
    time: output.time,
    steadyMah: output.componentsMah.shelf,
    scanMah: output.componentsMah.scan,
    advertisingMah: output.componentsMah.advertise,
    totalMah: output.totalMah,
    cumulativeMah: output.cumulativeMah,
    remainingMah: output.remainingMah,
    remainingPercent: output.remainingPercent,
    estimatedVoltage: output.estimatedVoltage
  };
}
```

This avoids forcing the UI to change immediately while allowing richer diagnostics for validation.

## Proposed Bench Coefficients

Start with a linear model over measured durations and counts. Keep coefficients independent of simulator policies.

Recommended coefficient shape:

```ts
export type BenchEnergyCoefficients = {
  id: string;
  label: string;
  version: string;
  sourceNotes: string;
  batteryCapacityMah: number;
  startingVoltage: number;
  terms: {
    shelfCurrentMicroAmps: number;
    scanActiveCurrentIncrementMicroAmps: number;
    advertiseActiveCurrentIncrementMicroAmps: number;
    perScanBurstChargeMicroCoulombs?: number;
    perAdvertiseBurstChargeMicroCoulombs?: number;
    perAdvertisingPacketChargeMicroCoulombs?: number;
    perDetectionLogChargeMicroCoulombs?: number;
    sensorCurrentMicroAmps?: number;
  };
};
```

Initial deterministic formula:

```ts
shelfMah =
  shelfCurrentMicroAmps * epochSeconds / 3_600_000;

scanMah =
  scanActiveCurrentIncrementMicroAmps * scanBurstWallSeconds / 3_600_000
  + perScanBurstChargeMicroCoulombs * scanBurstCount / 3_600_000;

advertiseMah =
  advertiseActiveCurrentIncrementMicroAmps * advertisingBurstWallSeconds / 3_600_000
  + perAdvertiseBurstChargeMicroCoulombs * advertisingBurstCount / 3_600_000
  + perAdvertisingPacketChargeMicroCoulombs * advertisingPacketCount / 3_600_000;

loggingMah =
  perDetectionLogChargeMicroCoulombs * detectionCount / 3_600_000;

sensorMah =
  sensorCurrentMicroAmps * epochSeconds / 3_600_000;
```

Only include optional terms that have bench support. Terms without bench support should be omitted, not guessed.

## What To Remove Or De-Emphasize

Current fields that are candidates for removal from the primary model once the bench API exists:

- `energyModel`: no need for `"component"` versus `"bench_duration"` in production if bench linear is the only supported model.
- `rxCurrentMa1MPhy`: legacy component-only scan input.
- `advEventChargeMicroCoulombs`: legacy component-only advertising input unless bench explicitly chooses packet-count charge.
- `componentBleActivityScale`: tuning knob; should be replaced by bench coefficients.
- `measuredSocial5s20sTotalMicroAmps`: current calibration target; should become a validation fixture, not a runtime coefficient.
- `benchProductionAdvDuty`: current calibration helper; not needed if active current increments are directly fitted.
- `benchProductionScanDuty`: current calibration helper; not needed if active current increments are directly fitted.
- `benchWallTimeCalibrationScale`: hidden schedule correction; should be replaced by coefficients fitted to the same activity representation passed through the API.
- `benchAdvertiseBurstCurrentMicroAmps` and `benchScanBurstCurrentMicroAmps`: keep only if they become direct coefficient inputs; otherwise replace with `advertiseActiveCurrentIncrementMicroAmps` and `scanActiveCurrentIncrementMicroAmps`.

Keep:

- `batteryCapacityMah`.
- `startingVoltage`.
- `txPowerDbm` if it remains a radio/RSSI assumption. It should not be an energy knob unless separate tx-power energy coefficients are added.
- Per-animal cumulative mAh tracking.
- Cohort-mean energy projection for UI compatibility.

## Determinism Requirements

The energy model should be deterministic:

- No RNG.
- No dependence on detection probability internals except finalized epoch detection counts if explicitly modeled.
- Same `EnergyEpochInput` plus same coefficients must produce identical output.
- Output must not depend on array order except for equivalent summation of bursts.
- Epoch-length changes should converge to the same projected mAh/day for equivalent schedules.

## Recommended Validation Tests

Add tests around the API boundary rather than only around UI metrics.

Recommended tests:

- No bursts: energy equals shelf current times epoch duration.
- Scan-only burst: scan energy scales linearly with scan wall seconds.
- Advertise-only burst: advertising energy scales linearly with advertise wall seconds.
- Mixed scan and advertise: total equals sum of components.
- Zero scan window / scan off: no scan bursts, zero scan mAh.
- 30 s vs 60 s epoch: projected mAh/day differs by less than an agreed tolerance for the same long-run schedule.
- Per-animal cumulative: cohort mean equals mean of per-animal cumulative tracks.
- Bench reference replay: a fixed reference schedule reproduces the measured mean current within tolerance.
- Optional terms disabled: omitted optional coefficients contribute exactly zero.

## Migration Plan

1. Add `EnergyEpochInput`, `EnergyEpochOutput`, `BenchEnergyCoefficients`, and `DeterministicEnergyModel`.
2. Add an adapter that builds `EnergyEpochInput` from the data already present in `stepSimulation()`.
3. Implement `bench_linear_v1` using only bench-supported coefficients.
4. Keep `EnergyLog` as a UI-facing projection so charts and metrics do not need an immediate rewrite.
5. Move the current Juxta production mean from runtime calibration into a validation fixture.
6. Remove or hide legacy component fields once tests prove the new model reproduces bench references.
7. Export diagnostics for bench comparison: epoch wall seconds, component mAh, mean current, cumulative mAh, and model version.

## Open Questions For Energy Developer

- Are bench observations measured as full routine wall-time averages, isolated burst windows, packet-level charge, or a mix?
- Should scan energy be modeled using scan burst wall seconds or listen-window seconds?
- Should advertise energy be modeled using advertise burst wall seconds, packet counts, or both?
- Is there a measurable fixed charge per burst start/stop?
- Is there a measurable cost for detections, flash writes, or minute-record serialization?
- Does current depend on battery voltage enough to require voltage-dependent coefficients?
- Do coefficients vary by TX power, PHY, channel count, or firmware mode?
- Should sensor/motion processing be part of shelf current or a separate term?

## Summary Contract

The simulator can provide a deterministic per-animal epoch record containing:

- Epoch timing.
- Animal id and validity.
- Applied policy id.
- Applied schedule parameters.
- Actual scan and advertise bursts after scheduler effects.
- Derived burst wall seconds, burst counts, listen-window counts, and packet counts.
- Optional motion and detection summaries.
- Previous cumulative mAh and battery metadata.

The energy developer should provide a deterministic model that maps that record plus bench coefficients to:

- Component mAh for shelf, scan, advertise, and any bench-supported optional terms.
- Epoch total mAh.
- Updated cumulative and remaining battery state.
- Diagnostics sufficient to compare simulation output against bench observations.
