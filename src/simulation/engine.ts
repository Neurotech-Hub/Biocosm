import { getEdge, interpolateEdge } from "./geometry";
import { computeEnergyLog } from "./energy";
import { computeMotionObservations } from "./motionSensor";
import { applyFirmwarePolicy } from "./policies/adaptive";
import { SeededRandom } from "./random";
import {
  computeTrueContacts,
  createAdvertisingEventsFromBursts,
  createBleBurstEvents,
  createScanWindowEventsFromBursts,
  simulateBleDetections
} from "./radio";
import { arriveAtNode, chooseBehaviorState, chooseNextEdge, enterEdge } from "./world";
import type {
  Animal,
  AnimalObservation,
  AnimalStateLog,
  BleBurstEvent,
  CollarStateLog,
  DetectionEvent,
  ScanWindowEvent,
  ScanWindowLog,
  SimulationState,
  TrueContact,
  TrueDyadLog
} from "./types";

const movementSpeedMetersPerMinute = 1.2;

export function stepSimulation(state: SimulationState): SimulationState {
  const rng = SeededRandom.fromState(state.rngState);
  const dtSeconds = state.config.timeStepSeconds;
  const time = state.time + dtSeconds;
  const absoluteTime = state.config.startTimeSeconds + time;

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
      time,
      dtSeconds
    )
  );
  const epochStart = time - dtSeconds;
  const bleBursts = createBleBurstEvents(
    animalsWithPolicy,
    state.config.activePolicy.id,
    epochStart,
    time
  );
  const animalsWithBurstState = applyBurstState(animalsWithPolicy, bleBursts);
  const trueContacts = computeTrueContacts(animalsWithBurstState, state.config.radio, time);
  const scanWindowEvents = createScanWindowEventsFromBursts(bleBursts);
  const advertisingEvents = createAdvertisingEventsFromBursts(bleBursts);
  const detections = simulateBleDetections(
    animalsWithBurstState,
    trueContacts,
    state.config.radio,
    state.config.activePolicy.id,
    time,
    rng,
    bleBursts
  );
  const scanWindows = createScanWindowLogs(scanWindowEvents, detections);
  const energy = computeEnergyLog(time, dtSeconds, bleBursts, state.config.energy, state.energy.cumulativeMah);
  const frameLogs = {
    animalStates: createAnimalStateLogs(time, animalsWithBurstState, observations),
    trueDyads: createTrueDyadLogs(trueContacts, animalsWithBurstState),
    detections,
    bleBursts,
    scanWindows,
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

export function mergeLogs(left: SimulationState["logs"], right: SimulationState["logs"]): SimulationState["logs"] {
  return {
    animalStates: [...left.animalStates, ...right.animalStates],
    trueDyads: [...left.trueDyads, ...right.trueDyads],
    detections: [...left.detections, ...right.detections],
    bleBursts: [...left.bleBursts, ...right.bleBursts],
    scanWindows: [...left.scanWindows, ...right.scanWindows],
    collarStates: [...left.collarStates, ...right.collarStates],
    energy: [...left.energy, ...right.energy]
  };
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
    if (boutRemainingSeconds <= 0) {
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
    const distanceThisStep = movementSpeedMetersPerMinute * (dtSeconds / 60);
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
    return Math.max(120, rng.triangular(120, animal.traits.sleepBoutMeanMinutes * 60, animal.traits.sleepBoutMeanMinutes * 180));
  }
  return rng.range(2 * 60, 10 * 60);
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

function createTrueDyadLogs(trueContacts: TrueContact[], animals: Animal[]): TrueDyadLog[] {
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  return trueContacts.map((contact) => {
    const animalA = animalById.get(contact.animalA);
    const animalB = animalById.get(contact.animalB);
    return {
      ...contact,
      bothCollarsValid: Boolean(animalA?.collar.valid && animalB?.collar.valid)
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
