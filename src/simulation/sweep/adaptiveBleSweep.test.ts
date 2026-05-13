import { describe, expect, it } from "vitest";
import {
  baselineFixedPolicyForSweep,
  bleBaselinePresetDefForSweep,
  blePolicyPresets,
  buildAdaptiveAnchorsFromBaseline,
  DEFAULT_BLE_POLICY_PRESET_ID,
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

const quickSweepAnchors = buildAdaptiveAnchorsFromBaseline(bleBaselinePresetDefForSweep(defaultSimulationConfig));

const adaptiveGridProduct =
  SWEEP_BASELINE_DRIVES.length *
  SWEEP_MOTION_WEIGHTS.length *
  SWEEP_PEER_WEIGHTS.length *
  SWEEP_TAU_PEER_SECONDS.length;

describe("adaptive BLE sweep", () => {
  it("uses one compact grid for all variants: 16 adaptives + 75 fixed (scan×adv intervals only; ×3/×5 inactive) per seed", () => {
    expect(adaptiveGridProduct).toBe(16);
    expect(SWEEP_MINIMAL_BASELINE_DRIVES).toEqual(SWEEP_BASELINE_DRIVES);

    expect(fixedSweepPolicyCount("quick")).toBe(75);
    expect(adaptiveSweepPolicyCount("quick")).toBe(16);
    expect(policiesPerSweepSeed("quick")).toBe(91);
    expect(fixedSweepPolicyCount("minimal")).toBe(75);
    expect(policiesPerSweepSeed("full")).toBe(91);

    expect(buildSweepGridPolicies("quick", quickSweepAnchors)).toHaveLength(16);
    expect(buildSweepTrials("fast", "42", { gridVariant: "quick" })).toHaveLength(
      sweepTrialCount("fast", { gridVariant: "quick" })
    );
    expect(buildSweepTrials("report", "42", { gridVariant: "quick", reportSeedCount: 3 })).toHaveLength(
      sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 3 })
    );
    expect(sweepTrialCount("fast", { gridVariant: "quick" })).toBe(91);
    expect(sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 3 })).toBe(273);
    expect(sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 5 })).toBe(455);
  });

  it("adaptive grid includes low- and high-duty corners", () => {
    const policies = buildSweepGridPolicies("quick", quickSweepAnchors);
    expect(policies.some((p) => p.baselineDrive === 0.1 && p.motionWeight === 0.2 && p.peerWeight === 0.2)).toBe(true);
    expect(policies.some((p) => p.baselineDrive === 0.3 && p.motionWeight === 0.5 && p.peerWeight === 0.5)).toBe(true);
    expect(policies.some((p) => p.tauPeerSeconds === 600 && p.peerWeight === 0.2)).toBe(true);
    expect(
      policies.some(
        (p) =>
          p.baselineDrive === 0.3 &&
          p.motionWeight === 0.5 &&
          p.peerWeight === 0.5 &&
          p.tauPeerSeconds === 600 &&
          p.tauMotionSeconds === 180 &&
          p.peerGain === 0.45 &&
          p.peerMissPenalty === 0.2
      )
    ).toBe(true);
  });

  it("aggregates rows and selects candidates", () => {
    const baseRow = (overrides: Partial<import("./adaptiveBleSweep").SweepRawRow>): import("./adaptiveBleSweep").SweepRawRow => ({
      policyId: sweepBaselinePolicyId("general-discovery"),
      kind: "baseline_fixed",
      seed: "101",
      doubleWhenInactive: false,
      inactiveScanIntervalMultiplier: null,
      scheduledScanIntervalSeconds: 20,
      scheduledScanWindowSeconds: 3,
      scheduledAdvIntervalSeconds: 5,
      scheduledAdvertisingBurstDurationSeconds: 2,
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
      meanScanIntervalSeconds: 20,
      meanScanWindowSeconds: 3,
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

  it("fixed sweep axes are scan and advertise intervals only; scan window is fixed by simulator assumption", () => {
    const baseline = baselineFixedPolicyForSweep(defaultSimulationConfig);
    const axes = getFixedSweepAxes("quick", baseline);
    expect(axes.scanIntervals).toEqual([10, 20, 30, 60, 120]);
    expect(axes.advIntervals).toEqual([1, 2, 5, 10, 20]);
    expect(axes.heldScanWindowSeconds).toBeCloseTo(3, 5);
  });

  it("defaults ble preset to general-discovery with reference discovery schedule", () => {
    expect(DEFAULT_BLE_POLICY_PRESET_ID).toBe("general-discovery");
    const ref = referenceDiscoveryBlePreset();
    expect(ref.scanIntervalSeconds).toBe(20);
    expect(ref.scanWindowSeconds).toBe(3);
    expect(ref.advIntervalSeconds).toBe(1);
    expect(ref.advertisingBurstDurationSeconds).toBe(0.5);
    expect(defaultSimulationConfig.blePolicyPresetId).toBe("general-discovery");
  });

  it("includes symmetric-example preset but does not use it as default", () => {
    expect(blePolicyPresets["symmetric-example"]).toBeDefined();
    expect(DEFAULT_BLE_POLICY_PRESET_ID).not.toBe("symmetric-example");
  });

  it("includes general-discovery and juxta-v56-social presets", () => {
    expect(blePolicyPresets["general-discovery"]).toBeDefined();
    expect(blePolicyPresets["juxta-v56-social"]).toBeDefined();
  });

  it("neutral adaptive timing at sampling drive 0.5 matches sweep anchors", () => {
    const neutral = mapAdaptiveTiming(0.5, defaultAdaptivePolicy.timingAnchors);
    expect(neutral.scanIntervalSeconds).toBeCloseTo(20);
    expect(neutral.scanWindowSeconds).toBeCloseTo(3);
    expect(neutral.advIntervalSeconds).toBeCloseTo(5);
  });

  it("sweep includes fixed grid corner and inactive ×3/×5 rows when baseline is symmetric-example", () => {
    const cfg = { ...defaultSimulationConfig, blePolicyPresetId: "symmetric-example" as const };
    const baseline = baselineFixedPolicyForSweep(cfg);
    const trials = buildSweepTrials("fast", "42", { gridVariant: "quick", simulationConfig: cfg });
    expect(
      trials.some(
        (t) =>
          t.kind === "fixed_sweep" &&
          t.policy.type === "fixed" &&
          t.policy.scanIntervalSeconds === 10 &&
          t.policy.scanWindowSeconds === baseline.scanWindowSeconds &&
          t.policy.advIntervalSeconds === 1
      )
    ).toBe(true);
    expect(fixedSweepPolicyCount("quick", baseline)).toBe(78);
    expect(policiesPerSweepSeed("quick", baseline)).toBe(94);
    expect(sweepTrialCount("fast", { gridVariant: "quick", simulationConfig: cfg })).toBe(94);
    const i3 = trials.find((t) => t.policyId.endsWith("-i3") && t.kind === "fixed_sweep_inactive_scan_x3");
    expect(i3?.policy).toMatchObject({
      type: "fixed",
      doubleWhenInactive: true,
      inactiveScanIntervalMultiplier: 3
    });
    const i5 = trials.find((t) => t.policyId.endsWith("-i5") && t.kind === "fixed_sweep_inactive_scan_x5");
    expect(i5?.policy).toMatchObject({
      type: "fixed",
      doubleWhenInactive: true,
      inactiveScanIntervalMultiplier: 5
    });
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
