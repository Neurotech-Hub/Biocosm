import type { Animal, AnimalObservation, FirmwarePolicyConfig, FixedPolicyConfig, ScanWindowLog } from "../types";

export const DEFAULT_ADVERTISING_BURST_DURATION_SECONDS = 2;

export function isInactiveScanMultiplierInf(
  mult: FixedPolicyConfig["inactiveScanIntervalMultiplier"] | undefined
): mult is "inf" {
  return mult === "inf";
}

export function applyFixedRatePolicy(
  animal: Animal,
  policy: FixedPolicyConfig,
  timeSeconds: number,
  dtSeconds: number,
  observation: AnimalObservation
): Animal {
  void timeSeconds;
  void dtSeconds;
  const advertisingBurstDurationSeconds =
    policy.advertisingBurstDurationSeconds ?? DEFAULT_ADVERTISING_BURST_DURATION_SECONDS;
  const mult = policy.inactiveScanIntervalMultiplier ?? 2;
  const boutSeconds = Math.max(1, animal.traits.movementBoutMeanMinutes * 60);
  const infInactiveScan =
    policy.doubleWhenInactive === true && isInactiveScanMultiplierInf(policy.inactiveScanIntervalMultiplier) && !observation.motionDetected;
  const stretchInactiveScan =
    policy.doubleWhenInactive === true &&
    !isInactiveScanMultiplierInf(policy.inactiveScanIntervalMultiplier) &&
    animal.collar.noMotionStreakSeconds >= boutSeconds;
  const numericMult = typeof mult === "number" ? mult : 2;

  return {
    ...animal,
    collar: {
      ...animal.collar,
      scanActive: false,
      advActive: false,
      scanIntervalSeconds: stretchInactiveScan ? policy.scanIntervalSeconds * numericMult : policy.scanIntervalSeconds,
      scanWindowSeconds: infInactiveScan ? 0 : policy.scanWindowSeconds,
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
