import { PLAYBACK_SPEED_MULTIPLIER } from "../playbackConstants";
import { PauseIcon, PlayIcon, ResetTimelineIcon, StepForwardIcon } from "./playbackIcons";
import { formatClockHHMM } from "../timeFormat";

type TimelinePanelProps = {
  currentStep: number;
  totalSteps: number;
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
          <input
            type="range"
            min="0"
            max={totalSteps}
            step="1"
            value={currentStep}
            onChange={(event) => onStepChange(Number(event.target.value))}
          />
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
