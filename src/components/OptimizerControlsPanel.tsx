import { type ReactNode } from "react";

const CANDIDATE_PRESETS = [5000, 20000, 50000] as const;

export type OptimizerWorkflowPhase = "idle" | "optimizing" | "verifying";

export type OptimizerControlsPanelProps = {
  candidatePreset: (typeof CANDIDATE_PRESETS)[number];
  onCandidatePresetChange: (n: (typeof CANDIDATE_PRESETS)[number]) => void;
  optimizerSeed: string;
  onOptimizerSeedChange: (s: string) => void;
  ridgeLambdaStr: string;
  onRidgeLambdaStrChange: (s: string) => void;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  workflowPhase: OptimizerWorkflowPhase;
  runError: string | null;
  hasPipeline: boolean;
  verificationRunning: boolean;
  verificationProgress: { completed: number; total: number };
  verificationDisabled: boolean;
  baseSeedLabel: string;
  onRunOptimizer: () => void;
  onRetryVerification: () => void;
  /** Optional status line under actions (e.g. sweep stale warning). */
  extraStatus?: ReactNode;
};

export function OptimizerControlsPanel({
  candidatePreset,
  onCandidatePresetChange,
  optimizerSeed,
  onOptimizerSeedChange,
  ridgeLambdaStr,
  onRidgeLambdaStrChange,
  advancedOpen,
  onAdvancedOpenChange,
  workflowPhase,
  runError,
  hasPipeline,
  verificationRunning,
  verificationProgress,
  verificationDisabled,
  baseSeedLabel,
  onRunOptimizer,
  onRetryVerification,
  extraStatus
}: OptimizerControlsPanelProps) {
  const busy = workflowPhase === "optimizing" || workflowPhase === "verifying";
  const phaseLabel =
    workflowPhase === "optimizing"
      ? "Optimizing…"
      : workflowPhase === "verifying"
        ? verificationRunning
          ? `Verifying… ${verificationProgress.completed}/${verificationProgress.total}`
          : "Verifying…"
        : null;

  return (
    <aside className="panel sweep-controls-panel optimizer-controls-sidebar">
      <div className="panel-title-row">
        <h2>Optimizer</h2>
      </div>

      <p className="helper-text optimizer-controls-sidebar-lead">
        Fit the response surface from the current sweep bundle, then verify recommendations against the built world (seed{" "}
        <strong>{baseSeedLabel}</strong>).
      </p>

      <div className="optimizer-controls">
        <label className="optimizer-control">
          <span>Candidate count</span>
          <select
            value={candidatePreset}
            onChange={(e) => onCandidatePresetChange(Number(e.target.value) as (typeof CANDIDATE_PRESETS)[number])}
            disabled={busy}
          >
            {CANDIDATE_PRESETS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <label className="optimizer-control">
          <span>Optimizer seed</span>
          <input
            type="text"
            value={optimizerSeed}
            onChange={(e) => onOptimizerSeedChange(e.target.value)}
            spellCheck={false}
            className="optimizer-seed-input"
            disabled={busy}
          />
        </label>
        <button type="button" className="build-button-primary" disabled={busy} onClick={onRunOptimizer}>
          {workflowPhase === "optimizing" ? "Optimizing…" : "Run optimizer"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!hasPipeline || busy || verificationDisabled || verificationRunning}
          onClick={onRetryVerification}
          title="Re-run verification simulations for the current recommendation set"
        >
          {verificationRunning
            ? `Simulating… ${verificationProgress.completed}/${verificationProgress.total}`
            : "Retry verification"}
        </button>
      </div>

      {phaseLabel ? (
        <p className="optimizer-workflow-status helper-text" aria-live="polite">
          {phaseLabel}
        </p>
      ) : null}

      <button
        type="button"
        className="optimizer-advanced-toggle secondary-button"
        onClick={() => onAdvancedOpenChange(!advancedOpen)}
        disabled={busy}
      >
        {advancedOpen ? "Hide advanced" : "Advanced"}
      </button>
      {advancedOpen ? (
        <label className="optimizer-control optimizer-ridge">
          <span>Ridge λ</span>
          <input value={ridgeLambdaStr} onChange={(e) => onRidgeLambdaStrChange(e.target.value)} disabled={busy} />
        </label>
      ) : null}

      {runError ? <p className="optimizer-error">{runError}</p> : null}

      {extraStatus}

      <p className="optimizer-verify-note helper-text">
        After each optimizer run, verification runs automatically. Each role uses one full simulation on the current{" "}
        <strong>built</strong> configuration.
      </p>
    </aside>
  );
}
