import type { Animal, FixedPolicyConfig, ScanWindowLog } from "../types";

export function applyFixedRatePolicy(
  animal: Animal,
  policy: FixedPolicyConfig,
  timeSeconds: number,
  dtSeconds: number
): Animal {
  const scanPhase = positiveModulo(timeSeconds, policy.scanIntervalSeconds);
  const advPhase = positiveModulo(timeSeconds, policy.advIntervalSeconds);
  const scanActive = animal.collar.valid && scanPhase < Math.min(policy.scanWindowSeconds, dtSeconds);
  const advActive = animal.collar.valid && advPhase < dtSeconds;

  return {
    ...animal,
    collar: {
      ...animal.collar,
      scanActive,
      advActive,
      scanIntervalSeconds: policy.scanIntervalSeconds,
      scanWindowSeconds: policy.scanWindowSeconds,
      advIntervalSeconds: policy.advIntervalSeconds,
      lastScanTime: scanActive ? timeSeconds : animal.collar.lastScanTime,
      lastAdvTime: advActive ? timeSeconds : animal.collar.lastAdvTime
    }
  };
}

export function createScanWindowLog(
  animal: Animal,
  policy: FixedPolicyConfig,
  timeSeconds: number
): ScanWindowLog | undefined {
  if (!animal.collar.scanActive) {
    return undefined;
  }

  return {
    startTime: timeSeconds,
    endTime: timeSeconds + policy.scanWindowSeconds,
    observerId: animal.id,
    scanPolicyId: policy.id,
    detectedPeerIds: [],
    detectedAnyPeer: false
  };
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
