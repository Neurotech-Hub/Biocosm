import {
  countAdvertisingPacketsInBursts,
  countScanListenWindowsInBursts,
  totalBleBurstWallSeconds,
  totalScanListenWindowSeconds
} from "./radio";
import type { BleBurstEvent, EnergyConfig, EnergyLog } from "./types";

/** 1 mAh = 1 mA × 1 h = 3.6 C = 3_600_000 µC */
export const MICROCOULOMBS_PER_MILLIAMP_HOUR = 3_600_000;

/** mAh = (µA × seconds) / 3_600_000 */
function microAmpSecondsToMilliampHours(microAmps: number, seconds: number): number {
  return (microAmps * seconds) / 3_600_000;
}

export function computeEnergyLog(
  time: number,
  epochSeconds: number,
  bursts: BleBurstEvent[],
  config: EnergyConfig,
  previousCumulativeMah = 0
): EnergyLog {
  const interval = config.advertisingEventIntervalSeconds;
  /** One representative collar — see `energyBurstsForRepresentativeCollar` in engine. */
  const steadyMah = microAmpSecondsToMilliampHours(config.baselineCurrentMicroAmps, epochSeconds);

  let scanMah: number;
  let advertisingMah: number;

  if (config.energyModel === "empiricalAverage") {
    const totalFromBenchMah = microAmpSecondsToMilliampHours(config.measuredSocial5s20sTotalMicroAmps, epochSeconds);
    advertisingMah = Math.max(0, totalFromBenchMah - steadyMah);
    scanMah = 0;
  } else {
    const bleScale = config.componentBleActivityScale ?? 1;
    const listenSeconds = totalScanListenWindowSeconds(bursts);
    scanMah = ((listenSeconds * config.rxCurrentMa1MPhy) / 3600) * bleScale;
    const advPackets = countAdvertisingPacketsInBursts(bursts, interval);
    advertisingMah =
      ((advPackets * config.advEventChargeMicroCoulombs) / MICROCOULOMBS_PER_MILLIAMP_HOUR) * bleScale;
  }

  const totalMah = steadyMah + scanMah + advertisingMah;
  const cumulativeMah = previousCumulativeMah + totalMah;
  const remainingMah = Math.max(0, config.batteryCapacityMah - cumulativeMah);
  const remainingPercent = config.batteryCapacityMah > 0 ? remainingMah / config.batteryCapacityMah : 0;

  return {
    time,
    steadyMah,
    scanMah,
    advertisingMah,
    totalMah,
    cumulativeMah,
    remainingMah,
    remainingPercent,
    estimatedVoltage: estimateLipoVoltage(remainingPercent, config.startingVoltage)
  };
}

/** Exported for tests comparing scheduling across epoch lengths. */
export function energyDiagnostics(
  bursts: BleBurstEvent[],
  advertisingEventIntervalSeconds: number
): {
  scanListenWindowCount: number;
  advertisingPacketCount: number;
  scanBurstWallSeconds: number;
  advertisingBurstWallSeconds: number;
} {
  return {
    scanListenWindowCount: countScanListenWindowsInBursts(bursts),
    advertisingPacketCount: countAdvertisingPacketsInBursts(bursts, advertisingEventIntervalSeconds),
    scanBurstWallSeconds: totalBleBurstWallSeconds(bursts, "scan"),
    advertisingBurstWallSeconds: totalBleBurstWallSeconds(bursts, "advertise")
  };
}

export function estimateLipoVoltage(stateOfCharge: number, startingVoltage = 4.2): number {
  const clampedSoc = Math.max(0, Math.min(1, stateOfCharge));
  const curve = [
    { soc: 0, voltage: 3.3 },
    { soc: 0.2, voltage: 3.6 },
    { soc: 0.5, voltage: 3.75 },
    { soc: 0.8, voltage: 3.95 },
    { soc: 1, voltage: Math.min(4.2, startingVoltage) }
  ];

  for (let index = 0; index < curve.length - 1; index += 1) {
    const left = curve[index];
    const right = curve[index + 1];
    if (clampedSoc >= left.soc && clampedSoc <= right.soc) {
      const position = (clampedSoc - left.soc) / (right.soc - left.soc);
      return left.voltage + position * (right.voltage - left.voltage);
    }
  }

  return curve.at(-1)?.voltage ?? startingVoltage;
}
