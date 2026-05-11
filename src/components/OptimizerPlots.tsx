import type { ReactNode } from "react";
import { InfoPopover } from "./InfoPopover";

const PLOT_WIDTH = 920;
const PLOT_HEIGHT = 440;
const PAD = { left: 58, right: 24, top: 34, bottom: 48 };
const FONT_AXIS = 14;
const FONT_LABEL = 14;

export type OptimizerScatterObserved = {
  x: number;
  y: number;
  id: string;
  tooltip: string;
  variant: "adaptive" | "fixed_sweep" | "fixed_inactivity_double";
  highlight: boolean;
  pareto: boolean;
};

export type OptimizerPredPoint = {
  x: number;
  y: number;
  id: string;
};

export type OptimizerRecommendationPoint = {
  x: number;
  y: number;
  id: string;
  label: string;
};

function computeScale(
  xs: number[],
  ys: number[],
  plotW: number,
  plotH: number,
  pad: typeof PAD
): {
  sx: (x: number) => number;
  sy: (y: number) => number;
  plotCenterX: number;
  plotMidY: number;
  leftMarginCenterX: number;
  height: number;
} {
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.08 || 0.02;
  const yPad = (yMax - yMin) * 0.08 || 0.02;

  const sx = (x: number) => pad.left + ((x - (xMin - xPad)) / (xMax - xMin + 2 * xPad || 1)) * plotW;
  const sy = (y: number) => pad.top + plotH - ((y - (yMin - yPad)) / (yMax - yMin + 2 * yPad || 1)) * plotH;

  return {
    sx,
    sy,
    plotCenterX: pad.left + plotW / 2,
    plotMidY: pad.top + plotH / 2,
    leftMarginCenterX: pad.left / 2,
    height: PLOT_HEIGHT
  };
}

