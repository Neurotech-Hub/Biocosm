import { describe, expect, it } from "vitest";
import {
  baselineFixedPolicyForSweep,
  BLE_POLICY_CUSTOM_ID,
  blePolicyPresets,
  DEFAULT_BLE_POLICY_PRESET_ID,
  focusedSweepAdaptiveTimingAnchors,
  referenceDiscoveryBlePreset,
  sweepBaselinePolicyId
} from "../blePolicyPresets";
import { defaultAdaptivePolicy, defaultSimulationConfig } from "../config";
import { mapAdaptiveTiming } from "../policies/adaptive";
import {
  adaptiveSweepPolicyCount,
  buildSweepGridPolicies,
  buildSweepTrials,
  fixedSweepPolicyCount,
  finalizeSweepBundle,
  getFixedSweepAxes,
  policiesPerSweepSeed,
  runSingleSweepTrialSync,
  SWEEP_BASELINE_DRIVES,
  SWEEP_MINIMAL_BASELINE_DRIVES,
  SWEEP_MOTION_WEIGHTS,
  SWEEP_PEER_WEIGHTS,
  SWEEP_TAU_PEER_SECONDS,
  sweepTrialCount
} from "./adaptiveBleSweep";
import { pickSweepCandidates } from "./sweepCandidates";
import type { SweepPolicySummary } from "./sweepCandidates";

const quickSweepAnchors = focusedSweepAdaptiveTimingAnchors();

const adaptiveGridProduct =
  SWEEP_BASELINE_DRIVES.length *
  SWEEP_MOTION_WEIGHTS.length *
  SWEEP_PEER_WEIGHTS.length *
  SWEEP_TAU_PEER_SECONDS.length;

