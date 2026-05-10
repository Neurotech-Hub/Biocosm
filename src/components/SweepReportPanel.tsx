import { useMemo, type CSSProperties } from "react";
import { InfoPopover } from "./InfoPopover";
import type { SimulationConfig } from "../simulation/types";
import type { CandidatePick, SweepPolicySummary } from "../simulation/sweep/sweepCandidates";
import type { SweepResultBundle } from "../simulation/sweep/adaptiveBleSweep";
import {
  buildSweepMarkdownReport,
  serializeSweepRawCsv,
  serializeSweepSummaryCsv
} from "../simulation/sweep/sweepExport";

const SWEEP_PLOT_WIDTH = 920;
const SWEEP_PLOT_HEIGHT = 440;
const SWEEP_PLOT_PAD = { left: 58, right: 24, top: 34, bottom: 48 };
const SWEEP_PLOT_SVG_FONT_AXIS = 14;
const SWEEP_PLOT_SVG_FONT_BASELINE_LABEL = 14;

function policyHoverLabel(summary: SweepPolicySummary): string {
  return `${summary.policyId} — ${summary.label}`;
}

function efficiencyRowStyle(eff: number, minEff: number, maxEff: number): CSSProperties {
  if (!Number.isFinite(eff)) {
    return {};
  }
  if (maxEff <= minEff || Math.abs(maxEff - minEff) < 1e-12) {
    return { backgroundColor: "hsla(52, 50%, 16%, 0.65)" };
  }
  const t = Math.max(0, Math.min(1, (eff - minEff) / (maxEff - minEff)));
  const hue = t * 120;
  return { backgroundColor: `hsla(${hue}, 50%, 15%, 0.68)` };
}

type SweepReportPanelProps = {
  baseConfig: SimulationConfig;
  sweepResult: (SweepResultBundle & { candidates: CandidatePick[] }) | null;
  onSimulatePolicy?: (summary: SweepPolicySummary) => void;
  simulateDisabled?: boolean;
};

