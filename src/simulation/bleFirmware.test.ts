import { computeEnergyLog, MICROCOULOMBS_PER_MILLIAMP_HOUR } from "./energy";
import { juxtaMainCMode0FixedPolicy, defaultSimulationConfig } from "./config";
import {
  countAdvertisingPacketsInBursts,
  countScanListenWindowsInBursts,
  createBleBurstEvents,
  simulateBleDetections
} from "./radio";
import { SeededRandom } from "./random";
import type { Animal, BleBurstEvent, BleSchedulingConfig } from "./types";
import { createInitialSimulation } from "./world";

function applyCollarAfterBursts(animal: Animal, bursts: BleBurstEvent[]): Animal {
  const mine = bursts.filter((burst) => burst.animalId === animal.id);
  const lastScan = mine.filter((burst) => burst.kind === "scan").at(-1);
  const lastAdv = mine.filter((burst) => burst.kind === "advertise").at(-1);
  return {
    ...animal,
    collar: {
      ...animal.collar,
      lastScanTime: lastScan?.endTime ?? animal.collar.lastScanTime,
      lastAdvTime: lastAdv?.endTime ?? animal.collar.lastAdvTime
    }
  };
}

function runChunkedScheduling(
  animal: Animal,
  policyId: string,
  totalSeconds: number,
  chunkSeconds: number,
  scheduling: BleSchedulingConfig
): BleBurstEvent[] {
  let current = animal;
  const all: BleBurstEvent[] = [];
  for (let start = 0; start < totalSeconds; start += chunkSeconds) {
    const end = Math.min(totalSeconds, start + chunkSeconds);
    const chunk = createBleBurstEvents([current], policyId, start, end, scheduling);
    all.push(...chunk);
    current = applyCollarAfterBursts(current, chunk);
  }
  return all;
}

