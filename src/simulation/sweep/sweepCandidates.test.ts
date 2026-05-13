import { describe, expect, it } from "vitest";
import { attachParetoEfficiency, computeParetoEfficientPolicyIds } from "./sweepCandidates";
import type { SweepPolicySummary } from "./sweepCandidates";

describe("computeParetoEfficientPolicyIds", () => {
  it("flags policies not dominated on capture vs mAh/day", () => {
    const ids = computeParetoEfficientPolicyIds([
      { policyId: "highCapLowE", meanCaptureRate: 0.6, meanMahPerDay: 5 },
      { policyId: "dominated", meanCaptureRate: 0.5, meanMahPerDay: 6 },
      { policyId: "lowCapLowE", meanCaptureRate: 0.55, meanMahPerDay: 4 }
    ]);
    expect(ids.has("highCapLowE")).toBe(true);
    expect(ids.has("lowCapLowE")).toBe(true);
    expect(ids.has("dominated")).toBe(false);
  });

  it("treats identical metrics as mutually non-dominating", () => {
    const ids = computeParetoEfficientPolicyIds([
      { policyId: "a", meanCaptureRate: 0.5, meanMahPerDay: 6 },
      { policyId: "b", meanCaptureRate: 0.5, meanMahPerDay: 6 }
    ]);
    expect(ids.size).toBe(2);
  });

  it("single policy is Pareto-efficient", () => {
    const ids = computeParetoEfficientPolicyIds([{ policyId: "only", meanCaptureRate: 0.4, meanMahPerDay: 8 }]);
    expect(ids.has("only")).toBe(true);
  });
});

describe("attachParetoEfficiency", () => {
  const fixedSummary = (id: string, cap: number, mAh: number): SweepPolicySummary => ({
    policyId: id,
    kind: "fixed_sweep",
    label: id,
    params: {
      family: "fixed",
      scanIntervalSeconds: 20,
      scanWindowSeconds: 3,
      advIntervalSeconds: 5
    },
    meanCaptureRate: cap,
    meanMahPerDay: mAh,
    meanBleEfficiency: cap / mAh,
    meanRelativeCapture: 1,
    meanRelativeEnergy: 1,
    meanRelativeEfficiency: 1,
    seedsUsed: 1,
    isParetoEfficient: false
  });

  it("sets isParetoEfficient on baseline and summaries", () => {
    const baseline: SweepPolicySummary = {
      ...fixedSummary("base", 0.5, 6),
      kind: "baseline_fixed",
      isComparisonBaseline: true
    };
    const s1 = fixedSummary("s1", 0.45, 7);
    const out = attachParetoEfficiency(baseline, [s1]);
    expect(typeof out.baselineSummary.isParetoEfficient).toBe("boolean");
    expect(out.summaries).toHaveLength(1);
    expect(typeof out.summaries[0]!.isParetoEfficient).toBe("boolean");
  });
});
