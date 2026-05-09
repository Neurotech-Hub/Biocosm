import { edgeLength, edgesForNode, getNode, interpolateEdge, otherNodeId } from "./geometry";
import { getPolicyTiming } from "./policies/fixedRate";
import { SeededRandom } from "./random";
import type {
  Animal,
  AnimalState,
  AnimalTraits,
  BehaviorConfig,
  BiologyConfig,
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

    return (
      novelty +
      animal.traits.socialPropensity * peerAttraction +
      0.05
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
  const traits = createTraits(id, config.biology, rng);
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

export function createTraits(id: string, biology: BiologyConfig, rng: SeededRandom): AnimalTraits {
  return {
    id,
    circadianPhaseOffsetHours: sampleTrait(biology.circadianPhaseOffsetHours, rng),
    dailyActivityMinutes: sampleTrait(biology.dailyActivityMinutes, rng),
    majorSleepPeriodHours: sampleTrait(biology.majorSleepPeriodHours, rng),
    sleepBoutMeanMinutes: sampleTrait(biology.sleepBoutMeanMinutes, rng),
    movementBoutMeanMinutes: sampleTrait(biology.movementBoutMeanMinutes, rng),
    socialPropensity: sampleTrait(biology.socialPropensity, rng)
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
  const activeCenterHour = behavior.circadianMode === "nocturnal" ? 0 : 12;
  const sleepCenterHour = behavior.circadianMode === "nocturnal" ? 12 : 0;
  const activeWindowHours = clamp(traits.dailyActivityMinutes / 60, 1, 16);
  const activeDrive = windowDrive(hour, activeCenterHour, activeWindowHours);
  const sleepDrive = windowDrive(hour, sleepCenterHour, traits.majorSleepPeriodHours);
  const activityIntensity = clamp(traits.dailyActivityMinutes / 720, 0.2, 1);
  const weights = [
    0.02 + activeDrive * activityIntensity * 2.2,
    0.12 + activeDrive * 0.55,
    0.08 + sleepDrive * 3 + (1 - activeDrive) * 0.8
  ];
  const selected = rng.weightedIndex(weights);

  if (selected === 0) {
    return "moving";
  }
  if (selected === 1) {
    return "awake_stationary";
  }
  return "sleeping";
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
