import type { EnergyConfig } from "./types";

export type HardwareEnergyProfileDef = {
  id: string;
  label: string;
  description: string;
  batteryCapacityMah: number;
  startingVoltage: number;
  txPowerDbm: number;
  /** Fields overlaying defaults for non-profile-specific keys. */
  energy: Pick<
    EnergyConfig,
    | "baselineCurrentMicroAmps"
    | "rxCurrentMa1MPhy"
    | "advertisingEventIntervalSeconds"
    | "advEventChargeMicroCoulombs"
    | "energyModel"
    | "measuredSocial5s20sTotalMicroAmps"
    | "componentBleActivityScale"
    | "benchShelfCurrentMicroAmps"
    | "benchAdvertiseBurstCurrentMicroAmps"
    | "benchScanBurstCurrentMicroAmps"
    | "benchProductionAdvDuty"
    | "benchProductionScanDuty"
    | "benchWallTimeCalibrationScale"
  >;
};

/** Single supported profile (legacy `juxta-v56` ids normalize to this on workspace load). */
export const DEFAULT_HARDWARE_ENERGY_PROFILE_ID = "generic-nrf52840" as const;

const defaultWearableEnergy = {
  baselineCurrentMicroAmps: 8.685,
  rxCurrentMa1MPhy: 6.4,
  advertisingEventIntervalSeconds: 0.15,
  advEventChargeMicroCoulombs: 13,
  /** Wall-time × bench µA; default profile matches Juxta5-8 README production routine mean. */
  energyModel: "bench_duration" as const,
  /**
   * Juxta5-8-nRF prod README: mean current at battery terminals for 1 s adv / 20 s scan routine (467.891 µA).
   * https://github.com/Neurotech-Hub/Juxta5-8-nRF/blob/main/applications/juxta5-8-prod/README.md#measured-current-draw-battery-terminals
   * Bench model: calibration target. Component model: >3× sanity check when fixed policy matches discovery schedule.
   */
  measuredSocial5s20sTotalMicroAmps: 467.891,
  componentBleActivityScale: 1,
  benchShelfCurrentMicroAmps: 8.685,
  benchAdvertiseBurstCurrentMicroAmps: 364.625,
  benchScanBurstCurrentMicroAmps: 2893.38,
  /** 500 ms adv burst per 1 s advertise cadence. */
  benchProductionAdvDuty: 0.5,
  /** Sim scan wall (1.5 s) per 20 s interval — matches `scanWindowSeconds` / `scanIntervalSeconds` for default discovery. */
  benchProductionScanDuty: 1.5 / 20,
  /** Simulated schedule achieves ~87% of ideal README wall-time duty; scales active µA so 24 h mean matches bench. */
  benchWallTimeCalibrationScale: 1.146_28
};

export const hardwareEnergyProfiles: Record<string, HardwareEnergyProfileDef> = {
  "generic-nrf52840": {
    id: "generic-nrf52840",
    label: "Generic nRF52840 BLE wearable",
    description:
      "Bench-calibrated duration energy (Juxta5-8 README): shelf 8.685 µA, burst currents scaled so the default 1 s adv / 20 s scan / 1.5 s listen schedule matches 467.891 µA mean; +8 dBm fixed.",
    batteryCapacityMah: 40,
    startingVoltage: 4.2,
    txPowerDbm: 8,
    energy: { ...defaultWearableEnergy }
  }
};

const HARDWARE_PROFILE_ID_REDIRECTS: Record<string, string> = {
  "juxta-v56": DEFAULT_HARDWARE_ENERGY_PROFILE_ID
};

export function normalizeHardwareEnergyProfileId(id: string): string {
  return HARDWARE_PROFILE_ID_REDIRECTS[id] ?? id;
}

export function getHardwareEnergyProfile(id: string): HardwareEnergyProfileDef | undefined {
  const canonical = normalizeHardwareEnergyProfileId(id);
  return hardwareEnergyProfiles[canonical];
}

/** Build full energy block for config from a hardware profile id. */
export function energyConfigFromHardwareProfileId(profileId: string): EnergyConfig {
  const canonical = normalizeHardwareEnergyProfileId(profileId);
  const profile = hardwareEnergyProfiles[canonical] ?? hardwareEnergyProfiles[DEFAULT_HARDWARE_ENERGY_PROFILE_ID]!;
  return {
    batteryCapacityMah: profile.batteryCapacityMah,
    startingVoltage: profile.startingVoltage,
    txPowerDbm: profile.txPowerDbm,
    ...profile.energy
  };
}

/** Apply hardware profile to simulation config energy only (does not touch BLE schedules). */
export function applyHardwareProfileToEnergy<T extends { hardwareEnergyProfileId: string; energy: EnergyConfig }>(
  config: T
): void {
  config.energy = energyConfigFromHardwareProfileId(config.hardwareEnergyProfileId);
}
