type BuildProgressProps = {
  isBuilding: boolean;
  percent: number;
};

type WorkspaceLoadModalProps = {
  buildProgress: BuildProgressProps;
  sweepProgress: { completed: number; total: number };
  sweepRunning: boolean;
  shouldRunSweep: boolean;
  onCancel: () => void;
};

export function WorkspaceLoadModal({
  buildProgress,
  sweepProgress,
  sweepRunning,
  shouldRunSweep,
  onCancel
}: WorkspaceLoadModalProps) {
  const sweepPct =
    sweepProgress.total > 0 ? Math.min(100, Math.round((sweepProgress.completed / sweepProgress.total) * 100)) : 0;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="species-modal workspace-load-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-load-title"
      >
        <div className="modal-header">
          <h3 id="workspace-load-title">Loading workspace</h3>
        </div>
        <p className="helper-text">
          Applying saved parameters and rebuilding. The rest of the app is blocked until this finishes (or you
          cancel).
        </p>

        <section className="workspace-load-step">
          <h4 className="workspace-load-step-title">Building simulation</h4>
          <div className="build-progress" role="status" aria-live="polite">
            <div className="build-progress-label">
              <span>{buildProgress.isBuilding ? "In progress…" : "Complete"}</span>
              <span>{buildProgress.percent}%</span>
            </div>
            <div className="build-progress-track" aria-hidden="true">
              <div className="build-progress-bar" style={{ width: `${buildProgress.percent}%` }} />
            </div>
          </div>
        </section>

        {shouldRunSweep ? (
          <section className="workspace-load-step">
            <h4 className="workspace-load-step-title">Performing sweep</h4>
            <div className="build-progress" role="status" aria-live="polite">
              <div className="build-progress-label">
                <span>
                  {sweepRunning
                    ? `Trial ${sweepProgress.completed} / ${sweepProgress.total}`
                    : sweepProgress.total > 0
                      ? "Complete"
                      : "Waiting…"}
                </span>
                <span>{sweepPct}%</span>
              </div>
              <div className="build-progress-track" aria-hidden="true">
                <div className="build-progress-bar" style={{ width: `${sweepPct}%` }} />
              </div>
            </div>
          </section>
        ) : null}

        <div className="workspace-load-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
