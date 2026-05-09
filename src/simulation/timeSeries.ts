import type { SimulationState } from "./types";

export type TimeSeriesPoint = {
  time: number;
  absoluteTime: number;
  movementFraction: number;
  lightPhase: boolean;
};

export function buildTimeSeries(timeline: SimulationState[]): TimeSeriesPoint[] {
  return timeline.map((state) => {
    const rowsAtTime = state.logs.animalStates.filter((row) => row.time === state.time);
    const animalCount = Math.max(1, state.animals.length);
    const movingAnimals = rowsAtTime.filter((row) => row.behavioralState === "moving").length;
    return {
      time: state.time,
      absoluteTime: state.config.startTimeSeconds + state.time,
      movementFraction: movingAnimals / animalCount,
      lightPhase: isLightPhase(state.config.startTimeSeconds + state.time)
    };
  });
}

export function isLightPhase(absoluteTimeSeconds: number): boolean {
  const hour = (((absoluteTimeSeconds / 3600) % 24) + 24) % 24;
  return hour >= 6 && hour < 18;
}
