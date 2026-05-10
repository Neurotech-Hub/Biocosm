import { computeMetrics, computeMetricsFromLogs } from "./analysis";
import { defaultAdaptivePolicy, defaultSimulationConfig } from "./config";
import { computeEnergyLog, estimateLipoVoltage } from "./energy";
import { runSimulation, stepSimulation } from "./engine";
import { computeMotionObservations } from "./motionSensor";
import { applyMotionPeerAdaptivePolicy, logInterpolate } from "./policies/adaptive";
import { createBleBurstEvents, simulateBleDetections } from "./radio";
import { SeededRandom } from "./random";
import type { AnimalStateLog, SimulationConfig } from "./types";
import { chooseBehaviorState, createInitialSimulation } from "./world";

describe("simulation engine", () => {
  it("is deterministic from seed through movement, logs, and detections", () => {
    const config = testConfig({ seed: "same-seed", animalCount: 8 });
    const left = runSimulation(createInitialSimulation(config), 12);
    const right = runSimulation(createInitialSimulation(config), 12);

    expect(left.pathGraph).toEqual(right.pathGraph);
    expect(left.animals).toEqual(right.animals);
    expect(left.logs.trueDyads).toEqual(right.logs.trueDyads);
    expect(left.logs.detections).toEqual(right.logs.detections);
  });

  it("keeps animals inside the rectangular enclosure", () => {
    const config = testConfig({ seed: "bounds", animalCount: 12 });
    const state = runSimulation(createInitialSimulation(config), 40);

    for (const animal of state.animals) {
      expect(animal.position.x).toBeGreaterThanOrEqual(0);
      expect(animal.position.x).toBeLessThanOrEqual(config.enclosure.width);
      expect(animal.position.y).toBeGreaterThanOrEqual(0);
      expect(animal.position.y).toBeLessThanOrEqual(config.enclosure.height);
    }
  });

  it("logs fixed-rate scan windows even when no peers are detected", () => {
    const config = testConfig({
      animalCount: 5,
      radio: {
        ...defaultSimulationConfig.radio,
        detectionRadiusMeters: 0.01
      },
      activePolicy: {
        id: "fixed-rate",
        type: "fixed",
        name: "Fixed-rate BLE",
        scanIntervalSeconds: 60,
        scanWindowSeconds: 60,
        advIntervalSeconds: 60
      }
    });
    const state = stepSimulation(createInitialSimulation(config));

    expect(state.logs.scanWindows).toHaveLength(config.animalCount);
    expect(state.logs.scanWindows.every((window) => !window.detectedAnyPeer)).toBe(true);
  });

  it("requires scan and advertising state before radio detections can occur", () => {
    const config = testConfig({
      animalCount: 2,
      radio: {
        ...defaultSimulationConfig.radio,
        detectionRadiusMeters: 5,
        rssiThreshold: -200,
        rssiNoiseSd: 0
      }
    });
    const base = createInitialSimulation(config);
    const colocated = base.animals.map((animal) => ({
      ...animal,
      position: {
        ...animal.position,
        x: 1,
        y: 1
      }
    }));
    const rng = new SeededRandom("radio");

    expect(simulateBleDetections(colocated, colocated, config.radio, "fixed-rate", 0, 60, rng, [])).toHaveLength(0);

    const active = colocated.map((animal) => ({
      ...animal,
      collar: {
        ...animal.collar,
        scanActive: true,
        advActive: true
      }
    }));

    expect(
      simulateBleDetections(
        active,
        active,
        config.radio,
        "fixed-rate",
        0,
        60,
        new SeededRandom("radio"),
        [
          { kind: "scan", startTime: 0, endTime: 1.5, animalId: "animal-1", policyId: "fixed-rate" },
          { kind: "advertise", startTime: 0, endTime: 2, animalId: "animal-2", policyId: "fixed-rate" },
          { kind: "scan", startTime: 0, endTime: 1.5, animalId: "animal-2", policyId: "fixed-rate" },
          { kind: "advertise", startTime: 0, endTime: 2, animalId: "animal-1", policyId: "fixed-rate" }
        ]
      )
    ).toHaveLength(2);
  });

  it("uses serial scan priority when scan and advertise are both due", () => {
    const animal = createInitialSimulation(
      testConfig({
        animalCount: 1,
        activePolicy: {
          id: "fixed-rate",
          type: "fixed",
          name: "Fixed-rate BLE",
          scanIntervalSeconds: 60,
          scanWindowSeconds: 60,
          advIntervalSeconds: 60
        }
      })
    ).animals[0];
    const dueAnimal = {
      ...animal,
      collar: {
        ...animal.collar,
        lastScanTime: 0,
        lastAdvTime: 0
      }
    };
    const bursts = createBleBurstEvents([dueAnimal], "fixed-rate", 60, 120, defaultSimulationConfig.bleScheduling);

    expect(bursts[0].kind).toBe("scan");
    expect(bursts.every((burst, index) => index === 0 || burst.startTime >= bursts[index - 1].endTime)).toBe(true);
  });

  it("misses detections when scan and advertising bursts do not overlap", () => {
    const config = testConfig({
      animalCount: 2,
      radio: {
        ...defaultSimulationConfig.radio,
        detectionRadiusMeters: 5,
        rssiThreshold: -200,
        rssiNoiseSd: 0
      }
    });
    const animals = createInitialSimulation(config).animals;

    const detections = simulateBleDetections(animals, animals, config.radio, "fixed-rate", 0, 60, new SeededRandom("radio"), [
      { kind: "scan", startTime: 0, endTime: 1.5, animalId: "animal-1", policyId: "fixed-rate" },
      { kind: "advertise", startTime: 5, endTime: 7, animalId: "animal-2", policyId: "fixed-rate" }
    ]);

    expect(detections).toHaveLength(0);
  });

  it("computes basic true-vs-observed metrics from logs", () => {
    const metrics = computeMetricsFromLogs({
      animalStates: [],
      collarStates: [],
      trueDyads: [
        {
          time: 60,
          animalA: "animal-1",
          animalB: "animal-2",
          distance: 0.4,
          withinDetectionRadius: true,
          withinSocialRadius: true,
          bothCollarsValid: true
        }
      ],
      detections: [
        {
          time: 60,
          observerId: "animal-1",
          peerId: "animal-2",
          trueDistance: 0.4,
          rssi: -50,
          scanPolicyId: "fixed-rate"
        }
      ],
      bleBursts: [],
      scanWindows: [
        {
          startTime: 60,
          endTime: 90,
          observerId: "animal-1",
          scanPolicyId: "fixed-rate",
          detectedPeerIds: ["animal-2"],
          detectedAnyPeer: true
        }
      ],
      energy: []
    });

    expect(metrics.trueContactSteps).toBe(1);
    expect(metrics.observedDetections).toBe(1);
    expect(metrics.uniqueObservedDyads).toBe(1);
    expect(metrics.recallEstimate).toBe(1);
  });

  it("computes scan and advertising summaries from build-level logs", () => {
    const state = createInitialSimulation(testConfig({ animalCount: 2 }));
    const metrics = computeMetrics(state, {
      ...state.logs,
      bleBursts: [
        { kind: "scan", startTime: 0, endTime: 1.5, animalId: "animal-1", policyId: "fixed-rate" },
        { kind: "advertise", startTime: 0, endTime: 2, animalId: "animal-2", policyId: "fixed-rate" }
      ]
    });

    expect(metrics.scanningAnimals).toBe(1);
    expect(metrics.advertisingAnimals).toBe(1);
  });

  it("creates deterministic motion sensor observations from seed-controlled noise", () => {
    const config = testConfig({
      motionSensor: {
        thresholdMetersPerStep: 0.05,
        noiseSdMeters: 0.01,
        falsePositiveRate: 0,
        falseNegativeRate: 0
      }
    });
    const previous = createInitialSimulation(config).animals;
    const moved = previous.map((animal, index) => ({
      ...animal,
      position: {
        ...animal.position,
        x: animal.position.x + (index === 0 ? 0.2 : 0)
      }
    }));

    expect(computeMotionObservations(60, previous, moved, config.motionSensor, new SeededRandom("motion"))).toEqual(
      computeMotionObservations(60, previous, moved, config.motionSensor, new SeededRandom("motion"))
    );
  });

  it("generates deterministic configurable animal traits", () => {
    const config = testConfig({
      seed: "biology",
      animalCount: 4,
      advancedSpeciesOverrides: {
        dailyMotionMinutes: { min: 240, mode: 300, max: 360 },
        socialPropensity: { min: 0.2, mode: 0.3, max: 0.4 }
      }
    });
    const left = createInitialSimulation(config).animals.map((animal) => animal.traits);
    const right = createInitialSimulation(config).animals.map((animal) => animal.traits);

    expect(left).toEqual(right);
    for (const traits of left) {
      expect(traits.dailyMotionMinutes).toBeGreaterThanOrEqual(240);
      expect(traits.dailyMotionMinutes).toBeLessThanOrEqual(360);
      expect(traits.socialPropensity).toBeGreaterThanOrEqual(0.2);
      expect(traits.socialPropensity).toBeLessThanOrEqual(0.4);
      expect("resourceAttraction" in traits).toBe(false);
      expect("speedMetersPerMinute" in traits).toBe(false);
    }
  });

  it("biases nocturnal movement toward the dark phase", () => {
    const config = testConfig({
      seed: "circadian",
      animalCount: 1,
      speciesPresetId: "lab_mouse",
      advancedSpeciesOverrides: {
        circadianPhaseOffsetHours: { min: 0, mode: 0, max: 0 },
        dailyMotionMinutes: { min: 360, mode: 360, max: 360 },
        majorRestWindowHours: { min: 10, mode: 10, max: 10 }
      }
    });
    const animal = createInitialSimulation(config).animals[0];
    const nightMoving = Array.from({ length: 200 }, (_, index) =>
      chooseBehaviorState(24 * 3600 + index * 60, animal, config.behavior, new SeededRandom(`night-${index}`))
    ).filter((state) => state === "moving").length;
    const dayMoving = Array.from({ length: 200 }, (_, index) =>
      chooseBehaviorState(12 * 3600 + index * 60, animal, config.behavior, new SeededRandom(`day-${index}`))
    ).filter((state) => state === "moving").length;

    expect(nightMoving).toBeGreaterThan(dayMoving * 3);
  });

  it("initializes nocturnal animals from the start-time circadian state", () => {
    const config = testConfig({
      seed: "initial-circadian",
      startTimeSeconds: 12 * 3600,
      animalCount: 24,
      speciesPresetId: "lab_mouse",
      advancedSpeciesOverrides: {
        circadianPhaseOffsetHours: { min: 0, mode: 0, max: 0 },
        dailyMotionMinutes: { min: 360, mode: 360, max: 360 },
        majorRestWindowHours: { min: 10, mode: 10, max: 10 }
      }
    });
    const initial = createInitialSimulation(config);
    const movingFraction = initial.animals.filter((animal) => animal.state === "moving").length / config.animalCount;

    expect(movingFraction).toBeLessThan(0.1);
  });

  it("pins prairie vole dailyMotionMinutes to ~7h/day in moving state (locomotion budget)", () => {
    const config = testConfig({
      seed: "prairie-motion-target",
      speciesPresetId: "prairie_vole",
      animalCount: 1,
      startTimeSeconds: 0,
      advancedSpeciesOverrides: {
        dailyMotionMinutes: { min: 420, mode: 420, max: 420 },
        circadianPhaseOffsetHours: { min: 0, mode: 0, max: 0 }
      }
    });
    let state = createInitialSimulation(config);
    let movingSteps = 0;
    const steps = (24 * 3600) / config.timeStepSeconds;
    for (let i = 0; i < steps; i++) {
      state = stepSimulation(state);
      if (state.animals[0].state === "moving") {
        movingSteps++;
      }
    }
    expect(movingSteps).toBeGreaterThanOrEqual(380);
    expect(movingSteps).toBeLessThanOrEqual(520);
  });

  it("keeps human seed 42 from producing all-sleep animal rows", () => {
    const config = testConfig({
      seed: "42",
      speciesPresetId: "human",
      animalCount: 6,
      startTimeSeconds: 0
    });
    let state = createInitialSimulation(config);
    const movingStepsByAnimal = new Map(state.animals.map((animal) => [animal.id, 0]));
    const awakeStepsByAnimal = new Map(state.animals.map((animal) => [animal.id, 0]));
    const steps = (24 * 3600) / config.timeStepSeconds;

    for (let i = 0; i < steps; i++) {
      state = stepSimulation(state);
      for (const animal of state.animals) {
        if (animal.state === "moving") {
          movingStepsByAnimal.set(animal.id, (movingStepsByAnimal.get(animal.id) ?? 0) + 1);
        } else if (animal.state === "awake_stationary") {
          awakeStepsByAnimal.set(animal.id, (awakeStepsByAnimal.get(animal.id) ?? 0) + 1);
        }
      }
    }

    expect([...movingStepsByAnimal.values()].every((movingSteps) => movingSteps > 0)).toBe(true);
    expect([...awakeStepsByAnimal.values()].filter((awakeSteps) => awakeSteps > 0).length).toBeGreaterThanOrEqual(3);
  });

  it("centers human group movement near the 14:00 active peak", () => {
    const config = testConfig({
      seed: "42",
      speciesPresetId: "human",
      animalCount: 6,
      startTimeSeconds: 0
    });
    const state = runSimulation(createInitialSimulation(config), (24 * 3600) / config.timeStepSeconds);
    const centerHour = weightedMovementCenterHour(state.logs.animalStates, config.startTimeSeconds);

    expect(centerHour).toBeGreaterThanOrEqual(12);
    expect(centerHour).toBeLessThanOrEqual(16);
  });

  it("computes BLE capture rate from in-range dyad intervals", () => {
    const state = stepSimulation(
      createInitialSimulation(
        testConfig({
          animalCount: 2,
          radio: {
            ...defaultSimulationConfig.radio,
            detectionRadiusMeters: 100,
            rssiThreshold: -200,
            rssiNoiseSd: 0
          },
          activePolicy: {
            id: "fixed-rate",
            type: "fixed",
            name: "Fixed-rate BLE",
            scanIntervalSeconds: 60,
            scanWindowSeconds: 60,
            advIntervalSeconds: 60
          }
        })
      )
    );
    const metrics = computeMetrics(state);

    expect(metrics.bleCaptureOpportunities).toBeGreaterThan(0);
    expect(metrics.bleCaptureRate).toBeGreaterThanOrEqual(0);
  });

  it("computes deterministic energy use and LiPo voltage", () => {
    const energy = computeEnergyLog(
      60,
      60,
      [
        { kind: "scan", startTime: 0, endTime: 1.5, animalId: "animal-1", policyId: "fixed-rate" },
        { kind: "advertise", startTime: 2, endTime: 4, animalId: "animal-1", policyId: "fixed-rate" }
      ],
      defaultSimulationConfig.energy
    );

    expect(energy.totalMah).toBeGreaterThan(energy.steadyMah);
    expect(energy.remainingMah).toBeLessThan(defaultSimulationConfig.energy.batteryCapacityMah);
    expect(estimateLipoVoltage(1)).toBeGreaterThan(estimateLipoVoltage(0.2));
  });

  it("maps adaptive drive toward shorter scan intervals", () => {
    expect(logInterpolate(300, 10, 0)).toBeCloseTo(300);
    expect(logInterpolate(300, 10, 1)).toBeCloseTo(10);
    expect(logInterpolate(300, 10, 0.5)).toBeLessThan(300);
  });

  it("increases adaptive motion and peer drive from observations and recent detections", () => {
    const config = testConfig({ activePolicy: { ...defaultAdaptivePolicy } });
    const animal = createInitialSimulation(config).animals[0];
    const updated = applyMotionPeerAdaptivePolicy(
      animal,
      defaultAdaptivePolicy,
      {
        time: 60,
        animalId: animal.id,
        motionDetected: true,
        motionMagnitude: 0.2,
        collarValid: true
      },
      [
        {
          time: 0,
          observerId: animal.id,
          peerId: "animal-2",
          trueDistance: 0.5,
          rssi: -60,
          scanPolicyId: "fixed-rate"
        }
      ],
      60,
      60
    );

    expect(updated.collar.motionDrive).toBeGreaterThan(0);
    expect(updated.collar.peerDrive).toBeGreaterThan(0);
    expect(updated.collar.scanIntervalSeconds).toBeLessThan(defaultAdaptivePolicy.scanIntervalMaxSeconds);
  });

  it("changes distance-dependent contacts when physical scale changes", () => {
    const small = runSimulation(createInitialSimulation(testConfig({ seed: "scale", enclosure: { width: 6, height: 4 } })), 5);
    const large = runSimulation(createInitialSimulation(testConfig({ seed: "scale", enclosure: { width: 24, height: 14 } })), 5);
    const smallContacts = small.logs.trueDyads.filter((dyad) => dyad.withinDetectionRadius).length;
    const largeContacts = large.logs.trueDyads.filter((dyad) => dyad.withinDetectionRadius).length;

    expect(smallContacts).toBeGreaterThan(largeContacts);
  });
});

