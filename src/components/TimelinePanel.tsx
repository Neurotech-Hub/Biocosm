type TimelinePanelProps = {
  currentStep: number;
  totalSteps: number;
  timeSeconds: number;
  startTimeSeconds: number;
  timeStepSeconds: number;
  onStepChange: (step: number) => void;
};

export function TimelinePanel({
  currentStep,
  totalSteps,
  timeSeconds,
  startTimeSeconds,
  timeStepSeconds,
  onStepChange
}: TimelinePanelProps) {
  const clock = formatClock(startTimeSeconds + timeSeconds);
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

      <label>
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
      <p className="helper-text">Each slider step advances {timeStepSeconds} simulated seconds.</p>
    </section>
  );
}

function formatClock(timeSeconds: number): string {
  const secondsInDay = 24 * 60 * 60;
  const daySeconds = ((timeSeconds % secondsInDay) + secondsInDay) % secondsInDay;
  const hours = Math.floor(daySeconds / 3600);
  const minutes = Math.floor((daySeconds % 3600) / 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
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
