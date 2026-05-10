import { useMemo } from "react";
import { InfoPopover } from "./InfoPopover";
import {
  ADAPTIVE_SWEEP_TIMING_ANCHORS,
  adaptiveSweepPolicyCount,
  fixedSweepPolicyCount,
  isFullSweepGrid,
  policiesPerSweepSeed,
  sweepExecutionSummary,
  sweepTrialCount,
  SWEEP_HELD_ADAPTIVE,
  SWEEP_REPORT_SEED_POOL,
  type SweepGridVariant
} from "../simulation/sweep/adaptiveBleSweep";
import { buildSweepSimulationBrief } from "../simulation/sweep/sweepSimulationBrief";
import type { SimulationConfig } from "../simulation/types";

type SweepControlsPanelProps = {
  builtSimulation: SimulationConfig;
  isSimulationStale: boolean;
  sweepMode: "fast" | "report";
  onSweepModeChange: (mode: "fast" | "report") => void;
  sweepGridVariant: SweepGridVariant;
  onSweepGridVariantChange: (variant: SweepGridVariant) => void;
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
  sweepGridVariant,
  onSweepGridVariantChange,
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
        gridVariant: sweepGridVariant,
        mode: sweepMode,
        builtSeed: String(builtSimulation.seed),
        reportSeedCount: sweepMode === "report" ? reportSeedCount : undefined
      }),
    [builtSimulation.seed, sweepGridVariant, sweepMode, reportSeedCount]
  );

  const buildPrefersFull = isFullSweepGrid();
  const trialTotal = sweepTrialCount(sweepMode, {
    gridVariant: sweepGridVariant,
    reportSeedCount: sweepMode === "report" ? reportSeedCount : undefined
  });

  return (
    <aside className="panel sweep-controls-panel">
      <div className="panel-title-row">
        <h2>Sweep settings</h2>
        <InfoPopover label="Sweep details and grid size" title="About this sweep">
          <p>
            <strong>Quick grid</strong> is tuned for interactive iteration. <strong>Full grid</strong> matches a production
            build with <code>VITE_SWEEP_FULL_GRID=true</code> (larger Cartesian grids).
          </p>
          <p>
            Per seed: <strong>{fixedSweepPolicyCount(sweepGridVariant)}</strong> fixed-rate schedules +{" "}
            <strong>{adaptiveSweepPolicyCount(sweepGridVariant)}</strong> adaptive policies (
            <strong>{policiesPerSweepSeed(sweepGridVariant)}</strong> total per seed).
          </p>
          <p>Uses your last built simulation configuration.</p>
          <p>
            Quick adaptive grid: <code>baselineDrive</code> values sit below the 0.5 neutral anchor on purpose (energy-saving
            idle state; motion/peer can ramp duty when active).
          </p>
          <p>
            Report mode draws world seeds from a fixed pool ({SWEEP_REPORT_SEED_POOL.join(", ")}). Choose how many seeds to
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
        <legend>Policy grid</legend>
        <label className="sweep-radio-label">
          <input
            type="radio"
            name="sweep-grid"
            checked={sweepGridVariant === "quick"}
            disabled={isSweepRunning}
            onChange={() => onSweepGridVariantChange("quick")}
          />
          <span>Quick grid — faster iteration (default in dev)</span>
        </label>
        <label className="sweep-radio-label">
          <input
            type="radio"
            name="sweep-grid"
            checked={sweepGridVariant === "full"}
            disabled={isSweepRunning}
            onChange={() => onSweepGridVariantChange("full")}
          />
          <span>Full grid — larger scan/adaptive Cartesian grid</span>
        </label>
        {buildPrefersFull ? (
          <p className="helper-text">This build defaults to full grid via <code>VITE_SWEEP_FULL_GRID</code>.</p>
        ) : null}
      </fieldset>

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
          <span>Fast preview — single seed (current built simulation seed)</span>
        </label>
        <label className="sweep-radio-label">
          <input
            type="radio"
            name="sweep-mode"
            checked={sweepMode === "report"}
            disabled={isSweepRunning}
            onChange={() => onSweepModeChange("report")}
          />
          <span>Report mode — aggregate means across multiple world seeds from the pool below</span>
        </label>
      </fieldset>

      {sweepMode === "report" ? (
        <div className="sweep-report-seeds-control">
          <label className="sweep-report-seeds-label">
            <span>Report seeds (from pool)</span>
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
        <summary>What this sweep exercises</summary>
        <dl className="sweep-grid-details-list">
          <div className="sweep-grid-details-row">
            <dt>Grid variant</dt>
            <dd>{execSummary.variant === "quick" ? "Quick" : "Full"}</dd>
          </div>
          <div className="sweep-grid-details-row">
            <dt>Policies per seed</dt>
            <dd>{execSummary.policiesPerSeed}</dd>
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
            <dd>{formatNumList(execSummary.fixedAxes.scanWindows)}</dd>
          </div>
          <div className="sweep-grid-details-row sweep-grid-details-row--block">
            <dt>Timing anchors (adaptive)</dt>
            <dd>
              Low {ADAPTIVE_SWEEP_TIMING_ANCHORS.lowIntensity.scanIntervalSeconds}s scan /{" "}
              {ADAPTIVE_SWEEP_TIMING_ANCHORS.lowIntensity.scanWindowSeconds}s window /{" "}
              {ADAPTIVE_SWEEP_TIMING_ANCHORS.lowIntensity.advIntervalSeconds}s adv; neutral{" "}
              {ADAPTIVE_SWEEP_TIMING_ANCHORS.neutral.scanIntervalSeconds}s / {ADAPTIVE_SWEEP_TIMING_ANCHORS.neutral.scanWindowSeconds}
              s / {ADAPTIVE_SWEEP_TIMING_ANCHORS.neutral.advIntervalSeconds}s; high{" "}
              {ADAPTIVE_SWEEP_TIMING_ANCHORS.highIntensity.scanIntervalSeconds}s /{" "}
              {ADAPTIVE_SWEEP_TIMING_ANCHORS.highIntensity.scanWindowSeconds}s /{" "}
              {ADAPTIVE_SWEEP_TIMING_ANCHORS.highIntensity.advIntervalSeconds}s (burst{" "}
              {ADAPTIVE_SWEEP_TIMING_ANCHORS.advertisingBurstDurationSeconds}s).
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
