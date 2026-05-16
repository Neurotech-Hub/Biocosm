import { useMemo } from "react";
import { InfoPopover } from "./InfoPopover";
import {
  baselineFixedPolicyForSweep,
  focusedSweepAdaptiveTimingAnchors
} from "../simulation/blePolicyPresets";
import {
  adaptiveSweepPolicyCount,
  fixedSweepPolicyCount,
  policiesPerSweepSeed,
  sweepExecutionSummary,
  sweepTrialCount,
  SWEEP_HELD_ADAPTIVE,
  SWEEP_REPORT_SEED_POOL
} from "../simulation/sweep/adaptiveBleSweep";
import { FOCUSED_SWEEP_FIXED_ADVERTISING_BURST_SECONDS } from "../simulation/bleTimingAssumptions";
import { buildSweepSimulationBrief } from "../simulation/sweep/sweepSimulationBrief";
import type { SimulationConfig } from "../simulation/types";

type SweepControlsPanelProps = {
  builtSimulation: SimulationConfig;
  isSimulationStale: boolean;
  sweepMode: "fast" | "report";
  onSweepModeChange: (mode: "fast" | "report") => void;
  reportSeedCount: number;
  onReportSeedCountChange: (count: number) => void;
  isSweepRunning: boolean;
  sweepProgress: { completed: number; total: number };
  sweepError: string | null;
  onRunSweep: () => void;
  onCancelSweep: () => void;
};

function formatNumList(values: readonly number[]): string {
  return values.join(", ");
}

