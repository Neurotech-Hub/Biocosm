import { describe, expect, it } from "vitest";
import type { SweepPolicySummary } from "../sweep/sweepCandidates";
import { generateAdaptiveCandidates } from "./candidateGeneration";
import { defaultOptimizerBounds } from "./bounds";
import { featuresFromNormalized } from "./features";
import { OPTIMIZER_FEATURE_COUNT } from "./features";
import { accumulateXtXy, solveLinearSystem } from "./matrix";
import { markPredictedPareto } from "./pareto";
import { normalizeAdaptiveParams } from "./normalize";
import { runOptimizerPipeline } from "./pipeline";
import type { PredictedPolicyCandidate } from "./types";

function syntheticAdaptiveSummary(
  id: string,
  bd: number,
  mw: number,
  pw: number,
  tau: number,
  cap: number,
  mah: number
): SweepPolicySummary {
  return {
    policyId: id,
    kind: "adaptive",
    label: id,
    params: {
      family: "adaptive",
      baselineDrive: bd,
      motionWeight: mw,
      peerWeight: pw,
      tauPeerSeconds: tau
    },
    meanCaptureRate: cap,
    meanMahPerDay: mah,
    meanBleEfficiency: mah > 1e-12 ? cap / mah : 0,
    meanRelativeCapture: 1,
    meanRelativeEnergy: 1,
    meanRelativeEfficiency: 1,
    seedsUsed: 1,
    isParetoEfficient: false
  };
}

function baselineSummary(): SweepPolicySummary {
  return {
    policyId: "baseline",
    kind: "baseline_fixed",
    label: "Juxta",
    isJuxtaReference: true,
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
}

describe("optimizer features", () => {
  it("has 15 terms with leading constant 1", () => {
    const b = defaultOptimizerBounds();
    const n = normalizeAdaptiveParams(0.2, 0.35, 0.5, 300, b);
    const phi = featuresFromNormalized(n);
    expect(phi.length).toBe(OPTIMIZER_FEATURE_COUNT);
    expect(phi[0]).toBe(1);
  });
});

describe("matrix helpers", () => {
  it("solves a 2x2 system", () => {
    const A = [
      [2, 1],
      [1, 3]
    ];
    const x = solveLinearSystem(
      A.map((r) => [...r]),
      [1, 2]
    );
    expect(x[0]).toBeCloseTo(0.2, 5);
    expect(x[1]).toBeCloseTo(0.6, 5);
  });

  it("accumulates XtX", () => {
    const X = [
      [1, 0],
      [1, 1]
    ];
    const { XtX, Xty } = accumulateXtXy(X, [2, 4]);
    expect(XtX[0]![0]).toBe(2);
    expect(Xty[0]).toBe(6);
  });
});

describe("predicted Pareto", () => {
  it("marks frontier along energy sort", () => {
    const mk = (
      id: string,
      cap: number,
      mah: number,
      rel = 1
    ): PredictedPolicyCandidate => ({
      candidateId: id,
      source: "predicted_adaptive",
      sweepPolicyId: id,
      baselineDrive: 0.2,
      motionWeight: 0.3,
      peerWeight: 0.5,
      tauPeerSeconds: 120,
      predictedCaptureRate: cap,
      predictedMahPerDay: mah,
      predictedBleEfficiency: cap / mah,
      predictedRelativeCapture: rel,
      predictedRelativeEnergy: rel,
      predictedRelativeEfficiency: rel,
      isPredictedPareto: false,
      recommendationTags: []
    });

    const cands = [mk("a", 0.5, 5), mk("b", 0.6, 6), mk("c", 0.55, 4)];
    markPredictedPareto(cands);
    const byId = Object.fromEntries(cands.map((c) => [c.candidateId, c.isPredictedPareto]));
    expect(byId["c"]).toBe(true);
    expect(byId["b"]).toBe(true);
    expect(byId["a"]).toBe(false);
  });
});

describe("runOptimizerPipeline", () => {
  it("is deterministic for seed and produces recommendations", () => {
    const summaries: SweepPolicySummary[] = [];
    let k = 0;
    for (let bd = 0.12; bd <= 0.45; bd += 0.11) {
      for (let mw = 0.22; mw <= 0.5; mw += 0.14) {
        for (let pw = 0.35; pw <= 0.85; pw += 0.25) {
          for (const tau of [120, 300, 600]) {
            const cap = 0.4 + bd * 0.2 + mw * 0.05;
            const mah = 2 + pw * 0.3;
            summaries.push(
              syntheticAdaptiveSummary(`p${k}`, bd, mw, pw, tau, cap, mah)
            );
            k += 1;
          }
        }
      }
    }

    const base = baselineSummary();
    const r1 = runOptimizerPipeline({
      summaries,
      baselineSummary: base,
      candidateCount: 500,
      optimizerSeed: "seed-a"
    });
    const r2 = runOptimizerPipeline({
      summaries,
      baselineSummary: base,
      candidateCount: 500,
      optimizerSeed: "seed-a"
    });
    expect(r1.candidates.length).toBe(501);
    expect(r2.candidates[0]!.predictedCaptureRate).toBeCloseTo(
      r1.candidates[0]!.predictedCaptureRate,
      12
    );
    expect(r1.recommendations.picks.length).toBe(5);
    expect(r1.model.captureR2).toBeGreaterThan(0);
  });

  it("throws when too few training rows", () => {
    const few = Array.from({ length: 10 }, (_, i) =>
      syntheticAdaptiveSummary(`p${i}`, 0.2, 0.3, 0.5, 120, 0.5, 2)
    );
    expect(() =>
      runOptimizerPipeline({
        summaries: few,
        baselineSummary: baselineSummary(),
        candidateCount: 100,
        optimizerSeed: "x"
      })
    ).toThrow(/at least 15/);
  });
});

describe("candidateGeneration", () => {
  it("uses log-uniform tau in bounds", () => {
    const b = defaultOptimizerBounds();
    const c = generateAdaptiveCandidates(2000, "opt-test", b);
    for (const row of c) {
      expect(row.tauPeerSeconds).toBeGreaterThanOrEqual(b.tauPeerSeconds.min - 1e-9);
      expect(row.tauPeerSeconds).toBeLessThanOrEqual(b.tauPeerSeconds.max + 1e-9);
    }
  });
});
