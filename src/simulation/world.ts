import { edgeLength, edgesForNode, getNode, interpolateEdge, otherNodeId } from "./geometry";
import { SeededRandom } from "./random";
import type {
  Animal,
  AnimalState,
  AnimalTraits,
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
  const nestIds = pathGraph.nodes.filter((node) => node.type === "nest").map((node) => node.id);
  const animals = Array.from({ length: config.animalCount }, (_, index) =>
    createAnimal(index, pathGraph, nestIds, config, rng)
  );

  return {
    time: 0,
    config,
    pathGraph,
    animals,
    trueContacts: [],
    detections: [],
    scanWindows: [],
    logs: createEmptyLogs(),
    rngState: rng.getState()
  };
}

export function createEmptyLogs(): SimulationLogs {
  return {
    animalStates: [],
    trueDyads: [],
    detections: [],
    scanWindows: [],
    collarStates: []
  };
}

export function createPathGraph(config: SimulationConfig, rng: SeededRandom): PathGraph {
  const { width, height } = config.enclosure;
  const nodeCount = Math.max(4, config.pathNodeCount);
  const nodes: PathNode[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index + 1}`,
    x: rng.range(width * 0.08, width * 0.92),
    y: rng.range(height * 0.08, height * 0.92),
    type: nodeTypeForIndex(index, nodeCount)
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
    const nestDrive = nextNodeId === animal.preferredNestId ? animal.traits.nestFidelity : 0.1;
    const resourceDrive = nextNode.type === "resource" || nextNode.type === "feeder" ? animal.traits.resourceAttraction : 0.1;
    const peerAttraction = nearbyPeerScore(nextNode, animal, animals);

    return (
      animal.traits.explorationTendency * novelty +
      nestDrive +
      resourceDrive +
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
  nestIds: string[],
  config: SimulationConfig,
  rng: SeededRandom
): Animal {
  const id = `animal-${index + 1}`;
  const preferredNestId = nestIds[index % nestIds.length] ?? graph.nodes[0].id;
  const startNode = getNode(graph, preferredNestId);
  const traits = createTraits(id, rng);

  return {
    id,
    traits,
    state: index % 3 === 0 ? "awake_stationary" : "moving",
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
      scanIntervalSeconds: config.fixedPolicy.scanIntervalSeconds,
      scanWindowSeconds: config.fixedPolicy.scanWindowSeconds,
      advIntervalSeconds: config.fixedPolicy.advIntervalSeconds,
      motionDrive: 0,
      peerDrive: 0,
      samplingDrive: 0,
      lastScanTime: 0,
      lastAdvTime: 0
    },
    boutRemainingSeconds: rng.range(2 * 60, 12 * 60),
    preferredNestId,
    recentNodeIds: [startNode.id]
  };
}

function createTraits(id: string, rng: SeededRandom): AnimalTraits {
  return {
    id,
    circadianPhaseOffsetHours: rng.range(-2, 2),
    dailyActivityMinutes: rng.triangular(180, 420, 720),
    majorSleepPeriodHours: rng.triangular(6, 9, 12),
    sleepBoutMeanMinutes: rng.triangular(20, 60, 180),
    movementBoutMeanMinutes: rng.triangular(3, 12, 35),
    speedMetersPerMinute: rng.triangular(0.4, 1.2, 2.8),
    socialPropensity: rng.triangular(0.1, 0.45, 0.95),
    explorationTendency: rng.triangular(0.2, 0.55, 1),
    nestFidelity: rng.triangular(0.2, 0.7, 1),
    resourceAttraction: rng.triangular(0.1, 0.45, 0.9)
  };
}

function nodeTypeForIndex(index: number, nodeCount: number): PathNode["type"] {
  if (index < 2) {
    return "nest";
  }
  if (index === nodeCount - 1) {
    return "resource";
  }
  if (index % 7 === 0) {
    return "feeder";
  }
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

export function chooseBehaviorState(timeSeconds: number, animal: Animal, rng: SeededRandom): AnimalState {
  const hour = ((timeSeconds / 3600 + animal.traits.circadianPhaseOffsetHours) % 24 + 24) % 24;
  const activeDrive = hour >= 18 || hour <= 6 ? 0.75 : 0.25;
  const movingChance = activeDrive * (animal.traits.dailyActivityMinutes / 720);
  const roll = rng.next();
  if (roll < movingChance) {
    return "moving";
  }
  if (roll < movingChance + 0.2) {
    return "awake_stationary";
  }
  return "sleeping";
}
