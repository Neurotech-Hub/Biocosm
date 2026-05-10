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
  } = {}
): Promise<VerifiedCandidateResult[]> {
  const metricsCache = new Map<string, { captureRate: number; mAhPerDay: number; bleEfficiency: number }>();
  const results: VerifiedCandidateResult[] = [];
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
      const policy = firmwarePolicyFromSweepSummary(sweepSummary);
      if (!policy) {
        completed += 1;
        options.onProgress?.(completed, total);
        continue;
      }

      const trial: SweepTrial = {
        policyId: sweepSummary.policyId,
        kind: sweepSummary.kind,
        seed: String(builtConfig.seed),
        policy
      };

      const config = structuredClone(builtConfig);
      config.activePolicy = policy;
      const initial = createInitialSimulation(config);

      const { finalState, mergedLogs, timeline } = await runSimulationToEndChunked(initial, {
        shouldAbort: () => options.signal?.aborted ?? false
      });

      const row = computeSweepRowFromRun(trial, finalState, mergedLogs, timeline);
      verifiedCaptureRate = row.captureRate;
      verifiedMahPerDay = row.mAhPerDay;
      verifiedBleEfficiency = row.bleEfficiency;
      metricsCache.set(key, {
        captureRate: verifiedCaptureRate,
        mAhPerDay: verifiedMahPerDay,
        bleEfficiency: verifiedBleEfficiency
      });
    }

    results.push({
      candidateId: candidate.candidateId,
      recommendationRole,
      predictedCaptureRate: candidate.predictedCaptureRate,
      verifiedCaptureRate,
      predictedMahPerDay: candidate.predictedMahPerDay,
      verifiedMahPerDay,
      predictedBleEfficiency: candidate.predictedBleEfficiency,
      verifiedBleEfficiency,
      capturePredictionError: verifiedCaptureRate - candidate.predictedCaptureRate,
      energyPredictionError: verifiedMahPerDay - candidate.predictedMahPerDay,
      efficiencyPredictionError: verifiedBleEfficiency - candidate.predictedBleEfficiency
    });

    completed += 1;
    options.onProgress?.(completed, total);
  }

  return results;
}
