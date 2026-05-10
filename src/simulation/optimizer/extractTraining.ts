import type { SweepPolicySummary } from "../sweep/sweepCandidates";
import type { OptimizerTrainingRow } from "./responseSurface";

export function sweepSummariesToTrainingRows(summaries: SweepPolicySummary[]): OptimizerTrainingRow[] {
  const rows: OptimizerTrainingRow[] = [];
  for (const s of summaries) {
    if (s.kind !== "adaptive" || !s.params || s.params.family !== "adaptive") {
      continue;
    }
    const p = s.params;
    rows.push({
      baselineDrive: p.baselineDrive,
      motionWeight: p.motionWeight,
      peerWeight: p.peerWeight,
      tauPeerSeconds: p.tauPeerSeconds,
      captureRate: s.meanCaptureRate,
      mahPerDay: s.meanMahPerDay
    });
  }
  return rows;
}
