import { applyFixedRatePolicy } from "./fixedRate";
import type {
  Animal,
  AnimalObservation,
  DetectionEvent,
  FirmwarePolicyConfig,
  MotionPeerAdaptivePolicyConfig
} from "../types";

export function applyFirmwarePolicy(
  animal: Animal,
  policy: FirmwarePolicyConfig,
  observation: AnimalObservation,
  recentDetections: DetectionEvent[],
  timeSeconds: number,
  dtSeconds: number
): Animal {
  if (policy.type === "fixed") {
    return applyFixedRatePolicy(animal, policy, timeSeconds, dtSeconds);
  }

  return applyMotionPeerAdaptivePolicy(animal, policy, observation, recentDetections, timeSeconds, dtSeconds);
}

export function applyMotionPeerAdaptivePolicy(
  animal: Animal,
  policy: MotionPeerAdaptivePolicyConfig,
  observation: AnimalObservation,
  recentDetections: DetectionEvent[],
  timeSeconds: number,
  dtSeconds: number
): Animal {
  const motionDrive = decay(animal.collar.motionDrive, dtSeconds, policy.tauMotionSeconds) +
    (observation.motionDetected ? policy.motionGain : 0);
  const hadRecentPeerDetection = recentDetections.some((event) => event.observerId === animal.id);
  const peerDrive = decay(animal.collar.peerDrive, dtSeconds, policy.tauPeerSeconds) +
    (hadRecentPeerDetection ? policy.peerGain : 0);
  const samplingDrive = clamp01(policy.motionWeight * motionDrive + policy.peerWeight * peerDrive);
  const scanIntervalSeconds = logInterpolate(
    policy.scanIntervalMaxSeconds,
    policy.scanIntervalMinSeconds,
    samplingDrive
  );
  const scanWindowSeconds = linearInterpolate(
    policy.scanWindowMinSeconds,
    policy.scanWindowMaxSeconds,
    samplingDrive
  );
  const advIntervalSeconds = logInterpolate(policy.advIntervalMaxSeconds, policy.advIntervalMinSeconds, samplingDrive);

  return {
    ...animal,
    collar: {
      ...animal.collar,
      scanActive: false,
      advActive: false,
      scanIntervalSeconds,
      scanWindowSeconds,
      advIntervalSeconds,
      motionDrive,
      peerDrive,
      samplingDrive,
      lastPeerDetectionTime: hadRecentPeerDetection ? timeSeconds : animal.collar.lastPeerDetectionTime
    }
  };
}

export function logInterpolate(maxValue: number, minValue: number, drive: number): number {
  const clamped = clamp01(drive);
  return Math.exp(Math.log(maxValue) * (1 - clamped) + Math.log(minValue) * clamped);
}

export function linearInterpolate(minValue: number, maxValue: number, drive: number): number {
  return minValue + clamp01(drive) * (maxValue - minValue);
}

function decay(value: number, dtSeconds: number, tauSeconds: number): number {
  return value * Math.exp(-dtSeconds / tauSeconds);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