describe("BLE firmware alignment", () => {
  it("chunked 60s epochs match one-shot scheduling within 2% for listen/adv packet counts (sub-60s chunks truncate bursts)", () => {
    const state = createInitialSimulation({
      ...defaultSimulationConfig,
      pathNodeCount: 18,
      animalCount: 1,
      activePolicy: { ...juxtaMainCMode0FixedPolicy }
    });
    const animal = state.animals[0];
    const scheduling = defaultSimulationConfig.bleScheduling;
    const policyId = juxtaMainCMode0FixedPolicy.id;
    const horizon = 600;

    const once = createBleBurstEvents([animal], policyId, 0, horizon, scheduling);
    const bySixty = runChunkedScheduling(animal, policyId, horizon, 60, scheduling);

    const listenOnce = countScanListenWindowsInBursts(once);
    const listenChunked = countScanListenWindowsInBursts(bySixty);
    expect(Math.abs(listenChunked - listenOnce) / Math.max(listenOnce, 1)).toBeLessThanOrEqual(0.02);

    const packetsOnce = countAdvertisingPacketsInBursts(once);
    const packetsChunked = countAdvertisingPacketsInBursts(bySixty);
    expect(Math.abs(packetsChunked - packetsOnce) / Math.max(packetsOnce, 1)).toBeLessThanOrEqual(0.02);
  });

  it("schedules roughly 3 scans and frequent advertises per wall minute for Juxta5-8-style fixed policy (one animal; serial radio + gaps)", () => {
    const state = createInitialSimulation({
      ...defaultSimulationConfig,
      pathNodeCount: 18,
      animalCount: 1,
      startTimeSeconds: 0,
      activePolicy: { ...juxtaMainCMode0FixedPolicy }
    });
    const animal = state.animals[0];
    const bursts = createBleBurstEvents([animal], juxtaMainCMode0FixedPolicy.id, 0, 60, defaultSimulationConfig.bleScheduling);
    const scans = bursts.filter((burst) => burst.kind === "scan").length;
    const adverts = bursts.filter((burst) => burst.kind === "advertise").length;
    expect(scans).toBeGreaterThanOrEqual(2);
    expect(scans).toBeLessThanOrEqual(4);
    expect(adverts).toBeGreaterThanOrEqual(28);
    expect(adverts).toBeLessThanOrEqual(40);
  });

  it("minute write safe zone changes scheduled burst times", () => {
    const state = createInitialSimulation({
      ...defaultSimulationConfig,
      pathNodeCount: 18,
      animalCount: 1,
      activePolicy: { ...juxtaMainCMode0FixedPolicy }
    });
    const animal = state.animals[0];
    const base = defaultSimulationConfig.bleScheduling;
    const noZone = createBleBurstEvents([animal], juxtaMainCMode0FixedPolicy.id, 50, 130, {
      ...base,
      minuteWriteSafeZoneSeconds: 0
    });
    const withZone = createBleBurstEvents([animal], juxtaMainCMode0FixedPolicy.id, 50, 130, {
      ...base,
      minuteWriteSafeZoneSeconds: 3
    });
    expect(noZone.map((burst) => burst.startTime)).not.toEqual(withZone.map((burst) => burst.startTime));
  });

  it("uses interpolated distance so brief in-range geometry inside an epoch can produce detections", () => {
    const radio = {
      ...defaultSimulationConfig.radio,
      detectionRadiusMeters: 2,
      rssiThreshold: -200,
      rssiNoiseSd: 0
    };
    const observerTemplate = createInitialSimulation({
      ...defaultSimulationConfig,
      pathNodeCount: 18,
      animalCount: 1,
      radio
    }).animals[0];
    const observerStart: Animal = {
      ...observerTemplate,
      id: "animal-observer",
      position: { ...observerTemplate.position, x: 0, y: 0, fromNodeId: "n", toNodeId: "n", nodeId: "n" }
    };
    const observerEnd: Animal = { ...observerStart };

    const peerTemplate = createInitialSimulation({
      ...defaultSimulationConfig,
      pathNodeCount: 18,
      animalCount: 1,
      radio
    }).animals[0];
    const peerStart: Animal = {
      ...peerTemplate,
      id: "animal-peer",
      position: { ...peerTemplate.position, x: 6, y: 0, fromNodeId: "n", toNodeId: "n", nodeId: "n" }
    };
    const peerEnd: Animal = {
      ...peerStart,
      position: { ...peerStart.position, x: 1, y: 0 }
    };

    const bursts: BleBurstEvent[] = [
      { kind: "scan", startTime: 50, endTime: 51.5, animalId: observerStart.id, policyId: "test" },
      { kind: "advertise", startTime: 50, endTime: 52, animalId: peerStart.id, policyId: "test" }
    ];

    const detections = simulateBleDetections(
      [observerStart, peerStart],
      [observerEnd, peerEnd],
      radio,
      "test",
      0,
      60,
      new SeededRandom("cross"),
      bursts
    );
    expect(detections.some((event) => event.observerId === observerStart.id && event.peerId === peerStart.id)).toBe(
      true
    );

    const farPeer = { ...peerStart, position: { ...peerStart.position, x: 6, y: 0 } };
    const farPeerEnd = { ...farPeer };
    expect(
      simulateBleDetections(
        [observerStart, farPeer],
        [observerEnd, farPeerEnd],
        radio,
        "test",
        0,
        60,
        new SeededRandom("cross"),
        bursts
      )
    ).toHaveLength(0);
  });

  it("attributes BLE advertising energy to µC per event, not burst wall × peak TX", () => {
    const bursts: BleBurstEvent[] = [
      { kind: "advertise", startTime: 0, endTime: 2, animalId: "a", policyId: "p" },
      { kind: "scan", startTime: 3, endTime: 4.5, animalId: "a", policyId: "p" }
    ];
    const componentEnergy = {
      ...defaultSimulationConfig.energy,
      energyModel: "component" as const
    };
    const energy = computeEnergyLog(60, 60, bursts, componentEnergy);
    const packets = countAdvertisingPacketsInBursts(
      bursts,
      componentEnergy.advertisingEventIntervalSeconds
    );
    const scale = componentEnergy.componentBleActivityScale ?? 1;
    const expectedAdvMah =
      ((packets * componentEnergy.advEventChargeMicroCoulombs) / MICROCOULOMBS_PER_MILLIAMP_HOUR) *
      scale;
    expect(energy.advertisingMah).toBeCloseTo(expectedAdvMah, 6);
    expect(energy.scanMah).toBeGreaterThan(0);
    const naiveIfTwoSecondsAtSixteenMa = (2 * 16) / 3600;
    expect(energy.advertisingMah).toBeLessThan(naiveIfTwoSecondsAtSixteenMa);
  });
});
