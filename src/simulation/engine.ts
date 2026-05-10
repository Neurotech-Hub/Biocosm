import { summarizeDyadEpoch } from "./dyadEpoch";
import { getEdge, interpolateEdge } from "./geometry";
import { computeEnergyLog } from "./energy";
import { computeMotionObservations } from "./motionSensor";
import { adaptivePolicyInputsForAnimal, applyFirmwarePolicy, combinedEnvelopeDuty } from "./policies/adaptive";
import { SeededRandom } from "./random";
import {
  computeTrueContacts,
  createAdvertisingEventsFromBursts,
  createBleBurstEvents,
  createScanWindowEventsFromBursts,
  simulateBleDetections
} from "./radio";
import { arriveAtNode, behaviorStateFromSchedule, chooseBehaviorState, chooseNextEdge, enterEdge } from "./world";
import type {
  Animal,
  AnimalObservation,
  AnimalStateLog,
  AdaptiveBlePolicyLog,
  BleBurstEvent,
  CollarStateLog,
  DetectionEvent,
  ScanWindowEvent,
  ScanWindowLog,
  SimulationLogs,
  SimulationState,
  TrueContact,
  TrueDyadLog
} from "./types";

export function stepSimulation(state: SimulationState): SimulationState {
  const rng = SeededRandom.fromState(state.rngState);
  const dtSeconds = state.config.timeStepSeconds;
  const time = state.time + dtSeconds;
  const absoluteTime = state.config.startTimeSeconds + time;

  const animalsAtEpochStart = state.animals;
  const movedAnimals = updateAnimalPositions(state.animals, state, absoluteTime, dtSeconds, rng);
  const observations = computeMotionObservations(time, state.animals, movedAnimals, state.config.motionSensor, rng);
  const observationByAnimal = new Map(observations.map((observation) => [observation.animalId, observation]));
  const animalsWithPolicy = movedAnimals.map((animal) =>
    applyFirmwarePolicy(
      animal,
      state.config.activePolicy,
      observationByAnimal.get(animal.id) ?? {
        time,
        animalId: animal.id,
        motionDetected: false,
        motionMagnitude: 0,
        collarValid: animal.collar.valid
      },
      state.detections,
      state.scanWindows,
      time,
      dtSeconds
    )
  );
  const epochStart = time - dtSeconds;
  const bleBursts = createBleBurstEvents(
    animalsWithPolicy,
    state.config.activePolicy.id,
    epochStart,
    time,
    state.config.bleScheduling
  );
  const animalsWithBurstState = applyBurstState(animalsWithPolicy, bleBursts);
  const energyBursts = energyBurstsForRepresentativeCollar(animalsWithBurstState, bleBursts);
  const advInterval = state.config.energy.advertisingEventIntervalSeconds;
  const trueContacts = computeTrueContacts(animalsWithBurstState, state.config.radio, time);
  const scanWindowEvents = createScanWindowEventsFromBursts(bleBursts);
  const advertisingEvents = createAdvertisingEventsFromBursts(bleBursts, advInterval);
  const detections = simulateBleDetections(
    animalsAtEpochStart,
    animalsWithBurstState,
    state.config.radio,
    state.config.activePolicy.id,
    epochStart,
    time,
    rng,
    bleBursts,
    advInterval
  );
  const scanWindows = createScanWindowLogs(scanWindowEvents, detections);
  const energy = computeEnergyLog(time, dtSeconds, energyBursts, state.config.energy, state.energy.cumulativeMah);
  const frameLogs = {
    animalStates: createAnimalStateLogs(time, animalsWithBurstState, observations),
    trueDyads: createTrueDyadLogs(
      trueContacts,
      animalsAtEpochStart,
      animalsWithBurstState,
      state.config.radio,
      epochStart,
      time
    ),
    detections,
    bleBursts,
    scanWindows,
    adaptiveBlePolicy: createAdaptiveBlePolicyLogs(
      epochStart,
      time,
      animalsWithBurstState,
      observations,
      state.detections,
      state.scanWindows,
      state.config.activePolicy
    ),
    collarStates: createCollarStateLogs(time, animalsWithBurstState),
    energy: [energy]
  };

  return {
    ...state,
    time,
    animals: animalsWithBurstState,
    trueContacts,
    detections,
    bleBursts,
    scanWindows,
    advertisingEvents,
    energy,
    logs: frameLogs,
    rngState: rng.getState()
  };
}

