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
    scanWindowSeconds: 1.5,
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
  it("does not claim a Juxta baseline when general-discovery is selected", () => {
    const cfg = { ...defaultSimulationConfig, blePolicyPresetId: "general-discovery" as const };
    const md = buildSweepMarkdownReport({
      baseConfig: cfg,
      bundle: stubBundle(),
      candidates: [] as CandidatePick[]
    });
    expect(md.toLowerCase()).not.toContain("juxta baseline");
    expect(md).toMatch(/asymmetric/i);
  });

  it("warns when comparison baseline is symmetric-example", () => {
    const cfg = { ...defaultSimulationConfig, blePolicyPresetId: "symmetric-example" as const };
    const md = buildSweepMarkdownReport({
      baseConfig: cfg,
      bundle: stubBundle(),
      candidates: [] as CandidatePick[]
    });
    expect(md).toMatch(/symmetric/i);
    expect(md).toMatch(/efficient/i);
  });
});
