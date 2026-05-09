import {
  countAdvertisingPacketsInBursts,
  countScanListenWindowsInBursts,
  estimateEventBasedBleEpochMilliampSeconds,
  totalBleBurstWallSeconds
} from "./radio";
import type { BleBurstEvent, EnergyConfig, EnergyLog } from "./types";

export function computeEnergyLog(
  time: number,
  epochSeconds: number,
  bursts: BleBurstEvent[],
  config: EnergyConfig,
  previousCumulativeMah = 0
): EnergyLog {
  const { steadyMah, scanMah, advertisingMah } = estimateEventBasedBleEpochMilliampSeconds(
    bursts,
    epochSeconds,
    config
  );
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
export function energyDiagnostics(bursts: BleBurstEvent[]): {
  scanListenWindowCount: number;
  advertisingPacketCount: number;
  scanBurstWallSeconds: number;
  advertisingBurstWallSeconds: number;
} {
  return {
    scanListenWindowCount: countScanListenWindowsInBursts(bursts),
    advertisingPacketCount: countAdvertisingPacketsInBursts(bursts),
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
