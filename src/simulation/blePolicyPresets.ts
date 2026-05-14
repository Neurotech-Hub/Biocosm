import {
  BASELINE_CATALOG_ADVERTISING_BURST_SECONDS,
  FIXED_ADVERTISING_BURST_SECONDS,
  FIXED_SCAN_BURST_SECONDS
} from "./bleTimingAssumptions";
import type {
  AdaptiveBleTimingAnchors,
  FixedPolicyConfig,
  MotionPeerAdaptivePolicyConfig,
  SimulationConfig
} from "./types";

export type BlePolicyPresetDef = {
  id: string;
  label: string;
  description: string;
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
  advertisingBurstDurationSeconds: number;
};

/** Internal id when the fixed schedule does not match a catalog preset. */
export const BLE_POLICY_CUSTOM_ID = "custom" as const;

/** Default BLE baseline ([docs/biocosm_baseline_simplification_5p5mah_sweep_spec.md]). */
export const DEFAULT_BLE_POLICY_PRESET_ID = "balanced-adaptive" as const;

/** Preset ids removed or renamed; configs and workspace files upgrade on read. */
const BLE_PRESET_ID_REDIRECTS: Record<string, string> = {
  "general-balanced": "balanced-adaptive",
  "general-discovery": "balanced-adaptive",
  "general-low-power": "low-power",
  "general-high-capture": "high-capture",
  "symmetric-example": "balanced-adaptive",
  "juxta-v56-social": "balanced-adaptive"
};

export function normalizeBlePolicyPresetId(id: string): string {
  return BLE_PRESET_ID_REDIRECTS[id] ?? id;
}

/** Shared adaptive anchors for catalog baselines + focused sweep ([docs/biocosm_baseline_simplification_5p5mah_sweep_spec.md] §3, §8). */
export function focusedSweepAdaptiveTimingAnchors(): AdaptiveBleTimingAnchors {
  return {
    lowIntensity: {
      scanIntervalSeconds: 90,
      scanWindowSeconds: 0.35,
      advIntervalSeconds: 10
    },
    neutral: {
      scanIntervalSeconds: 30,
      scanWindowSeconds: 0.5,
      advIntervalSeconds: 7.5
    },
    highIntensity: {
      scanIntervalSeconds: 15,
      scanWindowSeconds: 0.75,
      advIntervalSeconds: 5
    },
    advertisingBurstDurationSeconds: BASELINE_CATALOG_ADVERTISING_BURST_SECONDS
  };
}

export const blePolicyPresets: Record<string, BlePolicyPresetDef> = {
  "balanced-adaptive": {
    id: "balanced-adaptive",
    label: "Balanced adaptive",
    description: "Recommended starting point for adaptive mode under a small-battery budget.",
    scanIntervalSeconds: 30,
    scanWindowSeconds: 0.5,
    advIntervalSeconds: 7.5,
    advertisingBurstDurationSeconds: BASELINE_CATALOG_ADVERTISING_BURST_SECONDS
  },
  "low-power": {
    id: "low-power",
    label: "Low-power",
    description: "Lower-energy schedule with reduced scan effort and slower advertising.",
    scanIntervalSeconds: 60,
    scanWindowSeconds: 0.35,
    advIntervalSeconds: 10,
    advertisingBurstDurationSeconds: BASELINE_CATALOG_ADVERTISING_BURST_SECONDS
  },
  "high-capture": {
    id: "high-capture",
    label: "High-capture",
    description: "Higher-capture schedule with more frequent scanning and advertising.",
    scanIntervalSeconds: 15,
    scanWindowSeconds: 0.75,
    advIntervalSeconds: 5,
    advertisingBurstDurationSeconds: BASELINE_CATALOG_ADVERTISING_BURST_SECONDS
  }
};

/** Match fixed policies to presets (most specific schedules first). */
const BLE_POLICY_PRESET_MATCH_ORDER: readonly string[] = ["high-capture", "low-power", "balanced-adaptive"] as const;

function approxEq(a: number, b: number, eps = 1e-5): boolean {
  return Math.abs(a - b) <= eps;
}

export function getBlePolicyPreset(id: string): BlePolicyPresetDef | undefined {
  const canonicalId = normalizeBlePolicyPresetId(id);
  return blePolicyPresets[canonicalId];
}

export function fixedPolicyFromPreset(preset: BlePolicyPresetDef): FixedPolicyConfig {
  const scanWindowSeconds = Math.min(preset.scanWindowSeconds, preset.scanIntervalSeconds);
  return {
    id: `fixed-${preset.id}`,
    type: "fixed",
    name: preset.label,
    scanIntervalSeconds: preset.scanIntervalSeconds,
    scanWindowSeconds,
    advIntervalSeconds: preset.advIntervalSeconds,
    advertisingBurstDurationSeconds: preset.advertisingBurstDurationSeconds
  };
}

