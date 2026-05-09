import type { Animal, FirmwarePolicyConfig, FixedPolicyConfig, ScanWindowLog } from "../types";

export const DEFAULT_ADVERTISING_BURST_DURATION_SECONDS = 2;

export function applyFixedRatePolicy(
  animal: Animal,
  policy: FixedPolicyConfig,
  timeSeconds: number,
  dtSeconds: number
): Animal {
  void timeSeconds;
  void dtSeconds;
  const advertisingBurstDurationSeconds =
    policy.advertisingBurstDurationSeconds ?? DEFAULT_ADVERTISING_BURST_DURATION_SECONDS;

  return {
    ...animal,
    collar: {
      ...animal.collar,
      scanActive: false,
      advActive: false,
      scanIntervalSeconds: policy.scanIntervalSeconds,
      scanWindowSeconds: policy.scanWindowSeconds,
      advIntervalSeconds: policy.advIntervalSeconds,
      advertisingBurstDurationSeconds
    }
  };
}

export function createScanWindowLog(
  animal: Animal,
  policy: Pick<FirmwarePolicyConfig, "id">,
  timeSeconds: number
): ScanWindowLog | undefined {
  if (!animal.collar.scanActive) {
    return undefined;
  }

  return {
    startTime: timeSeconds,
    endTime: timeSeconds + animal.collar.scanWindowSeconds,
    observerId: animal.id,
    scanPolicyId: policy.id,
    detectedPeerIds: [],
    detectedAnyPeer: false
  };
}

export function getPolicyTiming(policy: FirmwarePolicyConfig): {
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
  advertisingBurstDurationSeconds: number;
} {
  const advertisingBurstDurationSeconds =
    policy.advertisingBurstDurationSeconds ?? DEFAULT_ADVERTISING_BURST_DURATION_SECONDS;
  if (policy.type === "fixed") {
    return {
      scanIntervalSeconds: policy.scanIntervalSeconds,
      scanWindowSeconds: policy.scanWindowSeconds,
      advIntervalSeconds: policy.advIntervalSeconds,
      advertisingBurstDurationSeconds
    };
  }

  return {
    scanIntervalSeconds: policy.scanIntervalMaxSeconds,
    scanWindowSeconds: policy.scanWindowMinSeconds,
    advIntervalSeconds: policy.advIntervalMaxSeconds,
    advertisingBurstDurationSeconds
  };
}

export function hasScheduledEventInEpoch(
  epochStart: number,
  epochEnd: number,
  intervalSeconds: number,
  phaseOffsetSeconds: number
): boolean {
  return firstScheduledTimeAtOrAfter(epochStart, intervalSeconds, phaseOffsetSeconds) < epochEnd;
}

export function firstScheduledTimeAtOrAfter(
  timeSeconds: number,
  intervalSeconds: number,
  phaseOffsetSeconds: number
): number {
  if (intervalSeconds <= 0) {
    return timeSeconds;
  }

  const cycle = Math.ceil((timeSeconds - phaseOffsetSeconds) / intervalSeconds);
  return phaseOffsetSeconds + cycle * intervalSeconds;
}
