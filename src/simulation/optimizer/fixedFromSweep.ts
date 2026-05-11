import type { SweepPolicySummary } from "../sweep/sweepCandidates";
import type { OptimizerCandidateSource } from "./candidateSource";
import type { PredictedPolicyCandidate } from "./types";

function baselineRatios(baseline: SweepPolicySummary): {
  capture: number;
  energy: number;
  efficiency: number;
} {
  const cap = baseline.meanCaptureRate > 1e-18 ? baseline.meanCaptureRate : 1;
  const en = baseline.meanMahPerDay > 1e-18 ? baseline.meanMahPerDay : 1;
  const eff = baseline.meanBleEfficiency > 1e-18 ? baseline.meanBleEfficiency : 1;
  return { capture: cap, energy: en, efficiency: eff };
}

/** Discrete fixed-policy candidates from sweep bundle (comparison baseline + fixed_sweep rows). */
export function sweepFixedSummariesToCandidates(
  baselineSummary: SweepPolicySummary,
  summaries: SweepPolicySummary[]
): PredictedPolicyCandidate[] {
  const base = baselineRatios(baselineSummary);
  const fixedSummaries: SweepPolicySummary[] = [];
  if (baselineSummary.kind === "baseline_fixed") {
    fixedSummaries.push(baselineSummary);
  }
  for (const s of summaries) {
    if (s.kind === "fixed_sweep") {
      fixedSummaries.push(s);
    }
  }

  const source: OptimizerCandidateSource = "observed_fixed";

  return fixedSummaries.map((s) => {
    const cap = s.meanCaptureRate;
    const mah = s.meanMahPerDay;
    const eff = s.meanBleEfficiency;
    return {
      candidateId: s.policyId,
      sweepPolicyId: s.policyId,
      source,
      baselineDrive: 0,
      motionWeight: 0,
      peerWeight: 0,
      tauPeerSeconds: 0,
      fixedScanIntervalSeconds:
        s.params?.family === "fixed" ? s.params.scanIntervalSeconds : null,
      fixedScanWindowSeconds:
        s.params?.family === "fixed" ? s.params.scanWindowSeconds : null,
      fixedAdvIntervalSeconds:
        s.params?.family === "fixed" ? s.params.advIntervalSeconds : null,
      predictedCaptureRate: cap,
      predictedMahPerDay: mah,
      predictedBleEfficiency: eff,
      predictedRelativeCapture: cap / base.capture,
      predictedRelativeEnergy: mah / base.energy,
      predictedRelativeEfficiency: eff / base.efficiency,
      isPredictedPareto: false,
      recommendationTags: [],
      predictionClamped: false,
      trainingNearestDistance: null,
      trainingOutsideEnvelope: false,
      trainingOutsideAxes: []
    };
  });
}