export function fixedPolicyWithBurstAssumptions(policy: FixedPolicyConfig): FixedPolicyConfig {
  const burst = policy.advertisingBurstDurationSeconds ?? FIXED_ADVERTISING_BURST_SECONDS;
  const sw = policy.scanWindowSeconds ?? FIXED_SCAN_BURST_SECONDS;
  return {
    ...policy,
    scanWindowSeconds: Math.min(sw, policy.scanIntervalSeconds),
    advertisingBurstDurationSeconds: burst
  };
}

/** Infer preset id when fixed schedule matches a catalog entry (else custom). */
export function blePolicyPresetIdForFixedPolicy(policy: FixedPolicyConfig): string {
  const burst = policy.advertisingBurstDurationSeconds ?? FIXED_ADVERTISING_BURST_SECONDS;
  for (const presetId of BLE_POLICY_PRESET_MATCH_ORDER) {
    const preset = blePolicyPresets[presetId];
    if (!preset) {
      continue;
    }
    if (
      policy.scanIntervalSeconds === preset.scanIntervalSeconds &&
      approxEq(policy.scanWindowSeconds, Math.min(preset.scanWindowSeconds, preset.scanIntervalSeconds)) &&
      approxEq(policy.advIntervalSeconds, preset.advIntervalSeconds) &&
      approxEq(burst, preset.advertisingBurstDurationSeconds)
    ) {
      return preset.id;
    }
  }
  return BLE_POLICY_CUSTOM_ID;
}

/** Canonical balanced baseline schedule (same as `balanced-adaptive` preset). */
export function referenceDiscoveryBlePreset(): BlePolicyPresetDef {
  return blePolicyPresets["balanced-adaptive"]!;
}

export function buildAdaptiveAnchorsFromBaseline(preset: BlePolicyPresetDef): AdaptiveBleTimingAnchors {
  void preset;
  return focusedSweepAdaptiveTimingAnchors();
}

export function sweepBaselinePolicyId(blePolicyPresetId: string): string {
  return `sweep-baseline-${blePolicyPresetId}`;
}

/** Fixed schedule used as the sweep comparison baseline (preset catalog or custom from active fixed policy). */
export function baselineFixedPolicyForSweep(config: SimulationConfig): FixedPolicyConfig {
  if (config.blePolicyPresetId !== BLE_POLICY_CUSTOM_ID) {
    const preset = getBlePolicyPreset(config.blePolicyPresetId);
    if (preset) {
      return fixedPolicyFromPreset(preset);
    }
  }
  if (config.activePolicy.type === "fixed") {
    return fixedPolicyWithBurstAssumptions(config.activePolicy);
  }
  return fixedPolicyFromPreset(getBlePolicyPreset(DEFAULT_BLE_POLICY_PRESET_ID)!);
}

/** Preset definition for labels and adaptive anchors (custom synthesizes from active fixed policy). */
export function bleBaselinePresetDefForSweep(config: SimulationConfig): BlePolicyPresetDef {
  const fixed = baselineFixedPolicyForSweep(config);
  const inferredId = blePolicyPresetIdForFixedPolicy(fixed);
  if (inferredId !== BLE_POLICY_CUSTOM_ID) {
    const preset = getBlePolicyPreset(inferredId);
    if (preset) {
      return preset;
    }
  }
  return {
    id: BLE_POLICY_CUSTOM_ID,
    label: "Custom",
    description: "Custom fixed schedule",
    scanIntervalSeconds: fixed.scanIntervalSeconds,
    scanWindowSeconds: Math.min(fixed.scanWindowSeconds, fixed.scanIntervalSeconds),
    advIntervalSeconds: fixed.advIntervalSeconds,
    advertisingBurstDurationSeconds: fixed.advertisingBurstDurationSeconds ?? FIXED_ADVERTISING_BURST_SECONDS
  };
}

/** Refresh adaptive timing anchors when the BLE baseline preset changes (`custom` leaves anchors unchanged). */
export function motionPeerAdaptiveWithBleBaselineAnchors(
  policy: MotionPeerAdaptivePolicyConfig,
  blePolicyPresetId: string
): MotionPeerAdaptivePolicyConfig {
  if (blePolicyPresetId === BLE_POLICY_CUSTOM_ID) {
    return policy;
  }
  const preset = getBlePolicyPreset(blePolicyPresetId);
  if (!preset) {
    return policy;
  }
  return {
    ...policy,
    timingAnchors: buildAdaptiveAnchorsFromBaseline(preset)
  };
}
