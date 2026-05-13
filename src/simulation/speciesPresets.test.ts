import { defaultSimulationConfig } from "./config";
import { runSimulation } from "./engine";
import { defaultSpeciesModifiers, resolveSpeciesPreset } from "./speciesModifiers";
import { SPECIES_PRESETS } from "./speciesPresets";
import { buildTimeSeries } from "./timeSeries";
import type { FixedPolicyConfig, SimulationConfig } from "./types";
import { createInitialSimulation } from "./world";

/** Coarse BLE for long-run tests (full sim defaults to JUXTA-high-rate and would OOM when retaining timeline). */
const speciesTestBlePolicy: FixedPolicyConfig = {
  id: "species-test-fixed-ble",
  type: "fixed",
  name: "Species test (coarse BLE)",
  scanIntervalSeconds: 60,
  scanWindowSeconds: 3,
  advIntervalSeconds: 30,
  advertisingBurstDurationSeconds: 0.5
};

describe("species circadian presets", () => {
  it("includes biology-agent species rows plus the human comparison preset", () => {
    expect(Object.keys(SPECIES_PRESETS)).toEqual(
      expect.arrayContaining([
        "lab_mouse",
        "wild_house_mouse",
        "lab_rat",
        "deer_mouse",
        "white_footed_mouse",
        "prairie_vole",
        "meadow_vole",
        "bank_vole",
        "red_squirrel",
        "fox_squirrel",
        "eastern_gray_squirrel",
        "ground_squirrel",
        "human"
      ])
    );
    expect(SPECIES_PRESETS.human.confidence).toBe("high");
    expect(SPECIES_PRESETS.human.sleepArchitecture).toBe("monophasic");
    expect(SPECIES_PRESETS.human.groupSynchrony?.mode).toBeCloseTo(0.8);
  });

  it("samples deterministic species traits from preset config", () => {
    const config = testConfig({ seed: "species-determinism", speciesPresetId: "prairie_vole" });
    const left = createInitialSimulation(config).animals.map((animal) => animal.traits);
    const right = createInitialSimulation(config).animals.map((animal) => animal.traits);

    expect(left).toEqual(right);
    expect(left[0].speciesPresetId).toBe("prairie_vole");
    expect(left[0].activityPattern).toBe("crepuscular");
  });

  it("moves nocturnal presets more during dark phase", () => {
    const profile = movementProfile(testConfig({ speciesPresetId: "lab_mouse", seed: "lab-mouse-profile" }));

    expect(profile.darkAverage).toBeGreaterThan(profile.lightAverage * 1.5);
  });

  it("moves diurnal squirrel and human presets more during light phase", () => {
    const squirrel = movementProfile(testConfig({ speciesPresetId: "fox_squirrel", seed: "fox-profile" }));
    const human = movementProfile(testConfig({ speciesPresetId: "human", seed: "human-profile" }));

    expect(squirrel.lightAverage).toBeGreaterThan(squirrel.nightAverage * 2);
    expect(human.lightAverage).toBeGreaterThan(human.darkAverage * 2);
  });

  it("keeps vole presets active across light and dark phases through ultradian drive", () => {
    const profile = movementProfile(testConfig({ speciesPresetId: "meadow_vole", seed: "vole-profile" }));

    expect(profile.lightAverage).toBeGreaterThan(0.05);
    expect(profile.darkAverage).toBeGreaterThan(0.05);
  });

  it("applies global modifiers before trait sampling", () => {
    const base = resolveSpeciesPreset("human", defaultSpeciesModifiers);
    const modified = resolveSpeciesPreset("human", {
      ...defaultSpeciesModifiers,
      activityLevelMultiplier: 1.5,
      socialityMultiplier: 0.5,
      territorialityMultiplier: 2
    });

    expect(modified.dailyMotionMinutes.mode).toBeCloseTo(base.dailyMotionMinutes.mode * 1.5);
    expect(modified.socialPropensity.mode).toBeCloseTo(base.socialPropensity.mode * 0.5);
    expect(modified.territoriality.mode).toBeGreaterThan(base.territoriality.mode);
  });
});

function movementProfile(config: SimulationConfig): { lightAverage: number; darkAverage: number; nightAverage: number } {
  const timeline = [createInitialSimulation(config)];
  const totalSteps = config.simulationLengthSeconds / config.timeStepSeconds;
  for (let step = 0; step < totalSteps; step += 1) {
    timeline.push(runSimulation(timeline.at(-1)!, 1));
  }
  const points = buildTimeSeries(timeline).filter((point) => point.time > 0);
  const lightAverage = average(points.filter((point) => point.lightPhase).map((point) => point.movementFraction));
  const darkAverage = average(points.filter((point) => !point.lightPhase).map((point) => point.movementFraction));
  const nightAverage = average(
    points
      .filter((point) => {
        const hour = ((point.absoluteTime / 3600) % 24 + 24) % 24;
        return hour < 6;
      })
      .map((point) => point.movementFraction)
  );
  return { lightAverage, darkAverage, nightAverage };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function testConfig(overrides: Partial<SimulationConfig>): SimulationConfig {
  return {
    ...defaultSimulationConfig,
    ...overrides,
    startTimeSeconds: overrides.startTimeSeconds ?? 0,
    simulationLengthSeconds: overrides.simulationLengthSeconds ?? 24 * 3600,
    animalCount: overrides.animalCount ?? 16,
    speciesModifiers: {
      ...defaultSimulationConfig.speciesModifiers,
      ...overrides.speciesModifiers
    },
    activePolicy: overrides.activePolicy ?? speciesTestBlePolicy
  };
}

