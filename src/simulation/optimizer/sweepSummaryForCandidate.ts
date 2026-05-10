import type { SweepResultBundle } from "../sweep/adaptiveBleSweep";
import type { SweepPolicySummary } from "../sweep/sweepCandidates";
import type { PredictedPolicyCandidate } from "./types";

/** Minimal SweepPolicySummary so `firmwarePolicyFromSweepSummary` can build a policy for Simulator. */
export function buildSyntheticAdaptiveSweepSummary(c: PredictedPolicyCandidate): SweepPolicySummary {
  return {
    policyId: c.candidateId,
    kind: "adaptive",
    label: `Optimizer ${c.candidateId}`,
    params: {
      family: "adaptive",
      baselineDrive: c.baselineDrive,
      motionWeight: c.motionWeight,
      peerWeight: c.peerWeight,
      tauPeerSeconds: c.tauPeerSeconds
    },
    meanCaptureRate: c.predictedCaptureRate,
    meanMahPerDay: c.predictedMahPerDay,
    meanBleEfficiency: c.predictedBleEfficiency,
    meanRelativeCapture: c.predictedRelativeCapture,
    meanRelativeEnergy: c.predictedRelativeEnergy,
    meanRelativeEfficiency: c.predictedRelativeEfficiency,
    seedsUsed: 1,
    isParetoEfficient: false
  };
}

export function sweepSummaryForOptimizerCandidate(
  bundle: SweepResultBundle,
  c: PredictedPolicyCandidate
): SweepPolicySummary {
  if (c.source === "observed_fixed") {
    if (c.sweepPolicyId === bundle.baselineSummary.policyId) {
      return bundle.baselineSummary;
    }
    const row = bundle.summaries.find((s) => s.policyId === c.sweepPolicyId);
    if (!row) {
      throw new Error(`Missing sweep summary for fixed policy ${c.sweepPolicyId}`);
    }
    return row;
  }
  return buildSyntheticAdaptiveSweepSummary(c);
}
