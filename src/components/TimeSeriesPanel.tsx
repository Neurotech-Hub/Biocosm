import { useMemo } from "react";
import type { TimeSeriesPoint } from "../simulation/timeSeries";
import type { EnergyLog } from "../simulation/types";

type TimeSeriesPanelProps = {
  points: TimeSeriesPoint[];
  energy: EnergyLog[];
  currentStep: number;
};

const chartWidth = 860;
const chartHeight = 180;
const chartPadding = {
  top: 18,
  right: 62,
  bottom: 34,
  left: 54
};

export function TimeSeriesPanel({ points, energy, currentStep }: TimeSeriesPanelProps) {
  const summary = useMemo(() => createChartSummary(points, energy), [energy, points]);
  const cursorX = chartPadding.left + ((points[currentStep]?.time ?? 0) / summary.maxTime) * summary.plotWidth;

  return (
    <section className="panel time-series-panel">
      <h2>Light, Movement, And Energy Over Time</h2>
      <svg
        className="time-series-chart"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label="Light phase and normalized animal movement over time"
      >
        <rect x="0" y="0" width={chartWidth} height={chartHeight} rx="12" className="chart-background" />
        {points.map((point, index) => {
          const nextPoint = points[index + 1];
          if (!nextPoint) {
            return null;
          }
          const x = chartPadding.left + (point.time / summary.maxTime) * summary.plotWidth;
          const nextX = chartPadding.left + (nextPoint.time / summary.maxTime) * summary.plotWidth;
          return (
            <rect
              key={point.time}
              x={x}
              y={chartPadding.top}
              width={Math.max(1, nextX - x)}
              height={summary.plotHeight}
              className={point.lightPhase ? "light-band" : "dark-band"}
            />
          );
        })}
        <line
          x1={chartPadding.left}
          y1={chartPadding.top + summary.plotHeight}
          x2={chartPadding.left + summary.plotWidth}
          y2={chartPadding.top + summary.plotHeight}
          className="chart-axis"
        />
        <line
          x1={chartPadding.left}
          y1={chartPadding.top}
          x2={chartPadding.left}
          y2={chartPadding.top + summary.plotHeight}
          className="chart-axis"
        />
        <line
          x1={chartPadding.left + summary.plotWidth}
          y1={chartPadding.top}
          x2={chartPadding.left + summary.plotWidth}
          y2={chartPadding.top + summary.plotHeight}
          className="chart-axis"
        />
        {summary.movementTicks.map((tick) => {
          const y = chartPadding.top + summary.plotHeight - (tick / summary.maxMovement) * summary.plotHeight;
          return (
            <text key={`movement-${tick}`} x={chartPadding.left - 8} y={y + 4} className="chart-label chart-label-end">
              {formatTick(tick)}
            </text>
          );
        })}
        {summary.energyTicks.map((tick) => {
          const y = chartPadding.top + summary.plotHeight - (tick / summary.maxEnergy) * summary.plotHeight;
          return (
            <text key={`energy-${tick}`} x={chartPadding.left + summary.plotWidth + 8} y={y + 4} className="chart-label">
              {formatTick(tick)}
            </text>
          );
        })}
        {summary.xTicks.map((tick) => {
          const x = chartPadding.left + (tick / summary.maxTime) * summary.plotWidth;
          return (
            <text key={`time-${tick}`} x={x} y={chartHeight - 10} className="chart-label chart-label-middle">
              {(tick / 3600).toFixed(tick === 0 ? 0 : 1)}h
            </text>
          );
        })}
        <path d={summary.movementPath} className="movement-line" fill="none" />
        <path d={summary.energyPath} className="energy-line" fill="none" />
        <line
          x1={cursorX}
          y1={chartPadding.top}
          x2={cursorX}
          y2={chartPadding.top + summary.plotHeight}
          className="current-time-line"
        />
      </svg>
      <div className="chart-legend">
        <span><i className="legend-swatch light-swatch" /> light</span>
        <span><i className="legend-swatch dark-swatch" /> dark</span>
        <span><i className="legend-swatch movement-swatch" /> moving animal fraction (0-1, left axis)</span>
        <span><i className="legend-swatch energy-swatch" /> cumulative energy used (mAh, right axis)</span>
      </div>
    </section>
  );
}

function createChartSummary(points: TimeSeriesPoint[], energy: EnergyLog[]) {
  const maxMovement = 1;
  const maxEnergy = Math.max(0.01, ...energy.map((point) => point.cumulativeMah));
  const maxTime = Math.max(1, points.at(-1)?.time ?? 1);
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const movementPath = points
    .map((point, index) => {
      const x = chartPadding.left + (point.time / maxTime) * plotWidth;
      const y = chartPadding.top + plotHeight - (point.movementFraction / maxMovement) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const energyPath = energy
    .map((point, index) => {
      const x = chartPadding.left + (point.time / maxTime) * plotWidth;
      const y = chartPadding.top + plotHeight - (point.cumulativeMah / maxEnergy) * plotHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return {
    maxMovement,
    maxEnergy,
    maxTime,
    plotWidth,
    plotHeight,
    xTicks: createTicks(0, maxTime, 5),
    movementTicks: createTicks(0, maxMovement, 5),
    energyTicks: createTicks(0, maxEnergy, 4),
    movementPath,
    energyPath
  };
}

function createTicks(min: number, max: number, count: number): number[] {
  if (count <= 1 || max <= min) {
    return [min, max];
  }
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function formatTick(value: number): string {
  if (value >= 10) {
    return value.toFixed(0);
  }
  if (value >= 1) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}
