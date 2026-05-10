import type { MotionPeerAdaptivePolicyConfig } from "../types";

export type PolicyKind = "baseline_fixed" | "adaptive";

export type SweepPolicySummary = {
  policyId: string;
  kind: PolicyKind;
  label: string;
  /** Swept parameters; null for baseline. */
  params: Pick<MotionPeerAdaptivePolicyConfig, "baselineDrive" | "motionWeight" | "peerWeight" | "tauPeerSeconds"> | null;
  /** Mean across seeds (report mode) or single value (fast mode). */
  meanCaptureRate: number;
  meanMahPerDay: number;
  meanBleEfficiency: number;
  meanRelativeCapture: number;
  meanRelativeEnergy: number;
  meanRelativeEfficiency: number;
  /** Population std (report mode); 0 for single seed. */
  stdCaptureRate?: number;
  seedsUsed: number;
};

export type CandidatePick = {
  role: "energySaving" | "balanced" | "highCapture";
  summary: SweepPolicySummary | null;
  meetsThreshold: boolean;
  note?: string;
};

const MIN_CAPTURE_FRAC = 0.8;
const ENERGY_SAVING_MIN_REL_CAPTURE = 0.9;
const BALANCED_MIN_REL_CAPTURE = 1.0;
const BALANCED_MAX_REL_ENERGY = 1.15;

function isEligibleForRecommendation(summary: SweepPolicySummary, baselineCapture: number): boolean {
  if (summary.kind === "baseline_fixed") {
    return false;
  }
  return summary.meanCaptureRate >= MIN_CAPTURE_FRAC * baselineCapture;
}

export function pickSweepCandidates(
  summaries: SweepPolicySummary[],
  baselineCaptureRate: number
): CandidatePick[] {
  const adaptive = summaries.filter((row) => row.kind === "adaptive");

  const eligible = adaptive.filter((row) => isEligibleForRecommendation(row, baselineCaptureRate));

  // Energy-saving: relativeEnergy < 1, relativeCapture >= 0.9, lowest relativeEnergy among those
  const energySavingStrict = eligible.filter(
    (row) => row.meanRelativeEnergy < 1 && row.meanRelativeCapture >= ENERGY_SAVING_MIN_REL_CAPTURE
  );
  const energySavingFallback = eligible.filter((row) => row.meanRelativeCapture >= ENERGY_SAVING_MIN_REL_CAPTURE);
  let energySaving: SweepPolicySummary | null = null;
  let energySavingMeets = false;
  if (energySavingStrict.length > 0) {
    energySaving = [...energySavingStrict].sort((a, b) => a.meanRelativeEnergy - b.meanRelativeEnergy)[0] ?? null;
    energySavingMeets = true;
  } else if (energySavingFallback.length > 0) {
    energySaving =
      [...energySavingFallback].sort((a, b) => a.meanRelativeEnergy - b.meanRelativeEnergy)[0] ?? null;
    energySavingMeets = false;
  } else if (eligible.length > 0) {
    energySaving =
      [...eligible].sort(
        (a, b) =>
          Math.abs(a.meanRelativeCapture - ENERGY_SAVING_MIN_REL_CAPTURE) -
          Math.abs(b.meanRelativeCapture - ENERGY_SAVING_MIN_REL_CAPTURE)
      )[0] ?? null;
    energySavingMeets = false;
  }

  // Balanced: relativeCapture >= 1, relativeEnergy <= 1.15, highest relativeEfficiency
  const balancedPool = eligible.filter(
    (row) =>
      row.meanRelativeCapture >= BALANCED_MIN_REL_CAPTURE && row.meanRelativeEnergy <= BALANCED_MAX_REL_ENERGY
  );
  let balanced: SweepPolicySummary | null = null;
  let balancedMeets = balancedPool.length > 0;
  if (balancedMeets) {
    balanced = [...balancedPool].sort((a, b) => b.meanRelativeEfficiency - a.meanRelativeEfficiency)[0] ?? null;
  } else {
    const fb = eligible.filter((row) => row.meanRelativeEnergy <= BALANCED_MAX_REL_ENERGY);
    if (fb.length > 0) {
      balanced = [...fb].sort((a, b) => b.meanRelativeEfficiency - a.meanRelativeEfficiency)[0] ?? null;
    } else if (eligible.length > 0) {
      balanced = [...eligible].sort((a, b) => b.meanRelativeEfficiency - a.meanRelativeEfficiency)[0] ?? null;
    }
    balancedMeets = false;
  }

  // High capture: max capture rate (any adaptive)
  const highCapture =
    adaptive.length > 0 ? [...adaptive].sort((a, b) => b.meanCaptureRate - a.meanCaptureRate)[0] ?? null : null;

  const picks: CandidatePick[] = [
    {
      role: "energySaving",
      summary: energySaving,
      meetsThreshold: energySavingMeets && Boolean(energySaving),
      note:
        energySaving && !energySavingMeets
          ? "Strict thresholds not met; showing closest policy among eligible or nearest capture target."
          : undefined
    },
    {
      role: "balanced",
      summary: balanced,
      meetsThreshold: balancedMeets && Boolean(balanced),
      note:
        balanced && !balancedMeets
          ? "No policy met relativeCapture ≥ 1.0 and relativeEnergy ≤ 1.15; showing best efficiency among eligible."
          : undefined
    },
    {
      role: "highCapture",
      summary: highCapture,
      meetsThreshold: true
    }
  ];

  return picks;
}
