import { describe, expect, it } from "vitest";
import { defaultSimulationConfig } from "../config";
import type { SweepResultBundle } from "./adaptiveBleSweep";
import type { CandidatePick } from "./sweepCandidates";
import { buildSweepMarkdownReport } from "./sweepExport";

const stubBaselineSummary: SweepResultBundle["baselineSummary"] = {
  policyId: "stub-base",
  kind: "baseline_fixed",
  label: "Baseline",
  isComparisonBaseline: true,
  params: {
    family: "fixed",
    scanIntervalSeconds: 20,
    scanWindowSeconds: 3,
    advIntervalSeconds: 5
  },
  meanCaptureRate: 0.5,
  meanMahPerDay: 6,
  meanBleEfficiency: 0.5 / 6,
  meanRelativeCapture: 1,
  meanRelativeEnergy: 1,
  meanRelativeEfficiency: 1,
  seedsUsed: 1,
  isParetoEfficient: true
};

function stubBundle(mode: SweepResultBundle["mode"] = "fast"): SweepResultBundle {
  return {
    rawRows: [],
    summaries: [],
    baselineSummary: stubBaselineSummary,
    seedsUsed: ["101"],
    mode
  };
}

describe("buildSweepMarkdownReport", () => {
  it("does not claim a Juxta baseline when balanced-adaptive is selected", () => {
    const cfg = { ...defaultSimulationConfig, blePolicyPresetId: "balanced-adaptive" as const };
    const md = buildSweepMarkdownReport({
      baseConfig: cfg,
      bundle: stubBundle(),
      candidates: [] as CandidatePick[]
    });
    expect(md.toLowerCase()).not.toContain("juxta baseline");
    expect(md).toMatch(/asymmetric|battery|small-battery/i);
  });

  it("notes energy tradeoff when comparison baseline is high-capture", () => {
    const cfg = { ...defaultSimulationConfig, blePolicyPresetId: "high-capture" as const };
    const md = buildSweepMarkdownReport({
      baseConfig: cfg,
      bundle: stubBundle(),
      candidates: [] as CandidatePick[]
    });
    expect(md).toMatch(/high-capture|energy/i);
  });
});