export function runSimulation(initialState: SimulationState, steps: number): SimulationState {
  let state = initialState;
  for (let index = 0; index < steps; index += 1) {
    const next = stepSimulation(state);
    state = {
      ...next,
      logs: mergeLogs(state.logs, next.logs)
    };
  }
  return state;
}

/** Full horizon run with merged logs and full timeline (for sweep / batch analysis). */
export function runSimulationToEnd(initialState: SimulationState): {
  finalState: SimulationState;
  mergedLogs: SimulationLogs;
  timeline: SimulationState[];
} {
  const timeline: SimulationState[] = [initialState];
  let logs = initialState.logs;
  const totalSteps = Math.floor(initialState.config.simulationLengthSeconds / initialState.config.timeStepSeconds);
  let current = initialState;

  for (let step = 0; step < totalSteps; step += 1) {
    current = stepSimulation(current);
    logs = mergeLogs(logs, current.logs);
    timeline.push(current);
  }

  return { finalState: current, mergedLogs: logs, timeline };
}

export function mergeLogs(left: SimulationState["logs"], right: SimulationState["logs"]): SimulationState["logs"] {
  return {
    animalStates: [...left.animalStates, ...right.animalStates],
    trueDyads: [...left.trueDyads, ...right.trueDyads],
    detections: [...left.detections, ...right.detections],
    bleBursts: [...left.bleBursts, ...right.bleBursts],
    scanWindows: [...left.scanWindows, ...right.scanWindows],
    adaptiveBlePolicy: [...left.adaptiveBlePolicy, ...right.adaptiveBlePolicy],
    collarStates: [...left.collarStates, ...right.collarStates],
    energy: [...left.energy, ...right.energy]
  };
}

function energyBurstsForRepresentativeCollar(animals: Animal[], bursts: BleBurstEvent[]): BleBurstEvent[] {
  const rep = animals.find((animal) => animal.collar.valid) ?? animals[0];
  if (!rep) {
    return [];
  }
  return bursts.filter((burst) => burst.animalId === rep.id);
}

function applyBurstState(animals: Animal[], bursts: BleBurstEvent[]): Animal[] {
  return animals.map((animal) => {
    const animalBursts = bursts.filter((burst) => burst.animalId === animal.id);
    const scanBursts = animalBursts.filter((burst) => burst.kind === "scan");
    const advBursts = animalBursts.filter((burst) => burst.kind === "advertise");
    const lastScan = scanBursts.at(-1);
    const lastAdv = advBursts.at(-1);
    return {
      ...animal,
      collar: {
        ...animal.collar,
        scanActive: scanBursts.length > 0,
        advActive: advBursts.length > 0,
        lastScanTime: lastScan?.endTime ?? animal.collar.lastScanTime,
        lastAdvTime: lastAdv?.endTime ?? animal.collar.lastAdvTime
      }
    };
  });
}

