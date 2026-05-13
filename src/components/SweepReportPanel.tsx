import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { InfoPopover } from "./InfoPopover";
import type { SimulationConfig } from "../simulation/types";
import type { CandidatePick, SweepPolicySummary } from "../simulation/sweep/sweepCandidates";
import type { SweepBundleWithCandidates, SweepRawRow } from "../simulation/sweep/adaptiveBleSweep";
import {
  buildSweepMarkdownReport,
  serializeSweepRawCsv,
  serializeSweepSummaryCsv
} from "../simulation/sweep/sweepExport";

const SWEEP_PLOT_WIDTH = 920;
const SWEEP_PLOT_HEIGHT = 440;
const SWEEP_PLOT_PAD = { left: 58, right: 24, top: 34, bottom: 48 };
const SWEEP_PLOT_SVG_FONT_AXIS = 14;
const SWEEP_PLOT_SVG_FONT_TICK = 11;

/** Inclusive tick positions from `min` to `max` (axis domain after padding). */
function sweepAxisTicks(min: number, max: number, tickCount: number): number[] {
  if (tickCount <= 1 || max < min) {
    return [min, max];
  }
  return Array.from({ length: tickCount }, (_, index) => min + ((max - min) * index) / (tickCount - 1));
}

function formatSweepScatterXTick(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function formatSweepScatterYTick(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(3);
}

function policyHoverLabel(summary: SweepPolicySummary): string {
  return `${summary.policyId} — ${summary.label}`;
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
  if (summary.isComparisonBaseline || summary.kind === "baseline_fixed") {
    return { letter: "B", title: "Comparison baseline (fixed)", className: "sweep-alg sweep-alg-juxta" };
  }
  if (summary.kind === "baseline_fixed_inactive_scan_x3") {
    return {
      letter: "3",
      title: "Baseline schedule with bout-delayed inactive scan ×3",
      className: "sweep-alg sweep-alg-fixed-i3"
    };
  }
  if (summary.kind === "baseline_fixed_inactive_scan_x5") {
    return {
      letter: "5",
      title: "Baseline schedule with bout-delayed inactive scan ×5",
      className: "sweep-alg sweep-alg-fixed-i5"
    };
  }
  if (summary.kind === "fixed_sweep_inactive_scan_x3") {
    return {
      letter: "3",
      title: "Fixed-rate sweep with bout-delayed inactive scan ×3",
      className: "sweep-alg sweep-alg-fixed-i3"
    };
  }
  if (summary.kind === "fixed_sweep_inactive_scan_x5") {
    return {
      letter: "5",
      title: "Fixed-rate sweep with bout-delayed inactive scan ×5",
      className: "sweep-alg sweep-alg-fixed-i5"
    };
  }
  if (summary.kind === "fixed_sweep") {
    return { letter: "F", title: "Fixed-rate BLE", className: "sweep-alg sweep-alg-fixed" };
  }
  return { letter: "A", title: "Adaptive BLE", className: "sweep-alg sweep-alg-adaptive" };
}

function scatterVariantFromSummary(summary: SweepPolicySummary): ScatterPoint["variant"] {
  if (summary.kind === "adaptive") {
    return "adaptive";
  }
  if (
    summary.kind === "baseline_fixed_inactive_scan_x3" ||
    summary.kind === "fixed_sweep_inactive_scan_x3"
  ) {
    return "fixed_inactive_x3";
  }
  if (
    summary.kind === "baseline_fixed_inactive_scan_x5" ||
    summary.kind === "fixed_sweep_inactive_scan_x5"
  ) {
    return "fixed_inactive_x5";
  }
  return "fixed_no_inactive";
}

type ScatterPoint = {
  x: number;
  y: number;
  id: string;
  tooltip: string;
  variant: "adaptive" | "fixed_no_inactive" | "fixed_inactive_x3" | "fixed_inactive_x5";
  /** Non-dominated on mean capture vs mean mAh/day (same as summary CSV). */
  pareto: boolean;
};

/** Columns that get red→yellow→green tint (Alg / Policy stay plain). */
const SWEEP_METRIC_COLUMNS = [
  "rank",
  "pareto",
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
  "meanDrive"
] as const;

type SweepMetricColumn = (typeof SWEEP_METRIC_COLUMNS)[number];

const SWEEP_TABLE_SORT_KEYS = [
  "pareto",
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
  "meanDrive"
] as const;

type SweepTableSortKey = (typeof SWEEP_TABLE_SORT_KEYS)[number];

const SWEEP_COLUMN_SENTIMENT: Record<SweepMetricColumn, "higherBetter" | "lowerBetter"> = {
  rank: "lowerBetter",
  pareto: "higherBetter",
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
  meanDrive: "higherBetter"
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
    meanDrive: avgNullable((row) => row.meanSamplingDrive)
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
  if (column === "pareto") {
    return summary.isParetoEfficient ? 1 : 0;
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
  const derived = sweepRowDerivedMetrics(summary, rawRows);
  if (column === "meanDrive") {
    return derived.meanDrive;
  }
  return null;
}

function defaultSortDirection(key: SweepTableSortKey): "asc" | "desc" {
  if (key === "mAh") {
    return "asc";
  }
  if (key === "pareto") {
    return "desc";
  }
  return "desc";
}

function sortValueForColumn(
  summary: SweepPolicySummary,
  key: SweepTableSortKey,
  rawRows: SweepRawRow[]
): number | null {
  return extractSweepMetricValue(summary, null, key as SweepMetricColumn, rawRows);
}

function compareSummariesForSort(
  a: SweepPolicySummary,
  b: SweepPolicySummary,
  key: SweepTableSortKey,
  dir: "asc" | "desc",
  rawRows: SweepRawRow[]
): number {
  const va = sortValueForColumn(a, key, rawRows);
  const vb = sortValueForColumn(b, key, rawRows);
  const sign = dir === "asc" ? 1 : -1;
  if (va == null && vb == null) {
    return a.policyId.localeCompare(b.policyId);
  }
  if (va == null) {
    return 1;
  }
  if (vb == null) {
    return -1;
  }
  if (va === vb) {
    return a.policyId.localeCompare(b.policyId);
  }
  return sign * (va - vb);
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
  sweepResult: SweepBundleWithCandidates | null;
  onSimulatePolicy?: (summary: SweepPolicySummary) => void;
  simulateDisabled?: boolean;
};

export function SweepReportPanel({
  baseConfig,
  sweepResult,
  onSimulatePolicy,
  simulateDisabled = false
}: SweepReportPanelProps) {
  const [tableSortKey, setTableSortKey] = useState<SweepTableSortKey>("efficiency");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">(() => defaultSortDirection("efficiency"));

  /** Baseline + all policies (unsorted multiset for resorting). */
  const policiesUnordered = useMemo(() => {
    if (!sweepResult) {
      return [];
    }
    return [sweepResult.baselineSummary, ...sweepResult.summaries];
  }, [sweepResult]);

  /** Candidate table row order (sortable). */
  const displayedPolicies = useMemo(() => {
    if (!sweepResult || policiesUnordered.length === 0) {
      return [];
    }
    const copy = [...policiesUnordered];
    copy.sort((a, b) => compareSummariesForSort(a, b, tableSortKey, tableSortDir, sweepResult.rawRows));
    return copy;
  }, [policiesUnordered, sweepResult, tableSortKey, tableSortDir]);

  /** Policies for capture vs energy (comparison baseline included; one marker per policy). */
  const scatterPlotPolicies = useMemo(() => {
    if (!sweepResult) {
      return [];
    }
    return [sweepResult.baselineSummary, ...sweepResult.summaries].sort(
      (a, b) => b.meanBleEfficiency - a.meanBleEfficiency
    );
  }, [sweepResult]);

  const sweepTableMetricStyles = useMemo(() => {
    if (!sweepResult) {
      return null;
    }
    const rows = displayedPolicies.map((summary, index) => ({
      summary,
      rank: index + 1
    }));
    const ranges = buildSweepColumnRanges(rows, sweepResult.rawRows);
    const byPolicy = new Map<string, Record<SweepMetricColumn, CSSProperties>>();
    for (let index = 0; index < displayedPolicies.length; index++) {
      const summary = displayedPolicies[index]!;
      byPolicy.set(
        summary.policyId,
        metricStylesForRow(summary, index + 1, sweepResult.rawRows, ranges)
      );
    }
    return { byPolicy };
  }, [sweepResult, displayedPolicies]);

  const onSortColumnHeader = (key: SweepTableSortKey) => {
    if (tableSortKey === key) {
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTableSortKey(key);
      setTableSortDir(defaultSortDirection(key));
    }
  };

  const captureVsEnergyPoints = useMemo((): ScatterPoint[] => {
    return scatterPlotPolicies.map((summary) => ({
      x: summary.meanMahPerDay,
      y: summary.meanCaptureRate,
      id: summary.policyId,
      tooltip: policyHoverLabel(summary),
      variant: scatterVariantFromSummary(summary),
      pareto: summary.isParetoEfficient
    }));
  }, [scatterPlotPolicies]);

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
  const sweepTableColSpan = 14;

  return (
    <div className="sweep-report-panel">
      {sweepResult ? (
        <SweepFixedAdaptiveComparisonTable
          baseline={sweepResult.baselineSummary}
          candidates={sweepResult.candidates}
          onSimulatePolicy={onSimulatePolicy}
          simulateDisabled={simulateDisabled}
        />
      ) : (
        <SweepComparisonPlaceholder />
      )}

      <div className="sweep-plots-grid sweep-plots-grid--single">
        {sweepResult ? (
          <SweepScatterPlot
            axesPopoverTitle="Capture rate vs energy — axes"
            axesPopoverChildren={SWEEP_AXES_POPOVER_CAPTURE_VS_ENERGY}
            title="Capture rate vs energy"
            subtitle="Upper-left is better capture at lower energy (standard capture-vs-energy tradeoff plot)."
            xLabel="mAh/day"
            yLabel="BLE capture rate"
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
              <dd>Current row index after sorting (1 = top row). Sort with column headers to change order.</dd>
              <dt>Alg</dt>
              <dd>
                <strong>B</strong> = comparison baseline (fixed), <strong>F</strong> = fixed-rate schedule without inactive scan
                multiplier, <strong>D</strong> = inactive scan ×2, <strong>5</strong> = inactive scan ×5, <strong>A</strong>{" "}
                = adaptive. Hover the badge for the full policy id. Use <strong>Simulate</strong> to load the row into the Simulator
                tab.
              </dd>
              <dt>Pareto</dt>
              <dd>
                <code>true</code> / <code>false</code> for whether the policy is non-dominated on mean capture vs mean mAh/day among
                all sweep rows (including the comparison baseline). Sort this column to group efficient policies.
              </dd>
              <dt>Cell tint</dt>
              <dd>
                Each numeric column uses a red→yellow→green scale from worst to best within that column across all rows
                (including the comparison baseline). mAh/day is greener when lower; capture, efficiency, and most other metrics
                are greener when higher. Schedule and adaptive parameter columns use highest value as green when the tradeoff is
                ambiguous. Em dash cells are neutral. The <strong>Pareto</strong> column uses the same tint scale (true ranks above
                false).
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
              <dt>Eff.</dt>
              <dd>BLE hits per unit energy (capture rate scaled by estimated mAh/day), same notion as simulator metrics panels.</dd>
              <dt>Mean drive</dt>
              <dd>Adaptive mean sampling drive (— for fixed-rate).</dd>
            </dl>
          </InfoPopover>
        </div>
        <div className="table-wrap">
          <table className="sweep-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th scope="col" title="Algorithm family (hover badge for policy id)">
                  Alg
                </th>
                <SweepSortableTh
                  columnKey="pareto"
                  label="Pareto"
                  hint="Non-dominated on mean capture vs mean mAh/day (true / false)"
                  activeKey={tableSortKey}
                  dir={tableSortDir}
                  onSort={onSortColumnHeader}
                />
                {(
                  [
                    ["bd", "bd", "Adaptive baseline drive"],
                    ["mw", "mw", "Motion weight"],
                    ["pw", "pw", "Peer weight"],
                    ["tauPeer", "τ peer", "τ peer (s)"],
                    ["scanInt", "Scan int. (s)", "BLE scan interval"],
                    ["scanWin", "Scan win. (s)", "Scan burst listen window"],
                    ["advInt", "Adv. Int. (s)", "Interval between advertising bursts"],
                    ["capture", "Capture", "Mean BLE capture rate"],
                    ["mAh", "mAh/day", "Mean energy burden"],
                    ["efficiency", "Eff.", "BLE efficiency (capture / mAh·day)"],
                    ["meanDrive", "Mean drive", "Adaptive mean sampling drive"]
                  ] as const
                ).map(([key, label, hint]) => (
                  <SweepSortableTh
                    key={key}
                    columnKey={key as SweepTableSortKey}
                    label={label}
                    hint={hint}
                    activeKey={tableSortKey}
                    dir={tableSortDir}
                    onSort={onSortColumnHeader}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sweepResult ? (
                <>
                  {displayedPolicies.map((summary, index) => (
                    <SweepTableRow
                      key={summary.policyId}
                      rank={index + 1}
                      metricStyles={sweepTableMetricStyles?.byPolicy.get(summary.policyId)}
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
                    Fixed-rate (including the comparison baseline) and adaptive policies appear here after you run a sweep. Use column
                    headers to sort.
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

function SweepSortableTh({
  columnKey,
  label,
  hint,
  activeKey,
  dir,
  onSort
}: {
  columnKey: SweepTableSortKey;
  label: string;
  hint: string;
  activeKey: SweepTableSortKey;
  dir: "asc" | "desc";
  onSort: (key: SweepTableSortKey) => void;
}) {
  const active = activeKey === columnKey;
  return (
    <th
      className="sweep-th-sortable"
      scope="col"
      tabIndex={0}
      title={hint}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      onClick={() => onSort(columnKey)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSort(columnKey);
        }
      }}
    >
      {label}
      {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}

function SweepTableRow({
  rank,
  metricStyles,
  summary,
  rawRows,
  onSimulatePolicy,
  simulateDisabled
}: {
  rank: number;
  metricStyles: Record<SweepMetricColumn, CSSProperties> | undefined;
  summary: SweepPolicySummary;
  rawRows: SweepRawRow[];
  onSimulatePolicy?: (summary: SweepPolicySummary) => void;
  simulateDisabled?: boolean;
}) {
  const derived = sweepRowDerivedMetrics(summary, rawRows);
  const meanDrive = derived.meanDrive;
  const cell = (column: SweepMetricColumn): CSSProperties | undefined => metricStyles?.[column];

  const canSimulate = Boolean(summary.params && onSimulatePolicy);
  const badge = algBadge(summary);
  const p = summary.params;

  const bd = p?.family === "adaptive" ? p.baselineDrive : "—";
  const mw = p?.family === "adaptive" ? p.motionWeight : "—";
  const pw = p?.family === "adaptive" ? p.peerWeight : "—";
  const tau = p?.family === "adaptive" ? p.tauPeerSeconds : "—";
  const scanInt = p?.family === "fixed" ? p.scanIntervalSeconds : "—";
  const scanWin = p?.family === "fixed" ? p.scanWindowSeconds : "—";
  const advInt = p?.family === "fixed" ? p.advIntervalSeconds : "—";

  const policyTip = policyHoverLabel(summary);

  return (
    <tr>
      <td style={cell("rank")}>{rank}</td>
      <td className="sweep-alg-cell">
        <span className="sweep-alg-hover" title={policyTip}>
          <span className={badge.className} title={badge.title}>
            {badge.letter}
          </span>
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
        </span>
      </td>
      <td className="sweep-pareto-bool-cell" style={cell("pareto")}>
        {summary.isParetoEfficient ? "true" : "false"}
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
      <td style={cell("meanDrive")}>{meanDrive != null ? meanDrive.toFixed(3) : "—"}</td>
    </tr>
  );
}

function SweepFixedAdaptiveComparisonTable({
  baseline,
  candidates,
  onSimulatePolicy,
  simulateDisabled
}: {
  baseline: SweepPolicySummary;
  candidates: CandidatePick[];
  onSimulatePolicy?: (summary: SweepPolicySummary) => void;
  simulateDisabled?: boolean;
}) {
  const bestFixed = candidates.find((c) => c.role === "bestFixed")?.summary ?? null;
  const bestAdaptive = candidates.find((c) => c.role === "bestAdaptive")?.summary ?? null;

  const policyCell = (summary: SweepPolicySummary | null) => {
    if (!summary) {
      return (
        <td className="sweep-comparison-cell">
          <span className="sweep-comparison-empty">—</span>
        </td>
      );
    }
    const canSim = Boolean(summary.params && onSimulatePolicy);
    return (
      <td className="sweep-comparison-cell">
        <div className="sweep-comparison-stack">
          <code className="sweep-comparison-policy-id" title={policyHoverLabel(summary)}>
            {summary.policyId}
          </code>
          {canSim ? (
            <button
              type="button"
              className="sweep-policy-simulate-button"
              disabled={simulateDisabled}
              onClick={() => onSimulatePolicy?.(summary)}
            >
              Simulate
            </button>
          ) : null}
        </div>
      </td>
    );
  };

  const numCell = (summary: SweepPolicySummary | null, pick: (s: SweepPolicySummary) => number, decimals: number) => (
    <td className="sweep-comparison-cell">{summary ? pick(summary).toFixed(decimals) : "—"}</td>
  );

  return (
    <div className="sweep-comparison-table-wrap">
      <table className="sweep-comparison-table">
        <colgroup>
          <col className="sweep-comparison-col-corner" />
          <col className="sweep-comparison-col-data" />
          <col className="sweep-comparison-col-data" />
          <col className="sweep-comparison-col-data" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="sweep-comparison-corner" />
            <th scope="col">Baseline</th>
            <th scope="col">Best fixed</th>
            <th scope="col">Best adaptive</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Policy</th>
            {policyCell(baseline)}
            {policyCell(bestFixed)}
            {policyCell(bestAdaptive)}
          </tr>
          <tr>
            <th scope="row">Capture</th>
            {numCell(baseline, (s) => s.meanCaptureRate, 4)}
            {numCell(bestFixed, (s) => s.meanCaptureRate, 4)}
            {numCell(bestAdaptive, (s) => s.meanCaptureRate, 4)}
          </tr>
          <tr>
            <th scope="row">mAh/day</th>
            {numCell(baseline, (s) => s.meanMahPerDay, 4)}
            {numCell(bestFixed, (s) => s.meanMahPerDay, 4)}
            {numCell(bestAdaptive, (s) => s.meanMahPerDay, 4)}
          </tr>
          <tr>
            <th scope="row">Eff.</th>
            {numCell(baseline, (s) => s.meanBleEfficiency, 4)}
            {numCell(bestFixed, (s) => s.meanBleEfficiency, 4)}
            {numCell(bestAdaptive, (s) => s.meanBleEfficiency, 4)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SweepComparisonPlaceholder() {
  return (
    <div className="sweep-comparison-table-wrap sweep-comparison-table-wrap--placeholder">
      <table className="sweep-comparison-table">
        <colgroup>
          <col className="sweep-comparison-col-corner" />
          <col className="sweep-comparison-col-data" />
          <col className="sweep-comparison-col-data" />
          <col className="sweep-comparison-col-data" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="sweep-comparison-corner" />
            <th scope="col">Baseline</th>
            <th scope="col">Best fixed</th>
            <th scope="col">Best adaptive</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Policy</th>
            <td colSpan={3} className="sweep-comparison-placeholder-note">
              Run a sweep from the sidebar — baseline vs best fixed vs best adaptive (by mean efficiency) will appear here.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
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

/** Legend below the sweep capture-vs-energy chart. */
function SweepPlotLegendHtml() {
  return (
    <div className="chart-legend sweep-chart-legend" aria-label="Plot legend">
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--fixed-no-inactive" aria-hidden />
        Fixed (no inactive multiplier)
      </span>
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--fixed-inactive-x3" aria-hidden />
        Fixed inactive scan ×3
      </span>
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--fixed-inactive-x5" aria-hidden />
        Fixed inactive scan ×5
      </span>
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--adaptive" aria-hidden />
        Adaptive sweep
      </span>
      <span>
        <i className="sweep-legend-icon sweep-legend-icon--pareto" aria-hidden />
        Pareto-efficient (ring)
      </span>
    </div>
  );
}

function scatterFillForVariant(variant: ScatterPoint["variant"]): string {
  switch (variant) {
    case "adaptive":
      return "#06b6d4";
    case "fixed_no_inactive":
      return "#8b5cf6";
    case "fixed_inactive_x3":
      return "#14b8a6";
    case "fixed_inactive_x5":
      return "#f97316";
    default:
      return "#94a3b8";
  }
}

function SweepScatterPlot({
  axesPopoverTitle,
  axesPopoverChildren,
  title,
  subtitle,
  xLabel,
  yLabel,
  points
}: {
  axesPopoverTitle: string;
  axesPopoverChildren: ReactNode;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  points: ScatterPoint[];
}) {
  const width = SWEEP_PLOT_WIDTH;
  const height = SWEEP_PLOT_HEIGHT;
  const pad = SWEEP_PLOT_PAD;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const yMin = ys.length ? Math.min(...ys) : 0;
  const yMax = ys.length ? Math.max(...ys) : 1;
  const xPad = (xMax - xMin) * 0.08 || 0.02;
  const yPad = (yMax - yMin) * 0.08 || 0.02;

  const sx = (x: number) => pad.left + ((x - (xMin - xPad)) / (xMax - xMin + 2 * xPad || 1)) * plotW;
  const sy = (y: number) => pad.top + plotH - ((y - (yMin - yPad)) / (yMax - yMin + 2 * yPad || 1)) * plotH;

  const xDomainLo = xMin - xPad;
  const xDomainHi = xMax + xPad;
  const yDomainLo = yMin - yPad;
  const yDomainHi = yMax + yPad;
  const xTicks = sweepAxisTicks(xDomainLo, xDomainHi, 5);
  const yTicks = sweepAxisTicks(yDomainLo, yDomainHi, 5);

  const plotCenterX = pad.left + plotW / 2;
  const plotMidY = pad.top + plotH / 2;
  const leftMarginCenterX = pad.left / 2;

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
        {xTicks.map((tick) => {
          const x = sx(tick);
          return (
            <g key={`xt-${tick}`}>
              <line x1={x} y1={pad.top + plotH} x2={x} y2={pad.top + plotH + 5} stroke="#5c6d7e" strokeWidth={1} />
              <text
                x={x}
                y={pad.top + plotH + 20}
                fill="#90a4b8"
                fontSize={SWEEP_PLOT_SVG_FONT_TICK}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {formatSweepScatterXTick(tick)}
              </text>
            </g>
          );
        })}
        {yTicks.map((tick) => {
          const y = sy(tick);
          return (
            <g key={`yt-${tick}`}>
              <line x1={pad.left - 5} y1={y} x2={pad.left} y2={y} stroke="#5c6d7e" strokeWidth={1} />
              <text x={pad.left - 8} y={y + 4} fill="#90a4b8" fontSize={SWEEP_PLOT_SVG_FONT_TICK} textAnchor="end">
                {formatSweepScatterYTick(tick)}
              </text>
            </g>
          );
        })}
        {points.map((point) => {
          const cx = sx(point.x);
          const cy = sy(point.y);
          const fill = scatterFillForVariant(point.variant);
          return (
            <g key={point.id}>
              <title>{point.tooltip}</title>
              {point.pareto ? (
                <circle cx={cx} cy={cy} r={8} fill="none" stroke="#34d399" strokeWidth={1.75} />
              ) : null}
              <circle cx={cx} cy={cy} r={5} fill={fill} opacity={0.95} />
            </g>
          );
        })}
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
