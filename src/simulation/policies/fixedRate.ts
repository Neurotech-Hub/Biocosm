import type { Animal, FirmwarePolicyConfig, FixedPolicyConfig, ScanWindowLog } from "../types";

export const DEFAULT_ADVERTISING_BURST_DURATION_SECONDS = 2;

export function applyFixedRatePolicy(
  animal: Animal,
  policy: FixedPolicyConfig,
  timeSeconds: number,
  dtSeconds: number,
  /** When false and policy.doubleWhenInactive, scan/adv intervals are doubled for this epoch. Defaults true when caller omits motion. */
  motionDetected = true
): Animal {
  void timeSeconds;
  void dtSeconds;
  const advertisingBurstDurationSeconds =
    policy.advertisingBurstDurationSeconds ?? DEFAULT_ADVERTISING_BURST_DURATION_SECONDS;
  const inactive = policy.doubleWhenInactive === true && !motionDetected;

  return {
    ...animal,
    collar: {
      ...animal.collar,
      scanActive: false,
      advActive: false,
      scanIntervalSeconds: inactive ? policy.scanIntervalSeconds * 2 : policy.scanIntervalSeconds,
      scanWindowSeconds: policy.scanWindowSeconds,
      advIntervalSeconds: inactive ? policy.advIntervalSeconds * 2 : policy.advIntervalSeconds,
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
  if (policy.type === "fixed") {
    const advertisingBurstDurationSeconds =
      policy.advertisingBurstDurationSeconds ?? DEFAULT_ADVERTISING_BURST_DURATION_SECONDS;
    return {
      scanIntervalSeconds: policy.scanIntervalSeconds,
      scanWindowSeconds: policy.scanWindowSeconds,
      advIntervalSeconds: policy.advIntervalSeconds,
      advertisingBurstDurationSeconds
    };
  }

  return {
    scanIntervalSeconds: policy.timingAnchors.neutral.scanIntervalSeconds,
    scanWindowSeconds: policy.timingAnchors.neutral.scanWindowSeconds,
    advIntervalSeconds: policy.timingAnchors.neutral.advIntervalSeconds,
    advertisingBurstDurationSeconds: policy.timingAnchors.advertisingBurstDurationSeconds
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
