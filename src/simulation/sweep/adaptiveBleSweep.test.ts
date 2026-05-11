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
  SWEEP_FULL_BASELINE_DRIVES,
  SWEEP_FULL_MOTION_WEIGHTS,
  SWEEP_FULL_PEER_WEIGHTS,
  SWEEP_FULL_TAU_PEER_SECONDS,
  SWEEP_MINIMAL_BASELINE_DRIVES,
  SWEEP_MINIMAL_MOTION_WEIGHTS,
  SWEEP_MINIMAL_PEER_WEIGHTS,
  SWEEP_MINIMAL_TAU_PEER_SECONDS,
  SWEEP_QUICK_BASELINE_DRIVES,
  SWEEP_QUICK_MOTION_WEIGHTS,
  SWEEP_QUICK_PEER_WEIGHTS,
  SWEEP_QUICK_TAU_PEER_SECONDS,
  sweepTrialCount
} from "./adaptiveBleSweep";
import { pickSweepCandidates } from "./sweepCandidates";
import type { FixedPolicyConfig } from "../types";
import type { SweepPolicySummary } from "./sweepCandidates";

const quickSweepAnchors = buildAdaptiveAnchorsFromBaseline(bleBaselinePresetDefForSweep(defaultSimulationConfig));

function roundLikeFixedSweepIntervalSeconds(v: number): number {
  return Math.max(1, Math.round(v * 100) / 100);
}

function roundLikeFixedSweepWindowSeconds(v: number): number {
  return Math.max(0.5, Math.round(v * 100) / 100);
}

function roundedEndpoint(
  baseline: FixedPolicyConfig,
  key: "scanIntervalSeconds" | "advIntervalSeconds" | "scanWindowSeconds",
  mult: number
): number {
  const raw = baseline[key] * mult;
  return key === "scanWindowSeconds" ? roundLikeFixedSweepWindowSeconds(raw) : roundLikeFixedSweepIntervalSeconds(raw);
}

