import type { SweepPolicyKind } from "../types";

export type PolicyKind = SweepPolicyKind;

/** Discriminated params for Simulate / exports (Juxta baseline uses family fixed). */
export type SweepPolicyParams =
  | {
      family: "adaptive";
      baselineDrive: number;
      motionWeight: number;
      peerWeight: number;
      tauPeerSeconds: number;
    }
  | {
      family: "fixed";
      scanIntervalSeconds: number;
      scanWindowSeconds: number;
      advIntervalSeconds: number;
      advertisingBurstDurationSeconds?: number;
      /** When true, inactive scan stretch (bout-delayed) matches a sweep row with inactive multiplier. */
      doubleWhenInactive?: boolean;
      /** Scan interval multiplier when inactive stretch applies (sweep uses 2 or 5). */
      inactiveScanIntervalMultiplier?: 2 | 3 | 4 | 5;
    };

export type SweepPolicySummary = {
  policyId: string;
  kind: PolicyKind;
  label: string;
  /** True for the selected comparison BLE baseline row (`baseline_fixed`). */
  isComparisonBaseline?: boolean;
  params: SweepPolicyParams | null;
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
  /**
   * Non-dominated on (maximize mean capture, minimize mean mAh/day) among baseline + all sweep summaries.
   */
  isParetoEfficient: boolean;
};

export type CandidatePick = {
  role: "bestFixed" | "bestAdaptive";
  summary: SweepPolicySummary | null;
  meetsThreshold: boolean;
  note?: string;
};

const MIN_CAPTURE_FRAC = 0.8;

/**
 * Pareto frontier on maximize capture, minimize energy (mAh/day).
 * Policy j dominates i if j has >= capture, <= mAh, with at least one strict improvement.
 */
export function computeParetoEfficientPolicyIds(
  policies: { policyId: string; meanCaptureRate: number; meanMahPerDay: number }[]
): Set<string> {
  const ids = new Set<string>();
  const n = policies.length;
  for (let i = 0; i < n; i++) {
    const pi = policies[i]!;
    let dominated = false;
    for (let j = 0; j < n; j++) {
      if (i === j) {
        continue;
      }
      const pj = policies[j]!;
      const capOk = pj.meanCaptureRate >= pi.meanCaptureRate;
      const energyOk = pj.meanMahPerDay <= pi.meanMahPerDay;
      const strictGain =
        pj.meanCaptureRate > pi.meanCaptureRate || pj.meanMahPerDay < pi.meanMahPerDay;
      if (capOk && energyOk && strictGain) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      ids.add(pi.policyId);
    }
  }
  return ids;
}

export function attachParetoEfficiency(
  baselineSummary: SweepPolicySummary,
  summaries: SweepPolicySummary[]
): { baselineSummary: SweepPolicySummary; summaries: SweepPolicySummary[] } {
  const combined = [baselineSummary, ...summaries];
  const paretoIds = computeParetoEfficientPolicyIds(combined);
  return {
    baselineSummary: { ...baselineSummary, isParetoEfficient: paretoIds.has(baselineSummary.policyId) },
    summaries: summaries.map((row) => ({
      ...row,
      isParetoEfficient: paretoIds.has(row.policyId)
    }))
  };
}

function bestByEfficiency(policies: SweepPolicySummary[]): SweepPolicySummary | null {
  if (policies.length === 0) {
    return null;
  }
  return [...policies].sort((a, b) => b.meanBleEfficiency - a.meanBleEfficiency)[0] ?? null;
}

/**
 * Mixed sweep recommendations: best fixed-rate (including Juxta 5.6 in the pool) vs best adaptive by mean BLE efficiency.
 */
export function pickSweepCandidates(
  baselineSummary: SweepPolicySummary,
  summaries: SweepPolicySummary[],
  baselineCaptureRate: number
): CandidatePick[] {
  const adaptive = summaries.filter((row) => row.kind === "adaptive");
  const fixedExtras = summaries.filter(
    (row) =>
      row.kind === "fixed_sweep" ||
      row.kind === "fixed_sweep_inactivity_double" ||
      row.kind === "fixed_sweep_inactive_scan_x5" ||
      row.kind === "baseline_fixed_inactivity_double" ||
      row.kind === "baseline_fixed_inactive_scan_x5"
  );

  const fixedPool: SweepPolicySummary[] = [baselineSummary, ...fixedExtras];
  const bestFixed = bestByEfficiency(fixedPool);

  const eligibleAdaptive = adaptive.filter((row) => row.meanCaptureRate >= MIN_CAPTURE_FRAC * baselineCaptureRate);
  const bestAdaptiveEligible = bestByEfficiency(eligibleAdaptive);
  const bestAdaptiveOverall = bestByEfficiency(adaptive);

  const chosenAdaptive = bestAdaptiveEligible ?? bestAdaptiveOverall;
  const meetsAdaptiveThreshold = Boolean(bestAdaptiveEligible);

  const noteFixed =
    bestFixed && bestFixed.isComparisonBaseline
      ? "Best fixed-rate in this sweep is the comparison baseline schedule."
      : undefined;

  const noteAdaptive =
    !meetsAdaptiveThreshold && bestAdaptiveOverall
      ? `No adaptive policy reached ${(MIN_CAPTURE_FRAC * 100).toFixed(0)}% of baseline capture; showing best-efficiency adaptive anyway.`
      : undefined;

  return [
    {
      role: "bestFixed",
      summary: bestFixed,
      meetsThreshold: Boolean(bestFixed),
      note: noteFixed
    },
    {
      role: "bestAdaptive",
      summary: chosenAdaptive,
      meetsThreshold: meetsAdaptiveThreshold && Boolean(chosenAdaptive),
      note: noteAdaptive
    }
  ];
}
