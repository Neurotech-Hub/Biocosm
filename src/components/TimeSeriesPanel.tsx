import { useMemo, type ReactNode } from "react";
import {
  decimateMovementStripEvents,
  type AdaptiveBleTimePoint,
  type AnimalStripEvent,
  type AnimalStripEventKind,
  type FixedBleTimePoint,
  type TimeSeriesPoint
} from "../simulation/timeSeries";
import type { FirmwarePolicyConfig } from "../simulation/types";
import type { EnergyLog } from "../simulation/types";
import { formatClockHHMM } from "../timeFormat";

type TimeSeriesPanelProps = {
  points: TimeSeriesPoint[];
  energy: EnergyLog[];
  adaptiveBleSeries: AdaptiveBleTimePoint[];
  fixedBleSeries: FixedBleTimePoint[];
  activePolicyType: FirmwarePolicyConfig["type"];
  currentStep: number;
  animalStripEvents: AnimalStripEvent[];
  animalIds: string[];
  startTimeSeconds: number;
};

const chartWidth = 860;
/** Taller bottom margin for dual x-axis (clock + elapsed offset). Plot height unchanged vs prior 128px. */
const chartHeight = 194;
/** BLE policy analysis charts (aligned x-axis with main chart). */
const bleChartHeight = 176;
const chartPadding = {
  top: 18,
  right: 62,
  bottom: 48,
  left: 58
};

const stripChartWidth = chartWidth;
const stripRowHeight = 15;
const stripDotRadius = 2.8;
const stripPadding = {
  top: 16,
  right: chartPadding.right,
  bottom: 44,
  left: chartPadding.left
};

/** Trailing window for smoothing the moving-animal fraction (simulation clock seconds). */
const MOVEMENT_FRACTION_AVG_WINDOW_SECONDS = 600;

/** Max dots per animal row on the movement strip (avoids overlap when timestep is dense). */
const MOVEMENT_STRIP_MAX_DOTS_PER_ANIMAL = 280;

type StripSummary = ReturnType<typeof createStripSummary>;

