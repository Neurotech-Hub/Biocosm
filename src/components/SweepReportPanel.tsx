import { useMemo, type CSSProperties, type ReactNode } from "react";
import { InfoPopover } from "./InfoPopover";
import type { SimulationConfig } from "../simulation/types";
import type { CandidatePick, SweepPolicySummary } from "../simulation/sweep/sweepCandidates";
import type { SweepRawRow, SweepResultBundle } from "../simulation/sweep/adaptiveBleSweep";
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

function nearlyEqual(a: number, b: number, eps = 1e-5): boolean {
  return Math.abs(a - b) < eps;
}

/** True when the built Simulator policy matches this sweep row’s swept parameters. */
function sweepSummaryMatchesBuilt(summary: SweepPolicySummary, config: SimulationConfig): boolean {
  if (!summary.params) {
    return false;
  }
  const active = config.activePolicy;
  if (summary.params.family === "adaptive" && active.type === "motion_peer_adaptive") {
    const p = summary.params;
    return (
      nearlyEqual(p.baselineDrive, active.baselineDrive) &&
      nearlyEqual(p.motionWeight, active.motionWeight) &&
      nearlyEqual(p.peerWeight, active.peerWeight) &&
      p.tauPeerSeconds === active.tauPeerSeconds
    );
  }
  if (summary.params.family === "fixed" && active.type === "fixed") {
    const p = summary.params;
    return (
      nearlyEqual(p.scanIntervalSeconds, active.scanIntervalSeconds) &&
      nearlyEqual(p.scanWindowSeconds, active.scanWindowSeconds) &&
      nearlyEqual(p.advIntervalSeconds, active.advIntervalSeconds)
    );
  }
  return false;
}

/** Axis explanations for sweep chart popovers — explicit x/y and units. */
const SWEEP_AXES_POPOVER_CAPTURE_VS_ENERGY = (
  <dl className="metric-definition-list">
    <dt>X-axis (horizontal)</dt>
    <dd>
      Mean estimated BLE energy burden for one representative collar over a full simulated day, from the sweep summary row for that
      policy. Values increase left to right; units are milliamp-hours per day (<strong>mAh/day</strong>). Each point is one policy;
      fixed-rate and adaptive policies share this axis.
    </dd>
    <dt>Y-axis (vertical)</dt>
    <dd>
      Mean BLE <strong>capture rate</strong> for that policy (same sweep aggregation): the fraction of social-contact opportunities
      in which the collar logged at least one BLE detection (0 = none, 1 = all opportunities). Higher on the chart means better
      capture; compare points at similar x to see capture differences at comparable energy.
    </dd>
    <dt>Reading the tradeoff</dt>
    <dd>
      For this orientation, policies toward the <strong>upper-left</strong> combine relatively lower energy (smaller mAh/day) with
      relatively higher capture — a favorable direction on both axes. Policies toward the lower-right use more energy for less
      capture.
    </dd>
  </dl>
);

function algBadge(summary: SweepPolicySummary): { letter: string; title: string; className: string } {
  if (summary.isJuxtaReference || summary.kind === "baseline_fixed") {
    return { letter: "J", title: "Juxta 5.6 reference (fixed)", className: "sweep-alg sweep-alg-juxta" };
  }
  if (summary.kind === "fixed_sweep") {
    return { letter: "F", title: "Fixed-rate BLE", className: "sweep-alg sweep-alg-fixed" };
  }
  return { letter: "A", title: "Adaptive BLE", className: "sweep-alg sweep-alg-adaptive" };
}

type ScatterPoint = {
  x: number;
  y: number;
  id: string;
  tooltip: string;
  variant: "adaptive" | "fixed_sweep";
  highlight: boolean;
  /** Non-dominated on mean capture vs mean mAh/day (same as summary CSV). */
  pareto: boolean;
};

