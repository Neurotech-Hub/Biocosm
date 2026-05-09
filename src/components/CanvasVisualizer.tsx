import { useEffect, useRef } from "react";
import type { SimulationState } from "../simulation/types";

type CanvasVisualizerProps = {
  state: SimulationState;
  showTrueProximity: boolean;
  showObservedDetections: boolean;
};

const canvasWidth = 900;
const canvasHeight = 560;
const padding = 40;

export function CanvasVisualizer({
  state,
  showTrueProximity,
  showObservedDetections
}: CanvasVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    drawSimulation(context, state, showTrueProximity, showObservedDetections);
  }, [showObservedDetections, showTrueProximity, state]);

  return (
    <canvas
      ref={canvasRef}
      className="sim-canvas"
      width={canvasWidth}
      height={canvasHeight}
      aria-label="Animal enclosure simulation"
    />
  );
}

function drawSimulation(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  showTrueProximity: boolean,
  showObservedDetections: boolean
): void {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#101822";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const toScreen = createProjection(state);
  const topLeft = toScreen(0, 0);
  const bottomRight = toScreen(state.config.enclosure.width, state.config.enclosure.height);

  context.strokeStyle = "#5f748a";
  context.lineWidth = 2;
  context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

  drawPathGraph(context, state, toScreen);
  if (showTrueProximity) {
    drawTrueContacts(context, state, toScreen);
  }
  if (showObservedDetections) {
    drawDetections(context, state, toScreen);
  }
  drawAnimals(context, state, toScreen);
  drawClock(context, state);
}

function drawPathGraph(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  toScreen: Projection
): void {
  context.lineWidth = 1.5;
  context.strokeStyle = "#2f4659";
  for (const edge of state.pathGraph.edges) {
    const from = state.pathGraph.nodes.find((node) => node.id === edge.from);
    const to = state.pathGraph.nodes.find((node) => node.id === edge.to);
    if (!from || !to) {
      continue;
    }
    const start = toScreen(from.x, from.y);
    const end = toScreen(to.x, to.y);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  for (const node of state.pathGraph.nodes) {
    const point = toScreen(node.x, node.y);
    context.beginPath();
    context.fillStyle = node.type === "nest" ? "#f6c453" : node.type === "resource" || node.type === "feeder" ? "#55c879" : "#8ba4b8";
    context.arc(point.x, point.y, node.type === "nest" ? 6 : 4, 0, Math.PI * 2);
    context.fill();
  }
}

function drawTrueContacts(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  toScreen: Projection
): void {
  context.strokeStyle = "rgba(103, 210, 255, 0.55)";
  context.lineWidth = 3;
  for (const contact of state.trueContacts) {
    if (!contact.withinSocialRadius) {
      continue;
    }
    drawAnimalLine(context, state, contact.animalA, contact.animalB, toScreen);
  }
}

function drawDetections(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  toScreen: Projection
): void {
  context.strokeStyle = "rgba(255, 117, 117, 0.75)";
  context.lineWidth = 2;
  context.setLineDash([6, 5]);
  for (const detection of state.detections) {
    drawAnimalLine(context, state, detection.observerId, detection.peerId, toScreen);
  }
  context.setLineDash([]);
}

function drawAnimalLine(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  animalAId: string,
  animalBId: string,
  toScreen: Projection
): void {
  const animalA = state.animals.find((animal) => animal.id === animalAId);
  const animalB = state.animals.find((animal) => animal.id === animalBId);
  if (!animalA || !animalB) {
    return;
  }
  const start = toScreen(animalA.position.x, animalA.position.y);
  const end = toScreen(animalB.position.x, animalB.position.y);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
}

function drawAnimals(context: CanvasRenderingContext2D, state: SimulationState, toScreen: Projection): void {
  for (const animal of state.animals) {
    const point = toScreen(animal.position.x, animal.position.y);
    if (animal.collar.scanActive) {
      context.beginPath();
      context.strokeStyle = "rgba(255, 255, 255, 0.25)";
      context.lineWidth = 2;
      context.arc(point.x, point.y, 16, 0, Math.PI * 2);
      context.stroke();
    }

    context.beginPath();
    context.fillStyle = animal.state === "sleeping" ? "#66717d" : animal.state === "moving" ? "#72e6ac" : "#f0f6fc";
    context.arc(point.x, point.y, 8, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#d6e2ef";
    context.font = "11px system-ui";
    context.fillText(animal.id.replace("animal-", "A"), point.x + 10, point.y - 8);
  }
}

function drawClock(context: CanvasRenderingContext2D, state: SimulationState): void {
  const hours = Math.floor(state.time / 3600);
  const minutes = Math.floor((state.time % 3600) / 60);
  context.fillStyle = "#d6e2ef";
  context.font = "14px system-ui";
  context.fillText(`t = ${hours}h ${minutes.toString().padStart(2, "0")}m`, 18, 28);
}

type Projection = (x: number, y: number) => { x: number; y: number };

function createProjection(state: SimulationState): Projection {
  const scale = Math.min(
    (canvasWidth - padding * 2) / state.config.enclosure.width,
    (canvasHeight - padding * 2) / state.config.enclosure.height
  );
  const xOffset = (canvasWidth - state.config.enclosure.width * scale) / 2;
  const yOffset = (canvasHeight - state.config.enclosure.height * scale) / 2;

  return (x, y) => ({
    x: xOffset + x * scale,
    y: yOffset + y * scale
  });
}
