import { interpolatedAnimalDistance } from "./geometry";
import type { Animal, RadioConfig } from "./types";

export type DyadEpochSummary = {
  withinDetectionRadiusAny: boolean;
  inRangeSeconds: number;
  minDistanceMeters: number;
};

export function summarizeDyadEpoch(
  animalAStart: Animal,
  animalAEnd: Animal,
  animalBStart: Animal,
  animalBEnd: Animal,
  epochStart: number,
  epochEnd: number,
  radio: RadioConfig
): DyadEpochSummary {
  const sampleStepSeconds = Math.max(0.001, radio.opportunitySampleStepSeconds);
  const sampleTimes = epochSampleTimes(epochStart, epochEnd, sampleStepSeconds);
  let withinDetectionRadiusAny = false;
  let inRangeSamples = 0;
  let minDistanceMeters = Number.POSITIVE_INFINITY;

  for (const time of sampleTimes) {
    const distanceMeters = interpolatedAnimalDistance(
      animalAStart,
      animalAEnd,
      animalBStart,
      animalBEnd,
      time,
      epochStart,
      epochEnd
    );
    minDistanceMeters = Math.min(minDistanceMeters, distanceMeters);
    if (distanceMeters <= radio.detectionRadiusMeters) {
      withinDetectionRadiusAny = true;
      inRangeSamples++;
    }
  }

  const epochSeconds = Math.max(0, epochEnd - epochStart);
  return {
    withinDetectionRadiusAny,
    inRangeSeconds: Math.min(epochSeconds, inRangeSamples * sampleStepSeconds),
    minDistanceMeters: Number.isFinite(minDistanceMeters)
      ? minDistanceMeters
      : interpolatedAnimalDistance(animalAStart, animalAEnd, animalBStart, animalBEnd, epochEnd, epochStart, epochEnd)
  };
}

function epochSampleTimes(epochStart: number, epochEnd: number, stepSeconds: number): number[] {
  if (epochEnd <= epochStart) {
    return [epochEnd];
  }

  const times: number[] = [];
  for (let time = epochStart; time < epochEnd; time += stepSeconds) {
    times.push(time);
  }
  if (times.at(-1) !== epochEnd) {
    times.push(epochEnd);
  }
  return times;
}
