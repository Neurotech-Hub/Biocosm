import { describe, expect, it } from "vitest";
import { sweepBaselinePolicyId } from "./blePolicyPresets";
import { defaultAdaptivePolicy, defaultSimulationConfig, juxtaMainCMode0FixedPolicy } from "./config";
import { applyHardwareProfileToEnergy } from "./hardwareEnergyProfiles";
import { mapAdaptiveTiming } from "./policies/adaptive";
import { buildSweepTrials } from "./sweep/adaptiveBleSweep";

describe("BLE baseline vs hardware energy separation", () => {
  it("applyHardwareProfileToEnergy refreshes pack energy without altering active BLE schedule", () => {
    const cfg = structuredClone(defaultSimulationConfig);
    const policySnap = JSON.stringify(cfg.activePolicy);
    cfg.energy.baselineCurrentMicroAmps = 999;
    applyHardwareProfileToEnergy(cfg);
    expect(JSON.stringify(cfg.activePolicy)).toBe(policySnap);
    expect(cfg.energy.baselineCurrentMicroAmps).toBe(8.685);
  });

  it("neutral adaptive timing uses default focused anchors from default config", () => {
    const neutral = mapAdaptiveTiming(0.5, defaultAdaptivePolicy.timingAnchors);
    expect(neutral.scanIntervalSeconds).toBeCloseTo(30);
    expect(neutral.scanWindowSeconds).toBeCloseTo(3);
    expect(neutral.advIntervalSeconds).toBeCloseTo(10);
  });

  it("low-intensity anchor matches focused sweep low anchor (60s scan / 1s win / 20s adv)", () => {
    const low = mapAdaptiveTiming(0, defaultAdaptivePolicy.timingAnchors);
    expect(low.scanIntervalSeconds).toBeCloseTo(60);
    expect(low.scanWindowSeconds).toBeCloseTo(1);
    expect(low.advIntervalSeconds).toBeCloseTo(20);
  });
  it("sweep includes baseline_fixed row for selected BLE preset id", () => {
    const trials = buildSweepTrials("fast", "42", {
      gridVariant: "quick",
      simulationConfig: defaultSimulationConfig
    });
    const expectedId = sweepBaselinePolicyId(defaultSimulationConfig.blePolicyPresetId);
    expect(trials.some((t) => t.policyId === expectedId && t.kind === "baseline_fixed")).toBe(true);
  });

  it("Juxta main.c mode0 fixed policy reproduces specified scan/adv/window/burst", () => {
    const fixed = juxtaMainCMode0FixedPolicy;
    expect(fixed.scanIntervalSeconds).toBe(20);
    expect(fixed.scanWindowSeconds).toBe(3);
    expect(fixed.advIntervalSeconds).toBe(1);
    expect(fixed.advertisingBurstDurationSeconds).toBe(1);
  });
});
