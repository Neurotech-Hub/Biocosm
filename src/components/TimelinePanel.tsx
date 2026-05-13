import { PLAYBACK_SPEED_MULTIPLIER } from "../playbackConstants";
import { PauseIcon, PlayIcon, ResetTimelineIcon, StepForwardIcon } from "./playbackIcons";
import { formatClockHHMM } from "../timeFormat";

type TimelinePanelProps = {
  currentStep: number;
  totalSteps: number;
  /** Timeline step indices where fixed-policy cohort mean passive scan window is 0 (optional; aligns with chart shading). */
  scanOffStepIndices?: readonly number[];
  timeSeconds: number;
  startTimeSeconds: number;
  timeStepSeconds: number;
  isPlaying: boolean;
  playbackDisabled: boolean;
  onStepChange: (step: number) => void;
  onPlayPause: () => void;
  onStep: () => void;
  onReset: () => void;
};

export function TimelinePanel({
  currentStep,
  totalSteps,
  scanOffStepIndices,
  timeSeconds,
  startTimeSeconds,
  timeStepSeconds,
  isPlaying,
  playbackDisabled,
  onStepChange,
  onPlayPause,
  onStep,
  onReset
}: TimelinePanelProps) {
  const clock = formatClockHHMM(startTimeSeconds + timeSeconds);
  const elapsed = formatElapsed(timeSeconds);
  const dayPhase = getDayPhase(startTimeSeconds + timeSeconds);

  return (
    <section className="panel timeline-panel">
      <div className="time-summary">
        <div>
          <span>Time of day</span>
          <strong>{clock}</strong>
        </div>
        <div>
          <span>Phase</span>
          <strong>{dayPhase}</strong>
        </div>
        <div>
          <span>Elapsed</span>
          <strong>{elapsed}</strong>
        </div>
      </div>

      <div className="timeline-scrub-row">
        <div className="timeline-playback" role="group" aria-label="Playback controls">
          <button
            type="button"
            className="icon-button"
            disabled={playbackDisabled}
            onClick={onPlayPause}
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={playbackDisabled}
            onClick={onStep}
            aria-label="Step forward one timestep"
            title="Step"
          >
            <StepForwardIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            disabled={playbackDisabled}
            onClick={onReset}
            aria-label="Jump to start of timeline"
            title="Reset"
          >
            <ResetTimelineIcon />
          </button>
        </div>
        <label className="timeline-scrub-label">
          Scrub simulation time: step {currentStep} / {totalSteps}
          <div className="timeline-scrub-track-wrap">
            {scanOffStepIndices && scanOffStepIndices.length > 0 ? (
              <div
                className="timeline-scan-off-marker-layer"
                title="Orange ticks: timesteps with no passive scan window (cohort mean 0 s, e.g. Inf inactive when nobody moved in the last epoch)."
              >
                {scanOffStepIndices.map((step) => (
                  <span
                    key={step}
                    className="timeline-scan-off-tick"
                    style={{ left: `${totalSteps > 0 ? (step / totalSteps) * 100 : 0}%` }}
                  />
                ))}
              </div>
            ) : null}
            <input
              type="range"
              min="0"
              max={totalSteps}
              step="1"
              value={currentStep}
              onChange={(event) => onStepChange(Number(event.target.value))}
            />
          </div>
        </label>
      </div>
      <p className="helper-text timeline-playback-hint">
        Each slider step advances {timeStepSeconds} simulated seconds. Playback is {PLAYBACK_SPEED_MULTIPLIER}x speed.
      </p>
    </section>
  );
}

function formatElapsed(timeSeconds: number): string {
  const hours = Math.floor(timeSeconds / 3600);
  const minutes = Math.floor((timeSeconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function getDayPhase(timeSeconds: number): "Day" | "Night" {
  const hour = Math.floor((((timeSeconds / 3600) % 24) + 24) % 24);
  return hour >= 6 && hour < 18 ? "Day" : "Night";
}
