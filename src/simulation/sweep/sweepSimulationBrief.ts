import { bleBaselinePresetDefForSweep } from "../blePolicyPresets";
import { getHardwareEnergyProfile } from "../hardwareEnergyProfiles";
import type { SimulationConfig } from "../types";
import { SPECIES_PRESETS } from "../speciesPresets";
import { DEFAULT_REPORT_SEED_COUNT, seedsForSweepMode } from "./adaptiveBleSweep";

/** One row for the Sweep settings “Simulation source” summary (last built config). */
export type SweepSimulationBriefRow = { label: string; value: string };

function formatSimHorizon(seconds: number): string {
  const h = seconds / 3600;
  if (Number.isInteger(h) && h > 0 && h <= 168) {
    return `${h} h`;
  }
  const d = seconds / (24 * 3600);
  return `${d.toFixed(2)} d`;
}

/** Human-readable lines describing world/radio/energy inputs taken from the built Simulation tab config. */
export function buildSweepSimulationBrief(
  config: SimulationConfig,
  sweepMode: "fast" | "report",
  options?: { reportSeedCount?: number }
): SweepSimulationBriefRow[] {
  const preset = SPECIES_PRESETS[config.speciesPresetId as keyof typeof SPECIES_PRESETS];
  const species = preset != null ? preset.commonName : config.speciesPresetId.replace(/_/g, " ");

  const seeds = seedsForSweepMode(sweepMode, String(config.seed), {
    reportSeedCount: options?.reportSeedCount ?? DEFAULT_REPORT_SEED_COUNT
  });
  const seedLine =
    sweepMode === "fast"
      ? `${seeds[0]} (matches Simulated Seed)`
      : `${seeds.join(", ")} — means aggregated`;

  const enc = config.enclosure;
  const enclosureLabel =
    enc.mode === "rectangle"
      ? `${enc.width}×${enc.height} m · ${enc.boundaryBehavior}`
      : enc.mode;

  const behavior = config.behavior;
  const energyLabel =
    config.energy.energyModel === "component"
      ? "Component (timing + events)"
      : "Empirical average";

  const baselinePreset = bleBaselinePresetDefForSweep(config);
  const hw =
    getHardwareEnergyProfile(config.hardwareEnergyProfileId)?.label ?? config.hardwareEnergyProfileId;

  return [
    { label: "Species", value: species },
    { label: "Seeds", value: seedLine },
    {
      label: "Cohort",
      value: `${config.animalCount} animals · ${config.pathNodeCount} path nodes`
    },
    { label: "Enclosure", value: enclosureLabel },
    {
      label: "Horizon",
      value: `${formatSimHorizon(config.simulationLengthSeconds)} simulated · step ${config.timeStepSeconds} s · radio ${config.radioStepSeconds} s`
    },
    {
      label: "Behavior",
      value: `${behavior.circadianMode} · social pause ${(behavior.socialPauseProbability * 100).toFixed(0)}% · bout μ ${behavior.socialBoutMeanMinutes} min`
    },
    {
      label: "BLE geometry",
      value: `detect ${config.radio.detectionRadiusMeters} m · social ${config.radio.socialRadiusMeters} m`
    },
    {
      label: "Motion",
      value: `${config.motionSensor.thresholdMetersPerStep} m/step threshold · ${(config.motionSensor.falseNegativeRate * 100).toFixed(0)}% false negatives`
    },
    { label: "Energy", value: `${energyLabel} · ${config.energy.batteryCapacityMah} mAh pack` },
    {
      label: "Comparison BLE baseline",
      value: `${baselinePreset.label} — scan ${baselinePreset.scanIntervalSeconds}s / win ${baselinePreset.scanWindowSeconds}s / adv ${baselinePreset.advIntervalSeconds}s / burst ${baselinePreset.advertisingBurstDurationSeconds}s`
    },
    { label: "Hardware energy profile", value: hw },
    {
      label: "Collar policy",
      value:
        "Sweep substitutes schedules (comparison baseline row + fixed-rate grid + adaptive grid). The active Simulator policy is not run as-is unless it matches a swept row."
    }
  ];
}
