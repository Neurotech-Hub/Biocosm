import { DEFAULT_SPECIES_PRESET_ID } from "./speciesPresets";
import { defaultSpeciesModifiers } from "./speciesModifiers";
import type { BleSchedulingConfig, EnergyConfig, FixedPolicyConfig, SimulationConfig } from "./types";

/** Juxta v5/6 social-mode energy back-fit (see agent/juxta_ble_energy_model_mismatch_feedback.md). */
export const juxtaV56EnergyPreset: Pick<
  EnergyConfig,
  | "baselineCurrentMicroAmps"
  | "rxCurrentMa1MPhy"
  | "advertisingEventIntervalSeconds"
  | "advEventChargeMicroCoulombs"
  | "energyModel"
  | "measuredSocial5s20sTotalMicroAmps"
  | "componentBleActivityScale"
> = {
  baselineCurrentMicroAmps: 78,
  rxCurrentMa1MPhy: 6.4,
  advertisingEventIntervalSeconds: 0.15,
  advEventChargeMicroCoulombs: 13,
  energyModel: "component",
  measuredSocial5s20sTotalMicroAmps: 233.09,
  /**
   * Scales scan + advertising mAh (not baseline). Corrects event-scheduled duty vs datasheet long-run average
   * (safe zones, jitter, serial scan/adv) after baseline uses µA·s → mAh consistently.
   */
  componentBleActivityScale: 1.134
};

export const defaultBleScheduling: BleSchedulingConfig = {
  interBurstDelaySeconds: 0.1,
  randomPostIdleJitterMinSeconds: 0,
  randomPostIdleJitterMaxSeconds: 1.0,
  minuteWriteSafeZoneSeconds: 3,
  scanPreStartRadioStabilizationSeconds: 0.2
};

/** Matches JUXTA nRF52840 `main.c` operatingMode 0 (non-connectable adv, passive scan). */
export const juxtaMainCMode0FixedPolicy: FixedPolicyConfig = {
  id: "juxta-mainc-mode0",
  type: "fixed",
  name: "JUXTA main.c mode 0 (5s adv / 20s scan)",
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 5,
  advertisingBurstDurationSeconds: 2
};

export const defaultSimulationConfig: SimulationConfig = {
  seed: "42",
  speciesPresetId: DEFAULT_SPECIES_PRESET_ID,
  speciesModifiers: defaultSpeciesModifiers,
  startTimeSeconds: 6 * 60 * 60,
  simulationLengthSeconds: 24 * 60 * 60,
  timeStepSeconds: 60,
  radioStepSeconds: 1,
  animalCount: 6,
  pathNodeCount: 10,
  enclosure: {
    mode: "rectangle",
    width: 10,
    height: 10,
    boundaryBehavior: "constrain"
  },
  behavior: {
    circadianMode: "nocturnal",
    socialPauseProbability: 0.25,
    socialBoutMeanMinutes: 4
  },
  biology: {
    circadianPhaseOffsetHours: { min: -2, mode: 0, max: 2 },
    dailyActivityMinutes: { min: 180, mode: 420, max: 720 },
    majorSleepPeriodHours: { min: 6, mode: 9, max: 12 },
    sleepBoutMeanMinutes: { min: 20, mode: 60, max: 180 },
    movementBoutMeanMinutes: { min: 3, mode: 12, max: 35 },
    socialPropensity: { min: 0.1, mode: 0.45, max: 0.95 }
  },
  motionSensor: {
    thresholdMetersPerStep: 0.05,
    noiseSdMeters: 0.015,
    falsePositiveRate: 0.02,
    falseNegativeRate: 0.05
  },
  radio: {
    detectionRadiusMeters: 1,
    socialRadiusMeters: 1,
    rssiAtOneMeter: -60,
    pathLossExponent: 2,
    rssiNoiseSd: 4,
    rssiThreshold: -85,
    rssiSlope: 4
  },
  energy: {
    batteryCapacityMah: 40,
    startingVoltage: 4.2,
    txPowerDbm: 8,
    ...juxtaV56EnergyPreset
  },
  bleScheduling: { ...defaultBleScheduling },
  activePolicy: { ...juxtaMainCMode0FixedPolicy }
};

/** Datasheet Social Mode average draw (Adv 5 s / Scan 20 s), µA — use with `milliampHoursFromMeanMicroAmps`. */
export const JUXTA_DATASHEET_SOCIAL_MODE_MICRO_AMPS = 233.09 as const;

/** mAh over `hours` at constant average `meanMicroAmps` (e.g. 233.09 µA × 24 h ≈ 5.59 mAh). */
export function milliampHoursFromMeanMicroAmps(meanMicroAmps: number, hours: number): number {
  return (meanMicroAmps / 1000) * hours;
}

export const defaultAdaptivePolicy = {
  id: "motion-peer-adaptive",
  type: "motion_peer_adaptive",
  name: "Motion + peer adaptive BLE",
  scanIntervalMinSeconds: 10,
  scanIntervalMaxSeconds: 60,
  scanWindowMinSeconds: 0.5,
  scanWindowMaxSeconds: 1.5,
  advIntervalMinSeconds: 5,
  advIntervalMaxSeconds: 50,
  tauMotionSeconds: 10 * 60,
  tauPeerSeconds: 30 * 60,
  motionGain: 0.2,
  peerGain: 0.35,
  motionWeight: 0.5,
  peerWeight: 0.5,
  advertisingBurstDurationSeconds: 2
} as const;
