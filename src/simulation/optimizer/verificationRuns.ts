import { createInitialSimulation } from "../world";
import type { SimulationConfig } from "../types";
import {
  computeSweepRowFromRun,
  firmwarePolicyFromSweepSummary,
  runSimulationToEndChunked,
  type SweepTrial
} from "../sweep/adaptiveBleSweep";
import type { SweepPolicySummary } from "../sweep/sweepCandidates";
import type { PredictedPolicyCandidate } from "./types";
import type { VerifiedCandidateResult } from "./types";

export type OptimizerVerifyItem = {
  recommendationRole: string;
  candidate: PredictedPolicyCandidate;
  /** Policy row used to build firmware + trial (same as Sweep simulate). */
  sweepSummary: SweepPolicySummary;
};

function verifyCacheKey(summary: SweepPolicySummary): string {
  const p = summary.params;
  if (!p) {
    return summary.policyId;
  }
  if (p.family === "fixed") {
    return `fixed:${p.scanIntervalSeconds}|${p.scanWindowSeconds}|${p.advIntervalSeconds}`;
  }
  return `adaptive:${p.baselineDrive}|${p.motionWeight}|${p.peerWeight}|${p.tauPeerSeconds}`;
}

/**
 * Run simulator on each recommendation using builtConfig; dedupes identical policies.
 * Uses builtConfig.seed (spec §11).
 */