/** Columns that get red→yellow→green tint (Alg / Policy stay plain). */
const SWEEP_METRIC_COLUMNS = [
  "rank",
  "bd",
  "mw",
  "pw",
  "tauPeer",
  "scanInt",
  "scanWin",
  "advInt",
  "capture",
  "mAh",
  "efficiency",
  "relCap",
  "relE",
  "meanDrive",
  "pctBelow",
  "pctNear",
  "pctAbove"
] as const;

type SweepMetricColumn = (typeof SWEEP_METRIC_COLUMNS)[number];

const SWEEP_COLUMN_SENTIMENT: Record<SweepMetricColumn, "higherBetter" | "lowerBetter"> = {
  rank: "lowerBetter",
  bd: "higherBetter",
  mw: "higherBetter",
  pw: "higherBetter",
  tauPeer: "higherBetter",
  scanInt: "higherBetter",
  scanWin: "higherBetter",
  advInt: "higherBetter",
  capture: "higherBetter",
  mAh: "lowerBetter",
  efficiency: "higherBetter",
  relCap: "higherBetter",
  relE: "lowerBetter",
  meanDrive: "higherBetter",
  pctBelow: "higherBetter",
  pctNear: "higherBetter",
  pctAbove: "higherBetter"
};

function sweepRowDerivedMetrics(summary: SweepPolicySummary, rawRows: SweepRawRow[]) {
  const samples = rawRows.filter((row) => row.policyId === summary.policyId);
  const avgNullable = (pick: (row: SweepRawRow) => number | null) => {
    const values = samples.map(pick).filter((value): value is number => value != null);
    if (values.length === 0) {
      return null;
    }
    return values.reduce((accumulator, value) => accumulator + value, 0) / values.length;
  };
  return {
    meanDrive: avgNullable((row) => row.meanSamplingDrive),
    pctBelow: avgNullable((row) => row.percentTimeBelowFixed),
    pctNear: avgNullable((row) => row.percentTimeNearFixed),
    pctAbove: avgNullable((row) => row.percentTimeAboveFixed)
  };
}

function extractSweepMetricValue(
  summary: SweepPolicySummary,
  rank: number | null,
  column: SweepMetricColumn,
  rawRows: SweepRawRow[]
): number | null {
  if (column === "rank") {
    return rank;
  }
  const p = summary.params;
  if (column === "bd") {
    return p?.family === "adaptive" ? p.baselineDrive : null;
  }
  if (column === "mw") {
    return p?.family === "adaptive" ? p.motionWeight : null;
  }
  if (column === "pw") {
    return p?.family === "adaptive" ? p.peerWeight : null;
  }
  if (column === "tauPeer") {
    return p?.family === "adaptive" ? p.tauPeerSeconds : null;
  }
  if (column === "scanInt") {
    return p?.family === "fixed" ? p.scanIntervalSeconds : null;
  }
  if (column === "scanWin") {
    return p?.family === "fixed" ? p.scanWindowSeconds : null;
  }
  if (column === "advInt") {
    return p?.family === "fixed" ? p.advIntervalSeconds : null;
  }
  if (column === "capture") {
    return summary.meanCaptureRate;
  }
  if (column === "mAh") {
    return summary.meanMahPerDay;
  }
  if (column === "efficiency") {
    return summary.meanBleEfficiency;
  }
  if (column === "relCap") {
    return summary.meanRelativeCapture;
  }
  if (column === "relE") {
    return summary.meanRelativeEnergy;
  }
  const derived = sweepRowDerivedMetrics(summary, rawRows);
  if (column === "meanDrive") {
    return derived.meanDrive;
  }
  if (column === "pctBelow") {
    return derived.pctBelow;
  }
  if (column === "pctNear") {
    return derived.pctNear;
  }
  if (column === "pctAbove") {
    return derived.pctAbove;
  }
  return null;
}

