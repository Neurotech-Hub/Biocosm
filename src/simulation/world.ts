import { edgeLength, edgesForNode, getNode, interpolateEdge, otherNodeId } from "./geometry";
import { getPolicyTiming } from "./policies/fixedRate";
import { SeededRandom } from "./random";
import { resolveSpeciesPreset } from "./speciesModifiers";
import type {
  Animal,
  AnimalState,
  AnimalTraits,
  BehaviorConfig,
  PathEdge,
  PathGraph,
  PathNode,
  SimulationConfig,
  SimulationLogs,
  SimulationState
} from "./types";

export function createInitialSimulation(config: SimulationConfig): SimulationState {
  const rng = new SeededRandom(config.seed);
  const pathGraph = createPathGraph(config, rng);
  const animals = Array.from({ length: config.animalCount }, (_, index) =>
    createAnimal(index, pathGraph, config, rng)
  );

  return {
    time: 0,
    config,
    pathGraph,
    animals,
    trueContacts: [],
    detections: [],
    bleBursts: [],
    scanWindows: [],
    advertisingEvents: [],
    energy: {
      time: 0,
      steadyMah: 0,
      scanMah: 0,
      advertisingMah: 0,
      totalMah: 0,
      cumulativeMah: 0,
      remainingMah: config.energy.batteryCapacityMah,
      remainingPercent: 1,
      estimatedVoltage: config.energy.startingVoltage
    },
    logs: createEmptyLogs(),
    rngState: rng.getState()
  };
}

export function createEmptyLogs(): SimulationLogs {
  return {
    animalStates: [],
    trueDyads: [],
    detections: [],
    bleBursts: [],
    scanWindows: [],
    collarStates: [],
    energy: []
  };
}

