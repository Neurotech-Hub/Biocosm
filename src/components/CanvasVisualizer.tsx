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
  context.fillStyle = "#0b1118";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const projection = createProjection(state);
  const toScreen = projection.toScreen;
  const topLeft = toScreen(0, 0);
  const bottomRight = toScreen(state.config.enclosure.width, state.config.enclosure.height);
  const enclosureWidth = bottomRight.x - topLeft.x;
  const enclosureHeight = bottomRight.y - topLeft.y;

  context.fillStyle = "#101822";
  context.fillRect(topLeft.x, topLeft.y, enclosureWidth, enclosureHeight);
  context.strokeStyle = "#5f748a";
  context.lineWidth = projection.boundaryWidth;
  context.strokeRect(topLeft.x, topLeft.y, enclosureWidth, enclosureHeight);

  drawScaleLegend(context, state, projection);
  drawPathGraph(context, state, projection);
  if (showTrueProximity) {
    drawTrueContacts(context, state, projection);
  }
  if (showObservedDetections) {
    drawDetections(context, state, projection);
  }
  drawAnimals(context, state, projection);
  drawSamplingIndicators(context, state, projection);
}

function drawPathGraph(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  projection: Projection
): void {
  context.lineWidth = projection.pathWidth;
  context.strokeStyle = "#2f4659";
  for (const edge of state.pathGraph.edges) {
    const from = state.pathGraph.nodes.find((node) => node.id === edge.from);
    const to = state.pathGraph.nodes.find((node) => node.id === edge.to);
    if (!from || !to) {
      continue;
    }
    const start = projection.toScreen(from.x, from.y);
    const end = projection.toScreen(to.x, to.y);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  for (const node of state.pathGraph.nodes) {
    const point = projection.toScreen(node.x, node.y);
    const radius = projection.nodeRadius;
    context.save();
    context.translate(point.x, point.y);
    context.rotate(Math.PI / 4);
    context.beginPath();
    context.fillStyle = "#a78bfa";
    context.strokeStyle = "#2e1065";
    context.lineWidth = Math.max(1, projection.pathWidth * 0.8);
    context.rect(-radius, -radius, radius * 2, radius * 2);
    context.fill();
    context.stroke();
    context.restore();
  }
}

function drawTrueContacts(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  projection: Projection
): void {
  context.strokeStyle = "rgba(103, 210, 255, 0.55)";
  context.lineWidth = projection.trueContactWidth;
  for (const contact of state.trueContacts) {
    if (!contact.withinSocialRadius) {
      continue;
    }
    drawAnimalLine(context, state, contact.animalA, contact.animalB, projection);
  }
}

function drawDetections(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  projection: Projection
): void {
  context.strokeStyle = "rgba(255, 117, 117, 0.75)";
  context.lineWidth = projection.observedDetectionWidth;
  context.setLineDash([6, 5]);
  for (const detection of state.detections) {
    drawAnimalLine(context, state, detection.observerId, detection.peerId, projection);
  }
  context.setLineDash([]);
}

function drawAnimalLine(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  animalAId: string,
  animalBId: string,
  projection: Projection
): void {
  const animalA = state.animals.find((animal) => animal.id === animalAId);
  const animalB = state.animals.find((animal) => animal.id === animalBId);
  if (!animalA || !animalB) {
    return;
  }
  const start = projection.toScreen(animalA.position.x, animalA.position.y);
  const end = projection.toScreen(animalB.position.x, animalB.position.y);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
}

function drawAnimals(context: CanvasRenderingContext2D, state: SimulationState, projection: Projection): void {
  const labelAngleById = stableLabelAngleByAnimalId(state.animals);

  context.save();
  context.fillStyle = "#d6e2ef";
  context.font = `${projection.labelFontSize}px system-ui`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const animal of state.animals) {
    const point = projection.toScreen(animal.position.x, animal.position.y);
    const animalRadius = projection.animalRadius;

    context.beginPath();
    context.fillStyle = animal.state === "sleeping" ? "#66717d" : animal.state === "moving" ? "#72e6ac" : "#f0f6fc";
    context.globalAlpha = 0.72;
    context.arc(point.x, point.y, animalRadius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    const angle = labelAngleById.get(animal.id) ?? -Math.PI / 2;
    const labelRadius = animalRadius + projection.labelFontSize * 0.9;
    const labelX = point.x + labelRadius * Math.cos(angle);
    const labelY = point.y + labelRadius * Math.sin(angle);

    context.fillStyle = "#d6e2ef";
    context.fillText(animal.id.replace("animal-", "A"), labelX, labelY);
  }
  context.restore();
}

/** Fixed angle per animal (sorted id × 2π / N) so labels do not jump when co-location sets change size. */
function stableLabelAngleByAnimalId(animals: SimulationState["animals"]): Map<string, number> {
  const sorted = [...animals].sort((a, b) => a.id.localeCompare(b.id));
  const n = sorted.length;
  const map = new Map<string, number>();
  if (n === 0) {
    return map;
  }
  for (let i = 0; i < n; i++) {
    map.set(sorted[i].id, -Math.PI / 2 + (i / n) * 2 * Math.PI);
  }
  return map;
}

function drawSamplingIndicators(
  context: CanvasRenderingContext2D,
  state: SimulationState,
  projection: Projection
): void {
  const scanningHitAnimalIds = new Set(state.detections.map((event) => event.observerId));
  const detectedAdvertiserIds = new Set(state.detections.map((event) => event.peerId));

  for (const animal of state.animals) {
    const point = projection.toScreen(animal.position.x, animal.position.y);
    if (scanningHitAnimalIds.has(animal.id)) {
      context.beginPath();
      context.strokeStyle = "rgba(125, 211, 252, 0.8)";
      context.lineWidth = projection.samplingIndicatorWidth;
      context.setLineDash([5, 4]);
      context.arc(point.x, point.y, projection.animalRadius + 6 * projection.samplingVisualScale, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }

    if (detectedAdvertiserIds.has(animal.id)) {
      context.beginPath();
      context.strokeStyle = "rgba(250, 204, 21, 0.95)";
      context.lineWidth = projection.samplingIndicatorWidth * 1.25;
      context.arc(point.x, point.y, projection.animalRadius + 9 * projection.samplingVisualScale, 0, Math.PI * 2);
      context.stroke();
    }
  }
}

type Projection = {
  toScreen: (x: number, y: number) => { x: number; y: number };
  scale: number;
  xOffset: number;
  yOffset: number;
  animalRadius: number;
  nodeRadius: number;
  pathWidth: number;
  trueContactWidth: number;
  observedDetectionWidth: number;
  boundaryWidth: number;
  scaleBarWidth: number;
  labelFontSize: number;
  samplingIndicatorWidth: number;
  samplingVisualScale: number;
};

function createProjection(state: SimulationState): Projection {
  const scale = Math.min(
    (canvasWidth - padding * 2) / state.config.enclosure.width,
    (canvasHeight - padding * 2) / state.config.enclosure.height
  );
  const xOffset = (canvasWidth - state.config.enclosure.width * scale) / 2;
  const yOffset = (canvasHeight - state.config.enclosure.height * scale) / 2;
  const visualScale = visualScaleForPhysicalSize(
    Math.max(state.config.enclosure.width, state.config.enclosure.height)
  );

  return {
    toScreen: (x, y) => ({
      x: xOffset + x * scale,
      y: yOffset + y * scale
    }),
    scale,
    xOffset,
    yOffset,
    animalRadius: 5.5 * visualScale,
    nodeRadius: 2.6 * visualScale,
    pathWidth: 1 * visualScale,
    trueContactWidth: 1.7 * visualScale,
    observedDetectionWidth: 1.35 * visualScale,
    boundaryWidth: 1.2 * visualScale,
    scaleBarWidth: 1.3 * visualScale,
    labelFontSize: Math.round(8 * visualScale),
    samplingIndicatorWidth: 1 * visualScale,
    samplingVisualScale: visualScale
  };
}

function visualScaleForPhysicalSize(maxDimensionMeters: number): number {
  const normalized = Math.max(0, Math.min(1, (maxDimensionMeters - 10) / 90));
  return 1.55 - normalized * 0.55;
}

function drawScaleLegend(context: CanvasRenderingContext2D, state: SimulationState, projection: Projection): void {
  const scaleMeters = state.config.enclosure.width >= 60 || state.config.enclosure.height >= 60 ? 20 : 5;
  const lengthPixels = scaleMeters * projection.scale;
  const x = projection.xOffset + 14;
  const y = projection.yOffset + state.config.enclosure.height * projection.scale - 18;

  context.strokeStyle = "rgba(214, 226, 239, 0.7)";
  context.lineWidth = projection.scaleBarWidth;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + lengthPixels, y);
  context.stroke();
  context.fillStyle = "#d6e2ef";
  context.font = `${projection.labelFontSize}px system-ui`;
  context.fillText(`${scaleMeters} m`, x, y - 6);
}
