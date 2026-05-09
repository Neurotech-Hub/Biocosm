import { defaultAdaptivePolicy } from "../simulation/config";
import type {
  FixedPolicyConfig,
  MotionPeerAdaptivePolicyConfig,
  SimulationConfig,
  TraitDistribution
} from "../simulation/types";

type ControlsPanelProps = {
  config: SimulationConfig;
  isBuildDirty: boolean;
  buildProgress: BuildProgress;
  isPlaying: boolean;
  speed: number;
  showTrueProximity: boolean;
  showObservedDetections: boolean;
  onConfigChange: (config: SimulationConfig) => void;
  onBuildSimulation: () => void;
  onPlayPause: () => void;
  onReset: () => void;
  onStep: () => void;
  onSpeedChange: (speed: number) => void;
  onShowTrueProximityChange: (show: boolean) => void;
  onShowObservedDetectionsChange: (show: boolean) => void;
};

type BuildProgress = {
  isBuilding: boolean;
  percent: number;
};

export function ControlsPanel({
  config,
  isBuildDirty,
  buildProgress,
  isPlaying,
  speed,
  showTrueProximity,
  showObservedDetections,
  onConfigChange,
  onBuildSimulation,
  onPlayPause,
  onReset,
  onStep,
  onSpeedChange,
  onShowTrueProximityChange,
  onShowObservedDetectionsChange
}: ControlsPanelProps) {
  const fixedPolicy: FixedPolicyConfig | undefined =
    config.activePolicy.type === "fixed" ? config.activePolicy : undefined;
  const adaptivePolicy: MotionPeerAdaptivePolicyConfig | undefined =
    config.activePolicy.type === "motion_peer_adaptive" ? config.activePolicy : undefined;
  const updateBiologyDistribution = (
    traitKey: keyof SimulationConfig["biology"],
    field: keyof TraitDistribution,
    value: number
  ) => {
    onConfigChange({
      ...config,
      biology: {
        ...config.biology,
        [traitKey]: {
          ...config.biology[traitKey],
          [field]: value
        }
      }
    });
  };
  const updateEnergyConfig = (field: keyof SimulationConfig["energy"], value: number) => {
    onConfigChange({
      ...config,
      energy: {
        ...config.energy,
        [field]: value
      }
    });
  };

  return (
    <aside className="panel controls-panel">
      <h2>Controls</h2>
      <button
        type="button"
        className={buildProgress.isBuilding ? "build-button building" : isBuildDirty ? "build-button dirty" : "build-button"}
        disabled={!isBuildDirty || buildProgress.isBuilding}
        onClick={onBuildSimulation}
      >
        {buildProgress.isBuilding ? "Building Simulation..." : isBuildDirty ? "Build Simulation" : "Simulation Built"}
      </button>
      {buildProgress.isBuilding ? (
        <div className="build-progress" role="status" aria-live="polite">
          <div className="build-progress-label">
            <span>Building timeline</span>
            <span>{buildProgress.percent}%</span>
          </div>
          <div className="build-progress-track" aria-hidden="true">
            <div className="build-progress-bar" style={{ width: `${buildProgress.percent}%` }} />
          </div>
        </div>
      ) : null}
      {isBuildDirty ? (
        <p className="helper-text">Settings changed. Build the simulation to update the canvas, timeline, logs, and metrics.</p>
      ) : null}

      <section className="control-section">
        <h3>Simulation / Biocosm</h3>
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
          Random seed
          <input
            value={config.seed}
            aria-describedby="seed-help"
            onChange={(event) => onConfigChange({ ...config, seed: event.target.value })}
          />
        </label>
        <p id="seed-help" className="helper-text">
          Same seed and settings recreate the same path graph, traits, movement, and detections.
        </p>

        <label>
          Start time
          <select
            value={Math.round(config.startTimeSeconds / 3600)}
            onChange={(event) => onConfigChange({ ...config, startTimeSeconds: Number(event.target.value) * 3600 })}
          >
            {hourOptions.map((hour) => (
              <option key={hour} value={hour}>
                {hour.toString().padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>

        <label>
          Simulation length
          <select
            value={Math.round(config.simulationLengthSeconds / 3600)}
            onChange={(event) =>
              onConfigChange({ ...config, simulationLengthSeconds: Number(event.target.value) * 3600 })
            }
          >
            {lengthHourOptions.map((hours) => (
              <option key={hours} value={hours}>
                {hours} hours
              </option>
            ))}
          </select>
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
          Physical size
          <div className="size-input-row">
            <select
              value={config.enclosure.width}
              aria-label="Enclosure width in meters"
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  enclosure: {
                    ...config.enclosure,
                    width: Number(event.target.value)
                  }
                })
              }
            >
              {sizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>x</span>
            <select
              value={config.enclosure.height}
              aria-label="Enclosure height in meters"
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  enclosure: {
                    ...config.enclosure,
                    height: Number(event.target.value)
                  }
                })
              }
            >
              {sizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>m</span>
          </div>
        </label>

        <label>
          Path nodes: {config.pathNodeCount}
          <input
            type="range"
            min="5"
            max="60"
            step="1"
            value={config.pathNodeCount}
            onChange={(event) => onConfigChange({ ...config, pathNodeCount: Number(event.target.value) })}
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
      </section>

      <section className="control-section">
        <h3>Device / BLE</h3>
        <p className="helper-text">
          BLE capture rate is the primary policy-quality metric: detected in-range dyad intervals divided by true
          in-range dyad intervals.
        </p>

        <label>
          Adaptive policy
          <select
            value={config.activePolicy.type}
            onChange={(event) => {
              const nextType = event.target.value;
              onConfigChange({
                ...config,
                activePolicy:
                  nextType === "motion_peer_adaptive"
                    ? { ...defaultAdaptivePolicy }
                    : {
                        id: "fixed-rate",
                        type: "fixed",
                        name: "Fixed-rate BLE",
                        scanIntervalSeconds:
                          config.activePolicy.type === "fixed" ? config.activePolicy.scanIntervalSeconds : 60,
                        scanWindowSeconds:
                          config.activePolicy.type === "fixed" ? config.activePolicy.scanWindowSeconds : 1.5,
                        advIntervalSeconds:
                          config.activePolicy.type === "fixed" ? config.activePolicy.advIntervalSeconds : 30
                      }
              });
            }}
          >
            <option value="fixed">Fixed-rate BLE</option>
            <option value="motion_peer_adaptive">Motion + peer adaptive BLE</option>
          </select>
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
        <p className="helper-text">
          Social radius is a ground-truth analysis threshold. Social propensity below is the animal behavior bias.
        </p>

        {fixedPolicy ? (
        <>
          <label>
            Scan interval: {fixedPolicy.scanIntervalSeconds}s
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={fixedPolicy.scanIntervalSeconds}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  activePolicy: { ...fixedPolicy, scanIntervalSeconds: Number(event.target.value) }
                })
              }
            />
          </label>

          <label>
            Scan burst duration: {fixedPolicy.scanWindowSeconds.toFixed(1)}s
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.5"
              value={fixedPolicy.scanWindowSeconds}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  activePolicy: { ...fixedPolicy, scanWindowSeconds: Number(event.target.value) }
                })
              }
            />
          </label>

          <label>
            Advertise interval: {fixedPolicy.advIntervalSeconds}s
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={fixedPolicy.advIntervalSeconds}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  activePolicy: { ...fixedPolicy, advIntervalSeconds: Number(event.target.value) }
                })
              }
            />
          </label>
        </>
        ) : adaptivePolicy ? (
        <details className="advanced-controls">
          <summary>Adaptive details</summary>
          <label>
            Motion sensitivity: {config.motionSensor.thresholdMetersPerStep.toFixed(2)} m/step
            <input
              type="range"
              min="0.01"
              max="0.3"
              step="0.01"
              value={config.motionSensor.thresholdMetersPerStep}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  motionSensor: { ...config.motionSensor, thresholdMetersPerStep: Number(event.target.value) }
                })
              }
            />
          </label>
          <label>
            Peer boost: {adaptivePolicy.peerGain.toFixed(2)}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={adaptivePolicy.peerGain}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  activePolicy: { ...adaptivePolicy, peerGain: Number(event.target.value) }
                })
              }
            />
          </label>
          <label>
            Decay time: {Math.round(adaptivePolicy.tauMotionSeconds / 60)} min
            <input
              type="range"
              min="1"
              max="60"
              step="1"
              value={Math.round(adaptivePolicy.tauMotionSeconds / 60)}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  activePolicy: {
                    ...adaptivePolicy,
                    tauMotionSeconds: Number(event.target.value) * 60,
                    tauPeerSeconds: Number(event.target.value) * 180
                  }
                })
              }
            />
          </label>
        </details>
        ) : null}
      </section>

      <section className="control-section">
        <h3>Animal / Biology</h3>
        <label>
          Circadian mode
          <select
            value={config.behavior.circadianMode}
            onChange={(event) =>
              onConfigChange({
                ...config,
                behavior: {
                  ...config.behavior,
                  circadianMode: event.target.value as SimulationConfig["behavior"]["circadianMode"]
                }
              })
            }
          >
            <option value="nocturnal">Nocturnal</option>
            <option value="diurnal">Diurnal</option>
          </select>
        </label>
        <p className="helper-text">
          Trait rows use min / peak / max triangular distributions. These settings are sampled once per animal when a
          simulation is built.
        </p>
        <TraitDistributionControl
          label="Daily activity minutes"
          distribution={config.biology.dailyActivityMinutes}
          step={10}
          onChange={(field, value) => updateBiologyDistribution("dailyActivityMinutes", field, value)}
        />
        <TraitDistributionControl
          label="Sleep bout minutes"
          distribution={config.biology.sleepBoutMeanMinutes}
          step={5}
          onChange={(field, value) => updateBiologyDistribution("sleepBoutMeanMinutes", field, value)}
        />
        <TraitDistributionControl
          label="Movement bout minutes"
          distribution={config.biology.movementBoutMeanMinutes}
          step={1}
          onChange={(field, value) => updateBiologyDistribution("movementBoutMeanMinutes", field, value)}
        />
        <TraitDistributionControl
          label="Social propensity"
          distribution={config.biology.socialPropensity}
          step={0.05}
          onChange={(field, value) => updateBiologyDistribution("socialPropensity", field, value)}
        />
      </section>

      <section className="control-section">
        <h3>Energy / Battery</h3>
        <p className="helper-text">
          Simple LiPo budget using nRF52840-like BLE burst currents plus steady 50 uA peripheral/sleep draw by default.
        </p>
        <label>
          Battery capacity: {config.energy.batteryCapacityMah} mAh
          <input
            type="range"
            min="20"
            max="1000"
            step="10"
            value={config.energy.batteryCapacityMah}
            onChange={(event) => updateEnergyConfig("batteryCapacityMah", Number(event.target.value))}
          />
        </label>
        <label>
          Starting voltage: {config.energy.startingVoltage.toFixed(2)} V
          <input
            type="range"
            min="3.7"
            max="4.2"
            step="0.01"
            value={config.energy.startingVoltage}
            onChange={(event) => updateEnergyConfig("startingVoltage", Number(event.target.value))}
          />
        </label>
        <label>
          Steady current: {(config.energy.steadyCurrentMa * 1000).toFixed(0)} uA
          <input
            type="range"
            min="10"
            max="500"
            step="10"
            value={config.energy.steadyCurrentMa * 1000}
            onChange={(event) => updateEnergyConfig("steadyCurrentMa", Number(event.target.value) / 1000)}
          />
        </label>
        <label>
          Scan current: {config.energy.scanCurrentMa.toFixed(1)} mA
          <input
            type="range"
            min="1"
            max="15"
            step="0.5"
            value={config.energy.scanCurrentMa}
            onChange={(event) => updateEnergyConfig("scanCurrentMa", Number(event.target.value))}
          />
        </label>
        <label>
          Advertising current: {config.energy.advertisingCurrentMa.toFixed(1)} mA
          <input
            type="range"
            min="1"
            max="15"
            step="0.5"
            value={config.energy.advertisingCurrentMa}
            onChange={(event) => updateEnergyConfig("advertisingCurrentMa", Number(event.target.value))}
          />
        </label>
      </section>
    </aside>
  );
}

type TraitDistributionControlProps = {
  label: string;
  distribution: TraitDistribution;
  step: number;
  onChange: (field: keyof TraitDistribution, value: number) => void;
};

function TraitDistributionControl({ label, distribution, step, onChange }: TraitDistributionControlProps) {
  return (
    <div className="trait-control">
      <span>{label}</span>
      <div className="trait-inputs" aria-label={`${label} min peak max`}>
        <label>
          min
          <input
            type="number"
            step={step}
            value={distribution.min}
            onChange={(event) => onChange("min", Number(event.target.value))}
          />
        </label>
        <label>
          peak
          <input
            type="number"
            step={step}
            value={distribution.mode}
            onChange={(event) => onChange("mode", Number(event.target.value))}
          />
        </label>
        <label>
          max
          <input
            type="number"
            step={step}
            value={distribution.max}
            onChange={(event) => onChange("max", Number(event.target.value))}
          />
        </label>
      </div>
    </div>
  );
}

const sizeOptions = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);
const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);
const lengthHourOptions = [1, 2, 3, 6, 12, 24, 48, 72];