export async function verifyOptimizerCandidates(
  items: OptimizerVerifyItem[],
  builtConfig: SimulationConfig,
  options: {
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
    /** Seeds to average for verification; defaults to builtConfig.seed only. */
    verificationSeeds?: string[];
    verificationSeedMode?: "builtSeedSingle" | "sweepSeedsMean";
    baselineSummary?: SweepPolicySummary;
  } = {}
): Promise<VerifiedCandidateResult[]> {
  const metricsCache = new Map<string, { captureRate: number; mAhPerDay: number; bleEfficiency: number }>();
  const results: VerifiedCandidateResult[] = [];
  const verificationSeeds =
    options.verificationSeeds && options.verificationSeeds.length > 0
      ? [...new Set(options.verificationSeeds)]
      : [String(builtConfig.seed)];
  const baselineCapture =
    options.baselineSummary && options.baselineSummary.meanCaptureRate > 1e-18
      ? options.baselineSummary.meanCaptureRate
      : 1;
  const baselineEnergy =
    options.baselineSummary && options.baselineSummary.meanMahPerDay > 1e-18
      ? options.baselineSummary.meanMahPerDay
      : 1;
  const baselineEfficiency =
    options.baselineSummary && options.baselineSummary.meanBleEfficiency > 1e-18
      ? options.baselineSummary.meanBleEfficiency
      : 1;
  const total = items.length;
  let completed = 0;

  for (const item of items) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const { candidate, recommendationRole, sweepSummary } = item;
    const key = verifyCacheKey(sweepSummary);

    let verifiedCaptureRate: number;
    let verifiedMahPerDay: number;
    let verifiedBleEfficiency: number;

    const cached = metricsCache.get(key);
    if (cached) {
      verifiedCaptureRate = cached.captureRate;
      verifiedMahPerDay = cached.mAhPerDay;
      verifiedBleEfficiency = cached.bleEfficiency;
    } else {
      const policy = firmwarePolicyFromSweepSummary(sweepSummary, builtConfig);
      if (!policy) {
        completed += 1;
        options.onProgress?.(completed, total);
        continue;
      }

      let capSum = 0;
      let mahSum = 0;
      let effSum = 0;
      let used = 0;
      for (const seed of verificationSeeds) {
        const seedKey = `${key}|seed:${seed}`;
        const seedCached = metricsCache.get(seedKey);
        if (seedCached) {
          capSum += seedCached.captureRate;
          mahSum += seedCached.mAhPerDay;
          effSum += seedCached.bleEfficiency;
          used += 1;
          continue;
        }
        const trial: SweepTrial = {
          policyId: sweepSummary.policyId,
          kind: sweepSummary.kind,
          seed,
          policy
        };

        const config = structuredClone(builtConfig);
        config.seed = seed;
        config.activePolicy = policy;
        const initial = createInitialSimulation(config);

        const { finalState, mergedLogs, timeline } = await runSimulationToEndChunked(initial, {
          shouldAbort: () => options.signal?.aborted ?? false
        });

        const row = computeSweepRowFromRun(trial, finalState, mergedLogs, timeline);
        const metrics = {
          captureRate: row.captureRate,
          mAhPerDay: row.mAhPerDay,
          bleEfficiency: row.bleEfficiency
        };
        metricsCache.set(seedKey, metrics);
        capSum += metrics.captureRate;
        mahSum += metrics.mAhPerDay;
        effSum += metrics.bleEfficiency;
        used += 1;
      }
      verifiedCaptureRate = used > 0 ? capSum / used : 0;
      verifiedMahPerDay = used > 0 ? mahSum / used : 0;
      verifiedBleEfficiency = used > 0 ? effSum / used : 0;
      metricsCache.set(key, {
        captureRate: verifiedCaptureRate,
        mAhPerDay: verifiedMahPerDay,
        bleEfficiency: verifiedBleEfficiency
      });
    }

    results.push({
      candidateId: candidate.candidateId,
      recommendationRole,
      source: candidate.source,
      sweepPolicyId: candidate.sweepPolicyId,
      baselineDrive: candidate.baselineDrive,
      motionWeight: candidate.motionWeight,
      peerWeight: candidate.peerWeight,
      tauPeerSeconds: candidate.tauPeerSeconds,
      fixedScanIntervalSeconds: candidate.fixedScanIntervalSeconds ?? null,
      fixedScanWindowSeconds: candidate.fixedScanWindowSeconds ?? null,
      fixedAdvIntervalSeconds: candidate.fixedAdvIntervalSeconds ?? null,
      verificationSeedMode: options.verificationSeedMode ?? "builtSeedSingle",
      verificationSeeds,
      predictionClamped: candidate.predictionClamped,
      trainingNearestDistance: candidate.trainingNearestDistance,
      trainingOutsideEnvelope: candidate.trainingOutsideEnvelope,
      trainingOutsideAxes: candidate.trainingOutsideAxes,
      predictedCaptureRate: candidate.predictedCaptureRate,
      verifiedCaptureRate,
      predictedMahPerDay: candidate.predictedMahPerDay,
      verifiedMahPerDay,
      predictedBleEfficiency: candidate.predictedBleEfficiency,
      verifiedBleEfficiency,
      predictedRelativeCapture: candidate.predictedRelativeCapture,
      predictedRelativeEnergy: candidate.predictedRelativeEnergy,
      predictedRelativeEfficiency: candidate.predictedRelativeEfficiency,
      verifiedRelativeCapture: verifiedCaptureRate / baselineCapture,
      verifiedRelativeEnergy: verifiedMahPerDay / baselineEnergy,
      verifiedRelativeEfficiency: verifiedBleEfficiency / baselineEfficiency,
      capturePredictionError: verifiedCaptureRate - candidate.predictedCaptureRate,
      energyPredictionError: verifiedMahPerDay - candidate.predictedMahPerDay,
      efficiencyPredictionError: verifiedBleEfficiency - candidate.predictedBleEfficiency,
      captureRelativeError:
        candidate.predictedCaptureRate > 1e-18
          ? (verifiedCaptureRate - candidate.predictedCaptureRate) / candidate.predictedCaptureRate
          : 0,
      energyRelativeError:
        candidate.predictedMahPerDay > 1e-18
          ? (verifiedMahPerDay - candidate.predictedMahPerDay) / candidate.predictedMahPerDay
          : 0,
      efficiencyRelativeError:
        candidate.predictedBleEfficiency > 1e-18
          ? (verifiedBleEfficiency - candidate.predictedBleEfficiency) / candidate.predictedBleEfficiency
          : 0
    });

    completed += 1;
    options.onProgress?.(completed, total);
  }

  return results;
}
