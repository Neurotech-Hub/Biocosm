import { describe, expect, it } from "vitest";
import type { Animal, AnimalObservation, FixedPolicyConfig } from "../types";
import { applyFixedRatePolicy } from "./fixedRate";

const baseCollar = {
  animalId: "a1",
  valid: true,
  batteryMahRemaining: 100,
  scanActive: false,
  advActive: false,
  scanIntervalSeconds: 10,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 5,
  advertisingBurstDurationSeconds: 2,
  scanPhaseOffsetSeconds: 0,
  advPhaseOffsetSeconds: 0,
  motionDrive: 0.5,
  peerDrive: 0.5,
  samplingDrive: 0.5,
  lastScanTime: 0,
  lastAdvTime: 0,
  noMotionStreakSeconds: 0
};

function animalWithStreak(streakSeconds: number): Animal {
  return {
    id: "a1",
    traits: { movementBoutMeanMinutes: 1 } as Animal["traits"],
    collar: { ...baseCollar, noMotionStreakSeconds: streakSeconds }
  } as Animal;
}

function obs(motionDetected: boolean): AnimalObservation {
  return { time: 60, animalId: "a1", motionDetected, motionMagnitude: motionDetected ? 0.5 : 0, collarValid: true };
}

const fixedPolicyBase: FixedPolicyConfig = {
  type: "fixed",
  id: "test-fixed",
  name: "Test",
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 10
};

describe("applyFixedRatePolicy", () => {
  it("does not stretch scan until no-motion streak reaches movement bout (minutes → seconds)", () => {
    const policy = { ...fixedPolicyBase, doubleWhenInactive: true };
    const below = applyFixedRatePolicy(animalWithStreak(59), policy, 0, 60, obs(false));
    expect(below.collar.scanIntervalSeconds).toBe(20);
    expect(below.collar.advIntervalSeconds).toBe(10);
    const at = applyFixedRatePolicy(animalWithStreak(60), policy, 0, 60, obs(false));
    expect(at.collar.scanIntervalSeconds).toBe(40);
    expect(at.collar.advIntervalSeconds).toBe(10);
  });

  it("uses inactiveScanIntervalMultiplier for scan interval only", () => {
    const policy = {
      ...fixedPolicyBase,
      doubleWhenInactive: true,
      inactiveScanIntervalMultiplier: 5 as const
    };
    const next = applyFixedRatePolicy(animalWithStreak(60), policy, 0, 60, obs(false));
    expect(next.collar.scanIntervalSeconds).toBe(100);
    expect(next.collar.advIntervalSeconds).toBe(10);
  });

  it("defaults multiplier to 2 when inactive stretch applies", () => {
    const policy = { ...fixedPolicyBase, doubleWhenInactive: true };
    const next = applyFixedRatePolicy(animalWithStreak(60), policy, 0, 60, obs(false));
    expect(next.collar.scanIntervalSeconds).toBe(40);
  });

  it("ignores inactive stretch when flag is unset", () => {
    const next = applyFixedRatePolicy(animalWithStreak(3600), fixedPolicyBase, 0, 60, obs(false));
    expect(next.collar.scanIntervalSeconds).toBe(20);
    expect(next.collar.advIntervalSeconds).toBe(10);
  });

  it("with Inf multiplier, zeroes scan window when the epoch had no motion (even below bout threshold)", () => {
    const policy = {
      ...fixedPolicyBase,
      doubleWhenInactive: true,
      inactiveScanIntervalMultiplier: "inf" as const
    };
    const noMotion = applyFixedRatePolicy(animalWithStreak(10), policy, 0, 60, obs(false));
    expect(noMotion.collar.scanWindowSeconds).toBe(0);
    expect(noMotion.collar.scanIntervalSeconds).toBe(20);
    const motion = applyFixedRatePolicy(animalWithStreak(10), policy, 0, 60, obs(true));
    expect(motion.collar.scanWindowSeconds).toBe(1.5);
  });

  it("Inf multiplier does not apply bout-based interval stretch", () => {
    const policy = {
      ...fixedPolicyBase,
      doubleWhenInactive: true,
      inactiveScanIntervalMultiplier: "inf" as const
    };
    const longStreak = applyFixedRatePolicy(animalWithStreak(3600), policy, 0, 60, obs(false));
    expect(longStreak.collar.scanIntervalSeconds).toBe(20);
    expect(longStreak.collar.scanWindowSeconds).toBe(0);
  });
});
