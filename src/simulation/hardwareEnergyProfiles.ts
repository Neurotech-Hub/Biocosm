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
  /** Routine-level linear model: mean µA = intercept + scanDutyCoeff×scanDuty + advDutyCoeff×advDuty (duties from realized burst wall time). */
  energyModel: "bench_routine_linear_v1" as const,
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
  /** Legacy bench_duration calibration duty; routine-linear uses its own coefficients. */
  benchProductionScanDuty: 3 / 20,
  /** Legacy bench_duration calibration scale; routine-linear ignores this field. */
  benchWallTimeCalibrationScale: 1.146_28
};

export const hardwareEnergyProfiles: Record<string, HardwareEnergyProfileDef> = {
  "generic-nrf52840": {
    id: "generic-nrf52840",
    label: "Generic nRF52840 BLE wearable",
    description:
      "Routine-level linear energy (mixed bench fit): intercept + duty-weighted scan/advertise with fixed 3 s scan and 0.5 s advertise burst assumptions; +8 dBm fixed for radio.",
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
