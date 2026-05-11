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
  lastAdvTime: 0
};

/** applyFixedRatePolicy only reads collar; rest is stubbed for the type checker. */
const dummyAnimal = {
  id: "a1",
  collar: baseCollar
} as unknown as Animal;

const fixedPolicyBase: FixedPolicyConfig = {
  type: "fixed",
  id: "test-fixed",
  name: "Test",
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 10
};

describe("applyFixedRatePolicy", () => {
  it("doubles scan and advertise intervals when doubleWhenInactive and no motion detected", () => {
    const policy = { ...fixedPolicyBase, doubleWhenInactive: true };
    const next = applyFixedRatePolicy(dummyAnimal, policy, 0, 60, false);
    expect(next.collar.scanIntervalSeconds).toBe(40);
    expect(next.collar.advIntervalSeconds).toBe(20);
    expect(next.collar.scanWindowSeconds).toBe(1.5);
  });

  it("does not double when motion detected despite doubleWhenInactive", () => {
    const policy = { ...fixedPolicyBase, doubleWhenInactive: true };
    const next = applyFixedRatePolicy(dummyAnimal, policy, 0, 60, true);
    expect(next.collar.scanIntervalSeconds).toBe(20);
    expect(next.collar.advIntervalSeconds).toBe(10);
  });

  it("ignores doubling when flag is unset", () => {
    const next = applyFixedRatePolicy(dummyAnimal, fixedPolicyBase, 0, 60, false);
    expect(next.collar.scanIntervalSeconds).toBe(20);
    expect(next.collar.advIntervalSeconds).toBe(10);
  });
});