function updateAnimalPositions(
  animals: Animal[],
  state: SimulationState,
  time: number,
  dtSeconds: number,
  rng: SeededRandom
): Animal[] {
  return animals.map((animal) => {
    let nextAnimal = animal;
    const boutRemainingSeconds = animal.boutRemainingSeconds - dtSeconds;
    if (animal.behaviorSchedule.length > 0) {
      const nextState = behaviorStateFromSchedule(animal.behaviorSchedule, time);
      nextAnimal = {
        ...nextAnimal,
        state: nextState,
        boutRemainingSeconds: secondsUntilScheduleChange(animal, time)
      };
    } else if (boutRemainingSeconds <= 0) {
      const nextState = chooseBehaviorState(time, animal, state.config.behavior, rng);
      nextAnimal = {
        ...nextAnimal,
        state: nextState,
        boutRemainingSeconds: boutLengthSeconds(nextState, animal, rng)
      };
    } else {
      nextAnimal = {
        ...nextAnimal,
        boutRemainingSeconds
      };
    }

    if (nextAnimal.state !== "moving") {
      return nextAnimal;
    }

    if (nextAnimal.position.mode === "node") {
      const { edge, toNodeId } = chooseNextEdge(nextAnimal, state.pathGraph, animals, rng);
      nextAnimal = enterEdge(nextAnimal, state.pathGraph, edge, toNodeId);
    }

    const edge = getEdge(state.pathGraph, nextAnimal.position.edgeId ?? "");
    const distanceThisStep = nextAnimal.traits.movementSpeedMetersPerMinute * (dtSeconds / 60);
    const progressDelta = edge.length > 0 ? distanceThisStep / edge.length : 1;
    const progress = Math.min(1, nextAnimal.position.progress + progressDelta);
    const point = interpolateEdge(state.pathGraph, nextAnimal.position.fromNodeId, nextAnimal.position.toNodeId, progress);
    nextAnimal = {
      ...nextAnimal,
      position: {
        ...nextAnimal.position,
        progress,
        x: point.x,
        y: point.y
      }
    };

    if (progress >= 1) {
      return arriveAtNode(nextAnimal, state.pathGraph, nextAnimal.position.toNodeId);
    }

    return nextAnimal;
  });
}

function boutLengthSeconds(state: Animal["state"], animal: Animal, rng: SeededRandom): number {
  if (state === "moving") {
    return Math.max(60, rng.triangular(60, animal.traits.movementBoutMeanMinutes * 60, animal.traits.movementBoutMeanMinutes * 180));
  }
  if (state === "sleeping") {
    return Math.max(120, rng.triangular(120, animal.traits.restBoutMeanMinutes * 60, animal.traits.restBoutMeanMinutes * 180));
  }
  return Math.max(60, rng.triangular(60, animal.traits.stationaryAwakeBoutMeanMinutes * 60, animal.traits.stationaryAwakeBoutMeanMinutes * 180));
}

function secondsUntilScheduleChange(animal: Animal, timeSeconds: number): number {
  const segment = animal.behaviorSchedule.find(
    (row) => timeSeconds >= row.startTimeSeconds && timeSeconds < row.endTimeSeconds
  );
  return Math.max(0, (segment?.endTimeSeconds ?? timeSeconds) - timeSeconds);
}

function createScanWindowLogs(scanWindowEvents: ScanWindowEvent[], detections: DetectionEvent[]): ScanWindowLog[] {
  return scanWindowEvents.map((window) => {
    const detectedPeerIds = detections
      .filter(
        (event) =>
          event.observerId === window.observerId && event.time >= window.startTime && event.time <= window.endTime
      )
      .map((event) => event.peerId);
    return {
      ...window,
      detectedPeerIds: [...new Set(detectedPeerIds)],
      detectedAnyPeer: detectedPeerIds.length > 0
    };
  });
}

function createAnimalStateLogs(
  time: number,
  animals: Animal[],
  observations: AnimalObservation[]
): AnimalStateLog[] {
  const observationByAnimal = new Map(observations.map((observation) => [observation.animalId, observation]));
  return animals.map((animal) => {
    const observation = observationByAnimal.get(animal.id);
    return {
      time,
      animalId: animal.id,
      x: animal.position.x,
      y: animal.position.y,
      nodeId: animal.position.nodeId,
      edgeId: animal.position.edgeId,
      behavioralState: animal.state,
      trueSpeed: observation ? observation.motionMagnitude : 0,
      motionDetected: observation?.motionDetected ?? false,
      sleeping: animal.state === "sleeping"
    };
  });
}