function buildSweepColumnRanges(
  rows: Array<{ summary: SweepPolicySummary; rank: number | null }>,
  rawRows: SweepRawRow[]
): Record<SweepMetricColumn, { min: number; max: number } | null> {
  const ranges = {} as Record<SweepMetricColumn, { min: number; max: number } | null>;
  for (const column of SWEEP_METRIC_COLUMNS) {
    const values: number[] = [];
    for (const { summary, rank } of rows) {
      const v = extractSweepMetricValue(summary, rank, column, rawRows);
      if (v != null && Number.isFinite(v)) {
        values.push(v);
      }
    }
    ranges[column] =
      values.length === 0 ? null : { min: Math.min(...values), max: Math.max(...values) };
  }
  return ranges;
}

function sweepMetricCellBackground(
  value: number | null,
  min: number,
  max: number,
  sentiment: "higherBetter" | "lowerBetter"
): CSSProperties {
  if (value == null || !Number.isFinite(value)) {
    return { backgroundColor: "hsla(40, 30%, 16%, 0.5)" };
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || Math.abs(max - min) < 1e-12) {
    return { backgroundColor: "hsla(52, 50%, 16%, 0.65)" };
  }
  const tRaw =
    sentiment === "higherBetter" ? (value - min) / (max - min) : (max - value) / (max - min);
  const t = Math.max(0, Math.min(1, tRaw));
  const hue = t * 120;
  return { backgroundColor: `hsla(${hue}, 50%, 15%, 0.68)` };
}