export function SweepControlsPanel({
  builtSimulation,
  isSimulationStale,
  sweepMode,
  onSweepModeChange,
  reportSeedCount,
  onReportSeedCountChange,
  isSweepRunning,
  sweepProgress,
  sweepError,
  onRunSweep,
  onCancelSweep
}: SweepControlsPanelProps) {
  const progressPct =
    sweepProgress.total > 0 ? Math.round((100 * sweepProgress.completed) / sweepProgress.total) : 0;

  const baselineFixed = useMemo(() => baselineFixedPolicyForSweep(builtSimulation), [builtSimulation]);
  const sweepAnchorsDisplay = useMemo(() => focusedSweepAdaptiveTimingAnchors(), []);

  const simulationBrief = useMemo(
    () =>
      buildSweepSimulationBrief(builtSimulation, sweepMode, {
        reportSeedCount: sweepMode === "report" ? reportSeedCount : undefined
      }),
    [builtSimulation, sweepMode, reportSeedCount]
  );

  const execSummary = useMemo(
    () =>
      sweepExecutionSummary({
        mode: sweepMode,
        builtSeed: String(builtSimulation.seed),
        reportSeedCount: sweepMode === "report" ? reportSeedCount : undefined,
        simulationConfig: builtSimulation
      }),
    [builtSimulation, sweepMode, reportSeedCount]
  );

  const policiesPerSeed = policiesPerSweepSeed(undefined, baselineFixed);
  const fixedPolicyCount = fixedSweepPolicyCount(undefined, baselineFixed);
  const adaptivePolicyCount = adaptiveSweepPolicyCount();
  const trialTotal = useMemo(
    () =>
      sweepTrialCount(sweepMode, {
        reportSeedCount: sweepMode === "report" ? reportSeedCount : undefined,
        simulationConfig: builtSimulation
      }),
    [builtSimulation, sweepMode, reportSeedCount]
  );

  return (
    <aside className="panel sweep-controls-panel">
      <div className="panel-title-row">
        <h2>Sweep settings</h2>
        <InfoPopover label="Sweep details and grid size" title="About this sweep">
          <p>
            Each run evaluates <strong>{policiesPerSeed} policies per seed</strong> ({fixedPolicyCount} fixed +{" "}
            {adaptivePolicyCount} adaptive): comparison baseline nominal + inactive scan ×3/×5 per factorial cell, plus the
            adaptive grid.
          </p>
          <p>
            Each run is <strong>fixed-rate schedules + adaptive policies</strong> per seed, anchored to your comparison BLE
            baseline from the Simulator tab.
          </p>
          <p>Uses your last built simulation configuration.</p>
          <p>
            This sweep tests whether efficient adaptive BLE policies can preserve frequent advertising while downscaling scan
            effort.
          </p>
          <p>
            Fixed-rate grid varies <strong>scan interval</strong>, <strong>advertise interval</strong>, and{" "}
            <strong>scan window</strong> (3×3×3 = 27 cells). Each distinct schedule runs as nominal fixed, then inactive scan ×3
            and ×5 (bout-delayed stretch). <strong>Advertise burst is held constant</strong> at{" "}
            <strong>{FOCUSED_SWEEP_FIXED_ADVERTISING_BURST_SECONDS}s</strong> (firmware non-connectable burst); one factorial cell
            may duplicate the comparison baseline and is skipped.
          </p>
          <p>
            Adaptive grid: <code>baselineDrive</code> {formatNumList(execSummary.adaptiveAxes.baselineDrives)}, motionWeight{" "}
            {formatNumList(execSummary.adaptiveAxes.motionWeights)}, peerWeight {formatNumList(execSummary.adaptiveAxes.peerWeights)}, τ_peer{" "}
            {formatNumList(execSummary.adaptiveAxes.tauPeerSeconds)} s (3×2×2×2 = {adaptivePolicyCount} policies per seed).
          </p>
          <p>
            Aggregate mode draws world seeds from a fixed pool ({SWEEP_REPORT_SEED_POOL.join(", ")}). Choose how many seeds to
            include (1–5); means are aggregated across those runs.
          </p>
        </InfoPopover>
      </div>

      <section className="sweep-sim-brief" aria-label="Simulation settings used for this sweep">
        <h3 className="sweep-sim-brief-heading">From Simulator (last build)</h3>
        {isSimulationStale ? (
          <p className="helper-text warning-text sweep-sim-brief-stale">
            Simulation controls changed after the last build — rebuild on the Simulator tab to include those edits in the
            next sweep.
          </p>
        ) : null}
        <dl className="sweep-sim-brief-list">
          {simulationBrief.map(({ label, value }) => (
            <div key={label} className="sweep-sim-brief-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <fieldset className="sweep-radio-group">
        <legend>Sweep mode</legend>
        <label className="sweep-radio-label">
          <input
            type="radio"
            name="sweep-mode"
            checked={sweepMode === "fast"}
            disabled={isSweepRunning}
            onChange={() => onSweepModeChange("fast")}
          />
          <span>Simulated Seed</span>
        </label>
        <label className="sweep-radio-label">
          <input
            type="radio"
            name="sweep-mode"
            checked={sweepMode === "report"}
            disabled={isSweepRunning}
            onChange={() => onSweepModeChange("report")}
          />
          <span>Aggregate</span>
        </label>
      </fieldset>

      {sweepMode === "report" ? (
        <div className="sweep-report-seeds-control">
          <label className="sweep-report-seeds-label">
            <span>Seeds (from pool)</span>
            <select
              aria-label="Number of report seeds"
              disabled={isSweepRunning}
              value={reportSeedCount}
              onChange={(e) => onReportSeedCountChange(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} — {SWEEP_REPORT_SEED_POOL.slice(0, n).join(", ")}
                </option>
              ))}
            </select>
          </label>
          <p className="helper-text">
            Pool order: {SWEEP_REPORT_SEED_POOL.join(", ")}. Increasing seeds adds variance averaging at higher runtime.
          </p>
        </div>
      ) : null}

      <details className="sweep-grid-details">
        <summary className="sweep-grid-details-summary">
          <span className="sweep-grid-details-chevron" aria-hidden />
          <span>What this sweep exercises</span>
        </summary>
        <dl className="sweep-grid-details-list">
          <div className="sweep-grid-details-row sweep-grid-details-row--block">
            <dt>Hypothesis</dt>
            <dd>
              This sweep tests whether efficient adaptive BLE policies can preserve frequent advertising while downscaling scan
              effort.
            </dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Policies per seed</dt>
            <dd>
              {execSummary.policiesPerSeed} ({fixedPolicyCount} fixed + {adaptivePolicyCount} adaptive for this baseline)
            </dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Simulation seeds</dt>
            <dd>{execSummary.simulationSeeds.join(", ")}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Total trials (this run)</dt>
            <dd>{trialTotal}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Adaptive baselineDrive</dt>
            <dd>{formatNumList(execSummary.adaptiveAxes.baselineDrives)}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Adaptive motionWeight</dt>
            <dd>{formatNumList(execSummary.adaptiveAxes.motionWeights)}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Adaptive peerWeight</dt>
            <dd>{formatNumList(execSummary.adaptiveAxes.peerWeights)}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Adaptive τ peer (s)</dt>
            <dd>{formatNumList(execSummary.adaptiveAxes.tauPeerSeconds)}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Fixed scan intervals (s)</dt>
            <dd>{formatNumList(execSummary.fixedAxes.scanIntervals)}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Fixed advertise intervals (s)</dt>
            <dd>{formatNumList(execSummary.fixedAxes.advIntervals)}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Fixed scan windows (s)</dt>
            <dd>{formatNumList(execSummary.fixedAxes.scanWindowSecondsList)}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Advertise burst (held constant)</dt>
            <dd>{FOCUSED_SWEEP_FIXED_ADVERTISING_BURST_SECONDS}s</dd>
          </div>
          <div className="sweep-grid-details-row sweep-grid-details-row--block">
            <dt>Timing anchors (adaptive)</dt>
            <dd>
              Low {sweepAnchorsDisplay.lowIntensity.scanIntervalSeconds}s scan / {sweepAnchorsDisplay.lowIntensity.scanWindowSeconds}s win /{" "}
              {sweepAnchorsDisplay.lowIntensity.advIntervalSeconds}s adv; neutral {sweepAnchorsDisplay.neutral.scanIntervalSeconds}s scan /{" "}
              {sweepAnchorsDisplay.neutral.scanWindowSeconds}s win / {sweepAnchorsDisplay.neutral.advIntervalSeconds}s adv; high{" "}
              {sweepAnchorsDisplay.highIntensity.scanIntervalSeconds}s scan / {sweepAnchorsDisplay.highIntensity.scanWindowSeconds}s win /{" "}
              {sweepAnchorsDisplay.highIntensity.advIntervalSeconds}s adv (burst {sweepAnchorsDisplay.advertisingBurstDurationSeconds}s).
            </dd>
          </div>
          <div className="sweep-grid-details-row sweep-grid-details-row--block">
            <dt>Held adaptive constants</dt>
            <dd>
              τ motion {SWEEP_HELD_ADAPTIVE.tauMotionSeconds}s · motion gain {SWEEP_HELD_ADAPTIVE.motionGain} · peer gain{" "}
              {SWEEP_HELD_ADAPTIVE.peerGain} · peer miss penalty {SWEEP_HELD_ADAPTIVE.peerMissPenalty} · energy downscale{" "}
              {String(SWEEP_HELD_ADAPTIVE.allowEnergySavingDownscale)}
            </dd>
          </div>
        </dl>
      </details>

      <div className="sweep-actions">
        <button type="button" className="primary-button sweep-run-button" disabled={isSweepRunning} onClick={onRunSweep}>
          Run policy sweep
        </button>
        {isSweepRunning ? (
          <button type="button" className="secondary-button" onClick={onCancelSweep}>
            Cancel
          </button>
        ) : null}
      </div>

      {isSweepRunning ? (
        <div className="sweep-progress">
          <div
            className="sweep-progress-bar"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="sweep-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="sweep-progress-label">
            Run {sweepProgress.completed} / {sweepProgress.total} ({progressPct}%)
          </span>
        </div>
      ) : null}

      {sweepError ? <p className="helper-text warning-text">{sweepError}</p> : null}
    </aside>
  );
}