function createTrueDyadLogs(
  trueContacts: TrueContact[],
  animalsAtEpochStart: Animal[],
  animalsAtEpochEnd: Animal[],
  radio: SimulationState["config"]["radio"],
  epochStart: number,
  epochEnd: number
): TrueDyadLog[] {
  const startAnimalById = new Map(animalsAtEpochStart.map((animal) => [animal.id, animal]));
  const endAnimalById = new Map(animalsAtEpochEnd.map((animal) => [animal.id, animal]));
  return trueContacts.map((contact) => {
    const animalAStart = startAnimalById.get(contact.animalA);
    const animalBStart = startAnimalById.get(contact.animalB);
    const animalAEnd = endAnimalById.get(contact.animalA);
    const animalBEnd = endAnimalById.get(contact.animalB);
    const epochSummary =
      animalAStart && animalBStart && animalAEnd && animalBEnd
        ? summarizeDyadEpoch(animalAStart, animalAEnd, animalBStart, animalBEnd, epochStart, epochEnd, radio)
        : {
            withinDetectionRadiusAny: contact.withinDetectionRadius,
            inRangeSeconds: contact.withinDetectionRadius ? Math.max(0, epochEnd - epochStart) : 0,
            minDistanceMeters: contact.distance
          };
    return {
      ...contact,
      epochStartTime: epochStart,
      epochEndTime: epochEnd,
      bothCollarsValid: Boolean(animalAEnd?.collar.valid && animalBEnd?.collar.valid),
      withinDetectionRadiusAtEnd: contact.withinDetectionRadius,
      withinDetectionRadiusAny: epochSummary.withinDetectionRadiusAny,
      inRangeSeconds: epochSummary.inRangeSeconds,
      minDistanceMeters: epochSummary.minDistanceMeters,
      endDistanceMeters: contact.distance
    };
  });
}

function createCollarStateLogs(time: number, animals: Animal[]): CollarStateLog[] {
  return animals.map((animal) => ({
    time,
    animalId: animal.id,
    collarValid: animal.collar.valid,
    invalidReason: animal.collar.invalidReason,
    batteryMahRemaining: animal.collar.batteryMahRemaining,
    scanActive: animal.collar.scanActive,
    advActive: animal.collar.advActive,
    scanIntervalSeconds: animal.collar.scanIntervalSeconds,
    scanWindowSeconds: animal.collar.scanWindowSeconds,
    advIntervalSeconds: animal.collar.advIntervalSeconds,
    motionDrive: animal.collar.motionDrive,
    peerDrive: animal.collar.peerDrive,
    samplingDrive: animal.collar.samplingDrive
  }));
}

function createAdaptiveBlePolicyLogs(
  epochStartTime: number,
  epochEndTime: number,
  animals: Animal[],
  observations: AnimalObservation[],
  previousDetections: DetectionEvent[],
  previousScanWindows: ScanWindowLog[],
  policy: SimulationState["config"]["activePolicy"]
): AdaptiveBlePolicyLog[] {
  if (policy.type !== "motion_peer_adaptive") {
    return [];
  }

  const observationByAnimal = new Map(observations.map((observation) => [observation.animalId, observation]));
  return animals.map((animal) => {
    const inputs = adaptivePolicyInputsForAnimal(animal.id, previousDetections, previousScanWindows);
    const observation = observationByAnimal.get(animal.id);
    const timing = animal.collar;
    const duty = combinedEnvelopeDuty(timing);

    return {
      time: epochEndTime,
      epochStartTime,
      epochEndTime,
      animalId: animal.id,
      motionDetected: observation?.motionDetected ?? false,
      motionEventCount: observation?.motionDetected ? 1 : 0,
      localPeerDetectionCount: inputs.localPeerDetectionsLastEpoch.length,
      observerScannedWithoutPeer: inputs.observerScannedWithoutPeerLastEpoch,
      baselineContribution: policy.baselineDrive,
      motionContribution: policy.motionWeight * timing.motionDrive,
      peerContribution: policy.peerWeight * timing.peerDrive,
      motionDrive: timing.motionDrive,
      peerDrive: timing.peerDrive,
      samplingDrive: timing.samplingDrive,
      scanIntervalSeconds: timing.scanIntervalSeconds,
      scanWindowSeconds: timing.scanWindowSeconds,
      advIntervalSeconds: timing.advIntervalSeconds,
      advertisingBurstDurationSeconds: timing.advertisingBurstDurationSeconds,
      combinedEnvelopeDuty: duty,
      saturatedScheduleWarning: duty > 0.8
    };
  });
}
