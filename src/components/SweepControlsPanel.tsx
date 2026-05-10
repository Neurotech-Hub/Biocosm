import { useMemo } from "react";
import { InfoPopover } from "./InfoPopover";
import {
  adaptiveSweepPolicyCount,
  isFullSweepGrid,
  sweepTrialCount
} from "../simulation/sweep/adaptiveBleSweep";
import { buildSweepSimulationBrief } from "../simulation/sweep/sweepSimulationBrief";
import type { SimulationConfig } from "../simulation/types";

type SweepControlsPanelProps = {
  builtSimulation: SimulationConfig;
  isSimulationStale: boolean;
  sweepMode: "fast" | "report";
  onSweepModeChange: (mode: "fast" | "report") => void;
  isSweepRunning: boolean;
  sweepProgress: { completed: number; total: number };
  sweepError: string | null;
  onRunSweep: () => void;
  onCancelSweep: () => void;
};

export function SweepControlsPanel({
  builtSimulation,
  isSimulationStale,
  sweepMode,
  onSweepModeChange,
  isSweepRunning,
  sweepProgress,
  sweepError,
  onRunSweep,
  onCancelSweep
}: SweepControlsPanelProps) {
  const progressPct =
    sweepProgress.total > 0 ? Math.round((100 * sweepProgress.completed) / sweepProgress.total) : 0;

  const simulationBrief = useMemo(
    () => buildSweepSimulationBrief(builtSimulation, sweepMode),
    [builtSimulation, sweepMode]
  );

  return (
    <aside className="panel sweep-controls-panel">
      <div className="panel-title-row">
        <h2>Sweep settings</h2>
        <InfoPopover label="Sweep details and grid size" title="About this sweep">
          {isFullSweepGrid() ? (
            <p>
              Full grid ({adaptiveSweepPolicyCount()} adaptive policies + fixed Juxta baseline per seed) — parameter
              corners bracket Juxta for both lower-energy and higher-capture regimes.
            </p>
          ) : (
            <p>
              Quick grid ({adaptiveSweepPolicyCount()} adaptive policies + baseline per seed) — mixes low-duty and
              upscale-capable settings around Juxta. For the full 90-policy grid, run a production build with{" "}
              <code>VITE_SWEEP_FULL_GRID=true</code>.
            </p>
          )}
          <p>Uses your last built simulation configuration.</p>
          <p>
            Fast preview runs {sweepTrialCount("fast")} simulations total; report mode runs {sweepTrialCount("report")}{" "}
            (seeds 101, 202, 303), then aggregates means.
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
          <span>Report mode — aggregate means across seeds 101, 202, and 303</span>
        </label>
      </fieldset>

      <div className="sweep-actions">
        <button type="button" className="primary-button sweep-run-button" disabled={isSweepRunning} onClick={onRunSweep}>
          Run adaptive sweep
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
