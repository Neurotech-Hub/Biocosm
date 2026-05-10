import type { PredictedPolicyCandidate } from "./types";

/** Mutates candidates; marks predicted Pareto frontier (spec §9). */
export function markPredictedPareto(candidates: PredictedPolicyCandidate[]): void {
  const sorted = [...candidates].sort((a, b) => a.predictedMahPerDay - b.predictedMahPerDay);
  let bestCaptureSoFar = -Infinity;
  const paretoIds = new Set<string>();

  for (const c of sorted) {
    if (c.predictedCaptureRate > bestCaptureSoFar) {
      paretoIds.add(c.candidateId);
      bestCaptureSoFar = c.predictedCaptureRate;
    }
  }

  for (const c of candidates) {
    c.isPredictedPareto = paretoIds.has(c.candidateId);
  }
}
