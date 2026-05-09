import type { SimulationConfig } from "../simulation/types";

type ControlsPanelProps = {
  config: SimulationConfig;
  isPlaying: boolean;
  speed: number;
  showTrueProximity: boolean;
  showObservedDetections: boolean;
  onConfigChange: (config: SimulationConfig) => void;
  onPlayPause: () => void;
  onReset: () => void;
  onStep: () => void;
  onSpeedChange: (speed: number) => void;
  onShowTrueProximityChange: (show: boolean) => void;
  onShowObservedDetectionsChange: (show: boolean) => void;
};

export function ControlsPanel({
  config,
  isPlaying,
  speed,
  showTrueProximity,
  showObservedDetections,
  onConfigChange,
  onPlayPause,
  onReset,
  onStep,
  onSpeedChange,
  onShowTrueProximityChange,
  onShowObservedDetectionsChange
}: ControlsPanelProps) {
  return (
    <aside className="panel controls-panel">
      <h2>Controls</h2>
      <div className="button-row">
        <button type="button" onClick={onPlayPause}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onStep}>
          Step
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>

      <label>
        Seed
        <input
          value={config.seed}
          onChange={(event) => onConfigChange({ ...config, seed: event.target.value })}
        />
      </label>

      <label>
        Animals: {config.animalCount}
        <input
          type="range"
          min="5"
          max="30"
          value={config.animalCount}
          onChange={(event) => onConfigChange({ ...config, animalCount: Number(event.target.value) })}
        />
      </label>

      <label>
        Playback speed: {speed}x
        <input
          type="range"
          min="1"
          max="60"
          value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
        />
      </label>

      <label>
        Detection radius: {config.radio.detectionRadiusMeters.toFixed(1)} m
        <input
          type="range"
          min="0.3"
          max="3"
          step="0.1"
          value={config.radio.detectionRadiusMeters}
          onChange={(event) =>
            onConfigChange({
              ...config,
              radio: { ...config.radio, detectionRadiusMeters: Number(event.target.value) }
            })
          }
        />
      </label>

      <label>
        Social radius: {config.radio.socialRadiusMeters.toFixed(1)} m
        <input
          type="range"
          min="0.2"
          max="2"
          step="0.1"
          value={config.radio.socialRadiusMeters}
          onChange={(event) =>
            onConfigChange({
              ...config,
              radio: { ...config.radio, socialRadiusMeters: Number(event.target.value) }
            })
          }
        />
      </label>

      <label>
        Scan interval: {config.fixedPolicy.scanIntervalSeconds}s
        <input
          type="range"
          min="30"
          max="600"
          step="30"
          value={config.fixedPolicy.scanIntervalSeconds}
          onChange={(event) =>
            onConfigChange({
              ...config,
              fixedPolicy: { ...config.fixedPolicy, scanIntervalSeconds: Number(event.target.value) }
            })
          }
        />
      </label>

      <label>
        Scan window: {config.fixedPolicy.scanWindowSeconds}s
        <input
          type="range"
          min="5"
          max="120"
          step="5"
          value={config.fixedPolicy.scanWindowSeconds}
          onChange={(event) =>
            onConfigChange({
              ...config,
              fixedPolicy: { ...config.fixedPolicy, scanWindowSeconds: Number(event.target.value) }
            })
          }
        />
      </label>

      <label>
        Advertise interval: {config.fixedPolicy.advIntervalSeconds}s
        <input
          type="range"
          min="5"
          max="120"
          step="5"
          value={config.fixedPolicy.advIntervalSeconds}
          onChange={(event) =>
            onConfigChange({
              ...config,
              fixedPolicy: { ...config.fixedPolicy, advIntervalSeconds: Number(event.target.value) }
            })
          }
        />
      </label>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={showTrueProximity}
          onChange={(event) => onShowTrueProximityChange(event.target.checked)}
        />
        Show true social proximity
      </label>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={showObservedDetections}
          onChange={(event) => onShowObservedDetectionsChange(event.target.checked)}
        />
        Show observed BLE detections
      </label>
    </aside>
  );
}