describe("adaptive BLE sweep", () => {
  it("uses focused grid: 24 adaptives + fixed factorial with inactive ×3/×5 per combo (default baseline)", () => {
    expect(adaptiveGridProduct).toBe(24);
    expect(SWEEP_MINIMAL_BASELINE_DRIVES).toEqual(SWEEP_BASELINE_DRIVES);

    expect(fixedSweepPolicyCount("quick")).toBe(81);
    expect(adaptiveSweepPolicyCount("quick")).toBe(24);
    expect(policiesPerSweepSeed("quick")).toBe(105);
    expect(fixedSweepPolicyCount("minimal")).toBe(81);
    expect(policiesPerSweepSeed("full")).toBe(105);

    expect(buildSweepGridPolicies("quick", quickSweepAnchors)).toHaveLength(24);
    expect(buildSweepTrials("fast", "42", { gridVariant: "quick" })).toHaveLength(
      sweepTrialCount("fast", { gridVariant: "quick" })
    );
    expect(buildSweepTrials("report", "42", { gridVariant: "quick", reportSeedCount: 3 })).toHaveLength(
      sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 3 })
    );
    expect(sweepTrialCount("fast", { gridVariant: "quick" })).toBe(105);
    expect(sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 3 })).toBe(315);
    expect(sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 5 })).toBe(525);
  });

  it("adaptive grid includes low- and high-duty corners", () => {
    const policies = buildSweepGridPolicies("quick", quickSweepAnchors);
    expect(policies.some((p) => p.baselineDrive === 0.15 && p.motionWeight === 0.2 && p.peerWeight === 0.2)).toBe(true);
    expect(policies.some((p) => p.baselineDrive === 0.35 && p.motionWeight === 0.4 && p.peerWeight === 0.4)).toBe(true);
    expect(policies.some((p) => p.tauPeerSeconds === 200 && p.peerWeight === 0.4)).toBe(true);
    expect(
      policies.some(
        (p) =>
          p.baselineDrive === 0.35 &&
          p.motionWeight === 0.4 &&
          p.peerWeight === 0.4 &&
          p.tauPeerSeconds === 200 &&
          p.tauMotionSeconds === 180 &&
          p.peerGain === 0.45 &&
          p.peerMissPenalty === 0.2
      )
    ).toBe(true);
  });

  it("aggregates rows and selects candidates", () => {
    const baseRow = (overrides: Partial<import("./adaptiveBleSweep").SweepRawRow>): import("./adaptiveBleSweep").SweepRawRow => ({
      policyId: sweepBaselinePolicyId("balanced-adaptive"),
      kind: "baseline_fixed",
      seed: "101",
      doubleWhenInactive: false,
      inactiveScanIntervalMultiplier: null,
      scheduledScanIntervalSeconds: 30,
      scheduledScanWindowSeconds: 3,
      scheduledAdvIntervalSeconds: 10,
      scheduledAdvertisingBurstDurationSeconds: 1,
      baselineDrive: null,
      motionWeight: null,
      peerWeight: null,
      tauPeerSeconds: null,
      tauMotionSeconds: 180,
      motionGain: 0.35,
      peerGain: 0.45,
      peerMissPenalty: 0.2,
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
      meanScanIntervalSeconds: 30,
      meanScanWindowSeconds: 3,
      meanAdvIntervalSeconds: 10,
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
        scheduledAdvertisingBurstDurationSeconds: null,
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
        scheduledAdvertisingBurstDurationSeconds: null,
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
    const baselineId = sweepBaselinePolicyId(tiny.blePolicyPresetId);
    const trials = buildSweepTrials("fast", tiny.seed, { gridVariant: "quick", simulationConfig: tiny });
    const baselineTrial = trials.find((t) => t.policyId === baselineId);
    expect(baselineTrial).toBeDefined();
    const row = runSingleSweepTrialSync(tiny, baselineTrial!);
    expect(row.policyId).toBe(baselineId);
    expect(row.captureRate).toBeGreaterThanOrEqual(0);
    expect(row.mAhPerDay).toBeGreaterThanOrEqual(0);
  });

  it("fixed sweep axes match focused factorial (scan × adv × window)", () => {
    const baseline = baselineFixedPolicyForSweep(defaultSimulationConfig);
    const axes = getFixedSweepAxes("quick", baseline);
    expect(axes.scanIntervals).toEqual([10, 30, 60]);
    expect(axes.advIntervals).toEqual([5, 10, 20]);
    expect(axes.scanWindowSecondsList).toEqual([1, 3, 5]);
  });

  it("defaults ble preset to balanced-adaptive with reference schedule", () => {
    expect(DEFAULT_BLE_POLICY_PRESET_ID).toBe("balanced-adaptive");
    const ref = referenceDiscoveryBlePreset();
    expect(ref.scanIntervalSeconds).toBe(30);
    expect(ref.scanWindowSeconds).toBe(3);
    expect(ref.advIntervalSeconds).toBe(10);
    expect(ref.advertisingBurstDurationSeconds).toBe(1);
    expect(defaultSimulationConfig.blePolicyPresetId).toBe("balanced-adaptive");
  });

  it("exposes three catalog baselines", () => {
    expect(blePolicyPresets["balanced-adaptive"]).toBeDefined();
    expect(blePolicyPresets["low-power"]).toBeDefined();
    expect(blePolicyPresets["high-capture"]).toBeDefined();
  });

  it("neutral adaptive timing at sampling drive 0.5 matches focused anchors", () => {
    const neutral = mapAdaptiveTiming(0.5, defaultAdaptivePolicy.timingAnchors);
    expect(neutral.scanIntervalSeconds).toBeCloseTo(30);
    expect(neutral.scanWindowSeconds).toBeCloseTo(3);
    expect(neutral.advIntervalSeconds).toBeCloseTo(10);
  });

  it("custom baseline off factorial grid yields full 27 cells plus inactive variants", () => {
    const offGridCfg = {
      ...defaultSimulationConfig,
      blePolicyPresetId: BLE_POLICY_CUSTOM_ID,
      activePolicy: {
        type: "fixed" as const,
        id: "custom-offgrid",
        name: "Custom off grid",
        scanIntervalSeconds: 11,
        scanWindowSeconds: 2,
        advIntervalSeconds: 7,
        advertisingBurstDurationSeconds: 1
      }
    };
    const baseline = baselineFixedPolicyForSweep(offGridCfg);
    const trials = buildSweepTrials("fast", "42", { gridVariant: "quick", simulationConfig: offGridCfg });
    expect(
      trials.some(
        (t) =>
          t.kind === "fixed_sweep" &&
          t.policy.type === "fixed" &&
          t.policy.scanIntervalSeconds === 10 &&
          t.policy.scanWindowSeconds === 1 &&
          t.policy.advIntervalSeconds === 5
      )
    ).toBe(true);
    expect(fixedSweepPolicyCount("quick", baseline)).toBe(84);
    expect(policiesPerSweepSeed("quick", baseline)).toBe(108);
    expect(sweepTrialCount("fast", { gridVariant: "quick", simulationConfig: offGridCfg })).toBe(108);
    expect(trials.some((t) => t.policyId.endsWith("-i3") && t.kind === "fixed_sweep_inactive_scan_x3")).toBe(true);
    expect(trials.some((t) => t.policyId.endsWith("-i5") && t.kind === "fixed_sweep_inactive_scan_x5")).toBe(true);
  });
});

describe("pickSweepCandidates", () => {
  it("prefers higher efficiency among balanced policies when thresholds apply", () => {
    const baseline: SweepPolicySummary = {
      policyId: "base",
      kind: "baseline_fixed",
      label: "baseline",
      isComparisonBaseline: true,
      params: {
        family: "fixed",
        scanIntervalSeconds: 20,
        scanWindowSeconds: 3,
        advIntervalSeconds: 1
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