export function TimeSeriesPanel({
  points,
  energy,
  adaptiveBleSeries,
  fixedBleSeries,
  activePolicyType,
  currentStep,
  animalStripEvents,
  animalIds,
  startTimeSeconds
}: TimeSeriesPanelProps) {
  const mainSummary = useMemo(
    () => createChartSummary(points, energy, currentStep),
    [currentStep, energy, points]
  );
  const adaptiveBleSummary = useMemo(
    () => createAdaptiveBleChartSummary(adaptiveBleSeries, points, currentStep),
    [adaptiveBleSeries, currentStep, points]
  );
  const fixedBleSummary = useMemo(
    () => createFixedBleChartSummary(fixedBleSeries, points, currentStep),
    [fixedBleSeries, currentStep, points]
  );
  const stripSummary = useMemo(
    () => createStripSummary(animalIds, mainSummary.maxTime, currentStep, points),
    [animalIds, mainSummary.maxTime, currentStep, points]
  );

  const socialEvents = useMemo(
    () => animalStripEvents.filter((e) => e.kind === "social"),
    [animalStripEvents]
  );
  const movementEvents = useMemo(() => {
    const raw = animalStripEvents.filter((e) => e.kind === "sleep" || e.kind === "awake" || e.kind === "move");
    return decimateMovementStripEvents(raw, MOVEMENT_STRIP_MAX_DOTS_PER_ANIMAL);
  }, [animalStripEvents]);

  return (
    <section className="panel time-series-panel">
      <h2 className="time-series-panel-title">Simulation over time</h2>

      <div className="time-series-panel-charts">
        <StripChartCard
          title="Per-animal social proximity"
          ariaLabel="Per-animal dots for social proximity events over time"
          stripSummary={stripSummary}
          animalIds={animalIds}
          events={socialEvents}
          startTimeSeconds={startTimeSeconds}
        >
          <span>
            <i className="legend-swatch strip-legend-dot strip-dot-social" /> social proximity (true dyad)
          </span>
        </StripChartCard>

        <StripChartCard
          title="Per-animal movement state"
          ariaLabel="Per-animal dots for sleeping and moving over time"
          stripSummary={stripSummary}
          animalIds={animalIds}
          events={movementEvents}
          startTimeSeconds={startTimeSeconds}
        >
          <span>
            <i className="legend-swatch strip-legend-dot strip-dot-sleep" /> sleeping
          </span>
          <span>
            <i className="legend-swatch strip-legend-dot strip-dot-awake" /> awake / stationary
          </span>
          <span>
            <i className="legend-swatch strip-legend-dot strip-dot-move" /> moving
          </span>
        </StripChartCard>

        <div className="time-series-chart-card">
          <h3 className="chart-subtitle chart-card-title">Light phase, moving fraction, and cumulative energy</h3>
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
              const x = chartPadding.left + (point.time / mainSummary.maxTime) * mainSummary.plotWidth;
              const nextX = chartPadding.left + (nextPoint.time / mainSummary.maxTime) * mainSummary.plotWidth;
              return (
                <rect
                  key={point.time}
                  x={x}
                  y={chartPadding.top}
                  width={Math.max(1, nextX - x)}
                  height={mainSummary.plotHeight}
                  className={point.lightPhase ? "light-band" : "dark-band"}
                />
              );
            })}
            <line
              x1={chartPadding.left}
              y1={chartPadding.top + mainSummary.plotHeight}
              x2={chartPadding.left + mainSummary.plotWidth}
              y2={chartPadding.top + mainSummary.plotHeight}
              className="chart-axis"
            />
            <line
              x1={chartPadding.left}
              y1={chartPadding.top}
              x2={chartPadding.left}
              y2={chartPadding.top + mainSummary.plotHeight}
              className="chart-axis"
            />
            <line
              x1={chartPadding.left + mainSummary.plotWidth}
              y1={chartPadding.top}
              x2={chartPadding.left + mainSummary.plotWidth}
              y2={chartPadding.top + mainSummary.plotHeight}
              className="chart-axis"
            />
            <text
              className="chart-axis-title chart-axis-title-primary"
              x={16}
              y={chartPadding.top + mainSummary.plotHeight / 2}
              transform={`rotate(-90 16 ${chartPadding.top + mainSummary.plotHeight / 2})`}
              textAnchor="middle"
            >
              Moving fraction (0–1)
            </text>
            <text
              className="chart-axis-title chart-axis-title-secondary"
              x={chartWidth - 16}
              y={chartPadding.top + mainSummary.plotHeight / 2}
              transform={`rotate(90 ${chartWidth - 16} ${chartPadding.top + mainSummary.plotHeight / 2})`}
              textAnchor="middle"
            >
              Energy (mAh)
            </text>
            {mainSummary.movementTicks.map((tick) => {
              const y =
                chartPadding.top + mainSummary.plotHeight - (tick / mainSummary.maxMovement) * mainSummary.plotHeight;
              return (
                <text key={`movement-${tick}`} x={chartPadding.left - 8} y={y + 4} className="chart-label chart-label-end">
                  {formatTick(tick)}
                </text>
              );
            })}
            {mainSummary.energyTicks.map((tick) => {
              const y = chartPadding.top + mainSummary.plotHeight - (tick / mainSummary.maxEnergy) * mainSummary.plotHeight;
              return (
                <text key={`energy-${tick}`} x={chartPadding.left + mainSummary.plotWidth + 8} y={y + 4} className="chart-label">
                  {formatTick(tick)}
                </text>
              );
            })}
            {mainSummary.xTicks.map((tick) => {
              const x = chartPadding.left + (tick / mainSummary.maxTime) * mainSummary.plotWidth;
              const absoluteTime = startTimeSeconds + tick;
              return (
                <g key={`time-${tick}`}>
                  <text x={x} y={chartHeight - 27} className="chart-label chart-label-middle chart-axis-time-of-day">
                    {formatClockHHMM(absoluteTime)}
                  </text>
                  <text x={x} y={chartHeight - 15} className="chart-label chart-label-middle chart-axis-elapsed">
                    {formatElapsedAxisTick(tick)}
                  </text>
                </g>
              );
            })}
            <path d={mainSummary.movementPath} className="movement-line" fill="none" />
            <path d={mainSummary.energyPath} className="energy-line" fill="none" />
            <line
              x1={mainSummary.cursorX}
              y1={chartPadding.top}
              x2={mainSummary.cursorX}
              y2={chartPadding.top + mainSummary.plotHeight}
              className="current-time-line"
            />
          </svg>
          <div className="chart-legend">
            <span>
              <i className="legend-swatch light-swatch" /> light
            </span>
            <span>
              <i className="legend-swatch dark-swatch" /> dark
            </span>
            <span>
              <i className="legend-swatch movement-swatch" /> moving animal fraction, 10 min avg (0–1, left axis)
            </span>
            <span>
              <i className="legend-swatch energy-swatch" /> cumulative energy used (mAh, right axis)
            </span>
          </div>
        </div>

        {activePolicyType === "motion_peer_adaptive" && adaptiveBleSeries.length > 0 ? (
          <div className="time-series-chart-card">
            <h3 className="chart-subtitle chart-card-title">Adaptive BLE policy (cohort mean)</h3>
            <svg
              className="time-series-chart ble-policy-chart"
              viewBox={`0 0 ${chartWidth} ${bleChartHeight}`}
              role="img"
              aria-label="Mean sampling drive and mean scan interval for adaptive BLE policy over time"
            >
              <rect x="0" y="0" width={chartWidth} height={bleChartHeight} rx="12" className="chart-background" />
              <line
                x1={chartPadding.left}
                y1={adaptiveBleSummary.neutralY}
                x2={chartPadding.left + adaptiveBleSummary.plotWidth}
                y2={adaptiveBleSummary.neutralY}
                className="neutral-drive-line"
              />
              <line
                x1={chartPadding.left}
                y1={chartPadding.top + adaptiveBleSummary.plotHeight}
                x2={chartPadding.left + adaptiveBleSummary.plotWidth}
                y2={chartPadding.top + adaptiveBleSummary.plotHeight}
                className="chart-axis"
              />
              <line
                x1={chartPadding.left}
                y1={chartPadding.top}
                x2={chartPadding.left}
                y2={chartPadding.top + adaptiveBleSummary.plotHeight}
                className="chart-axis"
              />
              <line
                x1={chartPadding.left + adaptiveBleSummary.plotWidth}
                y1={chartPadding.top}
                x2={chartPadding.left + adaptiveBleSummary.plotWidth}
                y2={chartPadding.top + adaptiveBleSummary.plotHeight}
                className="chart-axis"
              />
              <text
                className="chart-axis-title chart-axis-title-primary"
                x={16}
                y={chartPadding.top + adaptiveBleSummary.plotHeight / 2}
                transform={`rotate(-90 16 ${chartPadding.top + adaptiveBleSummary.plotHeight / 2})`}
                textAnchor="middle"
              >
                Sampling drive (0–1)
              </text>
              <text
                className="chart-axis-title chart-axis-title-secondary"
                x={chartWidth - 16}
                y={chartPadding.top + adaptiveBleSummary.plotHeight / 2}
                transform={`rotate(90 ${chartWidth - 16} ${chartPadding.top + adaptiveBleSummary.plotHeight / 2})`}
                textAnchor="middle"
              >
                Scan interval (s)
              </text>
              {adaptiveBleSummary.driveTicks.map((tick) => {
                const y =
                  chartPadding.top +
                  adaptiveBleSummary.plotHeight -
                  (tick / adaptiveBleSummary.maxDrive) * adaptiveBleSummary.plotHeight;
                return (
                  <text key={`ad-drive-${tick}`} x={chartPadding.left - 8} y={y + 4} className="chart-label chart-label-end">
                    {formatTick(tick)}
                  </text>
                );
              })}
              {adaptiveBleSummary.scanTicks.map((tick) => {
                const y =
                  chartPadding.top +
                  adaptiveBleSummary.plotHeight -
                  (tick / adaptiveBleSummary.maxScan) * adaptiveBleSummary.plotHeight;
                return (
                  <text
                    key={`ad-scan-${tick}`}
                    x={chartPadding.left + adaptiveBleSummary.plotWidth + 8}
                    y={y + 4}
                    className="chart-label"
                  >
                    {formatTick(tick)}
                  </text>
                );
              })}
              {mainSummary.xTicks.map((tick) => {
                const x = chartPadding.left + (tick / adaptiveBleSummary.maxTime) * adaptiveBleSummary.plotWidth;
                const absoluteTime = startTimeSeconds + tick;
                return (
                  <g key={`ble-ad-time-${tick}`}>
                    <text x={x} y={bleChartHeight - 27} className="chart-label chart-label-middle chart-axis-time-of-day">
                      {formatClockHHMM(absoluteTime)}
                    </text>
                    <text x={x} y={bleChartHeight - 15} className="chart-label chart-label-middle chart-axis-elapsed">
                      {formatElapsedAxisTick(tick)}
                    </text>
                  </g>
                );
              })}
              <path d={adaptiveBleSummary.drivePath} className="ble-adaptive-drive-line" fill="none" />
              <path d={adaptiveBleSummary.scanPath} className="ble-adaptive-scan-line" fill="none" />
              <line
                x1={adaptiveBleSummary.cursorX}
                y1={chartPadding.top}
                x2={adaptiveBleSummary.cursorX}
                y2={chartPadding.top + adaptiveBleSummary.plotHeight}
                className="current-time-line"
              />
            </svg>
            <div className="chart-legend">
              <span>
                <i className="legend-swatch ble-legend-drive" /> sampling drive (0–1, left; dashed = 0.5 neutral)
              </span>
              <span>
                <i className="legend-swatch ble-legend-scan" /> mean scan interval (s, right)
              </span>
            </div>
          </div>
        ) : null}

        {activePolicyType === "fixed" && fixedBleSeries.length > 0 && fixedBleSummary.hasPolicyRow ? (
          <div className="time-series-chart-card">
            <h3 className="chart-subtitle chart-card-title">Fixed-rate BLE schedule</h3>
            <svg
              className="time-series-chart ble-policy-chart"
              viewBox={`0 0 ${chartWidth} ${bleChartHeight}`}
              role="img"
              aria-label="Constant scan, advertise, and window intervals for fixed-rate BLE policy over time"
            >
              <rect x="0" y="0" width={chartWidth} height={bleChartHeight} rx="12" className="chart-background" />
              <line
                x1={chartPadding.left}
                y1={chartPadding.top + fixedBleSummary.plotHeight}
                x2={chartPadding.left + fixedBleSummary.plotWidth}
                y2={chartPadding.top + fixedBleSummary.plotHeight}
                className="chart-axis"
              />
              <line
                x1={chartPadding.left}
                y1={chartPadding.top}
                x2={chartPadding.left}
                y2={chartPadding.top + fixedBleSummary.plotHeight}
                className="chart-axis"
              />
              <line
                x1={chartPadding.left + fixedBleSummary.plotWidth}
                y1={chartPadding.top}
                x2={chartPadding.left + fixedBleSummary.plotWidth}
                y2={chartPadding.top + fixedBleSummary.plotHeight}
                className="chart-axis"
              />
              <text
                className="chart-axis-title chart-axis-title-primary"
                x={16}
                y={chartPadding.top + fixedBleSummary.plotHeight / 2}
                transform={`rotate(-90 16 ${chartPadding.top + fixedBleSummary.plotHeight / 2})`}
                textAnchor="middle"
              >
                Seconds (schedule)
              </text>
              <text
                className="chart-axis-title chart-axis-title-secondary"
                x={chartWidth - 16}
                y={chartPadding.top + fixedBleSummary.plotHeight / 2}
                transform={`rotate(90 ${chartWidth - 16} ${chartPadding.top + fixedBleSummary.plotHeight / 2})`}
                textAnchor="middle"
              >
                Duty (0–1)
              </text>
              {fixedBleSummary.secondTicks.map((tick) => {
                const y =
                  chartPadding.top +
                  fixedBleSummary.plotHeight -
                  (tick / fixedBleSummary.maxSeconds) * fixedBleSummary.plotHeight;
                return (
                  <text key={`fx-sec-${tick}`} x={chartPadding.left - 8} y={y + 4} className="chart-label chart-label-end">
                    {formatTick(tick)}
                  </text>
                );
              })}
              {fixedBleSummary.dutyTicks.map((tick) => {
                const y =
                  chartPadding.top +
                  fixedBleSummary.plotHeight -
                  (tick / fixedBleSummary.maxDuty) * fixedBleSummary.plotHeight;
                return (
                  <text
                    key={`fx-duty-${tick}`}
                    x={chartPadding.left + fixedBleSummary.plotWidth + 8}
                    y={y + 4}
                    className="chart-label"
                  >
                    {formatTick(tick)}
                  </text>
                );
              })}
              {mainSummary.xTicks.map((tick) => {
                const x = chartPadding.left + (tick / fixedBleSummary.maxTime) * fixedBleSummary.plotWidth;
                const absoluteTime = startTimeSeconds + tick;
                return (
                  <g key={`ble-fixed-time-${tick}`}>
                    <text x={x} y={bleChartHeight - 27} className="chart-label chart-label-middle chart-axis-time-of-day">
                      {formatClockHHMM(absoluteTime)}
                    </text>
                    <text x={x} y={bleChartHeight - 15} className="chart-label chart-label-middle chart-axis-elapsed">
                      {formatElapsedAxisTick(tick)}
                    </text>
                  </g>
                );
              })}
              <path d={fixedBleSummary.scanIntervalPath} className="ble-fixed-scan-interval-line" fill="none" />
              <path d={fixedBleSummary.advIntervalPath} className="ble-fixed-adv-interval-line" fill="none" />
              <path d={fixedBleSummary.scanWindowPath} className="ble-fixed-scan-window-line" fill="none" />
              <path d={fixedBleSummary.envelopeDutyPath} className="ble-fixed-duty-line" fill="none" />
              <line
                x1={fixedBleSummary.cursorX}
                y1={chartPadding.top}
                x2={fixedBleSummary.cursorX}
                y2={chartPadding.top + fixedBleSummary.plotHeight}
                className="current-time-line"
              />
            </svg>
            <div className="chart-legend">
              <span>
                <i className="legend-swatch ble-legend-fixed-scan" /> scan interval (s)
              </span>
              <span>
                <i className="legend-swatch ble-legend-fixed-adv" /> advertise interval (s)
              </span>
              <span>
                <i className="legend-swatch ble-legend-fixed-window" /> scan window (s)
              </span>
              <span>
                <i className="legend-swatch ble-legend-fixed-duty" /> envelope duty (0–1, right)
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StripChartCard({
  title,
  ariaLabel,
  stripSummary,
  animalIds,
  events,
  children,
  startTimeSeconds
}: {
  title: string;
  ariaLabel: string;
  stripSummary: StripSummary;
  animalIds: string[];
  events: AnimalStripEvent[];
  children: ReactNode;
  startTimeSeconds: number;
}) {
  const rowById = stripSummary.rowById;
  return (
    <div className="time-series-chart-card">
      <h3 className="chart-subtitle chart-card-title">{title}</h3>
      <svg
        className="time-series-chart strip-chart"
        viewBox={`0 0 ${stripChartWidth} ${stripSummary.stripHeight}`}
        role="img"
        aria-label={ariaLabel}
      >
        <rect x="0" y="0" width={stripChartWidth} height={stripSummary.stripHeight} rx="12" className="chart-background" />
        <line
          x1={stripPadding.left}
          y1={stripPadding.top}
          x2={stripPadding.left}
          y2={stripPadding.top + stripSummary.plotHeight}
          className="chart-axis"
        />
        <line
          x1={stripPadding.left + stripSummary.plotWidth}
          y1={stripPadding.top}
          x2={stripPadding.left + stripSummary.plotWidth}
          y2={stripPadding.top + stripSummary.plotHeight}
          className="chart-axis"
        />
        <line
          x1={stripPadding.left}
          y1={stripPadding.top + stripSummary.plotHeight}
          x2={stripPadding.left + stripSummary.plotWidth}
          y2={stripPadding.top + stripSummary.plotHeight}
          className="chart-axis"
        />
        {animalIds.map((id, row) => {
          const y = stripPadding.top + (row + 0.5) * stripRowHeight;
          const label = shortAnimalLabel(id);
          return (
            <text key={id} x={stripPadding.left - 8} y={y + 4} className="chart-label chart-label-end">
              {label}
            </text>
          );
        })}
        {stripSummary.xTicks.map((tick) => {
          const x = stripPadding.left + (tick / stripSummary.maxTime) * stripSummary.plotWidth;
          const absoluteTime = startTimeSeconds + tick;
          return (
            <g key={`strip-time-${tick}`}>
              <text
                x={x}
                y={stripSummary.stripHeight - 26}
                className="chart-label chart-label-middle chart-axis-time-of-day"
              >
                {formatClockHHMM(absoluteTime)}
              </text>
              <text
                x={x}
                y={stripSummary.stripHeight - 15}
                className="chart-label chart-label-middle chart-axis-elapsed"
              >
                {formatElapsedAxisTick(tick)}
              </text>
            </g>
          );
        })}
        {events.map((event, index) => {
          const row = rowById.get(event.animalId);
          if (row === undefined) {
            return null;
          }
          const x = stripPadding.left + (event.time / stripSummary.maxTime) * stripSummary.plotWidth;
          const y = stripPadding.top + (row + 0.5) * stripRowHeight;
          return (
            <circle
              key={`${event.time}-${event.animalId}-${event.kind}-${index}`}
              cx={x}
              cy={y}
              r={stripDotRadius}
              className={stripDotClass(event.kind)}
            />
          );
        })}
        <line
          x1={stripSummary.cursorX}
          y1={stripPadding.top}
          x2={stripSummary.cursorX}
          y2={stripPadding.top + stripSummary.plotHeight}
          className="current-time-line"
        />
      </svg>
      <div className="chart-legend strip-chart-legend">{children}</div>
    </div>
  );
}

function shortAnimalLabel(id: string): string {
  return id.replace(/^animal-/, "A");
}

function stripDotClass(kind: AnimalStripEventKind): string {
  switch (kind) {
    case "social":
      return "strip-dot strip-dot-social";
    case "sleep":
      return "strip-dot strip-dot-sleep";
    case "awake":
      return "strip-dot strip-dot-awake";
    case "move":
      return "strip-dot strip-dot-move";
    default:
      return "strip-dot";
  }
}

function createStripSummary(
  animalIds: string[],
  maxTime: number,
  currentStep: number,
  points: TimeSeriesPoint[]
) {
  const nRows = animalIds.length > 0 ? animalIds.length : 1;
  const plotWidth = stripChartWidth - stripPadding.left - stripPadding.right;
  const plotHeight = nRows * stripRowHeight;
  const stripHeight = stripPadding.top + stripPadding.bottom + plotHeight;
  const rowById = new Map(animalIds.map((id, index) => [id, index]));
  const safeMaxTime = Math.max(1, maxTime);
  const cursorX =
    stripPadding.left + ((points[currentStep]?.time ?? 0) / safeMaxTime) * plotWidth;

  return {
    stripHeight,
    plotWidth,
    plotHeight,
    maxTime: safeMaxTime,
    xTicks: createTicks(0, safeMaxTime, 5),
    rowById,
    cursorX
  };
}

function createChartSummary(points: TimeSeriesPoint[], energy: EnergyLog[], currentStep: number) {
  const maxMovement = 1;
  const maxEnergy = Math.max(0.01, ...energy.map((point) => point.cumulativeMah));
  const maxTime = Math.max(1, points.at(-1)?.time ?? 1);
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const smoothedFractions = trailingMovingAverageMovementFraction(points, MOVEMENT_FRACTION_AVG_WINDOW_SECONDS);
  const movementPath = points
    .map((point, index) => {
      const x = chartPadding.left + (point.time / maxTime) * plotWidth;
      const frac = smoothedFractions[index] ?? point.movementFraction;
      const y = chartPadding.top + plotHeight - (frac / maxMovement) * plotHeight;
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

  const cursorX = chartPadding.left + ((points[currentStep]?.time ?? 0) / maxTime) * plotWidth;

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
    energyPath,
    cursorX
  };
}

function createAdaptiveBleChartSummary(
  series: AdaptiveBleTimePoint[],
  points: TimeSeriesPoint[],
  currentStep: number
) {
  const maxTime = Math.max(1, points.at(-1)?.time ?? 1);
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = bleChartHeight - chartPadding.top - chartPadding.bottom;
  const maxDrive = 1;
  const maxScan = Math.max(1, ...series.map((point) => point.meanScanIntervalSeconds));
  const drivePath =
    series.length === 0
      ? ""
      : series
          .map((point, index) => {
            const x = chartPadding.left + (point.time / maxTime) * plotWidth;
            const y = chartPadding.top + plotHeight - (point.meanSamplingDrive / maxDrive) * plotHeight;
            return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(" ");
  const scanPath =
    series.length === 0
      ? ""
      : series
          .map((point, index) => {
            const x = chartPadding.left + (point.time / maxTime) * plotWidth;
            const y = chartPadding.top + plotHeight - (point.meanScanIntervalSeconds / maxScan) * plotHeight;
            return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(" ");
  const neutralY = chartPadding.top + plotHeight - 0.5 * plotHeight;
  const cursorX = chartPadding.left + ((points[currentStep]?.time ?? 0) / maxTime) * plotWidth;
  return {
    maxTime,
    maxDrive,
    maxScan,
    plotWidth,
    plotHeight,
    neutralY,
    cursorX,
    drivePath,
    scanPath,
    driveTicks: createTicks(0, 1, 5),
    scanTicks: createTicks(0, maxScan, 4)
  };
}

function createFixedBleChartSummary(series: FixedBleTimePoint[], points: TimeSeriesPoint[], currentStep: number) {
  const maxTime = Math.max(1, points.at(-1)?.time ?? 1);
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = bleChartHeight - chartPadding.top - chartPadding.bottom;
  if (series.length === 0) {
    return {
      hasPolicyRow: false,
      maxTime,
      plotWidth,
      plotHeight,
      maxSeconds: 1,
      maxDuty: 1,
      cursorX: chartPadding.left,
      scanIntervalPath: "",
      advIntervalPath: "",
      scanWindowPath: "",
      envelopeDutyPath: "",
      secondTicks: createTicks(0, 1, 2),
      dutyTicks: createTicks(0, 1, 2)
    };
  }
  const row = series[0];
  const hasPolicyRow = row.scanIntervalSeconds > 0 && row.advIntervalSeconds > 0;
  const maxSeconds = Math.max(row.scanIntervalSeconds, row.advIntervalSeconds, row.scanWindowSeconds, 0.01) * 1.05;
  const maxDuty = 1;
  const yScan = chartPadding.top + plotHeight - (row.scanIntervalSeconds / maxSeconds) * plotHeight;
  const yAdv = chartPadding.top + plotHeight - (row.advIntervalSeconds / maxSeconds) * plotHeight;
  const yWin = chartPadding.top + plotHeight - (row.scanWindowSeconds / maxSeconds) * plotHeight;
  const yDuty = chartPadding.top + plotHeight - (row.envelopeDuty / maxDuty) * plotHeight;
  const pathAtY = (y: number) =>
    series
      .map((point, index) => {
        const x = chartPadding.left + (point.time / maxTime) * plotWidth;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  const cursorX = chartPadding.left + ((points[currentStep]?.time ?? 0) / maxTime) * plotWidth;
  return {
    hasPolicyRow,
    maxTime,
    plotWidth,
    plotHeight,
    maxSeconds,
    maxDuty,
    cursorX,
    scanIntervalPath: pathAtY(yScan),
    advIntervalPath: pathAtY(yAdv),
    scanWindowPath: pathAtY(yWin),
    envelopeDutyPath: pathAtY(yDuty),
    secondTicks: createTicks(0, maxSeconds, 5),
    dutyTicks: createTicks(0, maxDuty, 5)
  };
}

/** Trailing moving average of `movementFraction` over simulation time `windowSeconds`. */
function trailingMovingAverageMovementFraction(points: TimeSeriesPoint[], windowSeconds: number): number[] {
  if (points.length === 0) {
    return [];
  }
  const result: number[] = new Array(points.length);
  let start = 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i].movementFraction;
    const windowStart = points[i].time - windowSeconds;
    while (start < i && points[start].time < windowStart) {
      sum -= points[start].movementFraction;
      start++;
    }
    const count = i - start + 1;
    result[i] = count > 0 ? sum / count : points[i].movementFraction;
  }
  return result;
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

/** Simulation time from start on the x-axis: "+0h", "+6.0h", "+12.0h", … */
function formatTimeAxisTick(secondsFromStart: number): string {
  const hours = secondsFromStart / 3600;
  if (hours === 0 || Math.abs(hours) < 1e-9) {
    return "+0h";
  }
  return `+${hours.toFixed(1)}h`;
}

/** Muted secondary row: "+0H", "+6.0H", … */
function formatElapsedAxisTick(secondsFromStart: number): string {
  return formatTimeAxisTick(secondsFromStart).toUpperCase();
}
