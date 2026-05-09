import type { SimulationConfig } from "./types";

export const defaultSimulationConfig: SimulationConfig = {
  seed: "42",
  startTimeSeconds: 6 * 60 * 60,
  simulationLengthSeconds: 6 * 60 * 60,
  timeStepSeconds: 60,
  radioStepSeconds: 1,
  animalCount: 12,
  pathNodeCount: 18,
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
    detectionRadiusMeters: 1.2,
    socialRadiusMeters: 0.8,
    rssiAtOneMeter: -60,
    pathLossExponent: 2,
    rssiNoiseSd: 4,
    rssiThreshold: -85,
    rssiSlope: 4
  },
  energy: {
    batteryCapacityMah: 100,
    startingVoltage: 4.2,
    steadyCurrentMa: 0.05,
    scanCurrentMa: 5,
    advertisingCurrentMa: 5
  },
  activePolicy: {
    id: "fixed-rate",
    type: "fixed",
    name: "Fixed-rate BLE",
    scanIntervalSeconds: 60,
    scanWindowSeconds: 1.5,
    advIntervalSeconds: 30
  }
};

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
  peerWeight: 0.5
} as const;
