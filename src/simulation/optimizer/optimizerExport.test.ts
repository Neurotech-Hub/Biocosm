import { describe, expect, it } from "vitest";
import type { SweepPolicySummary } from "../sweep/sweepCandidates";
import {
  buildOptimizerMarkdownReport,
  serializeOptimizerPredictionsCsv,
  serializeOptimizerRecommendationsCsv,
  serializeOptimizerVerificationCsv
} from "./optimizerExport";
import { defaultOptimizerBounds } from "./bounds";
import { runOptimizerPipelineFromBundle } from "./pipeline";
import type { SweepResultBundle } from "../sweep/adaptiveBleSweep";

function minimalBundle(): SweepResultBundle {
  const summaries: SweepPolicySummary[] = [];
  for (let i = 0; i < 20; i += 1) {
    const t = 120 + i * 30;
    summaries.push({
      policyId: `ad-${i}`,
      kind: "adaptive",
      label: `ad-${i}`,
      params: {
        family: "adaptive",
        baselineDrive: 0.1 + i * 0.02,
        motionWeight: 0.2,
        peerWeight: 0.4,
        tauPeerSeconds: t
      },
      meanCaptureRate: 0.45,
      meanMahPerDay: 2,
      meanBleEfficiency: 0.225,
      meanRelativeCapture: 1,
      meanRelativeEnergy: 1,
      meanRelativeEfficiency: 1,
      seedsUsed: 1,
      isParetoEfficient: false
    });
  }
  const baseline: SweepPolicySummary = {
    policyId: "base",
    kind: "baseline_fixed",
    label: "Juxta",
    params: null,
    meanCaptureRate: 0.5,
    meanMahPerDay: 2,
    meanBleEfficiency: 0.25,
    meanRelativeCapture: 1,
    meanRelativeEnergy: 1,
    meanRelativeEfficiency: 1,
    seedsUsed: 1,
    isParetoEfficient: false
  };
  return {
    rawRows: [],
    summaries,
    baselineSummary: baseline,
    seedsUsed: ["1"],
    mode: "fast"
  };
}

describe("optimizerExport", () => {
  it("serializes CSV headers and markdown sections", () => {
    const bundle = minimalBundle();
    const pipeline = runOptimizerPipelineFromBundle(bundle, {
      candidateCount: 100,
      optimizerSeed: "export-test"
    });
    const predCsv = serializeOptimizerPredictionsCsv(pipeline.candidates);
    expect(predCsv.split("\n")[0]).toContain("candidateId");
    expect(predCsv.split("\n").length).toBe(102);

    const recCsv = serializeOptimizerRecommendationsCsv(pipeline.recommendations.picks);
    expect(recCsv.split("\n")[0]).toContain("role");
    expect(recCsv.split("\n").length).toBe(5);

    const md = buildOptimizerMarkdownReport({
      bundle,
      pipeline,
      bounds: defaultOptimizerBounds(),
      candidateCount: 100,
      optimizerSeed: "export-test",
      builtSeed: "1",
      verificationMode: "builtSeedSingle",
      verificationSeeds: ["1"]
    });
    expect(md).toContain("# Policy optimizer report");
    expect(md).toContain("## Model fit");
    expect(md).toContain("## Caveats and notes");

    const verCsv = serializeOptimizerVerificationCsv([]);
    expect(verCsv.split("\n")[0]).toContain("verifiedCaptureRate");
  });
});
