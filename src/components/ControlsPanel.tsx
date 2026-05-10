import { useState } from "react";
import { defaultAdaptivePolicy, juxtaMainCMode0FixedPolicy } from "../simulation/config";
import { resolveSpeciesPreset } from "../simulation/speciesModifiers";
import { SPECIES_PRESETS, speciesPresetOptions } from "../simulation/speciesPresets";
import type { SpeciesModifierConfig, SpeciesPreset } from "../simulation/speciesTypes";
import type {
  FixedPolicyConfig,
  MotionPeerAdaptivePolicyConfig,
  SimulationConfig,
  TraitDistribution
} from "../simulation/types";

type DistributionOverrideKey =
  | "activeWindowHours"
  | "dailyMotionMinutes"
  | "majorRestWindowHours"
  | "movementBoutMeanMinutes"
  | "restBoutMeanMinutes"
  | "stationaryAwakeBoutMeanMinutes"
  | "movementSpeedMetersPerMinute"
  | "circadianPhaseOffsetHours"
  | "socialPropensity"
  | "territoriality"
  | "groupSynchrony"
  | "ultradianPeriodMinutes";

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
  const [isAdvancedSpeciesOpen, setIsAdvancedSpeciesOpen] = useState(false);
  const fixedPolicy: FixedPolicyConfig | undefined =
    config.activePolicy.type === "fixed" ? config.activePolicy : undefined;
  const adaptivePolicy: MotionPeerAdaptivePolicyConfig | undefined =
    config.activePolicy.type === "motion_peer_adaptive" ? config.activePolicy : undefined;
  const selectedPreset = (SPECIES_PRESETS[config.speciesPresetId as keyof typeof SPECIES_PRESETS] ??
    SPECIES_PRESETS.lab_mouse) as SpeciesPreset;
  const effectivePreset = resolveSpeciesPreset(config.speciesPresetId, config.speciesModifiers, config.advancedSpeciesOverrides);
  const updateSpeciesModifier = (field: keyof SpeciesModifierConfig, value: number) => {
    onConfigChange({
      ...config,
      speciesModifiers: {
        ...config.speciesModifiers,
        [field]: value
      }
    });
  };
  const updateSpeciesDistributionOverride = (
    traitKey: DistributionOverrideKey,
    field: keyof TraitDistribution,
    value: number
  ) => {
    const currentDistribution = config.advancedSpeciesOverrides?.[traitKey] ?? selectedPreset[traitKey];
    if (!currentDistribution || typeof currentDistribution === "number" || Array.isArray(currentDistribution)) {
      return;
    }
    onConfigChange({
      ...config,
      advancedSpeciesOverrides: {
        ...config.advancedSpeciesOverrides,
        [traitKey]: {
          ...currentDistribution,
          [field]: value
        }
      }
    });
  };
  const updateEnergyConfig = <K extends keyof SimulationConfig["energy"]>(
    field: K,
    value: SimulationConfig["energy"][K]
  ) => {
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
            max="20"
            step="1"
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
          BLE capture rate uses simulated in-range dyad intervals at each frame (60s by default) compared to raw detection
          events; firmware-shaped unique peers per minute (max RSSI) are listed separately in metrics.
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
                    : config.activePolicy.type === "fixed"
                      ? config.activePolicy
                      : { ...juxtaMainCMode0FixedPolicy }
              });
            }}
          >
            <option value="fixed">Fixed-rate BLE</option>
            <option value="motion_peer_adaptive">Motion + peer adaptive BLE</option>
          </select>
        </label>

        <label>
          Detection radius: {config.radio.detectionRadiusMeters.toFixed(2)} m
          <input
            type="range"
            min="0.05"
            max="3"
            step="0.05"
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
          Social radius: {config.radio.socialRadiusMeters.toFixed(2)} m
          <input
            type="range"
            min="0.05"
            max="2"
            step="0.05"
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

          <label>
            Advertise burst duration: {(fixedPolicy.advertisingBurstDurationSeconds ?? 2).toFixed(1)}s
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.5"
              value={fixedPolicy.advertisingBurstDurationSeconds ?? 2}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  activePolicy: {
                    ...fixedPolicy,
                    advertisingBurstDurationSeconds: Number(event.target.value)
                  }
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
          Species preset
          <select
            value={config.speciesPresetId}
            onChange={(event) =>
              onConfigChange({
                ...config,
                speciesPresetId: event.target.value,
                advancedSpeciesOverrides: undefined
              })
            }
          >
            {speciesPresetOptions.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <div className="preset-summary">
          <span>Pattern: {effectivePreset.activityPattern.replaceAll("_", " ")}</span>
          <span>Peaks: {effectivePreset.activePeakHours.map(formatHour).join(", ")}</span>
          <span>Motion: {formatDistribution(effectivePreset.dailyMotionMinutes)} min/day</span>
          <span>Sociality: {effectivePreset.socialPropensity.mode.toFixed(2)}</span>
          <span>Territoriality: {effectivePreset.territoriality.mode.toFixed(2)}</span>
          <span>Confidence: {effectivePreset.confidence}</span>
        </div>
        <p className="helper-text">{effectivePreset.notes}</p>
        <label>
          Activity modifier: {config.speciesModifiers.activityLevelMultiplier.toFixed(2)}x
          <input
            type="range"
            min="0.25"
            max="2"
            step="0.05"
            value={config.speciesModifiers.activityLevelMultiplier}
            onChange={(event) => updateSpeciesModifier("activityLevelMultiplier", Number(event.target.value))}
          />
        </label>
        <label>
          Sociality modifier: {config.speciesModifiers.socialityMultiplier.toFixed(2)}x
          <input
            type="range"
            min="0.25"
            max="2"
            step="0.05"
            value={config.speciesModifiers.socialityMultiplier}
            onChange={(event) => updateSpeciesModifier("socialityMultiplier", Number(event.target.value))}
          />
        </label>
        <button type="button" className="secondary-button" onClick={() => setIsAdvancedSpeciesOpen(true)}>
          Advanced Species Parameters
        </button>
        {isAdvancedSpeciesOpen ? (
          <div className="modal-backdrop" role="presentation">
            <div className="species-modal" role="dialog" aria-modal="true" aria-labelledby="species-modal-title">
              <div className="modal-header">
                <h3 id="species-modal-title">Advanced Species Parameters</h3>
                <button type="button" className="secondary-button" onClick={() => setIsAdvancedSpeciesOpen(false)}>
                  Close
                </button>
              </div>
              <p className="helper-text">
                These overrides modify the selected species prior. Values remain min / peak / max triangular distributions
                and are sampled once per animal at build time.
              </p>
              <div className="advanced-species-grid">
                <TraitDistributionControl
                  label="Active window hours"
                  distribution={effectivePreset.activeWindowHours}
                  step={0.5}
                  onChange={(field, value) => updateSpeciesDistributionOverride("activeWindowHours", field, value)}
                />
                <TraitDistributionControl
                  label="Daily motion minutes"
                  distribution={effectivePreset.dailyMotionMinutes}
                  step={10}
                  onChange={(field, value) => updateSpeciesDistributionOverride("dailyMotionMinutes", field, value)}
                />
                <TraitDistributionControl
                  label="Major rest window hours"
                  distribution={effectivePreset.majorRestWindowHours}
                  step={0.5}
                  onChange={(field, value) => updateSpeciesDistributionOverride("majorRestWindowHours", field, value)}
                />
                <TraitDistributionControl
                  label="Movement bout minutes"
                  distribution={effectivePreset.movementBoutMeanMinutes}
                  step={1}
                  onChange={(field, value) => updateSpeciesDistributionOverride("movementBoutMeanMinutes", field, value)}
                />
                <TraitDistributionControl
                  label="Rest bout minutes"
                  distribution={effectivePreset.restBoutMeanMinutes}
                  step={5}
                  onChange={(field, value) => updateSpeciesDistributionOverride("restBoutMeanMinutes", field, value)}
                />
                {effectivePreset.stationaryAwakeBoutMeanMinutes ? (
                  <TraitDistributionControl
                    label="Awake stationary bout minutes"
                    distribution={effectivePreset.stationaryAwakeBoutMeanMinutes}
                    step={5}
                    onChange={(field, value) =>
                      updateSpeciesDistributionOverride("stationaryAwakeBoutMeanMinutes", field, value)
                    }
                  />
                ) : null}
                <TraitDistributionControl
                  label="Phase offset hours"
                  distribution={effectivePreset.circadianPhaseOffsetHours}
                  step={0.5}
                  onChange={(field, value) => updateSpeciesDistributionOverride("circadianPhaseOffsetHours", field, value)}
                />
                <TraitDistributionControl
                  label="Social propensity"
                  distribution={effectivePreset.socialPropensity}
                  step={0.05}
                  onChange={(field, value) => updateSpeciesDistributionOverride("socialPropensity", field, value)}
                />
                <TraitDistributionControl
                  label="Territoriality"
                  distribution={effectivePreset.territoriality}
                  step={0.05}
                  onChange={(field, value) => updateSpeciesDistributionOverride("territoriality", field, value)}
                />
                {effectivePreset.groupSynchrony ? (
                  <TraitDistributionControl
                    label="Group synchrony"
                    distribution={effectivePreset.groupSynchrony}
                    step={0.05}
                    onChange={(field, value) => updateSpeciesDistributionOverride("groupSynchrony", field, value)}
                  />
                ) : null}
                {effectivePreset.movementSpeedMetersPerMinute ? (
                  <TraitDistributionControl
                    label="Movement speed m/min"
                    distribution={effectivePreset.movementSpeedMetersPerMinute}
                    step={1}
                    onChange={(field, value) =>
                      updateSpeciesDistributionOverride("movementSpeedMetersPerMinute", field, value)
                    }
                  />
                ) : null}
                {effectivePreset.ultradianPeriodMinutes ? (
                  <TraitDistributionControl
                    label="Ultradian period minutes"
                    distribution={effectivePreset.ultradianPeriodMinutes}
                    step={10}
                    onChange={(field, value) => updateSpeciesDistributionOverride("ultradianPeriodMinutes", field, value)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="control-section">
        <h3>Energy / Battery</h3>
        <p className="helper-text">
          Component model: baseline µA plus scan (RX × listen-window seconds) and advertising (packet events × µC/event)
          for <strong>one representative collar</strong>. Empirical mode uses the bench total for 5s/20s minus baseline
          for that same collar.
        </p>
        <label>
          Energy model
          <select
            value={config.energy.energyModel}
            onChange={(event) =>
              updateEnergyConfig(
                "energyModel",
                event.target.value as SimulationConfig["energy"]["energyModel"]
              )
            }
          >
            <option value="component">Component (µC/event + listen RX + baseline)</option>
            <option value="empiricalAverage">Empirical average (total − baseline, Juxta 5s/20s ref)</option>
          </select>
        </label>
        <label>
          Assumed TX power (label / prior): {config.energy.txPowerDbm} dBm
          <input
            type="range"
            min="-4"
            max="8"
            step="1"
            value={config.energy.txPowerDbm}
            onChange={(event) => updateEnergyConfig("txPowerDbm", Number(event.target.value))}
          />
        </label>
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
          Baseline (non-BLE): {config.energy.baselineCurrentMicroAmps.toFixed(0)} µA
          <input
            type="range"
            min="10"
            max="500"
            step="5"
            value={config.energy.baselineCurrentMicroAmps}
            onChange={(event) => updateEnergyConfig("baselineCurrentMicroAmps", Number(event.target.value))}
          />
        </label>
        <label>
          Scan RX current: {config.energy.rxCurrentMa1MPhy.toFixed(2)} mA
          <input
            type="range"
            min="3"
            max="10"
            step="0.05"
            value={config.energy.rxCurrentMa1MPhy}
            onChange={(event) => updateEnergyConfig("rxCurrentMa1MPhy", Number(event.target.value))}
          />
        </label>
        <label>
          Advertising event spacing: {config.energy.advertisingEventIntervalSeconds.toFixed(2)} s (detection grid)
          <input
            type="range"
            min="0.05"
            max="0.25"
            step="0.01"
            value={config.energy.advertisingEventIntervalSeconds}
            onChange={(event) =>
              updateEnergyConfig("advertisingEventIntervalSeconds", Number(event.target.value))
            }
          />
        </label>
        <label>
          Advertising event charge: {config.energy.advEventChargeMicroCoulombs.toFixed(1)} µC
          <input
            type="range"
            min="5"
            max="25"
            step="0.5"
            value={config.energy.advEventChargeMicroCoulombs}
            onChange={(event) => updateEnergyConfig("advEventChargeMicroCoulombs", Number(event.target.value))}
          />
        </label>
        <label>
          Juxta 5s/20s bench total (empirical + warn): {config.energy.measuredSocial5s20sTotalMicroAmps.toFixed(1)} µA
          <input
            type="range"
            min="120"
            max="400"
            step="1"
            value={config.energy.measuredSocial5s20sTotalMicroAmps}
            onChange={(event) =>
              updateEnergyConfig("measuredSocial5s20sTotalMicroAmps", Number(event.target.value))
            }
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

function formatDistribution(distribution: TraitDistribution): string {
  return `${distribution.min}-${distribution.mode}-${distribution.max}`;
}

function formatHour(hour: number): string {
  return `${Math.floor(hour).toString().padStart(2, "0")}:00`;
}

const sizeOptions = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);
const hourOptions = Array.from({ length: 24 }, (_, hour) => hour);
const lengthHourOptions = [1, 2, 3, 6, 12, 24, 48, 72];
