import { defaultSimulationConfig } from "./config";
import { runSimulation, stepSimulation } from "./engine";
import { buildTimeSeries, isLightPhase } from "./timeSeries";
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

  it("shows higher movement during the dark phase for nocturnal animals", () => {
    const config = {
      ...defaultSimulationConfig,
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