export function OptimizerCaptureEnergyPlot({
  axesPopoverTitle,
  axesPopoverChildren,
  title,
  subtitle,
  xLabel,
  yLabel,
  baselinePoint,
  baselineMatchesBuilt,
  observed,
  faintPredicted,
  paretoPredicted,
  verifiedPredicted,
  recommendationPoints = []
}: {
  axesPopoverTitle: string;
  axesPopoverChildren: ReactNode;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  baselinePoint: { x: number; y: number; label: string; tooltip: string; pareto?: boolean };
  baselineMatchesBuilt: boolean;
  observed: OptimizerScatterObserved[];
  faintPredicted: OptimizerPredPoint[];
  paretoPredicted: OptimizerPredPoint[];
  verifiedPredicted: OptimizerPredPoint[];
  recommendationPoints?: OptimizerRecommendationPoint[];
}) {
  const width = PLOT_WIDTH;
  const height = PLOT_HEIGHT;
  const pad = PAD;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xs = [
    baselinePoint.x,
    ...observed.map((p) => p.x),
    ...faintPredicted.map((p) => p.x),
    ...paretoPredicted.map((p) => p.x),
    ...verifiedPredicted.map((p) => p.x),
    ...recommendationPoints.map((p) => p.x)
  ];
  const ys = [
    baselinePoint.y,
    ...observed.map((p) => p.y),
    ...faintPredicted.map((p) => p.y),
    ...paretoPredicted.map((p) => p.y),
    ...verifiedPredicted.map((p) => p.y),
    ...recommendationPoints.map((p) => p.y)
  ];

  const { sx, sy, plotCenterX, plotMidY, leftMarginCenterX } = computeScale(xs, ys, plotW, plotH, pad);
  const bx = sx(baselinePoint.x);
  const by = sy(baselinePoint.y);

  return (
    <figure className="sweep-plot optimizer-plot">
      <div className="panel-title-row sweep-plot-title-row">
        <figcaption className="sweep-plot-figcaption">
          <strong>{title}</strong>
          <span className="helper-text">{subtitle}</span>
        </figcaption>
        <InfoPopover label="What the axes mean" title={axesPopoverTitle}>
          {axesPopoverChildren}
        </InfoPopover>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="sweep-scatter-svg"
        preserveAspectRatio="xMidYMid meet"
        aria-label={title}
      >
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="rgba(13,22,32,0.6)" stroke="#223245" />
        {faintPredicted.map((point) => (
          <circle
            key={`faint-${point.id}`}
            cx={sx(point.x)}
            cy={sy(point.y)}
            r={2.5}
            fill="#94a3b8"
            opacity={0.22}
          />
        ))}
        {observed.map((point) => {
          const cx = sx(point.x);
          const cy = sy(point.y);
          const fill = point.variant === "adaptive" ? "#7dd3fc" : "#fbbf24";
          const isInactiveDouble = point.variant === "fixed_inactivity_double";
          return (
            <g key={point.id}>
              <title>{point.tooltip}</title>
              {point.pareto ? (
                <circle cx={cx} cy={cy} r={8} fill="none" stroke="#34d399" strokeWidth={1.75} />
              ) : null}
              {point.highlight ? (
                <circle cx={cx} cy={cy} r={11} fill="none" stroke="#a78bfa" strokeWidth={2} />
              ) : null}
              {isInactiveDouble ? (
                <circle cx={cx} cy={cy} r={5.5} fill="none" stroke={fill} strokeWidth={2} opacity={0.95} />
              ) : (
                <circle cx={cx} cy={cy} r={5} fill={fill} opacity={0.92} />
              )}
            </g>
          );
        })}
        {paretoPredicted.map((point) => {
          const cx = sx(point.x);
          const cy = sy(point.y);
          return (
            <g key={`par-${point.id}`}>
              <title>{point.id}</title>
              <circle cx={cx} cy={cy} r={9} fill="none" stroke="#34d399" strokeWidth={1.5} opacity={0.95} />
              <circle cx={cx} cy={cy} r={3.5} fill="#5eead4" opacity={0.55} />
            </g>
          );
        })}
        {verifiedPredicted.map((point) => {
          const cx = sx(point.x);
          const cy = sy(point.y);
          return (
            <g key={`ver-${point.id}`}>
              <title>Verified {point.id}</title>
              <circle cx={cx} cy={cy} r={12} fill="none" stroke="#f472b6" strokeWidth={2.5} />
              <circle cx={cx} cy={cy} r={5} fill="#fbcfe8" opacity={0.95} />
            </g>
          );
        })}
        {recommendationPoints.map((p, i) => {
          const cx = sx(p.x);
          const cy = sy(p.y);
          return (
            <g key={`rec-${p.id}-${p.label}`}>
              <title>{`${p.label} (${p.id})`}</title>
              <circle cx={cx} cy={cy} r={10} fill="none" stroke="#38bdf8" strokeWidth={2} />
              <circle cx={cx} cy={cy} r={5} fill="#38bdf8" opacity={0.88} />
              <text x={cx + 12} y={cy - 6 + (i % 4) * 11} fill="#bae6fd" fontSize={11}>
                {p.label}
              </text>
            </g>
          );
        })}
        <g>
          <title>{baselinePoint.tooltip}</title>
          {baselinePoint.pareto ? (
            <circle cx={bx} cy={by} r={15} fill="none" stroke="#34d399" strokeWidth={1.75} />
          ) : null}
          {baselineMatchesBuilt ? <circle cx={bx} cy={by} r={13} fill="none" stroke="#a78bfa" strokeWidth={2} /> : null}
          <circle
            cx={bx}
            cy={by}
            r={9}
            fill="#fbbf24"
            opacity={0.95}
            stroke="#fef3c7"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        </g>
        <text x={bx + 12} y={by - 10} fill="#e7eef6" fontSize={FONT_LABEL}>
          {baselinePoint.label}
        </text>
        <text
          x={plotCenterX}
          y={height - 10}
          fill="#90a4b8"
          fontSize={FONT_AXIS}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {xLabel}
        </text>
        <text
          x={leftMarginCenterX}
          y={plotMidY}
          fill="#90a4b8"
          fontSize={FONT_AXIS}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90 ${leftMarginCenterX} ${plotMidY})`}
        >
          {yLabel}
        </text>
      </svg>
      <div className="chart-legend sweep-chart-legend optimizer-chart-legend" aria-label="Optimizer plot legend">
        <span>
          <i className="sweep-legend-icon sweep-legend-icon--fixed" aria-hidden />
          Observed sweep (fixed)
        </span>
        <span>
          <i className="sweep-legend-icon sweep-legend-icon--adaptive" aria-hidden />
          Observed sweep (adaptive)
        </span>
        <span>
          <i className="sweep-legend-icon sweep-legend-icon--juxta" aria-hidden />
          Juxta baseline
        </span>
        <span className="optimizer-legend-faint">
          <i className="optimizer-legend-dot optimizer-legend-dot--faint" aria-hidden />
          Predicted candidates (sample)
        </span>
        <span>
          <i className="sweep-legend-icon sweep-legend-icon--pareto" aria-hidden />
          Predicted Pareto
        </span>
        <span className="optimizer-legend-verified">
          <i className="optimizer-legend-dot optimizer-legend-dot--verified" aria-hidden />
          Verified simulation
        </span>
        <span className="optimizer-legend-rec-row">
          <i className="optimizer-legend-rec" aria-hidden />
          Recommendation roles (this run)
        </span>
      </div>
    </figure>
  );
}

export function OptimizerEfficiencyCapturePlot({
  axesPopoverTitle,
  axesPopoverChildren,
  title,
  subtitle,
  baselinePoint,
  baselineMatchesBuilt,
  recommendationPoints
}: {
  axesPopoverTitle: string;
  axesPopoverChildren: ReactNode;
  title: string;
  subtitle: string;
  baselinePoint: { x: number; y: number; label: string; tooltip: string; pareto?: boolean };
  baselineMatchesBuilt: boolean;
  recommendationPoints: { x: number; y: number; id: string; label: string }[];
}) {
  const width = PLOT_WIDTH;
  const height = PLOT_HEIGHT;
  const pad = PAD;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xs = [baselinePoint.x, ...recommendationPoints.map((p) => p.x)];
  const ys = [baselinePoint.y, ...recommendationPoints.map((p) => p.y)];
  const { sx, sy, plotCenterX, plotMidY, leftMarginCenterX } = computeScale(xs, ys, plotW, plotH, pad);
  const bx = sx(baselinePoint.x);
  const by = sy(baselinePoint.y);

  return (
    <figure className="sweep-plot optimizer-plot">
      <div className="panel-title-row sweep-plot-title-row">
        <figcaption className="sweep-plot-figcaption">
          <strong>{title}</strong>
          <span className="helper-text">{subtitle}</span>
        </figcaption>
        <InfoPopover label="What the axes mean" title={axesPopoverTitle}>
          {axesPopoverChildren}
        </InfoPopover>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="sweep-scatter-svg" preserveAspectRatio="xMidYMid meet">
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="rgba(13,22,32,0.6)" stroke="#223245" />
        {recommendationPoints.map((p, i) => (
          <g key={p.id}>
            <title>{p.label}</title>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={10} fill="none" stroke="#38bdf8" strokeWidth={2} />
            <circle cx={sx(p.x)} cy={sy(p.y)} r={5} fill="#38bdf8" opacity={0.85} />
            <text x={sx(p.x) + 12} y={sy(p.y) - 6 + (i % 3) * 12} fill="#bae6fd" fontSize={11}>
              {p.label}
            </text>
          </g>
        ))}
        <g>
          <title>{baselinePoint.tooltip}</title>
          {baselinePoint.pareto ? (
            <circle cx={bx} cy={by} r={15} fill="none" stroke="#34d399" strokeWidth={1.75} />
          ) : null}
          {baselineMatchesBuilt ? <circle cx={bx} cy={by} r={13} fill="none" stroke="#a78bfa" strokeWidth={2} /> : null}
          <circle cx={bx} cy={by} r={9} fill="#fbbf24" opacity={0.95} stroke="#fef3c7" strokeWidth={2} strokeDasharray="5 4" />
        </g>
        <text x={bx + 12} y={by - 10} fill="#e7eef6" fontSize={FONT_LABEL}>
          {baselinePoint.label}
        </text>
        <text x={plotCenterX} y={height - 10} fill="#90a4b8" fontSize={FONT_AXIS} textAnchor="middle">
          BLE capture rate
        </text>
        <text
          x={leftMarginCenterX}
          y={plotMidY}
          fill="#90a4b8"
          fontSize={FONT_AXIS}
          textAnchor="middle"
          transform={`rotate(-90 ${leftMarginCenterX} ${plotMidY})`}
        >
          Efficiency (rate / mAh·day⁻¹)
        </text>
      </svg>
      <div className="chart-legend sweep-chart-legend" aria-label="Legend">
        <span>
          <i className="sweep-legend-icon sweep-legend-icon--juxta" aria-hidden />
          Juxta baseline
        </span>
        <span>
          <i className="optimizer-legend-rec" aria-hidden />
          Recommended roles (this run)
        </span>
      </div>
    </figure>
  );
}

/** Predicted (x) vs verified (y); diagonal is perfect agreement. */
export function OptimizerCalibrationScatter({
  metricTitle,
  points
}: {
  metricTitle: string;
  points: { predicted: number; verified: number; label: string }[];
}) {
  const width = 640;
  const height = 280;
  const pad = { left: 56, right: 22, top: 32, bottom: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xs = points.map((p) => p.predicted);
  const ys = points.map((p) => p.verified);
  const lo = Math.min(...xs, ...ys);
  const hi = Math.max(...xs, ...ys);
  const span = hi - lo || 1;
  const margin = span * 0.06;

  const sx = (v: number) => pad.left + ((v - (lo - margin)) / (span + 2 * margin)) * plotW;
  const sy = (v: number) => pad.top + plotH - ((v - (lo - margin)) / (span + 2 * margin)) * plotH;

  const x1 = sx(lo - margin);
  const x2 = sx(hi + margin);

  return (
    <figure className="sweep-plot optimizer-plot optimizer-calibration-plot">
      <figcaption className="sweep-plot-figcaption optimizer-calibration-caption">
        <strong>{metricTitle}</strong>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="sweep-scatter-svg">
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="rgba(13,22,32,0.6)" stroke="#223245" />
        <line
          x1={x1}
          y1={sy(lo - margin)}
          x2={x2}
          y2={sy(hi + margin)}
          stroke="#64748b"
          strokeDasharray="5 4"
        />
        {points.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            <title>{`${p.label}: predicted ${p.predicted}, verified ${p.verified}`}</title>
            <circle cx={sx(p.predicted)} cy={sy(p.verified)} r={7} fill="#c4b5fd" opacity={0.95} stroke="#7c3aed" strokeWidth={1.5} />
            <text x={sx(p.predicted) + 10} y={sy(p.verified) - 8} fill="#ddd6fe" fontSize={11}>
              {p.label}
            </text>
          </g>
        ))}
        <text x={pad.left + plotW / 2} y={height - 8} fill="#90a4b8" fontSize={13} textAnchor="middle">
          Predicted
        </text>
        <text
          x={22}
          y={pad.top + plotH / 2}
          fill="#90a4b8"
          fontSize={13}
          textAnchor="middle"
          transform={`rotate(-90 22 ${pad.top + plotH / 2})`}
        >
          Verified
        </text>
      </svg>
    </figure>
  );
}
