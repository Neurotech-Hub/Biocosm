import { computeMetricsFromLogs } from "./analysis";
import { defaultSimulationConfig } from "./config";
import { runSimulation, stepSimulation } from "./engine";
import { computeTrueContacts, simulateBleDetections } from "./radio";
import { SeededRandom } from "./random";
import type { SimulationConfig } from "./types";
import { createInitialSimulation } from "./world";

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
      fixedPolicy: {
        ...defaultSimulationConfig.fixedPolicy,
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
    const contacts = computeTrueContacts(colocated, config.radio, 60);
    const rng = new SeededRandom("radio");

    expect(simulateBleDetections(colocated, contacts, config.radio, "fixed-rate", 60, rng)).toHaveLength(0);

    const active = colocated.map((animal) => ({
      ...animal,
      collar: {
        ...animal.collar,
        scanActive: true,
        advActive: true
      }
    }));

    expect(simulateBleDetections(active, contacts, config.radio, "fixed-rate", 60, new SeededRandom("radio"))).toHaveLength(2);
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
      scanWindows: [
        {
          startTime: 60,
          endTime: 90,
          observerId: "animal-1",
          scanPolicyId: "fixed-rate",
          detectedPeerIds: ["animal-2"],
          detectedAnyPeer: true
        }
      ]
    });

    expect(metrics.trueContactSteps).toBe(1);
    expect(metrics.observedDetections).toBe(1);
    expect(metrics.uniqueObservedDyads).toBe(1);
    expect(metrics.recallEstimate).toBe(1);
  });
});

function testConfig(overrides: Partial<SimulationConfig>): SimulationConfig {
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
    radio: {
      ...defaultSimulationConfig.radio,
      ...overrides.radio
    },
    fixedPolicy: {
      ...defaultSimulationConfig.fixedPolicy,
      ...overrides.fixedPolicy
    }
  };
}
