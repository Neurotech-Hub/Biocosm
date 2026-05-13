import { defaultSimulationConfig } from "./config";
import { runSimulation, stepSimulation } from "./engine";
import {
  buildAnimalStripEvents,
  buildFixedBleTimeSeries,
  buildTimeSeries,
  decimateMovementStripEvents,
  isLightPhase,
  type AnimalStripEvent
} from "./timeSeries";
import type { Animal, SimulationLogs, SimulationState } from "./types";
import { createInitialSimulation } from "./world";

describe("time series helpers", () => {
  it("classifies light phase from absolute time", () => {
    expect(isLightPhase(5 * 3600 + 59 * 60)).toBe(false);
    expect(isLightPhase(6 * 3600)).toBe(true);
    expect(isLightPhase(17 * 3600 + 59 * 60)).toBe(true);
    expect(isLightPhase(18 * 3600)).toBe(false);
  });

  it("summarizes movement as a normalized animal fraction", () => {
    const initial = createInitialSimulation({
      ...defaultSimulationConfig,
      simulationLengthSeconds: 2 * defaultSimulationConfig.timeStepSeconds
    });
    const first = runSimulation(initial, 1);
    const second = runSimulation(first, 1);
    const points = buildTimeSeries([initial, first, second]);

    expect(points).toHaveLength(3);
    expect(points[0].movementFraction).toBe(0);
    expect(points[1].movementFraction).toBeGreaterThanOrEqual(0);
    expect(points[1].movementFraction).toBeLessThanOrEqual(1);
    expect(points[2].absoluteTime).toBe(defaultSimulationConfig.startTimeSeconds + second.time);
  });

  it("decimates movement strip events to a fixed cap per animal", () => {
    const many: AnimalStripEvent[] = [];
    for (let t = 0; t < 5000; t++) {
      many.push({ time: t, animalId: "animal-1", kind: t % 120 === 0 ? "sleep" : "awake" });
    }
    const decimated = decimateMovementStripEvents(many, 50);
    expect(decimated.length).toBe(50);
    expect(decimated[0].time).toBe(0);
    expect(decimated.at(-1)?.time).toBe(4999);

    const twoAnimals: AnimalStripEvent[] = [
      ...many,
      ...many.map((e) => ({ ...e, animalId: "animal-2" }))
    ];
    expect(decimateMovementStripEvents(twoAnimals, 50)).toHaveLength(100);
  });

  it("buildFixedBleTimeSeries uses cohort mean of applied collar timings", () => {
    const policy = {
      type: "fixed" as const,
      id: "f",
      name: "f",
      scanIntervalSeconds: 10,
      scanWindowSeconds: 1,
      advIntervalSeconds: 4,
      advertisingBurstDurationSeconds: 2
    };
    const stubAnimal = (id: string, scan: number, adv: number, win: number): Animal =>
      ({
        id,
        collar: {
          scanIntervalSeconds: scan,
          advIntervalSeconds: adv,
          scanWindowSeconds: win
        }
      }) as Animal;
    const state = (time: number, animals: Animal[]): SimulationState =>
      ({
        time,
        config: { activePolicy: policy },
        animals
      }) as SimulationState;

    const timeline = [
      state(0, [stubAnimal("animal-1", 20, 4, 1), stubAnimal("animal-2", 40, 4, 1)]),
      state(60, [stubAnimal("animal-1", 30, 4, 1), stubAnimal("animal-2", 30, 4, 1)])
    ];
    const series = buildFixedBleTimeSeries(timeline);
    expect(series).toHaveLength(2);
    expect(series[0]!.scanIntervalSeconds).toBe(30);
    expect(series[1]!.scanIntervalSeconds).toBe(30);
    expect(series[0]!.envelopeDuty).toBeCloseTo(1 / 30 + 2 / 4);
    expect(series[0]!.noScanWindow).toBe(false);
    expect(series[1]!.noScanWindow).toBe(false);
  });

  it("buildFixedBleTimeSeries marks noScanWindow when cohort mean scan window is zero", () => {
    const policy = {
      type: "fixed" as const,
      id: "f",
      name: "f",
      scanIntervalSeconds: 10,
      scanWindowSeconds: 1,
      advIntervalSeconds: 4,
      advertisingBurstDurationSeconds: 2
    };
    const stubAnimal = (id: string, scan: number, adv: number, win: number): Animal =>
      ({
        id,
        collar: {
          scanIntervalSeconds: scan,
          advIntervalSeconds: adv,
          scanWindowSeconds: win
        }
      }) as Animal;
    const state = (time: number, animals: Animal[]): SimulationState =>
      ({
        time,
        config: { activePolicy: policy },
        animals
      }) as SimulationState;

    const timeline = [
      state(0, [stubAnimal("animal-1", 20, 4, 0), stubAnimal("animal-2", 20, 4, 0)]),
      state(60, [stubAnimal("animal-1", 20, 4, 1), stubAnimal("animal-2", 20, 4, 1)])
    ];
    const series = buildFixedBleTimeSeries(timeline);
    expect(series[0]!.noScanWindow).toBe(true);
    expect(series[1]!.noScanWindow).toBe(false);
  });

  it("includes awake stationary rows in animal strip events", () => {
    const logs: SimulationLogs = {
      animalStates: [
        stateLog("animal-1", 60, "sleeping"),
        stateLog("animal-1", 120, "awake_stationary"),
        stateLog("animal-1", 180, "moving")
      ],
      trueDyads: [
        {
          time: 240,
          epochStartTime: 180,
          epochEndTime: 240,
          animalA: "animal-1",
          animalB: "animal-2",
          distance: 0.4,
          withinDetectionRadius: true,
          withinDetectionRadiusAtEnd: true,
          withinDetectionRadiusAny: true,
          withinSocialRadius: true,
          bothCollarsValid: true,
          inRangeSeconds: 60,
          minDistanceMeters: 0.4,
          endDistanceMeters: 0.4
        }
      ],
      detections: [],
      bleBursts: [],
      scanWindows: [],
      adaptiveBlePolicy: [],
      collarStates: [],
      energy: []
    };

    expect(buildAnimalStripEvents(logs)).toEqual([
      { time: 60, animalId: "animal-1", kind: "sleep" },
      { time: 120, animalId: "animal-1", kind: "awake" },
      { time: 180, animalId: "animal-1", kind: "move" },
      { time: 240, animalId: "animal-1", kind: "social" },
      { time: 240, animalId: "animal-2", kind: "social" }
    ]);
  });

  it("shows higher movement during the dark phase for nocturnal animals", () => {
    const config = {
      ...defaultSimulationConfig,
      speciesPresetId: "lab_mouse",
      seed: "circadian-profile",
      startTimeSeconds: 0,
      simulationLengthSeconds: 24 * 3600,
      animalCount: 16,
      behavior: {
        ...defaultSimulationConfig.behavior,
        circadianMode: "nocturnal" as const
      },
      biology: {
        ...defaultSimulationConfig.biology,
        circadianPhaseOffsetHours: { min: 0, mode: 0, max: 0 },
        dailyActivityMinutes: { min: 360, mode: 360, max: 360 },
        majorSleepPeriodHours: { min: 10, mode: 10, max: 10 }
      }
    };
    const timeline = [createInitialSimulation(config)];
    for (let step = 0; step < config.simulationLengthSeconds / config.timeStepSeconds; step += 1) {
      timeline.push(stepSimulation(timeline.at(-1)!));
    }
    const points = buildTimeSeries(timeline).filter((point) => point.time > 0);
    const darkPoints = points.filter((point) => !point.lightPhase);
    const lightPoints = points.filter((point) => point.lightPhase);
    const darkAverage = average(darkPoints.map((point) => point.movementFraction));
    const lightAverage = average(lightPoints.map((point) => point.movementFraction));

    expect(darkAverage).toBeGreaterThan(lightAverage * 2);
  });
});

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function stateLog(animalId: string, time: number, behavioralState: "sleeping" | "awake_stationary" | "moving") {
  return {
    time,
    animalId,
    x: 0,
    y: 0,
    behavioralState,
    trueSpeed: behavioralState === "moving" ? 1 : 0,
    motionDetected: behavioralState === "moving",
    sleeping: behavioralState === "sleeping"
  };
}
