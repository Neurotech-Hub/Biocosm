import type { EnergyConfig } from "./types";

/** Juxta v5/6 social-mode energy back-fit (see agent/juxta_ble_energy_model_mismatch_feedback.md). */
export const juxtaV56EnergyPreset: Pick<
  EnergyConfig,
  | "baselineCurrentMicroAmps"
  | "rxCurrentMa1MPhy"
  | "advertisingEventIntervalSeconds"
  | "advEventChargeMicroCoulombs"
  | "energyModel"
  | "measuredSocial5s20sTotalMicroAmps"
  | "componentBleActivityScale"
> = {
  baselineCurrentMicroAmps: 78,
  rxCurrentMa1MPhy: 6.4,
  advertisingEventIntervalSeconds: 0.15,
  advEventChargeMicroCoulombs: 13,
  energyModel: "component",
  measuredSocial5s20sTotalMicroAmps: 233.09,
  componentBleActivityScale: 1.134
};

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
  >;
};

export const DEFAULT_HARDWARE_ENERGY_PROFILE_ID = "juxta-v56" as const;

export const hardwareEnergyProfiles: Record<string, HardwareEnergyProfileDef> = {
  "juxta-v56": {
    id: "juxta-v56",
    label: "Juxta v5/6",
    description: "nRF52840-based Juxta v5/6 hardware profile using measured or calibrated current assumptions.",
    batteryCapacityMah: 40,
    startingVoltage: 4.2,
    txPowerDbm: 8,
    energy: { ...juxtaV56EnergyPreset }
  },
  "generic-nrf52840": {
    id: "generic-nrf52840",
    label: "Generic nRF52840 BLE wearable",
    description: "Generic nRF52840 BLE energy assumptions; calibrate before interpreting battery life.",
    batteryCapacityMah: 30,
    startingVoltage: 4.2,
    txPowerDbm: 8,
    energy: {
      baselineCurrentMicroAmps: 0,
      rxCurrentMa1MPhy: 6.4,
      advertisingEventIntervalSeconds: 0.15,
      advEventChargeMicroCoulombs: 13,
      energyModel: "component",
      measuredSocial5s20sTotalMicroAmps: 233.09,
      componentBleActivityScale: 1
    }
  }
};

export function getHardwareEnergyProfile(id: string): HardwareEnergyProfileDef | undefined {
  return hardwareEnergyProfiles[id];
}

/** Build full energy block for config from a hardware profile id. */
export function energyConfigFromHardwareProfileId(profileId: string): EnergyConfig {
  const profile = hardwareEnergyProfiles[profileId] ?? hardwareEnergyProfiles[DEFAULT_HARDWARE_ENERGY_PROFILE_ID]!;
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
