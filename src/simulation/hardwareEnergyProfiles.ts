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
  >;
};

/** Single supported profile (legacy `juxta-v56` ids normalize to this on workspace load). */
export const DEFAULT_HARDWARE_ENERGY_PROFILE_ID = "generic-nrf52840" as const;

const defaultWearableEnergy = {
  baselineCurrentMicroAmps: 10,
  rxCurrentMa1MPhy: 6.4,
  advertisingEventIntervalSeconds: 0.15,
  advEventChargeMicroCoulombs: 13,
  energyModel: "component" as const,
  /** Reference total draw for 5s advertise / 20s scan social-style duty; used only for >3× component warnings. */
  measuredSocial5s20sTotalMicroAmps: 233.09,
  componentBleActivityScale: 1
};

export const hardwareEnergyProfiles: Record<string, HardwareEnergyProfileDef> = {
  "generic-nrf52840": {
    id: "generic-nrf52840",
    label: "Generic nRF52840 BLE wearable",
    description: "Component-mode energy: 10 µA non-BLE baseline plus scan RX and advertising event charge.",
    batteryCapacityMah: 30,
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