export function SweepReportPanel({
  baseConfig,
  sweepResult,
  onSimulatePolicy,
  simulateDisabled = false
}: SweepReportPanelProps) {
  const summariesByEfficiency = useMemo(() => {
    if (!sweepResult) {
      return [];
    }
    return [...sweepResult.summaries].sort((a, b) => b.meanBleEfficiency - a.meanBleEfficiency);
  }, [sweepResult]);

  const rankedIds = useMemo(() => summariesByEfficiency.map((summary) => summary.policyId), [summariesByEfficiency]);

  const efficiencyRange = useMemo(() => {
    if (summariesByEfficiency.length === 0) {
      return { min: 0, max: 1 };
    }
    const effs = summariesByEfficiency.map((row) => row.meanBleEfficiency);
    return { min: Math.min(...effs), max: Math.max(...effs) };
  }, [summariesByEfficiency]);

  const downloadRawCsv = () => {
    if (!sweepResult) {
      return;
    }
    downloadBlob(
      `biocosm-sweep-raw-${baseConfig.seed}.csv`,
      serializeSweepRawCsv(sweepResult.rawRows),
      "text/csv;charset=utf-8"
    );
  };

  const downloadSummaryCsv = () => {
    if (!sweepResult) {
      return;
    }
    downloadBlob(
      `biocosm-sweep-summary-${baseConfig.seed}.csv`,
      serializeSweepSummaryCsv(sweepResult, rankedIds),
      "text/csv;charset=utf-8"
    );
  };

  const downloadMarkdown = () => {
    if (!sweepResult) {
      return;
    }
    downloadBlob(
      `biocosm-sweep-report-${baseConfig.seed}.md`,
      buildSweepMarkdownReport({
        baseConfig,
        bundle: sweepResult,
        candidates: sweepResult.candidates
      }),
      "text/markdown;charset=utf-8"
    );
  };

  const hasResult = Boolean(sweepResult);
  const sweepTableColSpan = 15;

  return (
    <div className="sweep-report-panel">
      {sweepResult ? (
        <SweepCandidatesSection candidates={sweepResult.candidates} baseline={sweepResult.baselineSummary} />
      ) : (
        <SweepRecommendationsPlaceholder />
      )}

      <div className="sweep-plots-grid">
        {sweepResult ? (
          <>
            <SweepScatterPlot
              title="Capture rate vs energy"
              subtitle="Upper-left is better capture at lower energy."
              xLabel="mAh/day"
              yLabel="BLE capture rate"
              baselinePoint={{
                x: sweepResult.baselineSummary.meanMahPerDay,
                y: sweepResult.baselineSummary.meanCaptureRate,
                label: "Fixed Juxta baseline",
                tooltip: `Fixed Juxta baseline (${sweepResult.baselineSummary.policyId}) — fixed-rate BLE schedule used as sweep reference`
              }}
              points={summariesByEfficiency.map((summary) => ({
                x: summary.meanMahPerDay,
                y: summary.meanCaptureRate,
                id: summary.policyId,
                tooltip: policyHoverLabel(summary)
              }))}
            />
            <SweepScatterPlot
              title="BLE efficiency vs capture rate"
              subtitle="Upper-right: high capture and high capture per energy."
              xLabel="BLE capture rate"
              yLabel="Efficiency (rate / mAh·day⁻¹)"
              baselinePoint={{
                x: sweepResult.baselineSummary.meanCaptureRate,
                y: sweepResult.baselineSummary.meanBleEfficiency,
                label: "Fixed Juxta baseline",
                tooltip: `Fixed Juxta baseline (${sweepResult.baselineSummary.policyId}) — fixed-rate BLE schedule used as sweep reference`
              }}
              points={summariesByEfficiency.map((summary) => ({
                x: summary.meanCaptureRate,
                y: summary.meanBleEfficiency,
                id: summary.policyId,
                tooltip: policyHoverLabel(summary)
              }))}
            />
            <SweepRelativeTradeoffPlot summaries={summariesByEfficiency} />
          </>
        ) : (
          <>
            <SweepPlotPlaceholder
              title="Capture rate vs energy"
              subtitle="Upper-left is better capture at lower energy."
              hint="Legend: gold = Fixed Juxta baseline; cyan = adaptive sweep points. Hover any circle for policy id and swept parameters."
            />
            <SweepPlotPlaceholder
              title="BLE efficiency vs capture rate"
              subtitle="Upper-right: high capture and high capture per energy."
              hint="Same legend and hover behavior as the capture vs energy chart."
            />
            <SweepPlotPlaceholder
              title="Relative capture vs relative energy"
              subtitle="Reference lines at fixed-rate energy (x=1) and capture (y=1)."
              hint="Hover cyan points for adaptive policy id and parameters; baseline is relative (1, 1)."
            />
          </>
        )}
      </div>

      <div className="sweep-table-section">
        <div className="panel-title-row">
          <h3>Candidate table (mean across seeds)</h3>
          <InfoPopover label="Explain candidate table columns" title="Candidate table columns">
            <dl className="metric-definition-list">
              <dt>Rank</dt>
              <dd>Order by mean BLE efficiency among adaptive candidates in this sweep (1 = highest efficiency).</dd>
              <dt>Row tint</dt>
              <dd>
                Adaptive rows use a red→yellow→green background by mean efficiency within this sweep only (green = higher
                efficiency). The Fixed Juxta row keeps a fixed highlight style.
              </dd>
                  <dt>Policy</dt>
                  <dd>
                    Simulator-generated id for this adaptive parameter cell (truncated). Hover for full id and parameter
                    summary. Use <strong>Simulate</strong> to load this sweep cell into the Simulator tab (draft settings;
                    rebuild to refresh the timeline).
                  </dd>
              <dt>bd</dt>
              <dd>Adaptive firmware baselineDrive (minimum sampling drive).</dd>
              <dt>mw</dt>
              <dd>Adaptive motionWeight — contribution of motion-derived drive spikes.</dd>
              <dt>pw</dt>
              <dd>Adaptive peerWeight — contribution of socially inferred peer-drive spikes.</dd>
              <dt>τ peer</dt>
              <dd>Held peer-drive time constant (seconds) for this sweep cell.</dd>
              <dt>Capture</dt>
              <dd>Mean interval-level BLE capture rate across seeds included in this run.</dd>
              <dt>mAh/day</dt>
              <dd>Mean estimated representative-collar BLE energy burden (milliamp-hours per day).</dd>
              <dt>Efficiency</dt>
              <dd>BLE hits per unit energy (capture rate scaled by estimated mAh/day), same notion as simulator metrics panels.</dd>
              <dt>Rel cap</dt>
              <dd>
                {`Mean relative capture vs Fixed Juxta baseline (< 1 weaker capture, > 1 stronger than baseline).`}
              </dd>
              <dt>Rel E</dt>
              <dd>{`Mean relative BLE energy vs baseline (< 1 uses less BLE energy than baseline).`}</dd>
              <dt>Mean drive</dt>
              <dd>Time-weighted mean sampling drive averaged across collars and seeds (neutral = fixed-rate analogue).</dd>
              <dt>% below / near / above</dt>
              <dd>Share of epochs where cohort mean drive sits below / near neutral / above fixed-rate band (from adaptive logs).</dd>
            </dl>
          </InfoPopover>
        </div>
        <div className="table-wrap">
          <table className="sweep-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Policy</th>
                <th>bd</th>
                <th>mw</th>
                <th>pw</th>
                <th>τ peer</th>
                <th>Capture</th>
                <th>mAh/day</th>
                <th>Efficiency</th>
                <th>Rel cap</th>
                <th>Rel E</th>
                <th>Mean drive</th>
                <th>% below</th>
                <th>% near</th>
                <th>% above</th>
              </tr>
            </thead>
            <tbody>
              {sweepResult ? (
                <>
                  <tr className="sweep-table-baseline">
                    <td>—</td>
                    <td colSpan={5}>Fixed Juxta baseline</td>
                    <td>{sweepResult.baselineSummary.meanCaptureRate.toFixed(4)}</td>
                    <td>{sweepResult.baselineSummary.meanMahPerDay.toFixed(4)}</td>
                    <td>{sweepResult.baselineSummary.meanBleEfficiency.toFixed(4)}</td>
                    <td>1</td>
                    <td>1</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                  {summariesByEfficiency.map((summary, index) => (
                    <SweepTableRow
                      key={summary.policyId}
                      rank={index + 1}
                      rowStyle={efficiencyRowStyle(summary.meanBleEfficiency, efficiencyRange.min, efficiencyRange.max)}
                      summary={summary}
                      rawRows={sweepResult.rawRows}
                      onSimulatePolicy={onSimulatePolicy}
                      simulateDisabled={simulateDisabled}
                    />
                  ))}
                </>
              ) : (
                <tr>
                  <td colSpan={sweepTableColSpan} className="sweep-table-placeholder-cell">
                    Baseline row and adaptive candidates appear here after you run a sweep. Rank is by mean BLE efficiency
                    among adaptive policies.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sweep-downloads">
        <h3>Downloads</h3>
        <button type="button" className="secondary-button" disabled={!hasResult} onClick={downloadMarkdown}>
          Download Markdown report
        </button>
        <button type="button" className="secondary-button" disabled={!hasResult} onClick={downloadRawCsv}>
          Download raw CSV (per seed)
        </button>
        <button type="button" className="secondary-button" disabled={!hasResult} onClick={downloadSummaryCsv}>
          Download summary CSV
        </button>
      </div>

      <p className="helper-text sweep-caveat">
        This is a direction-setting sweep, not a final firmware optimizer. BLE efficiency should not be interpreted
        without the capture-rate threshold.
      </p>
    </div>
  );
}

function SweepTableRow({
  rank,
  rowStyle,
  summary,
  rawRows,
  onSimulatePolicy,
  simulateDisabled
}: {
  rank: number;
  rowStyle?: CSSProperties;
  summary: SweepPolicySummary;
  rawRows: import("../simulation/sweep/adaptiveBleSweep").SweepRawRow[];
  onSimulatePolicy?: (summary: SweepPolicySummary) => void;
  simulateDisabled?: boolean;
}) {
  const samples = rawRows.filter((row) => row.policyId === summary.policyId);
  const avgNullable = (pick: (row: import("../simulation/sweep/adaptiveBleSweep").SweepRawRow) => number | null) => {
    const values = samples.map(pick).filter((value): value is number => value != null);
    if (values.length === 0) {
      return null;
    }
    return values.reduce((accumulator, value) => accumulator + value, 0) / values.length;
  };
  const meanDrive = avgNullable((row) => row.meanSamplingDrive);
  const pctBelow = avgNullable((row) => row.percentTimeBelowFixed);
  const pctNear = avgNullable((row) => row.percentTimeNearFixed);
  const pctAbove = avgNullable((row) => row.percentTimeAboveFixed);

  const canSimulate = Boolean(summary.params && onSimulatePolicy);

  return (
    <tr style={rowStyle}>
      <td>{rank}</td>
      <td className="sweep-policy-id" title={`${summary.policyId} — ${summary.label}`}>
        <span className="sweep-policy-id-text">{summary.policyId}</span>
        {canSimulate ? (
          <button
            type="button"
            className="sweep-policy-simulate-button"
            disabled={simulateDisabled}
            onClick={() => onSimulatePolicy?.(summary)}
          >
            Simulate
          </button>
        ) : null}
      </td>
      <td>{summary.params?.baselineDrive ?? "—"}</td>
      <td>{summary.params?.motionWeight ?? "—"}</td>
      <td>{summary.params?.peerWeight ?? "—"}</td>
      <td>{summary.params?.tauPeerSeconds ?? "—"}</td>
      <td>{summary.meanCaptureRate.toFixed(4)}</td>
      <td>{summary.meanMahPerDay.toFixed(4)}</td>
      <td>{summary.meanBleEfficiency.toFixed(4)}</td>
      <td>{summary.meanRelativeCapture.toFixed(3)}</td>
      <td>{summary.meanRelativeEnergy.toFixed(3)}</td>
      <td>{meanDrive != null ? meanDrive.toFixed(3) : "—"}</td>
      <td>{pctBelow != null ? pctBelow.toFixed(1) : "—"}</td>
      <td>{pctNear != null ? pctNear.toFixed(1) : "—"}</td>
      <td>{pctAbove != null ? pctAbove.toFixed(1) : "—"}</td>
    </tr>
  );
}

function SweepCandidatesSection({
  candidates,
  baseline
}: {
  candidates: CandidatePick[];
  baseline: SweepPolicySummary;
}) {
  const titles: Record<CandidatePick["role"], string> = {
    energySaving: "Energy-saving candidate",
    balanced: "Balanced candidate",
    highCapture: "High-capture candidate"
  };

  return (
    <section className="sweep-candidates">
      <h3>Top recommendations</h3>
      <div className="sweep-candidate-cards">
        {candidates.map((pick) => (
          <div key={pick.role} className="sweep-candidate-card">
            <h4>{titles[pick.role]}</h4>
            {!pick.summary ? (
              <p className="helper-text">None selected.</p>
            ) : (
              <>
                <p className="sweep-candidate-id">{pick.summary.policyId}</p>
                <ul className="sweep-candidate-metrics">
                  <li>Mean capture: {pick.summary.meanCaptureRate.toFixed(4)} (baseline {baseline.meanCaptureRate.toFixed(4)})</li>
                  <li>Relative capture: {pick.summary.meanRelativeCapture.toFixed(3)}</li>
                  <li>Mean mAh/day: {pick.summary.meanMahPerDay.toFixed(4)}</li>
                  <li>Relative energy: {pick.summary.meanRelativeEnergy.toFixed(3)}</li>
                  <li>Threshold: {pick.meetsThreshold ? "met" : "not met"}</li>
                </ul>
                {pick.note ? <p className="helper-text">{pick.note}</p> : null}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const SWEEP_CANDIDATE_CARD_TITLES = ["Energy-saving candidate", "Balanced candidate", "High-capture candidate"] as const;

function SweepRecommendationsPlaceholder() {
  return (
    <section className="sweep-candidates sweep-candidates--placeholder">
      <h3>Top recommendations</h3>
      <div className="sweep-candidate-cards">
        {SWEEP_CANDIDATE_CARD_TITLES.map((title) => (
          <div key={title} className="sweep-candidate-card sweep-candidate-card--placeholder">
            <h4>{title}</h4>
            <p className="helper-text sweep-placeholder-text">
              Recommended policies from this sweep appear here after you use <strong>Run adaptive sweep</strong> in the
              sidebar.
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SweepPlotPlaceholder({
  title,
  subtitle,
  hint
}: {
  title: string;
  subtitle: string;
  hint: string;
}) {
  return (
    <figure className="sweep-plot sweep-plot--placeholder">
      <figcaption>
        <strong>{title}</strong>
        <span className="helper-text">{subtitle}</span>
      </figcaption>
      <div className="sweep-plot-placeholder-frame" aria-hidden="true">
        Scatter plot renders here when the sweep finishes.
      </div>
      <span className="sweep-plot-hint">{hint}</span>
    </figure>
  );
}

type PlotPoint = { x: number; y: number; id: string; tooltip: string };

function SweepScatterPlot({
  title,
  subtitle,
  xLabel,
  yLabel,
  baselinePoint,
  points
}: {
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  baselinePoint: { x: number; y: number; label: string; tooltip: string };
  points: PlotPoint[];
}) {
  const width = SWEEP_PLOT_WIDTH;
  const height = SWEEP_PLOT_HEIGHT;
  const pad = SWEEP_PLOT_PAD;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xs = [baselinePoint.x, ...points.map((point) => point.x)];
  const ys = [baselinePoint.y, ...points.map((point) => point.y)];
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.08 || 0.02;
  const yPad = (yMax - yMin) * 0.08 || 0.02;

  const sx = (x: number) => pad.left + ((x - (xMin - xPad)) / (xMax - xMin + 2 * xPad || 1)) * plotW;
  const sy = (y: number) => pad.top + plotH - ((y - (yMin - yPad)) / (yMax - yMin + 2 * yPad || 1)) * plotH;

  const plotCenterX = pad.left + plotW / 2;
  const plotMidY = pad.top + plotH / 2;
  const leftMarginCenterX = pad.left / 2;

  return (
    <figure className="sweep-plot">
      <figcaption>
        <strong>{title}</strong>
        <span className="helper-text">{subtitle}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="sweep-scatter-svg"
        preserveAspectRatio="xMidYMid meet"
        aria-label={title}
      >
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="rgba(13,22,32,0.6)" stroke="#223245" />
        {points.map((point) => (
          <g key={point.id}>
            <title>{point.tooltip}</title>
            <circle cx={sx(point.x)} cy={sy(point.y)} r={5} fill="#7dd3fc" opacity={0.92} />
          </g>
        ))}
        <g>
          <title>{baselinePoint.tooltip}</title>
          <circle cx={sx(baselinePoint.x)} cy={sy(baselinePoint.y)} r={9} fill="#fbbf24" opacity={0.95} />
        </g>
        <text
          x={sx(baselinePoint.x) + 12}
          y={sy(baselinePoint.y) - 10}
          fill="#e7eef6"
          fontSize={SWEEP_PLOT_SVG_FONT_BASELINE_LABEL}
        >
          {baselinePoint.label}
        </text>
        <text
          x={plotCenterX}
          y={height - 10}
          fill="#90a4b8"
          fontSize={SWEEP_PLOT_SVG_FONT_AXIS}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {xLabel}
        </text>
        <text
          x={leftMarginCenterX}
          y={plotMidY}
          fill="#90a4b8"
          fontSize={SWEEP_PLOT_SVG_FONT_AXIS}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90 ${leftMarginCenterX} ${plotMidY})`}
        >
          {yLabel}
        </text>
      </svg>
      <span className="sweep-plot-hint">Legend: gold = Fixed Juxta baseline; cyan = adaptive sweep points. Hover any circle for policy id and swept parameters.</span>
    </figure>
  );
}

function SweepRelativeTradeoffPlot({ summaries }: { summaries: SweepPolicySummary[] }) {
  const width = SWEEP_PLOT_WIDTH;
  const height = SWEEP_PLOT_HEIGHT;
  const pad = SWEEP_PLOT_PAD;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xs = [1, ...summaries.map((summary) => summary.meanRelativeEnergy)];
  const ys = [1, ...summaries.map((summary) => summary.meanRelativeCapture)];
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.08 || 0.05;
  const yPad = (yMax - yMin) * 0.08 || 0.05;

  const sx = (x: number) => pad.left + ((x - (xMin - xPad)) / (xMax - xMin + 2 * xPad || 1)) * plotW;
  const sy = (y: number) => pad.top + plotH - ((y - (yMin - yPad)) / (yMax - yMin + 2 * yPad || 1)) * plotH;

  const refX = sx(1);
  const refY = sy(1);
  const baselineTooltip =
    "Fixed Juxta baseline — relative energy 1, relative capture 1 (reference for adaptive cells in this sweep)";
  const plotCenterX = pad.left + plotW / 2;
  const plotMidY = pad.top + plotH / 2;
  const leftMarginCenterX = pad.left / 2;

  return (
    <figure className="sweep-plot">
      <figcaption>
        <strong>Relative capture vs relative energy</strong>
        <span className="helper-text">Reference lines at fixed-rate energy (x=1) and capture (y=1).</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="sweep-scatter-svg"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Relative capture vs relative energy"
      >
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="rgba(13,22,32,0.6)" stroke="#223245" />
        <line x1={refX} y1={pad.top} x2={refX} y2={pad.top + plotH} stroke="rgba(231,238,246,0.25)" strokeDasharray="4 4" />
        <line x1={pad.left} y1={refY} x2={pad.left + plotW} y2={refY} stroke="rgba(231,238,246,0.25)" strokeDasharray="4 4" />
        {summaries.map((summary) => (
          <g key={summary.policyId}>
            <title>{policyHoverLabel(summary)}</title>
            <circle
              cx={sx(summary.meanRelativeEnergy)}
              cy={sy(summary.meanRelativeCapture)}
              r={5}
              fill="#7dd3fc"
              opacity={0.92}
            />
          </g>
        ))}
        <g>
          <title>{baselineTooltip}</title>
          <circle cx={sx(1)} cy={sy(1)} r={9} fill="#fbbf24" opacity={0.95} />
        </g>
        <text x={sx(1) + 12} y={sy(1) - 10} fill="#e7eef6" fontSize={SWEEP_PLOT_SVG_FONT_BASELINE_LABEL}>
          Fixed Juxta baseline
        </text>
        <text
          x={plotCenterX}
          y={height - 10}
          fill="#90a4b8"
          fontSize={SWEEP_PLOT_SVG_FONT_AXIS}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          Relative energy
        </text>
        <text
          x={leftMarginCenterX}
          y={plotMidY}
          fill="#90a4b8"
          fontSize={SWEEP_PLOT_SVG_FONT_AXIS}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90 ${leftMarginCenterX} ${plotMidY})`}
        >
          Relative capture
        </text>
      </svg>
      <span className="sweep-plot-hint">Hover cyan points for adaptive policy id and parameters; baseline is relative (1, 1).</span>
    </figure>
  );
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
