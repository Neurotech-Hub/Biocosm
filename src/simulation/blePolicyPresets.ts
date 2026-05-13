import { FIXED_ADVERTISING_BURST_SECONDS, FIXED_SCAN_BURST_SECONDS } from "./bleTimingAssumptions";
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

/** User-tuned schedule does not match a catalog preset. */
export const BLE_POLICY_CUSTOM_ID = "custom" as const;

/** Default asymmetric discovery baseline ([docs/biocosm_restore_asymmetric_discovery_ble_default_spec.md](docs/biocosm_restore_asymmetric_discovery_ble_default_spec.md)). */
export const DEFAULT_BLE_POLICY_PRESET_ID = "general-discovery" as const;

/** Preset ids removed from the catalog; configs and workspace files upgrade on read. */
const BLE_PRESET_ID_REDIRECTS: Record<string, string> = {
  "general-balanced": "symmetric-example"
};

export function normalizeBlePolicyPresetId(id: string): string {
  return BLE_PRESET_ID_REDIRECTS[id] ?? id;
}

export const blePolicyPresets: Record<string, BlePolicyPresetDef> = {
  "general-discovery": {
    id: "general-discovery",
    label: "General discovery",
    description:
      "Recommended starting point for proximity logging: 1 s advertise cadence, 20 s scan interval, 3 s passive scan burst, 500 ms non-connectable adv bursts.",
    scanIntervalSeconds: 20,
    scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
    advIntervalSeconds: 1,
    advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
  },
  "general-low-power": {
    id: "general-low-power",
    label: "General low-power",
    description:
      "Lower-energy asymmetric schedule that preserves more frequent advertising while reducing scan effort.",
    scanIntervalSeconds: 40,
    scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
    advIntervalSeconds: 10,
    advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
  },
  "general-high-capture": {
    id: "general-high-capture",
    label: "General high-capture",
    description: "Aggressive discovery schedule for higher capture rate at higher energy cost.",
    scanIntervalSeconds: 10,
    scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
    advIntervalSeconds: 2.5,
    advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
  },
  "symmetric-example": {
    id: "symmetric-example",
    label: "Symmetric example",
    description:
      "Educational comparison: scan and advertise at the same interval. Often intuitive but not necessarily efficient for BLE discovery.",
    scanIntervalSeconds: 30,
    scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
    advIntervalSeconds: 30,
    advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
  },
  "juxta-v56-social": {
    id: "juxta-v56-social",
    label: "Juxta v5/6 social mode",
    description:
      "Juxta-specific label; numerically aligned with General discovery (1 s adv / 20 s scan, 3 s scan burst, 500 ms adv burst).",
    scanIntervalSeconds: 20,
    scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
    advIntervalSeconds: 1,
    advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
  }
};

/** Match fixed policies to presets (general-discovery before juxta-v56-social for identical schedules). */
const BLE_POLICY_PRESET_MATCH_ORDER: readonly string[] = [
  "general-discovery",
  "general-low-power",
  "general-high-capture",
  "symmetric-example",
  "juxta-v56-social"
] as const;

export function getBlePolicyPreset(id: string): BlePolicyPresetDef | undefined {
  const canonicalId = normalizeBlePolicyPresetId(id);
  return blePolicyPresets[canonicalId];
}

export function fixedPolicyFromPreset(preset: BlePolicyPresetDef): FixedPolicyConfig {
  return {
    id: `fixed-${preset.id}`,
    type: "fixed",
    name: preset.label,
    scanIntervalSeconds: preset.scanIntervalSeconds,
    scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
    advIntervalSeconds: preset.advIntervalSeconds,
    advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
  };
}

export function fixedPolicyWithBurstAssumptions(policy: FixedPolicyConfig): FixedPolicyConfig {
  return {
    ...policy,
    scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
    advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
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
      policy.scanWindowSeconds === FIXED_SCAN_BURST_SECONDS &&
      policy.advIntervalSeconds === preset.advIntervalSeconds &&
      burst === preset.advertisingBurstDurationSeconds
    ) {
      return preset.id;
    }
  }
  return BLE_POLICY_CUSTOM_ID;
}

/**
 * Spec §9 — canonical discovery reference schedule; union into fixed sweep axes so it is always explored.
 * Same numerically as general-discovery / Juxta social mode.
 */
export function referenceDiscoveryBlePreset(): BlePolicyPresetDef {
  return blePolicyPresets["general-discovery"]!;
}

/**
 * Spec §11 — adaptive anchors for general-discovery (override generic formula).
 * Anchors target a deployable “efficient discovery” band (short windows, 1–2.5 s adv spacing; sweep uses 2 s bursts).
 * Other presets use formula from baseline scan/adv/window.
 */
export function buildAdaptiveAnchorsFromBaseline(preset: BlePolicyPresetDef): AdaptiveBleTimingAnchors {
  if (preset.id === "general-discovery" || preset.id === "juxta-v56-social") {
    /** Deployable “efficient discovery” region for sweeps: moderate scan/adv intervals with fixed burst assumptions. */
    return {
      lowIntensity: {
        scanIntervalSeconds: 60,
        scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
        advIntervalSeconds: 10
      },
      neutral: {
        scanIntervalSeconds: 20,
        scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
        advIntervalSeconds: 5
      },
      highIntensity: {
        scanIntervalSeconds: 10,
        scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
        advIntervalSeconds: 0.2
      },
      advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
    };
  }

  const b = preset;
  return {
    lowIntensity: {
      scanIntervalSeconds: Math.max(1, b.scanIntervalSeconds * 2),
      scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
      advIntervalSeconds: Math.max(1, b.advIntervalSeconds * 2)
    },
    neutral: {
      scanIntervalSeconds: b.scanIntervalSeconds,
      scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
      advIntervalSeconds: b.advIntervalSeconds
    },
    highIntensity: {
      scanIntervalSeconds: Math.max(1, b.scanIntervalSeconds / 4),
      scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
      advIntervalSeconds: Math.max(1, b.advIntervalSeconds / 4)
    },
    advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
  };
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
    scanWindowSeconds: FIXED_SCAN_BURST_SECONDS,
    advIntervalSeconds: fixed.advIntervalSeconds,
    advertisingBurstDurationSeconds: FIXED_ADVERTISING_BURST_SECONDS
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