type TestConfigOverrides = Omit<
  Partial<SimulationConfig>,
  "enclosure" | "behavior" | "biology" | "motionSensor" | "radio" | "energy" | "bleScheduling" | "activePolicy" | "speciesModifiers"
> & {
  enclosure?: Partial<SimulationConfig["enclosure"]>;
  behavior?: Partial<SimulationConfig["behavior"]>;
  biology?: Partial<SimulationConfig["biology"]>;
  motionSensor?: Partial<SimulationConfig["motionSensor"]>;
  radio?: Partial<SimulationConfig["radio"]>;
  energy?: Partial<SimulationConfig["energy"]>;
  bleScheduling?: Partial<SimulationConfig["bleScheduling"]>;
  speciesModifiers?: Partial<SimulationConfig["speciesModifiers"]>;
  activePolicy?: SimulationConfig["activePolicy"];
};

function testConfig(overrides: TestConfigOverrides): SimulationConfig {
  return {
    ...defaultSimulationConfig,
    ...overrides,
    enclosure: {
      ...defaultSimulationConfig.enclosure,
      ...overrides.enclosure
    },
    behavior: {
      ...defaultSimulationConfig.behavior,
      ...overrides.behavior
    },
    biology: {
      ...defaultSimulationConfig.biology,
      ...overrides.biology
    },
    speciesModifiers: {
      ...defaultSimulationConfig.speciesModifiers,
      ...overrides.speciesModifiers
    },
    motionSensor: {
      ...defaultSimulationConfig.motionSensor,
      ...overrides.motionSensor
    },
    radio: {
      ...defaultSimulationConfig.radio,
      ...overrides.radio
    },
    energy: {
      ...defaultSimulationConfig.energy,
      ...overrides.energy
    },
    bleScheduling: {
      ...defaultSimulationConfig.bleScheduling,
      ...overrides.bleScheduling
    },
    activePolicy: overrides.activePolicy ?? defaultSimulationConfig.activePolicy
  };
}

function weightedMovementCenterHour(rows: AnimalStateLog[], startTimeSeconds: number): number {
  let weightedHours = 0;
  let movingRows = 0;
  for (const row of rows) {
    if (row.behavioralState !== "moving") {
      continue;
    }
    weightedHours += (((startTimeSeconds + row.time) / 3600) % 24 + 24) % 24;
    movingRows += 1;
  }
  return movingRows > 0 ? weightedHours / movingRows : 0;
}
