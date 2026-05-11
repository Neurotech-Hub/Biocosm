import {
  blePolicyPresets,
  buildAdaptiveAnchorsFromBaseline,
  DEFAULT_BLE_POLICY_PRESET_ID,
  fixedPolicyFromPreset
} from "./blePolicyPresets";
import { DEFAULT_HARDWARE_ENERGY_PROFILE_ID, energyConfigFromHardwareProfileId } from "./hardwareEnergyProfiles";
import { DEFAULT_SPECIES_PRESET_ID } from "./speciesPresets";
import { defaultSpeciesModifiers } from "./speciesModifiers";
import type { BleSchedulingConfig, FixedPolicyConfig, SimulationConfig } from "./types";

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

const generalDiscoveryPreset = blePolicyPresets[DEFAULT_BLE_POLICY_PRESET_ID]!;

/** Default fixed policy: General discovery (asymmetric proximity baseline). */
export const generalDiscoveryFixedPolicy: FixedPolicyConfig = fixedPolicyFromPreset(generalDiscoveryPreset);

/**
 * Optional fixed row (e.g. after a sweep): faster scan/adv than catalog general-discovery, with inactive ×2.
 * Not used as the app default — that schedule raises capture and energy vs `generalDiscoveryFixedPolicy`.
 */
export const sweepStyleFixedProximityDdPolicy: FixedPolicyConfig = {
  type: "fixed",
  id: "sweep-fixed-s5-a1.25-w0.5-dd",
  name: "Fixed 5s scan / 0.5s win / 1.25s adv — inactive ×2",
  scanIntervalSeconds: 5,
  scanWindowSeconds: 0.5,
  advIntervalSeconds: 1.25,
  advertisingBurstDurationSeconds: 2,
  doubleWhenInactive: true
};

const defaultAdaptiveAnchors = buildAdaptiveAnchorsFromBaseline(generalDiscoveryPreset);

export const defaultAdaptivePolicy = {
  id: "motion-peer-adaptive",
  type: "motion_peer_adaptive",
  name: "Motion + peer adaptive BLE",
  timingAnchors: defaultAdaptiveAnchors,
  baselineDrive: 0.25,
  tauMotionSeconds: 180,
  tauPeerSeconds: 900,
  motionGain: 0.35,
  peerGain: 0.45,
  peerMissPenalty: 0.2,
  motionWeight: 0.45,
  peerWeight: 0.55,
  peerDetectionCountSaturation: 1,
  motionEventCountSaturation: 1,
  allowEnergySavingDownscale: true
} as const;

export const defaultSimulationConfig: SimulationConfig = {
  seed: "42",
  speciesPresetId: DEFAULT_SPECIES_PRESET_ID,
  speciesModifiers: defaultSpeciesModifiers,
  blePolicyPresetId: DEFAULT_BLE_POLICY_PRESET_ID,
  hardwareEnergyProfileId: DEFAULT_HARDWARE_ENERGY_PROFILE_ID,
  startTimeSeconds: 6 * 60 * 60,
  simulationLengthSeconds: 24 * 60 * 60,
  timeStepSeconds: 60,
  radioStepSeconds: 1,
  animalCount: 6,
  pathNodeCount: 10,
  enclosure: {
    mode: "rectangle",
    width: 20,
    height: 20,
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
    opportunitySampleStepSeconds: 1,
    socialRadiusMeters: 1,
    rssiAtOneMeter: -60,
    pathLossExponent: 2,
    rssiNoiseSd: 4,
    rssiThreshold: -85,
    rssiSlope: 4
  },
  energy: energyConfigFromHardwareProfileId(DEFAULT_HARDWARE_ENERGY_PROFILE_ID),
  bleScheduling: { ...defaultBleScheduling },
  /** Matches `blePolicyPresetId` general-discovery (20s scan / 1.5s win / 5s adv); lower duty than sweep-style fixed rows. */
  activePolicy: { ...generalDiscoveryFixedPolicy }
};

/** Datasheet Social Mode average draw (Adv 5 s / Scan 20 s), µA — use with `milliampHoursFromMeanMicroAmps`. */
export const JUXTA_DATASHEET_SOCIAL_MODE_MICRO_AMPS = 233.09 as const;

/** mAh over `hours` at constant average `meanMicroAmps` (e.g. 233.09 µA × 24 h ≈ 5.59 mAh). */
export function milliampHoursFromMeanMicroAmps(meanMicroAmps: number, hours: number): number {
  return (meanMicroAmps / 1000) * hours;
}
