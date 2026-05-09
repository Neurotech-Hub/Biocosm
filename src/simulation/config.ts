import type { SimulationConfig } from "./types";

export const defaultSimulationConfig: SimulationConfig = {
  seed: "42",
  simulationLengthSeconds: 6 * 60 * 60,
  timeStepSeconds: 60,
  animalCount: 12,
  pathNodeCount: 18,
  enclosure: {
    mode: "rectangle",
    width: 10,
    height: 6,
    boundaryBehavior: "constrain"
  },
  behavior: {
    circadianMode: "nocturnal",
    socialPauseProbability: 0.25,
    socialBoutMeanMinutes: 4
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
  fixedPolicy: {
    id: "fixed-rate",
    type: "fixed",
    scanIntervalSeconds: 180,
    scanWindowSeconds: 30,
    advIntervalSeconds: 30
  }
};
