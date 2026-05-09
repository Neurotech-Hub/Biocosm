import { getEdge, interpolateEdge } from "./geometry";
import { applyFixedRatePolicy, createScanWindowLog } from "./policies/fixedRate";
import { SeededRandom } from "./random";
import { computeTrueContacts, simulateBleDetections } from "./radio";
import { arriveAtNode, chooseBehaviorState, chooseNextEdge, enterEdge } from "./world";
import type {
  Animal,
  AnimalObservation,
  AnimalStateLog,
  CollarStateLog,
  DetectionEvent,
  ScanWindowLog,
  SimulationState,
  TrueContact,
  TrueDyadLog
} from "./types";

export function stepSimulation(state: SimulationState): SimulationState {
  const rng = SeededRandom.fromState(state.rngState);
  const dtSeconds = state.config.timeStepSeconds;
  const time = state.time + dtSeconds;

  const movedAnimals = updateAnimalPositions(state.animals, state, time, dtSeconds, rng);
  const animalsWithPolicy = movedAnimals.map((animal) =>
    applyFixedRatePolicy(animal, state.config.fixedPolicy, time, dtSeconds)
  );
  const trueContacts = computeTrueContacts(animalsWithPolicy, state.config.radio, time);
  const detections = simulateBleDetections(
    animalsWithPolicy,
    trueContacts,
    state.config.radio,
    state.config.fixedPolicy.id,
    time,
    rng
  );
  const scanWindows = createScanWindowLogs(animalsWithPolicy, state.config.fixedPolicy.id, time, detections);
  const observations = createMotionObservations(time, state.animals, animalsWithPolicy);

  return {
    ...state,
    time,
    animals: animalsWithPolicy,
    trueContacts,
    detections,
    scanWindows,
    logs: {
      animalStates: [...state.logs.animalStates, ...createAnimalStateLogs(time, animalsWithPolicy, observations)],
      trueDyads: [...state.logs.trueDyads, ...createTrueDyadLogs(trueContacts, animalsWithPolicy)],
      detections: [...state.logs.detections, ...detections],
      scanWindows: [...state.logs.scanWindows, ...scanWindows],
      collarStates: [...state.logs.collarStates, ...createCollarStateLogs(time, animalsWithPolicy)]
    },
    rngState: rng.getState()
  };
}

export function runSimulation(initialState: SimulationState, steps: number): SimulationState {
  let state = initialState;
  for (let index = 0; index < steps; index += 1) {
    state = stepSimulation(state);
  }
  return state;
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
      const nextState = chooseBehaviorState(time, animal, rng);
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
    const distanceThisStep = nextAnimal.traits.speedMetersPerMinute * (dtSeconds / 60);
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

function createMotionObservations(time: number, previousAnimals: Animal[], animals: Animal[]): AnimalObservation[] {
  const previousById = new Map(previousAnimals.map((animal) => [animal.id, animal]));
  return animals.map((animal) => {
    const previous = previousById.get(animal.id);
    const distanceMoved = previous ? Math.hypot(animal.position.x - previous.position.x, animal.position.y - previous.position.y) : 0;
    const motionMagnitude = distanceMoved;
    return {
      time,
      animalId: animal.id,
      motionDetected: motionMagnitude > 0.01,
      motionMagnitude,
      collarValid: animal.collar.valid
    };
  });
}

function createScanWindowLogs(
  animals: Animal[],
  policyId: string,
  time: number,
  detections: DetectionEvent[]
): ScanWindowLog[] {
  return animals.flatMap((animal) => {
    const window = createScanWindowLog(animal, { ...animal.collar, id: policyId, type: "fixed" }, time);
    if (!window) {
      return [];
    }
    const detectedPeerIds = detections
      .filter((event) => event.observerId === animal.id)
      .map((event) => event.peerId);
    return [
      {
        ...window,
        detectedPeerIds,
        detectedAnyPeer: detectedPeerIds.length > 0
      }
    ];
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