describe("adaptive BLE sweep", () => {
  it("defaults to quick grid: fixed uses full min–max multiplier range with linspace (3 pts) + ref union; 54 quick adaptives; full adaptive grid is 90", () => {
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

    expect(fixedSweepPolicyCount("quick")).toBe(128);
    expect(adaptiveSweepPolicyCount("quick")).toBe(quickProduct);
    expect(policiesPerSweepSeed("quick")).toBe(128 + quickProduct);
    expect(buildSweepGridPolicies("quick", quickSweepAnchors)).toHaveLength(quickProduct);
    expect(buildSweepTrials("fast", "42", { gridVariant: "quick" })).toHaveLength(
      sweepTrialCount("fast", { gridVariant: "quick" })
    );
    expect(buildSweepTrials("report", "42", { gridVariant: "quick", reportSeedCount: 3 })).toHaveLength(
      sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 3 })
    );
    expect(sweepTrialCount("fast", { gridVariant: "quick" })).toBe(182);
    expect(sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 3 })).toBe(546);
    expect(sweepTrialCount("report", { gridVariant: "quick", reportSeedCount: 5 })).toBe(910);
  });

  it("minimal grid: 2-point fixed axes + 2×2×2×2 adaptives for fast smoke tests", () => {
    const minimalProduct =
      SWEEP_MINIMAL_BASELINE_DRIVES.length *
      SWEEP_MINIMAL_MOTION_WEIGHTS.length *
      SWEEP_MINIMAL_PEER_WEIGHTS.length *
      SWEEP_MINIMAL_TAU_PEER_SECONDS.length;
    expect(minimalProduct).toBe(16);
    expect(fixedSweepPolicyCount("minimal")).toBe(54);
    expect(adaptiveSweepPolicyCount("minimal")).toBe(16);
    expect(policiesPerSweepSeed("minimal")).toBe(70);
    expect(sweepTrialCount("fast", { gridVariant: "minimal" })).toBe(70);
    expect(buildSweepTrials("fast", "42", { gridVariant: "minimal" })).toHaveLength(70);
    expect(sweepTrialCount("report", { gridVariant: "minimal", reportSeedCount: 3 })).toBe(210);
  });

  it("quick grid includes low-duty and upscale corners (brackets neutral anchor on drive)", () => {
    const policies = buildSweepGridPolicies("quick", quickSweepAnchors);
    expect(policies.some((p) => p.baselineDrive === 0.12 && p.motionWeight === 0.22 && p.peerWeight === 0.35)).toBe(true);
    expect(policies.some((p) => p.baselineDrive === 0.45 && p.motionWeight === 0.5 && p.peerWeight === 0.85)).toBe(true);
    expect(policies.some((p) => p.peerWeight === 0.6 && p.tauPeerSeconds === 300)).toBe(true);
  });

  it("aggregates rows and selects candidates", () => {
    const baseRow = (overrides: Partial<import("./adaptiveBleSweep").SweepRawRow>): import("./adaptiveBleSweep").SweepRawRow => ({
      policyId: sweepBaselinePolicyId("general-discovery"),
      kind: "baseline_fixed",
      seed: "101",
      doubleWhenInactive: false,
      scheduledScanIntervalSeconds: 20,
      scheduledScanWindowSeconds: 1.5,
      scheduledAdvIntervalSeconds: 5,
      scheduledAdvertisingBurstDurationSeconds: 2,
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

  it("quick fixed axes use the same baseline multiplier endpoints as full (linspace between min and max)", () => {
    const baseline = baselineFixedPolicyForSweep(defaultSimulationConfig);
    const quick = getFixedSweepAxes("quick", baseline);
    const full = getFixedSweepAxes("full", baseline);
    const expectSpan = (axis: "scanIntervals" | "advIntervals" | "scanWindows", multMin: number, multMax: number) => {
      const bKey =
        axis === "scanIntervals"
          ? "scanIntervalSeconds"
          : axis === "advIntervals"
            ? "advIntervalSeconds"
            : "scanWindowSeconds";
      const lo = roundedEndpoint(baseline, bKey, multMin);
      const hi = roundedEndpoint(baseline, bKey, multMax);
      expect(quick[axis][0]).toBeCloseTo(lo, 5);
      expect(quick[axis][quick[axis].length - 1]).toBeCloseTo(hi, 5);
      expect(full[axis][0]).toBeCloseTo(lo, 5);
      expect(full[axis][full[axis].length - 1]).toBeCloseTo(hi, 5);
    };
    expectSpan("scanIntervals", 0.25, 4);
    expectSpan("advIntervals", 0.25, 4);
    expectSpan("scanWindows", 0.25, 2);
  });

  it("defaults ble preset to general-discovery with reference discovery schedule", () => {
    expect(DEFAULT_BLE_POLICY_PRESET_ID).toBe("general-discovery");
    const ref = referenceDiscoveryBlePreset();
    expect(ref.scanIntervalSeconds).toBe(20);
    expect(ref.scanWindowSeconds).toBe(1.5);
    expect(ref.advIntervalSeconds).toBe(5);
    expect(ref.advertisingBurstDurationSeconds).toBe(2);
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

  it("neutral adaptive timing at sampling drive 0.5 matches reference discovery anchors", () => {
    const neutral = mapAdaptiveTiming(0.5, defaultAdaptivePolicy.timingAnchors);
    expect(neutral.scanIntervalSeconds).toBeCloseTo(20);
    expect(neutral.scanWindowSeconds).toBeCloseTo(1.5);
    expect(neutral.advIntervalSeconds).toBeCloseTo(5);
  });

  it("quick sweep includes reference discovery triple when comparison baseline is symmetric-example", () => {
    const cfg = { ...defaultSimulationConfig, blePolicyPresetId: "symmetric-example" as const };
    const trials = buildSweepTrials("fast", "42", { gridVariant: "quick", simulationConfig: cfg });
    expect(
      trials.some(
        (t) =>
          t.kind === "fixed_sweep" &&
          t.policy.type === "fixed" &&
          t.policy.scanIntervalSeconds === 20 &&
          t.policy.scanWindowSeconds === 1.5 &&
          t.policy.advIntervalSeconds === 5
      )
    ).toBe(true);
    expect(fixedSweepPolicyCount("quick", baselineFixedPolicyForSweep(cfg))).toBe(128);
    expect(policiesPerSweepSeed("quick", baselineFixedPolicyForSweep(cfg))).toBe(182);
    expect(sweepTrialCount("fast", { gridVariant: "quick", simulationConfig: cfg })).toBe(182);
    const dd = trials.find(
      (t) => t.policyId.endsWith("-dd") && t.kind === "fixed_sweep_inactivity_double"
    );
    expect(dd?.policy.type).toBe("fixed");
    expect(dd != null && dd.policy.type === "fixed" && dd.policy.doubleWhenInactive === true).toBe(true);
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
