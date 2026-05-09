import type { Animal, PathEdge, PathGraph, PathNode } from "./types";

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function edgeLength(from: PathNode, to: PathNode): number {
  return distance(from, to);
}

export function getNode(graph: PathGraph, nodeId: string): PathNode {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Missing path node: ${nodeId}`);
  }
  return node;
}

export function getEdge(graph: PathGraph, edgeId: string): PathEdge {
  const edge = graph.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) {
    throw new Error(`Missing path edge: ${edgeId}`);
  }
  return edge;
}

export function edgesForNode(graph: PathGraph, nodeId: string): PathEdge[] {
  return graph.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
}

export function otherNodeId(edge: PathEdge, nodeId: string): string {
  return edge.from === nodeId ? edge.to : edge.from;
}

export function interpolateEdge(graph: PathGraph, fromNodeId: string, toNodeId: string, progress: number): { x: number; y: number } {
  const from = getNode(graph, fromNodeId);
  const to = getNode(graph, toNodeId);
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress
  };
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function animalDistance(a: Animal, b: Animal): number {
  return distance(a.position, b.position);
}