function metricStylesForRow(
  summary: SweepPolicySummary,
  rank: number | null,
  rawRows: SweepRawRow[],
  ranges: Record<SweepMetricColumn, { min: number; max: number } | null>
): Record<SweepMetricColumn, CSSProperties> {
  const styles = {} as Record<SweepMetricColumn, CSSProperties>;
  for (const column of SWEEP_METRIC_COLUMNS) {
    const v = extractSweepMetricValue(summary, rank, column, rawRows);
    const span = ranges[column];
    styles[column] =
      span == null
        ? sweepMetricCellBackground(null, 0, 1, "higherBetter")
        : sweepMetricCellBackground(v, span.min, span.max, SWEEP_COLUMN_SENTIMENT[column]);
  }
  return styles;
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
  /** Baseline + all policies, sorted by mean BLE efficiency (table and summary CSV). */
  const tableRowsRanked = useMemo(() => {
    if (!sweepResult) {
      return [];
    }
    return [sweepResult.baselineSummary, ...sweepResult.summaries].sort(
      (a, b) => b.meanBleEfficiency - a.meanBleEfficiency
    );
  }, [sweepResult]);

  /** Sweep summaries only (plots keep a separate dashed Juxta reference point). */
  const summariesByEfficiency = useMemo(() => {
    if (!sweepResult) {
      return [];
    }
    return [...sweepResult.summaries].sort((a, b) => b.meanBleEfficiency - a.meanBleEfficiency);
  }, [sweepResult]);

  const sweepTableMetricStyles = useMemo(() => {
    if (!sweepResult) {
      return null;
    }
    const rows = tableRowsRanked.map((summary, index) => ({
      summary,
      rank: index + 1
    }));
    const ranges = buildSweepColumnRanges(rows, sweepResult.rawRows);
    const byPolicy = new Map<string, Record<SweepMetricColumn, CSSProperties>>();
    for (let index = 0; index < tableRowsRanked.length; index++) {
      const summary = tableRowsRanked[index]!;
      byPolicy.set(
        summary.policyId,
        metricStylesForRow(summary, index + 1, sweepResult.rawRows, ranges)
      );
    }
    return { byPolicy };
  }, [sweepResult, tableRowsRanked]);

  const captureVsEnergyPoints = useMemo((): ScatterPoint[] => {
    return summariesByEfficiency.map((summary) => ({
      x: summary.meanMahPerDay,
      y: summary.meanCaptureRate,
      id: summary.policyId,
      tooltip: policyHoverLabel(summary),
      variant: summary.kind === "adaptive" ? "adaptive" : "fixed_sweep",
      highlight: sweepSummaryMatchesBuilt(summary, baseConfig),
      pareto: summary.isParetoEfficient
    }));
  }, [summariesByEfficiency, baseConfig]);

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
      serializeSweepSummaryCsv(sweepResult),
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
  const sweepTableColSpan = 20;

  return (
    <div className="sweep-report-panel">
      {sweepResult ? (
        <SweepCandidatesSection candidates={sweepResult.candidates} baseline={sweepResult.baselineSummary} />
      ) : (
        <SweepRecommendationsPlaceholder />
      )}

      <div className="sweep-plots-grid sweep-plots-grid--single">
        {sweepResult ? (
          <SweepScatterPlot
            axesPopoverTitle="Capture rate vs energy — axes"
            axesPopoverChildren={SWEEP_AXES_POPOVER_CAPTURE_VS_ENERGY}
            title="Capture rate vs energy"
            subtitle="Upper-left is better capture at lower energy (same layout as the Optimizer analysis chart)."
            xLabel="mAh/day"
            yLabel="BLE capture rate"
            baselinePoint={{
              x: sweepResult.baselineSummary.meanMahPerDay,
              y: sweepResult.baselineSummary.meanCaptureRate,
              label: "Juxta 5.6",
              tooltip: `Juxta 5.6 reference (${sweepResult.baselineSummary.policyId}) — 20s scan interval / 1.5s scan window / 5s advertise interval; dashed ring distinguishes reference among yellow fixed-rate points`,
              pareto: sweepResult.baselineSummary.isParetoEfficient
            }}
            baselineMatchesBuilt={sweepSummaryMatchesBuilt(sweepResult.baselineSummary, baseConfig)}
            points={captureVsEnergyPoints}
          />
        ) : (
          <SweepPlotPlaceholder
            axesPopoverTitle="Capture rate vs energy — axes"
            axesPopoverChildren={SWEEP_AXES_POPOVER_CAPTURE_VS_ENERGY}
            title="Capture rate vs energy"
            subtitle="Upper-left is better capture at lower energy."
            hint="Hover points after a sweep for policy id. Legend below shows marker meanings."
          />
        )}
      </div>

      <div className="sweep-table-section">
        <div className="panel-title-row">
          <h3>Candidate table (mean across seeds)</h3>
          <InfoPopover label="Explain candidate table columns" title="Candidate table columns">
            <dl className="metric-definition-list">
              <dt>Rank</dt>
              <dd>Order by mean BLE efficiency across every policy in the sweep, including Juxta 5.6 (1 = highest).</dd>
              <dt>Alg</dt>
              <dd>
                <strong>J</strong> = Juxta 5.6 reference (fixed), <strong>F</strong> = other fixed-rate schedule,{" "}
                <strong>A</strong> = adaptive.
              </dd>
              <dt>Cell tint</dt>
              <dd>
                Each numeric column uses a red→yellow→green scale from worst to best within that column across all rows
                (including Juxta). mAh/day and relative energy are greener when lower; capture, efficiency, and most other
                metrics are greener when higher. Schedule and adaptive parameter columns use highest value as green when the
                tradeoff is ambiguous. Em dash cells are neutral.
              </dd>
              <dt>Policy</dt>
              <dd>
                Sweep policy id. Use <strong>Simulate</strong> to load into the Simulator tab (auto-build). Violet outline
                on plots marks the policy matching your current built simulation when applicable.
              </dd>
              <dt>bd / mw / pw / τ peer</dt>
              <dd>Adaptive swept parameters only (— for fixed-rate rows).</dd>
              <dt>Scan / Win / Advertise</dt>
              <dd>
                Configured fixed-rate schedule: <strong>scan interval</strong>, <strong>scan (listen) window</strong>, and{" "}
                <strong>advertise interval</strong> (seconds between advertising bursts). Em dash for adaptive rows.
              </dd>
              <dt>Capture</dt>
              <dd>Mean interval-level BLE capture rate across seeds included in this run.</dd>
              <dt>mAh/day</dt>
              <dd>Mean estimated representative-collar BLE energy burden (milliamp-hours per day).</dd>
              <dt>Efficiency</dt>
              <dd>BLE hits per unit energy (capture rate scaled by estimated mAh/day), same notion as simulator metrics panels.</dd>
              <dt>Pareto</dt>
              <dd>
                Yes if this policy is <strong>not dominated</strong> on mean capture rate vs mean mAh/day by any other policy
                in the sweep (including Juxta). Same rule as the green outline on scatter plots.
              </dd>
              <dt>Rel cap</dt>
              <dd>{`Mean relative capture vs Juxta 5.6 (< 1 weaker, > 1 stronger).`}</dd>
              <dt>Rel E</dt>
              <dd>{`Mean relative BLE energy vs Juxta 5.6 (< 1 uses less energy).`}</dd>
              <dt>Mean drive</dt>
              <dd>Adaptive mean sampling drive (— for fixed-rate).</dd>
              <dt>% below / near / above</dt>
              <dd>Adaptive drive distribution vs fixed-rate band (— for fixed-rate).</dd>
            </dl>
          </InfoPopover>
        </div>
        <div className="table-wrap">
          <table className="sweep-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th title="Algorithm family">Alg</th>
                <th>Policy</th>
                <th>bd</th>
                <th>mw</th>
                <th>pw</th>
                <th>τ peer</th>
                <th title="BLE scan interval">Scan int. (s)</th>
                <th title="Scan burst listen window">Scan win. (s)</th>
                <th title="Interval between advertising bursts">Advertise int. (s)</th>
                <th>Capture</th>
                <th>mAh/day</th>
                <th>Efficiency</th>
                <th title="Non-dominated on capture vs mAh/day">Pareto</th>
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
                  {tableRowsRanked.map((summary, index) => (
                    <SweepTableRow
                      key={summary.policyId}
                      rank={index + 1}
                      metricStyles={sweepTableMetricStyles?.byPolicy.get(summary.policyId)}
                      summary={summary}
                      rawRows={sweepResult.rawRows}
                      baseConfig={baseConfig}
                      onSimulatePolicy={onSimulatePolicy}
                      simulateDisabled={simulateDisabled}
                    />
                  ))}
                </>
              ) : (
                <tr>
                  <td colSpan={sweepTableColSpan} className="sweep-table-placeholder-cell">
                    Fixed-rate (including Juxta 5.6) and adaptive policies appear here ranked by efficiency after you run a sweep.
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
  metricStyles,
  summary,
  rawRows,
  baseConfig,
  onSimulatePolicy,
  simulateDisabled
}: {
  rank: number;
  metricStyles: Record<SweepMetricColumn, CSSProperties> | undefined;
  summary: SweepPolicySummary;
  rawRows: SweepRawRow[];
  baseConfig: SimulationConfig;
  onSimulatePolicy?: (summary: SweepPolicySummary) => void;
  simulateDisabled?: boolean;
}) {
  const derived = sweepRowDerivedMetrics(summary, rawRows);
  const meanDrive = derived.meanDrive;
  const pctBelow = derived.pctBelow;
  const pctNear = derived.pctNear;
  const pctAbove = derived.pctAbove;
  const cell = (column: SweepMetricColumn): CSSProperties | undefined => metricStyles?.[column];

  const canSimulate = Boolean(summary.params && onSimulatePolicy);
  const badge = algBadge(summary);
  const matchesBuilt = sweepSummaryMatchesBuilt(summary, baseConfig);
  const p = summary.params;

  const bd = p?.family === "adaptive" ? p.baselineDrive : "—";
  const mw = p?.family === "adaptive" ? p.motionWeight : "—";
  const pw = p?.family === "adaptive" ? p.peerWeight : "—";
  const tau = p?.family === "adaptive" ? p.tauPeerSeconds : "—";
  const scanInt = p?.family === "fixed" ? p.scanIntervalSeconds : "—";
  const scanWin = p?.family === "fixed" ? p.scanWindowSeconds : "—";
  const advInt = p?.family === "fixed" ? p.advIntervalSeconds : "—";

  return (
    <tr className={matchesBuilt ? "sweep-table-row-matches-built" : undefined}>
      <td style={cell("rank")}>{rank}</td>
      <td>
        <span className={badge.className} title={badge.title}>
          {badge.letter}
        </span>
      </td>
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
      <td style={cell("bd")}>{bd}</td>
      <td style={cell("mw")}>{mw}</td>
      <td style={cell("pw")}>{pw}</td>
      <td style={cell("tauPeer")}>{tau}</td>
      <td style={cell("scanInt")}>{scanInt}</td>
      <td style={cell("scanWin")}>{scanWin}</td>
      <td style={cell("advInt")}>{advInt}</td>
      <td style={cell("capture")}>{summary.meanCaptureRate.toFixed(4)}</td>
      <td style={cell("mAh")}>{summary.meanMahPerDay.toFixed(4)}</td>
      <td style={cell("efficiency")}>{summary.meanBleEfficiency.toFixed(4)}</td>
      <td>{summary.isParetoEfficient ? "Yes" : "No"}</td>
      <td style={cell("relCap")}>{summary.meanRelativeCapture.toFixed(3)}</td>
      <td style={cell("relE")}>{summary.meanRelativeEnergy.toFixed(3)}</td>
      <td style={cell("meanDrive")}>{meanDrive != null ? meanDrive.toFixed(3) : "—"}</td>
      <td style={cell("pctBelow")}>{pctBelow != null ? pctBelow.toFixed(1) : "—"}</td>
      <td style={cell("pctNear")}>{pctNear != null ? pctNear.toFixed(1) : "—"}</td>
      <td style={cell("pctAbove")}>{pctAbove != null ? pctAbove.toFixed(1) : "—"}</td>
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
    bestFixed: "Best fixed-rate (vs pool incl. Juxta 5.6)",
    bestAdaptive: "Best adaptive"
  };

  return (
    <section className="sweep-candidates">
      <h3>Efficiency comparison</h3>
      <p className="helper-text sweep-candidates-intro">
        Highest mean BLE efficiency in each family. Fixed-rate sweep spans scan interval, scan window, and{" "}
        <strong>advertise interval</strong> (2 s burst held constant). Metrics are relative to Juxta 5.6 ({baseline.policyId}
        ).
      </p>
      <div className="sweep-candidate-cards sweep-candidate-cards--vs">
        {candidates.map((pick) => (
          <div key={pick.role} className="sweep-candidate-card">
            <h4>{titles[pick.role]}</h4>
            {!pick.summary ? (
              <p className="helper-text">None selected.</p>
            ) : (
              <>
                <p className="sweep-candidate-id">{pick.summary.policyId}</p>
                <ul className="sweep-candidate-metrics">
                  <li>Mean capture: {pick.summary.meanCaptureRate.toFixed(4)} (Juxta ref {baseline.meanCaptureRate.toFixed(4)})</li>
                  <li>Relative capture: {pick.summary.meanRelativeCapture.toFixed(3)}</li>
                  <li>Mean mAh/day: {pick.summary.meanMahPerDay.toFixed(4)}</li>
                  <li>Efficiency (cap / mAh·day): {pick.summary.meanBleEfficiency.toFixed(4)}</li>
                  <li>Threshold note: {pick.meetsThreshold ? "criteria met" : "see note below"}</li>
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

const SWEEP_CANDIDATE_CARD_TITLES = ["Best fixed-rate", "Best adaptive"] as const;

function SweepRecommendationsPlaceholder() {
  return (
    <section className="sweep-candidates sweep-candidates--placeholder">
      <h3>Top recommendations</h3>
      <div className="sweep-candidate-cards">
        {SWEEP_CANDIDATE_CARD_TITLES.map((title) => (
          <div key={title} className="sweep-candidate-card sweep-candidate-card--placeholder">
            <h4>{title}</h4>
            <p className="helper-text sweep-placeholder-text">
              Best fixed vs best adaptive (by efficiency) appear here after you run a sweep from the sidebar.
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SweepPlotPlaceholder({
  axesPopoverTitle,
  axesPopoverChildren,
  title,
  subtitle,
  hint
}: {
  axesPopoverTitle: string;
  axesPopoverChildren: ReactNode;
  title: string;
  subtitle: string;
  hint: string;
}) {
  return (
    <figure className="sweep-plot sweep-plot--placeholder">
      <div className="panel-title-row sweep-plot-title-row">
        <figcaption className="sweep-plot-figcaption">
          <strong>{title}</strong>
          <span className="helper-text">{subtitle}</span>
        </figcaption>
        <InfoPopover label="What the axes mean" title={axesPopoverTitle}>
          {axesPopoverChildren}
        </InfoPopover>
      </div>
      <div className="sweep-plot-placeholder-frame" aria-hidden="true">
        Scatter plot renders here when the sweep finishes.
      </div>
      <SweepPlotLegendHtml />
      <span className="sweep-plot-hint">{hint}</span>
    </figure>
  );
}

/** Legend below the chart (same marker language as the Simulation tab time-series legends). */
function SweepPlotLegendHtml() {
  return (
    <div className="chart-legend sweep-chart-legend" aria-label="Plot legend">
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--fixed" aria-hidden />
        Fixed-rate sweep
      </span>
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--adaptive" aria-hidden />
        Adaptive sweep
      </span>
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--juxta" aria-hidden />
        Juxta 5.6 reference
      </span>
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--built" aria-hidden />
        Matches built simulator
      </span>
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--pareto" aria-hidden />
        Pareto-efficient
      </span>
    </div>
  );
}

function SweepScatterPlot({
  axesPopoverTitle,
  axesPopoverChildren,
  title,
  subtitle,
  xLabel,
  yLabel,
  baselinePoint,
  baselineMatchesBuilt,
  points
}: {
  axesPopoverTitle: string;
  axesPopoverChildren: ReactNode;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  baselinePoint: { x: number; y: number; label: string; tooltip: string; pareto?: boolean };
  baselineMatchesBuilt: boolean;
  points: ScatterPoint[];
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
  const bx = sx(baselinePoint.x);
  const by = sy(baselinePoint.y);

  return (
    <figure className="sweep-plot">
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
        {points.map((point) => {
          const cx = sx(point.x);
          const cy = sy(point.y);
          const fill = point.variant === "adaptive" ? "#7dd3fc" : "#fbbf24";
          return (
            <g key={point.id}>
              <title>{point.tooltip}</title>
              {point.pareto ? (
                <circle cx={cx} cy={cy} r={8} fill="none" stroke="#34d399" strokeWidth={1.75} />
              ) : null}
              {point.highlight ? (
                <circle cx={cx} cy={cy} r={11} fill="none" stroke="#a78bfa" strokeWidth={2} />
              ) : null}
              <circle cx={cx} cy={cy} r={5} fill={fill} opacity={0.92} />
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
        <text x={bx + 12} y={by - 10} fill="#e7eef6" fontSize={SWEEP_PLOT_SVG_FONT_BASELINE_LABEL}>
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
      <SweepPlotLegendHtml />
      <span className="sweep-plot-hint">Hover points for policy id.</span>
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
