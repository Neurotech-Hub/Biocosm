import { applyFixedRatePolicy } from "./fixedRate";
import type {
  AdaptiveBleTiming,
  AdaptiveBleTimingAnchors,
  Animal,
  AnimalObservation,
  DetectionEvent,
  FirmwarePolicyConfig,
  MotionPeerAdaptivePolicyConfig,
  ScanWindowLog
} from "../types";

export type AdaptivePolicyInputs = {
  localPeerDetectionsLastEpoch: DetectionEvent[];
  observerScannedWithoutPeerLastEpoch: boolean;
  motionEventCount?: number;
};

export function applyFirmwarePolicy(
  animal: Animal,
  policy: FirmwarePolicyConfig,
  observation: AnimalObservation,
  recentDetections: DetectionEvent[],
  recentScanWindows: ScanWindowLog[],
  timeSeconds: number,
  dtSeconds: number
): Animal {
  if (policy.type === "fixed") {
    return applyFixedRatePolicy(animal, policy, timeSeconds, dtSeconds, observation);
  }

  return applyMotionPeerAdaptivePolicy(
    animal,
    policy,
    observation,
    adaptivePolicyInputsForAnimal(animal.id, recentDetections, recentScanWindows),
    timeSeconds,
    dtSeconds
  );
}

export function applyMotionPeerAdaptivePolicy(
  animal: Animal,
  policy: MotionPeerAdaptivePolicyConfig,
  observation: AnimalObservation,
  inputs: AdaptivePolicyInputs,
  timeSeconds: number,
  dtSeconds: number
): Animal {
  const motionEventScore = observation.motionDetected
    ? clamp01((inputs.motionEventCount ?? 1) / policy.motionEventCountSaturation)
    : 0;
  const peerEventScore = clamp01(inputs.localPeerDetectionsLastEpoch.length / policy.peerDetectionCountSaturation);
  const motionDrive = clamp01(
    decay(animal.collar.motionDrive, dtSeconds, policy.tauMotionSeconds) + policy.motionGain * motionEventScore
  );
  const peerDrive = clamp01(
    decay(animal.collar.peerDrive, dtSeconds, policy.tauPeerSeconds) +
    policy.peerGain * peerEventScore -
    (inputs.observerScannedWithoutPeerLastEpoch ? policy.peerMissPenalty : 0)
  );
  const samplingDrive = adaptiveSamplingDrive(policy, motionDrive, peerDrive);
  const timing = constrainAdaptiveTiming(mapAdaptiveTiming(samplingDrive, policy.timingAnchors));
  const hadRecentPeerDetection = inputs.localPeerDetectionsLastEpoch.length > 0;

  return {
    ...animal,
    collar: {
      ...animal.collar,
      scanActive: false,
      advActive: false,
      scanIntervalSeconds: timing.scanIntervalSeconds,
      scanWindowSeconds: timing.scanWindowSeconds,
      advIntervalSeconds: timing.advIntervalSeconds,
      advertisingBurstDurationSeconds: timing.advertisingBurstDurationSeconds,
      motionDrive,
      peerDrive,
      samplingDrive,
      lastPeerDetectionTime: hadRecentPeerDetection ? timeSeconds : animal.collar.lastPeerDetectionTime
    }
  };
}

export function adaptivePolicyInputsForAnimal(
  animalId: string,
  recentDetections: DetectionEvent[],
  recentScanWindows: ScanWindowLog[]
): AdaptivePolicyInputs {
  const localPeerDetectionsLastEpoch = recentDetections.filter((event) => event.observerId === animalId);
  const observerScannedLastEpoch = recentScanWindows.some((window) => window.observerId === animalId);

  return {
    localPeerDetectionsLastEpoch,
    observerScannedWithoutPeerLastEpoch: observerScannedLastEpoch && localPeerDetectionsLastEpoch.length === 0
  };
}

export function adaptiveSamplingDrive(
  policy: MotionPeerAdaptivePolicyConfig,
  motionDrive: number,
  peerDrive: number
): number {
  const rawDrive = clamp01(policy.baselineDrive + policy.motionWeight * motionDrive + policy.peerWeight * peerDrive);
  return policy.allowEnergySavingDownscale ? rawDrive : Math.max(0.5, rawDrive);
}

export function mapAdaptiveTiming(
  drive: number,
  anchors: AdaptiveBleTimingAnchors
): AdaptiveBleTiming & { advertisingBurstDurationSeconds: number } {
  const clamped = clamp01(drive);

  if (clamped <= 0.5) {
    const p = clamped / 0.5;
    return {
      scanIntervalSeconds: logInterpolate(anchors.lowIntensity.scanIntervalSeconds, anchors.neutral.scanIntervalSeconds, p),
      scanWindowSeconds: linearInterpolate(anchors.lowIntensity.scanWindowSeconds, anchors.neutral.scanWindowSeconds, p),
      advIntervalSeconds: logInterpolate(anchors.lowIntensity.advIntervalSeconds, anchors.neutral.advIntervalSeconds, p),
      advertisingBurstDurationSeconds: anchors.advertisingBurstDurationSeconds
    };
  }

  const p = (clamped - 0.5) / 0.5;
  return {
    scanIntervalSeconds: logInterpolate(anchors.neutral.scanIntervalSeconds, anchors.highIntensity.scanIntervalSeconds, p),
    scanWindowSeconds: linearInterpolate(anchors.neutral.scanWindowSeconds, anchors.highIntensity.scanWindowSeconds, p),
    advIntervalSeconds: logInterpolate(anchors.neutral.advIntervalSeconds, anchors.highIntensity.advIntervalSeconds, p),
    advertisingBurstDurationSeconds: anchors.advertisingBurstDurationSeconds
  };
}

export function constrainAdaptiveTiming<T extends AdaptiveBleTiming & { advertisingBurstDurationSeconds: number }>(
  timing: T
): T {
  const scanIntervalSeconds = Math.max(1, timing.scanIntervalSeconds);
  const advIntervalSeconds = Math.max(0.2, timing.advIntervalSeconds);
  const scanWindowSeconds = Math.min(scanIntervalSeconds, Math.max(0.05, timing.scanWindowSeconds));
  const advertisingBurstDurationSeconds = Math.max(0.1, timing.advertisingBurstDurationSeconds);

  return {
    ...timing,
    scanIntervalSeconds,
    scanWindowSeconds,
    advIntervalSeconds,
    advertisingBurstDurationSeconds
  };
}

export function combinedEnvelopeDuty(timing: Pick<Animal["collar"], "scanIntervalSeconds" | "scanWindowSeconds" | "advIntervalSeconds" | "advertisingBurstDurationSeconds">): number {
  return timing.scanWindowSeconds / timing.scanIntervalSeconds +
    timing.advertisingBurstDurationSeconds / timing.advIntervalSeconds;
}

export function logInterpolate(startValue: number, endValue: number, drive: number): number {
  const clamped = clamp01(drive);
  return Math.exp(Math.log(startValue) + (Math.log(endValue) - Math.log(startValue)) * clamped);
}

export function linearInterpolate(minValue: number, maxValue: number, drive: number): number {
  return minValue + clamp01(drive) * (maxValue - minValue);
}

function decay(value: number, dtSeconds: number, tauSeconds: number): number {
  if (tauSeconds <= 0) {
    return 0;
  }
  return value * Math.exp(-dtSeconds / tauSeconds);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

