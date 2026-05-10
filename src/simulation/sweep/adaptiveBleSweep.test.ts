import { describe, expect, it } from "vitest";
import { defaultSimulationConfig } from "../config";
import {
  adaptiveSweepPolicyCount,
  buildSweepGridPolicies,
  buildSweepTrials,
  fixedSweepPolicyCount,
  finalizeSweepBundle,
  policiesPerSweepSeed,
  runSingleSweepTrialSync,
  SWEEP_BASELINE_POLICY_ID,
  SWEEP_FULL_BASELINE_DRIVES,
  SWEEP_FULL_MOTION_WEIGHTS,
  SWEEP_FULL_PEER_WEIGHTS,
  SWEEP_FULL_TAU_PEER_SECONDS,
  SWEEP_QUICK_BASELINE_DRIVES,
  SWEEP_QUICK_MOTION_WEIGHTS,
  SWEEP_QUICK_PEER_WEIGHTS,
  SWEEP_QUICK_TAU_PEER_SECONDS,
  sweepTrialCount
} from "./adaptiveBleSweep";
import { pickSweepCandidates } from "./sweepCandidates";
import type { SweepPolicySummary } from "./sweepCandidates";

describe("adaptive BLE sweep", () => {
  it("defaults to quick grid: fixed (27 incl. Juxta 5.6) + 54 adaptive; full adaptive grid is 90", () => {
    const fullProduct =
      SWEEP_FULL_BASELINE_DRIVES.length *
      SWEEP_FULL_MOTION_WEIGHTS.length *
      SWEEP_FULL_PEER_WEIGHTS.length *
      SWEEP_FULL_TAU_PEER_SECONDS.length;
    const quickProduct =
      SWEEP_QUICK_BASELINE_DRIVES.length *
      SWEEP_QUICK_MOTION_WEIGHTS.length *
      SWEEP_QUICK_PEER_WEIGHTS.length *
      SWEEP_QUICK_TAU_PEER_SECONDS.length;
    expect(fullProduct).toBe(90);
    expect(quickProduct).toBe(54);

    expect(fixedSweepPolicyCount("quick")).toBe(27);
    expect(adaptiveSweepPolicyCount("quick")).toBe(quickProduct);
    expect(policiesPerSweepSeed("quick")).toBe(27 + quickProduct);
    expect(buildSweepGridPolicies("quick")).toHaveLength(quickProduct);
    expect(buildSweepTrials("fast", "42", { gridVariant: "quick" })).toHaveLength(
      sweepTrialCount("fast", { gridVariant: "quick" })
    );
    expect(buildSweepTrials("report", "42", { gridVariant: "quick", reportSeedCount: 3 })).toHaveLength(
      sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 3 })
    );
    expect(sweepTrialCount("fast", { gridVariant: "quick" })).toBe(81);
    expect(sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 3 })).toBe(243);
    expect(sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 5 })).toBe(405);
  });

  it("quick grid includes low-duty and upscale corners (brackets Juxta on drive)", () => {
    const policies = buildSweepGridPolicies("quick");
    expect(policies.some((p) => p.baselineDrive === 0.12 && p.motionWeight === 0.22 && p.peerWeight === 0.35)).toBe(true);
    expect(policies.some((p) => p.baselineDrive === 0.45 && p.motionWeight === 0.5 && p.peerWeight === 0.85)).toBe(true);
    expect(policies.some((p) => p.peerWeight === 0.6 && p.tauPeerSeconds === 300)).toBe(true);
  });

  it("aggregates rows and selects candidates", () => {
    const baseRow = (overrides: Partial<import("./adaptiveBleSweep").SweepRawRow>): import("./adaptiveBleSweep").SweepRawRow => ({
      policyId: SWEEP_BASELINE_POLICY_ID,
      kind: "baseline_fixed",
      seed: "101",
      scheduledScanIntervalSeconds: 20,
      scheduledScanWindowSeconds: 1.5,
      scheduledAdvIntervalSeconds: 5,
      baselineDrive: null,
      motionWeight: null,
      peerWeight: null,
      tauPeerSeconds: null,
      tauMotionSeconds: 120,
      motionGain: 0.35,
      peerGain: 0.5,
      peerMissPenalty: 0.25,
      allowEnergySavingDownscale: true,
      captureRate: 0.5,
      mAhPerDay: 6,
      bleEfficiency: 0.5 / 6,
      relativeCapture: 1,
      relativeEnergy: 1,
      relativeEfficiency: 1,
      opportunityEpochs: 100,
      hitEpochs: 50,
      missedEpochs: 50,
      meanSamplingDrive: null,
      percentTimeBelowFixed: null,
      percentTimeNearFixed: null,
      percentTimeAboveFixed: null,
      meanScanIntervalSeconds: 20,
      meanScanWindowSeconds: 1.5,
      meanAdvIntervalSeconds: 5,
      ...overrides
    });

    const rows = [
      baseRow({}),
      baseRow({
        policyId: "ad-a",
        kind: "adaptive",
        scheduledScanIntervalSeconds: null,
        scheduledScanWindowSeconds: null,
        scheduledAdvIntervalSeconds: null,
        baselineDrive: 0.25,
        motionWeight: 0.25,
        peerWeight: 0.5,
        tauPeerSeconds: 120,
        captureRate: 0.48,
        mAhPerDay: 5,
        bleEfficiency: 0.096,
        relativeCapture: 0.96,
        relativeEnergy: 5 / 6,
        relativeEfficiency: 0.096 / (0.5 / 6),
        meanSamplingDrive: 0.44,
        percentTimeBelowFixed: 30,
        percentTimeNearFixed: 50,
        percentTimeAboveFixed: 20
      }),
      baseRow({
        policyId: "ad-b",
        kind: "adaptive",
        scheduledScanIntervalSeconds: null,
        scheduledScanWindowSeconds: null,
        scheduledAdvIntervalSeconds: null,
        baselineDrive: 0.5,
        motionWeight: 0.5,
        peerWeight: 1,
        tauPeerSeconds: 600,
        captureRate: 0.52,
        mAhPerDay: 6.5,
        bleEfficiency: 0.52 / 6.5,
        relativeCapture: 1.04,
        relativeEnergy: 6.5 / 6,
        relativeEfficiency: (0.52 / 6.5) / (0.5 / 6),
        meanSamplingDrive: 0.62,
        percentTimeBelowFixed: 10,
        percentTimeNearFixed: 30,
        percentTimeAboveFixed: 60
      })
    ];

    const bundle = finalizeSweepBundle(rows, "fast");
    expect(bundle.baselineSummary.meanCaptureRate).toBeCloseTo(0.5);
    expect(bundle.summaries).toHaveLength(2);
    expect(bundle.candidates).toHaveLength(2);
    // Raw BLE efficiency = capture / mAh; ad-a (0.096) beats ad-b (~0.080) among policies meeting capture threshold.
    expect(bundle.candidates.find((c) => c.role === "bestAdaptive")?.summary?.policyId).toBe("ad-a");
  });

  it("runs a tiny baseline sweep trial deterministically", () => {
    const tiny = {
      ...defaultSimulationConfig,
      seed: "sweep-smoke",
      simulationLengthSeconds: 360,
      timeStepSeconds: 60,
      animalCount: 2,
      pathNodeCount: 6
    };
    const trials = buildSweepTrials("fast", tiny.seed, { gridVariant: "quick" });
    const baselineTrial = trials.find((t) => t.policyId === SWEEP_BASELINE_POLICY_ID);
    expect(baselineTrial).toBeDefined();
    const row = runSingleSweepTrialSync(tiny, baselineTrial!);
    expect(row.policyId).toBe(SWEEP_BASELINE_POLICY_ID);
    expect(row.captureRate).toBeGreaterThanOrEqual(0);
    expect(row.mAhPerDay).toBeGreaterThanOrEqual(0);
  });
});

describe("pickSweepCandidates", () => {
  it("prefers higher efficiency among balanced policies when thresholds apply", () => {
    const baseline: SweepPolicySummary = {
      policyId: "base",
      kind: "baseline_fixed",
      label: "baseline",
      isJuxtaReference: true,
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
    const hiEff: SweepPolicySummary = {
      policyId: "p1",
      kind: "adaptive",
      label: "hi",
      params: {
        family: "adaptive",
        baselineDrive: 0.4,
        motionWeight: 0.25,
        peerWeight: 0.5,
        tauPeerSeconds: 120
      },
      meanCaptureRate: 0.52,
      meanMahPerDay: 6.3,
      meanBleEfficiency: 0.52 / 6.3,
      meanRelativeCapture: 1.04,
      meanRelativeEnergy: 1.05,
      meanRelativeEfficiency: 1.1,
      seedsUsed: 1,
      isParetoEfficient: true
    };
    const picks = pickSweepCandidates(baseline, [hiEff], baseline.meanCaptureRate);
    expect(picks.find((pick) => pick.role === "bestAdaptive")?.summary?.policyId).toBe("p1");
    expect(picks.find((pick) => pick.role === "bestFixed")?.summary?.policyId).toBe("base");
  });
});
