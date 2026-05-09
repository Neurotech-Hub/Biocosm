import type { BleBurstEvent, EnergyConfig, EnergyLog } from "./types";

export function computeEnergyLog(
  time: number,
  epochSeconds: number,
  bursts: BleBurstEvent[],
  config: EnergyConfig,
  previousCumulativeMah = 0
): EnergyLog {
  const scanSeconds = burstSeconds(bursts, "scan");
  const advertisingSeconds = burstSeconds(bursts, "advertise");
  const steadyMah = config.steadyCurrentMa * (epochSeconds / 3600);
  const scanMah = config.scanCurrentMa * (scanSeconds / 3600);
  const advertisingMah = config.advertisingCurrentMa * (advertisingSeconds / 3600);
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

function burstSeconds(bursts: BleBurstEvent[], kind: BleBurstEvent["kind"]): number {
  return bursts
    .filter((burst) => burst.kind === kind)
    .reduce((sum, burst) => sum + Math.max(0, burst.endTime - burst.startTime), 0);
}
