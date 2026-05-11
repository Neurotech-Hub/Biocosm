import { describe, expect, it } from "vitest";
import { blePolicyPresets, fixedPolicyFromPreset, sweepBaselinePolicyId } from "./blePolicyPresets";
import { defaultAdaptivePolicy, defaultSimulationConfig } from "./config";
import { applyHardwareProfileToEnergy } from "./hardwareEnergyProfiles";
import { mapAdaptiveTiming } from "./policies/adaptive";
import { buildSweepTrials } from "./sweep/adaptiveBleSweep";

describe("BLE baseline vs hardware energy separation", () => {
  it("changing hardware profile updates energy fields without altering active BLE schedule", () => {
    const cfg = structuredClone(defaultSimulationConfig);
    const policySnap = JSON.stringify(cfg.activePolicy);
    cfg.hardwareEnergyProfileId = "generic-nrf52840";
    applyHardwareProfileToEnergy(cfg);
    expect(JSON.stringify(cfg.activePolicy)).toBe(policySnap);
    expect(cfg.energy.baselineCurrentMicroAmps).toBe(0);
  });

  it("neutral adaptive timing uses general-discovery anchors from default config", () => {
    const neutral = mapAdaptiveTiming(0.5, defaultAdaptivePolicy.timingAnchors);
    expect(neutral.scanIntervalSeconds).toBeCloseTo(20);
    expect(neutral.scanWindowSeconds).toBeCloseTo(1.5);
    expect(neutral.advIntervalSeconds).toBeCloseTo(5);
  });

  it("sweep includes baseline_fixed row for selected BLE preset id", () => {
    const trials = buildSweepTrials("fast", "42", {
      gridVariant: "quick",
      simulationConfig: defaultSimulationConfig
    });
    const expectedId = sweepBaselinePolicyId(defaultSimulationConfig.blePolicyPresetId);
    expect(trials.some((t) => t.policyId === expectedId && t.kind === "baseline_fixed")).toBe(true);
  });

  it("Juxta social preset reproduces specified scan/adv/window/burst", () => {
    const fixed = fixedPolicyFromPreset(blePolicyPresets["juxta-v56-social"]!);
    expect(fixed.scanIntervalSeconds).toBe(20);
    expect(fixed.scanWindowSeconds).toBe(1.5);
    expect(fixed.advIntervalSeconds).toBe(5);
    expect(fixed.advertisingBurstDurationSeconds).toBe(2);
  });
});