export function createPathGraph(config: SimulationConfig, rng: SeededRandom): PathGraph {
  const { width, height } = config.enclosure;
  const nodeCount = Math.max(4, config.pathNodeCount);
  const nodes: PathNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index + 1}`,
    x: rng.range(width * 0.08, width * 0.92),
    y: rng.range(height * 0.08, height * 0.92),
    type: nodeTypeForIndex(index)
  }));

  const edges: PathEdge[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const previousNodes = nodes.slice(0, index);
    const nearest = previousNodes.reduce((best, candidate) =>
      edgeLength(candidate, nodes[index]) < edgeLength(best, nodes[index]) ? candidate : best
    );
    edges.push(createEdge(edges.length, nearest, nodes[index]));
  }

  const extraEdges = Math.max(2, Math.floor(nodeCount / 4));
  let attempts = 0;
  while (edges.length < nodeCount - 1 + extraEdges && attempts < nodeCount * nodeCount) {
    attempts += 1;
    const from = nodes[rng.integer(0, nodes.length - 1)];
    const to = nodes[rng.integer(0, nodes.length - 1)];
    if (from.id === to.id || hasEdge(edges, from.id, to.id)) {
      continue;
    }
    edges.push(createEdge(edges.length, from, to));
  }

  return { nodes, edges };
}

export function chooseNextEdge(
  animal: Animal,
  graph: PathGraph,
  animals: Animal[],
  rng: SeededRandom
): { edge: PathEdge; toNodeId: string } {
  const currentNodeId = animal.position.toNodeId;
  const candidates = edgesForNode(graph, currentNodeId);
  const weights = candidates.map((edge) => {
    const nextNodeId = otherNodeId(edge, currentNodeId);
    const nextNode = getNode(graph, nextNodeId);
    const novelty = animal.recentNodeIds.includes(nextNodeId) ? 0.3 : 1;
    const peerAttraction = nearbyPeerScore(nextNode, animal, animals);
    const peerAvoidance = animal.traits.territoriality * peerAttraction * 0.8;

    return Math.max(
      0.05,
      novelty +
      animal.traits.socialPropensity * peerAttraction +
      0.05 -
      peerAvoidance
    );
  });
  const selected = candidates[rng.weightedIndex(weights)];

  return {
    edge: selected,
    toNodeId: otherNodeId(selected, currentNodeId)
  };
}

export function enterEdge(animal: Animal, graph: PathGraph, edge: PathEdge, toNodeId: string): Animal {
  const fromNodeId = otherNodeId(edge, toNodeId);
  const point = interpolateEdge(graph, fromNodeId, toNodeId, 0);
  return {
    ...animal,
    position: {
      mode: "edge",
      edgeId: edge.id,
      fromNodeId,
      toNodeId,
      progress: 0,
      x: point.x,
      y: point.y
    }
  };
}

export function arriveAtNode(animal: Animal, graph: PathGraph, nodeId: string): Animal {
  const node = getNode(graph, nodeId);
  return {
    ...animal,
    position: {
      mode: "node",
      nodeId,
      fromNodeId: nodeId,
      toNodeId: nodeId,
      progress: 1,
      x: node.x,
      y: node.y
    },
    recentNodeIds: [nodeId, ...animal.recentNodeIds.filter((recentId) => recentId !== nodeId)].slice(0, 5)
  };
}

function createAnimal(
  index: number,
  graph: PathGraph,
  config: SimulationConfig,
  rng: SeededRandom
): Animal {
  const id = `animal-${index + 1}`;
  const startNode = graph.nodes[index % graph.nodes.length];
  const traits = createTraits(id, config, rng);
  const policyTiming = getPolicyTiming(config.activePolicy);
  const scanPhaseOffsetSeconds = rng.range(0, policyTiming.scanIntervalSeconds);
  const advPhaseOffsetSeconds = rng.range(0, policyTiming.advIntervalSeconds);
  const initialState = chooseBehaviorStateFromTraits(config.startTimeSeconds, traits, config.behavior, rng);

  return {
    id,
    traits,
    state: initialState,
    position: {
      mode: "node",
      nodeId: startNode.id,
      fromNodeId: startNode.id,
      toNodeId: startNode.id,
      progress: 1,
      x: startNode.x,
      y: startNode.y
    },
    collar: {
      animalId: id,
      valid: true,
      batteryMahRemaining: 100,
      scanActive: false,
      advActive: false,
      scanIntervalSeconds: policyTiming.scanIntervalSeconds,
      scanWindowSeconds: policyTiming.scanWindowSeconds,
      advIntervalSeconds: policyTiming.advIntervalSeconds,
      advertisingBurstDurationSeconds: policyTiming.advertisingBurstDurationSeconds,
      scanPhaseOffsetSeconds,
      advPhaseOffsetSeconds,
      motionDrive: 0,
      peerDrive: 0,
      samplingDrive: 0,
      lastScanTime: scanPhaseOffsetSeconds - policyTiming.scanIntervalSeconds,
      lastAdvTime: advPhaseOffsetSeconds - policyTiming.advIntervalSeconds
    },
    boutRemainingSeconds: initialBoutRemainingSeconds(initialState, traits, rng),
    recentNodeIds: [startNode.id]
  };
}

export function createTraits(id: string, config: SimulationConfig, rng: SeededRandom): AnimalTraits {
  const preset = resolveSpeciesPreset(config.speciesPresetId, config.speciesModifiers, config.advancedSpeciesOverrides);
  const groupSynchrony = preset.groupSynchrony ? sampleTrait(preset.groupSynchrony, rng) : 0;
  const sampledPhaseOffset = sampleTrait(preset.circadianPhaseOffsetHours, rng) * (1 - groupSynchrony * 0.5);
  const activeWindowHours = sampleTrait(preset.activeWindowHours, rng);
  const dailyMotionMinutes = sampleTrait(preset.dailyMotionMinutes, rng);
  const majorRestWindowHours = sampleTrait(preset.majorRestWindowHours, rng);
  const restBoutMeanMinutes = sampleTrait(preset.restBoutMeanMinutes, rng);
  return {
    id,
    speciesPresetId: preset.id,
    activityPattern: preset.activityPattern,
    activePeakHours: preset.activePeakHours,
    activeWindowHours,
    dailyMotionMinutes,
    majorRestWindowHours,
    circadianPhaseOffsetHours: sampledPhaseOffset,
    groupSynchrony,
    lightPhaseStartHour: preset.lightPhaseStartHour,
    lightPhaseEndHour: preset.lightPhaseEndHour,
    movementSpeedMetersPerMinute: sampleTrait(preset.movementSpeedMetersPerMinute ?? { min: 0.7, mode: 1.2, max: 2 }, rng),
    dailyActivityMinutes: dailyMotionMinutes,
    majorSleepPeriodHours: majorRestWindowHours,
    sleepBoutMeanMinutes: restBoutMeanMinutes,
    movementBoutMeanMinutes: sampleTrait(preset.movementBoutMeanMinutes, rng),
    restBoutMeanMinutes,
    stationaryAwakeBoutMeanMinutes: sampleTrait(preset.stationaryAwakeBoutMeanMinutes ?? { min: 2, mode: 6, max: 10 }, rng),
    socialPropensity: sampleTrait(preset.socialPropensity, rng),
    territoriality: sampleTrait(preset.territoriality, rng),
    seasonalSensitivity: preset.seasonalSensitivity,
    sleepArchitecture: preset.sleepArchitecture,
    sleepCenterHour: preset.sleepCenterHour,
    ultradianPeriodMinutes: preset.ultradianPeriodMinutes ? sampleTrait(preset.ultradianPeriodMinutes, rng) : undefined,
    ultradianAmplitude: preset.ultradianAmplitude
  };
}

function sampleTrait(
  distribution: { min: number; mode: number; max: number },
  rng: SeededRandom
): number {
  return rng.triangular(distribution.min, distribution.mode, distribution.max);
}

function nodeTypeForIndex(_index: number): PathNode["type"] {
  return "junction";
}

function createEdge(index: number, from: PathNode, to: PathNode): PathEdge {
  return {
    id: `edge-${index + 1}`,
    from: from.id,
    to: to.id,
    length: edgeLength(from, to)
  };
}

function hasEdge(edges: PathEdge[], from: string, to: string): boolean {
  return edges.some((edge) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from));
}

function nearbyPeerScore(node: PathNode, animal: Animal, animals: Animal[]): number {
  const closePeers = animals.filter((peer) => {
    if (peer.id === animal.id) {
      return false;
    }
    return Math.hypot(peer.position.x - node.x, peer.position.y - node.y) < 1.5;
  });
  return Math.min(1, closePeers.length / 3);
}

export function chooseBehaviorState(
  timeSeconds: number,
  animal: Animal,
  behavior: BehaviorConfig,
  rng: SeededRandom
): AnimalState {
  return chooseBehaviorStateFromTraits(timeSeconds, animal.traits, behavior, rng);
}

function chooseBehaviorStateFromTraits(
  timeSeconds: number,
  traits: AnimalTraits,
  behavior: BehaviorConfig,
  rng: SeededRandom
): AnimalState {
  const hour = ((timeSeconds / 3600 + traits.circadianPhaseOffsetHours) % 24 + 24) % 24;
  const activeDrive = combinedActivityDrive(timeSeconds, hour, traits, behavior);
  const restDrive = restKernel(hour, traits, behavior);
  const activityIntensity = clamp(traits.dailyMotionMinutes / 720, 0.15, 1.2);
  const weights = stateWeightsFromDrive(activeDrive, restDrive, activityIntensity, traits);
  const selected = rng.weightedIndex(weights);

  if (selected === 0) {
    return "moving";
  }
  if (selected === 1) {
    return "awake_stationary";
  }
  return "sleeping";
}

function combinedActivityDrive(
  timeSeconds: number,
  hour: number,
  traits: AnimalTraits,
  behavior: BehaviorConfig
): number {
  const circadianDrive = circadianKernel(hour, traits, behavior);
  const ultradianDrive = ultradianKernel(timeSeconds, traits);
  if (traits.activityPattern === "ultradian") {
    return clamp(circadianDrive * 0.35 + ultradianDrive * 0.9, 0, 1.4);
  }
  if (traits.activityPattern === "crepuscular") {
    return clamp(circadianDrive * 0.75 + ultradianDrive * 0.35, 0, 1.4);
  }
  if (traits.activityPattern === "cathemeral") {
    return clamp(0.35 + ultradianDrive * 0.45 + circadianDrive * 0.25, 0, 1.4);
  }
  return clamp(circadianDrive + ultradianDrive * 0.2, 0, 1.4);
}

function circadianKernel(hour: number, traits: AnimalTraits, behavior: BehaviorConfig): number {
  const activeWindowHours = clamp(traits.activeWindowHours, 1, 20);
  const peaks =
    traits.activePeakHours.length > 0 ? traits.activePeakHours : [behavior.circadianMode === "nocturnal" ? 0 : 12];
  return Math.min(1, peaks.reduce((maxDrive, peakHour) => Math.max(maxDrive, windowDrive(hour, peakHour, activeWindowHours)), 0));
}

function ultradianKernel(timeSeconds: number, traits: AnimalTraits): number {
  if (!traits.ultradianPeriodMinutes || !traits.ultradianAmplitude) {
    return 0;
  }
  const phase = ((timeSeconds / 60) % traits.ultradianPeriodMinutes) / traits.ultradianPeriodMinutes;
  const wave = 0.5 + 0.5 * Math.cos(Math.PI * 2 * phase);
  return wave * traits.ultradianAmplitude;
}

function restKernel(hour: number, traits: AnimalTraits, behavior: BehaviorConfig): number {
  if (traits.sleepCenterHour !== undefined) {
    return windowDrive(hour, traits.sleepCenterHour, traits.majorRestWindowHours);
  }

  const sleepCenterHour =
    behavior.circadianMode === "nocturnal" || traits.activityPattern.startsWith("nocturnal") ? 12 : 0;
  return windowDrive(hour, sleepCenterHour, traits.majorRestWindowHours);
}

function stateWeightsFromDrive(
  activeDrive: number,
  restDrive: number,
  activityIntensity: number,
  traits: AnimalTraits
): [number, number, number] {
  const synchronyBoost = traits.groupSynchrony * activeDrive * 0.25;
  return [
    0.015 + activeDrive * activityIntensity * 2.3 + synchronyBoost,
    0.12 + activeDrive * 0.6,
    0.08 + restDrive * 3.2 + Math.max(0, 1 - activeDrive) * 0.75
  ];
}

function initialBoutRemainingSeconds(state: AnimalState, traits: AnimalTraits, rng: SeededRandom): number {
  if (state === "moving") {
    return rng.range(60, Math.max(90, traits.movementBoutMeanMinutes * 60));
  }
  if (state === "sleeping") {
    return rng.range(5 * 60, Math.max(10 * 60, traits.sleepBoutMeanMinutes * 60));
  }
  return rng.range(2 * 60, 10 * 60);
}

function windowDrive(hour: number, centerHour: number, windowHours: number): number {
  const halfWindow = Math.max(0.5, windowHours / 2);
  const distance = circularHourDistance(hour, centerHour);
  if (distance >= halfWindow) {
    return 0;
  }
  return 0.5 + 0.5 * Math.cos((Math.PI * distance) / halfWindow);
}

function circularHourDistance(left: number, right: number): number {
  const rawDistance = Math.abs(left - right) % 24;
  return Math.min(rawDistance, 24 - rawDistance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
