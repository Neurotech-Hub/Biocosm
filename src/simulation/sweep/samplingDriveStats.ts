import type { SimulationState } from "../types";

export type SamplingDriveDistribution = {
  meanSamplingDrive: number | null;
  percentTimeBelowFixed: number | null;
  percentTimeNearFixed: number | null;
  percentTimeAboveFixed: number | null;
};

export type MeanCollarTimings = {
  meanScanIntervalSeconds: number;
  meanScanWindowSeconds: number;
  meanAdvIntervalSeconds: number;
};

function cohortMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Time-weighted cohort mean sampling drive and band fractions (spec §11.4 thresholds). */
export function computeSamplingDriveDistribution(timeline: SimulationState[]): SamplingDriveDistribution {
  if (timeline.length <= 1) {
    return {
      meanSamplingDrive: null,
      percentTimeBelowFixed: null,
      percentTimeNearFixed: null,
      percentTimeAboveFixed: null
    };
  }

  const policyType = timeline[1]?.config.activePolicy.type;
  if (policyType !== "motion_peer_adaptive") {
    return {
      meanSamplingDrive: null,
      percentTimeBelowFixed: null,
      percentTimeNearFixed: null,
      percentTimeAboveFixed: null
    };
  }

  let sumDrive = 0;
  let below = 0;
  let near = 0;
  let above = 0;
  let count = 0;

  for (let i = 1; i < timeline.length; i += 1) {
    const animals = timeline[i].animals;
    if (animals.length === 0) {
      continue;
    }
    const mean = cohortMean(animals.map((animal) => animal.collar.samplingDrive));
    sumDrive += mean;
    count += 1;
    if (mean < 0.45) {
      below += 1;
    } else if (mean <= 0.55) {
      near += 1;
    } else {
      above += 1;
    }
  }

  if (count === 0) {
    return {
      meanSamplingDrive: null,
      percentTimeBelowFixed: null,
      percentTimeNearFixed: null,
      percentTimeAboveFixed: null
    };
  }

  const inv = 100 / count;
  return {
    meanSamplingDrive: sumDrive / count,
    percentTimeBelowFixed: below * inv,
    percentTimeNearFixed: near * inv,
    percentTimeAboveFixed: above * inv
  };
}

export function computeMeanCollarTimingsFromTimeline(timeline: SimulationState[]): MeanCollarTimings {
  if (timeline.length <= 1) {
    return { meanScanIntervalSeconds: 0, meanScanWindowSeconds: 0, meanAdvIntervalSeconds: 0 };
  }

  let sSum = 0;
  let wSum = 0;
  let aSum = 0;
  let count = 0;

  for (let i = 1; i < timeline.length; i += 1) {
    const animals = timeline[i].animals;
    if (animals.length === 0) {
      continue;
    }
    sSum += cohortMean(animals.map((animal) => animal.collar.scanIntervalSeconds));
    wSum += cohortMean(animals.map((animal) => animal.collar.scanWindowSeconds));
    aSum += cohortMean(animals.map((animal) => animal.collar.advIntervalSeconds));
    count += 1;
  }

  if (count === 0) {
    return { meanScanIntervalSeconds: 0, meanScanWindowSeconds: 0, meanAdvIntervalSeconds: 0 };
  }

  return {
    meanScanIntervalSeconds: sSum / count,
    meanScanWindowSeconds: wSum / count,
    meanAdvIntervalSeconds: aSum / count
  };
}
