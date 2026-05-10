import type { SimulationLogs, SimulationState } from "./types";

export type TimeSeriesPoint = {
  time: number;
  absoluteTime: number;
  movementFraction: number;
  lightPhase: boolean;
};

export type AnimalStripEventKind = "social" | "sleep" | "awake" | "move";

/** One filled dot on the per-animal strip chart (no strokes). */
export type AnimalStripEvent = {
  time: number;
  animalId: string;
  kind: AnimalStripEventKind;
};

export function sortAnimalIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const na = Number.parseInt(a.replace(/^animal-/, ""), 10);
    const nb = Number.parseInt(b.replace(/^animal-/, ""), 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      return na - nb;
    }
    return a.localeCompare(b);
  });
}

export function sortedAnimalIdsFromLogs(logs: SimulationLogs): string[] {
  return sortAnimalIds([...new Set(logs.animalStates.map((row) => row.animalId))]);
}

/** Dots per timestep: social = true dyad inside social radius; sleep / awake / move from animal state logs. */
export function buildAnimalStripEvents(logs: SimulationLogs): AnimalStripEvent[] {
  const events: AnimalStripEvent[] = [];

  for (const row of logs.animalStates) {
    if (row.sleeping) {
      events.push({ time: row.time, animalId: row.animalId, kind: "sleep" });
    } else if (row.behavioralState === "awake_stationary") {
      events.push({ time: row.time, animalId: row.animalId, kind: "awake" });
    } else if (row.behavioralState === "moving") {
      events.push({ time: row.time, animalId: row.animalId, kind: "move" });
    }
  }

  for (const dyad of logs.trueDyads) {
    if (!dyad.withinSocialRadius || !dyad.bothCollarsValid) {
      continue;
    }
    events.push({ time: dyad.time, animalId: dyad.animalA, kind: "social" });
    events.push({ time: dyad.time, animalId: dyad.animalB, kind: "social" });
  }

  return events;
}

/**
 * Limits dots per animal on the movement strip chart by evenly subsampling in time order
 * (first and last samples preserved when maxDotsPerAnimal >= 2).
 */
export function decimateMovementStripEvents(events: AnimalStripEvent[], maxDotsPerAnimal: number): AnimalStripEvent[] {
  if (maxDotsPerAnimal < 1 || events.length === 0) {
    return [];
  }

  const byAnimal = new Map<string, AnimalStripEvent[]>();
  for (const event of events) {
    const list = byAnimal.get(event.animalId);
    if (list) {
      list.push(event);
    } else {
      byAnimal.set(event.animalId, [event]);
    }
  }

  const out: AnimalStripEvent[] = [];
  const ids = [...byAnimal.keys()].sort((a, b) => a.localeCompare(b));

  for (const id of ids) {
    const arr = byAnimal.get(id)!;
    arr.sort((a, b) => a.time - b.time);
    const n = arr.length;
    if (n <= maxDotsPerAnimal) {
      out.push(...arr);
      continue;
    }
    if (maxDotsPerAnimal === 1) {
      out.push(arr[Math.floor((n - 1) / 2)]);
      continue;
    }

    const denom = maxDotsPerAnimal - 1;
    for (let i = 0; i < maxDotsPerAnimal; i++) {
      const idx = Math.floor((i * (n - 1)) / denom);
      out.push(arr[idx]);
    }
  }

  return out;
}

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
