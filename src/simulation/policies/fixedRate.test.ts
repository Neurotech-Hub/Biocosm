import { describe, expect, it } from "vitest";
import type { Animal, FixedPolicyConfig } from "../types";
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
    const below = applyFixedRatePolicy(animalWithStreak(59), policy, 0, 60);
    expect(below.collar.scanIntervalSeconds).toBe(20);
    expect(below.collar.advIntervalSeconds).toBe(10);
    const at = applyFixedRatePolicy(animalWithStreak(60), policy, 0, 60);
    expect(at.collar.scanIntervalSeconds).toBe(40);
    expect(at.collar.advIntervalSeconds).toBe(10);
  });

  it("uses inactiveScanIntervalMultiplier for scan interval only", () => {
    const policy = {
      ...fixedPolicyBase,
      doubleWhenInactive: true,
      inactiveScanIntervalMultiplier: 5 as const
    };
    const next = applyFixedRatePolicy(animalWithStreak(60), policy, 0, 60);
    expect(next.collar.scanIntervalSeconds).toBe(100);
    expect(next.collar.advIntervalSeconds).toBe(10);
  });

  it("defaults multiplier to 2 when inactive stretch applies", () => {
    const policy = { ...fixedPolicyBase, doubleWhenInactive: true };
    const next = applyFixedRatePolicy(animalWithStreak(60), policy, 0, 60);
    expect(next.collar.scanIntervalSeconds).toBe(40);
  });

  it("ignores inactive stretch when flag is unset", () => {
    const next = applyFixedRatePolicy(animalWithStreak(3600), fixedPolicyBase, 0, 60);
    expect(next.collar.scanIntervalSeconds).toBe(20);
    expect(next.collar.advIntervalSeconds).toBe(10);
  });
});
