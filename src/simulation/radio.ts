import { FIXED_SCAN_BURST_SECONDS } from "./bleTimingAssumptions";
import { animalDistance, interpolatedAnimalDistance } from "./geometry";
import { SeededRandom } from "./random";
import type {
  AdvertisingEvent,
  Animal,
  BleBurstEvent,
  BleSchedulingConfig,
  DetectionEvent,
  RadioConfig,
  ScanWindowEvent,
  TrueContact
} from "./types";

/** Legacy alias for production scan burst wall time (nRF52 `SCAN_BURST_MS`). */
export const scanBurstDurationSeconds = FIXED_SCAN_BURST_SECONDS;
export const interBurstDelaySeconds = 0.1;
export const SCAN_LISTEN_INTERVAL_SECONDS = 0.05;
export const SCAN_LISTEN_WINDOW_SECONDS = 0.0125;
/** Default spacing of synthetic advertising events; keep aligned with `EnergyConfig.advertisingEventIntervalSeconds`. */
export const DEFAULT_ADVERTISING_EVENT_INTERVAL_SECONDS = 0.15;

export function computeTrueContacts(animals: Animal[], radio: RadioConfig, time: number): TrueContact[] {
  const contacts: TrueContact[] = [];
  for (let left = 0; left < animals.length; left += 1) {
    for (let right = left + 1; right < animals.length; right += 1) {
      const distanceM = animalDistance(animals[left], animals[right]);
      contacts.push({
        time,
        animalA: animals[left].id,
        animalB: animals[right].id,
        distance: distanceM,
        withinDetectionRadius: distanceM <= radio.detectionRadiusMeters,
        withinSocialRadius: distanceM <= radio.socialRadiusMeters
      });
    }
  }
  return contacts;
}

export function simulateBleDetections(
  animalsStart: Animal[],
  animalsEnd: Animal[],
  radio: RadioConfig,
  policyId: string,
  epochStart: number,
  epochEnd: number,
  rng: SeededRandom,
  bleBursts?: BleBurstEvent[],
  advertisingEventIntervalSeconds: number = DEFAULT_ADVERTISING_EVENT_INTERVAL_SECONDS
): DetectionEvent[] {
  const startById = new Map(animalsStart.map((animal) => [animal.id, animal]));
  const bursts =
    bleBursts ?? createBleBurstEvents(animalsEnd, policyId, epochStart, epochEnd, defaultSchedulingFallback());
  const windows = createScanListenWindows(bursts);
  const ads = createAdvertisingEventsFromBursts(bursts, advertisingEventIntervalSeconds);
  const windowsByObserver = groupScanWindowsByObserver(windows);
  const adsByAnimal = groupAdvertisingEventsByAnimal(ads);
  const events: DetectionEvent[] = [];

  for (let left = 0; left < animalsEnd.length; left += 1) {
    for (let right = left + 1; right < animalsEnd.length; right += 1) {
      const aEnd = animalsEnd[left];
      const bEnd = animalsEnd[right];
      const aStart = startById.get(aEnd.id);
      const bStart = startById.get(bEnd.id);
      if (!aStart || !bStart || !aEnd.collar.valid || !bEnd.collar.valid) {
        continue;
      }

      maybeDetectPair(
        aStart,
        aEnd,
        bStart,
        bEnd,
        epochStart,
        epochEnd,
        radio,
        policyId,
        rng,
        windowsByObserver,
        adsByAnimal,
        events
      );
      maybeDetectPair(
        bStart,
        bEnd,
        aStart,
        aEnd,
        epochStart,
        epochEnd,
        radio,
        policyId,
        rng,
        windowsByObserver,
        adsByAnimal,
        events
      );
    }
  }

  return events;
}

function defaultSchedulingFallback(): BleSchedulingConfig {
  return {
    interBurstDelaySeconds: 0.1,
    randomPostIdleJitterMinSeconds: 0,
    randomPostIdleJitterMaxSeconds: 1.0,
    minuteWriteSafeZoneSeconds: 3,
    scanPreStartRadioStabilizationSeconds: 0.2
  };
}

export function createBleBurstEvents(
  animals: Animal[],
  policyId: string,
  epochStart: number,
  epochEnd: number,
  scheduling: BleSchedulingConfig
): BleBurstEvent[] {
  return animals.flatMap((animal) => {
    if (!animal.collar.valid) {
      return [];
    }

    const bursts: BleBurstEvent[] = [];
    let cursor = epochStart;
    let nextScanDue = animal.collar.lastScanTime + animal.collar.scanIntervalSeconds;
    let nextAdvDue = animal.collar.lastAdvTime + animal.collar.advIntervalSeconds;
    let guard = 0;
    let lastBurstKind: BleBurstEvent["kind"] | null = null;

    while (cursor < epochEnd && guard < 1000) {
      guard += 1;
      const scanDueAt = Math.max(cursor, nextScanDue);
      const advDueAt = Math.max(cursor, nextAdvDue);
      // nRF52 production: serial radio; when scan and advertise are both due, scan wins (ties → scan).
      const kind: BleBurstEvent["kind"] = scanDueAt <= advDueAt ? "scan" : "advertise";
      const dueAt = kind === "scan" ? scanDueAt : advDueAt;

      if (dueAt >= epochEnd) {
        break;
      }

      const jitteredStart = avoidMinuteSafeZone(
        clampToEpoch(dueAt + deterministicJitter(animal.id, dueAt, kind), epochStart, epochEnd),
        epochEnd,
        scheduling.minuteWriteSafeZoneSeconds
      );
      const burstAdvSeconds = animal.collar.advertisingBurstDurationSeconds;
      const duration = kind === "scan" ? animal.collar.scanWindowSeconds : burstAdvSeconds;
      let startTime = Math.max(cursor, jitteredStart);
      if (kind === "scan" && lastBurstKind === "advertise") {
        startTime += scheduling.scanPreStartRadioStabilizationSeconds;
      }
      startTime = clampToEpoch(startTime, epochStart, epochEnd);
      const endTime = Math.min(epochEnd, startTime + duration);

      if (endTime <= startTime) {
        if (kind === "scan") {
          nextScanDue = endTime + animal.collar.scanIntervalSeconds;
        } else {
          nextAdvDue = endTime + animal.collar.advIntervalSeconds;
        }
        lastBurstKind = kind;
        cursor =
          endTime +
          scheduling.interBurstDelaySeconds +
          deterministicPostIdleJitter(
            animal.id,
            endTime,
            kind,
            scheduling.randomPostIdleJitterMinSeconds,
            scheduling.randomPostIdleJitterMaxSeconds
          );
        continue;
      }

      bursts.push({
        kind,
        startTime,
        endTime,
        animalId: animal.id,
        policyId
      });

      if (kind === "scan") {
        nextScanDue = endTime + animal.collar.scanIntervalSeconds;
      } else {
        nextAdvDue = endTime + animal.collar.advIntervalSeconds;
      }
      lastBurstKind = kind;
      cursor =
        endTime +
        scheduling.interBurstDelaySeconds +
        deterministicPostIdleJitter(
          animal.id,
          endTime,
          kind,
          scheduling.randomPostIdleJitterMinSeconds,
          scheduling.randomPostIdleJitterMaxSeconds
        );
    }

    return bursts;
  });
}

export function createScanWindowEvents(
  animals: Animal[],
  policyId: string,
  epochStart: number,
  epochEnd: number,
  radioStepSeconds = 1,
  scheduling?: BleSchedulingConfig
): ScanWindowEvent[] {
  void radioStepSeconds;
  const sched = scheduling ?? defaultSchedulingFallback();
  return createScanWindowEventsFromBursts(createBleBurstEvents(animals, policyId, epochStart, epochEnd, sched));
}

export function createAdvertisingEvents(
  animals: Animal[],
  epochStart: number,
  epochEnd: number,
  radioStepSeconds = 1,
  scheduling?: BleSchedulingConfig
): AdvertisingEvent[] {
  void radioStepSeconds;
  const sched = scheduling ?? defaultSchedulingFallback();
  return createAdvertisingEventsFromBursts(
    createBleBurstEvents(animals, "", epochStart, epochEnd, sched),
    DEFAULT_ADVERTISING_EVENT_INTERVAL_SECONDS
  );
}

export function createScanWindowEventsFromBursts(bursts: BleBurstEvent[]): ScanWindowEvent[] {
  return bursts
    .filter((burst) => burst.kind === "scan")
    .map((burst) => ({
      startTime: burst.startTime,
      endTime: burst.endTime,
      observerId: burst.animalId,
      scanPolicyId: burst.policyId
    }));
}

export function createAdvertisingEventsFromBursts(
  bursts: BleBurstEvent[],
  advertisingEventIntervalSeconds: number = DEFAULT_ADVERTISING_EVENT_INTERVAL_SECONDS
): AdvertisingEvent[] {
  return bursts.flatMap((burst) => {
    if (burst.kind !== "advertise") {
      return [];
    }

    const packets: AdvertisingEvent[] = [];
    for (let time = burst.startTime; time <= burst.endTime; time += advertisingEventIntervalSeconds) {
      packets.push({ time, animalId: burst.animalId });
    }
    return packets;
  });
}

export function countScanListenWindowsInBursts(bursts: BleBurstEvent[]): number {
  let count = 0;
  for (const burst of bursts) {
    if (burst.kind !== "scan") {
      continue;
    }
    for (let time = burst.startTime; time < burst.endTime; time += SCAN_LISTEN_INTERVAL_SECONDS) {
      count += 1;
    }
  }
  return count;
}

export function totalScanListenWindowSeconds(bursts: BleBurstEvent[]): number {
  return countScanListenWindowsInBursts(bursts) * SCAN_LISTEN_WINDOW_SECONDS;
}

export function countAdvertisingPacketsInBursts(
  bursts: BleBurstEvent[],
  advertisingEventIntervalSeconds: number = DEFAULT_ADVERTISING_EVENT_INTERVAL_SECONDS
): number {
  let count = 0;
  for (const burst of bursts) {
    if (burst.kind !== "advertise") {
      continue;
    }
    for (let time = burst.startTime; time <= burst.endTime; time += advertisingEventIntervalSeconds) {
      count += 1;
    }
  }
  return count;
}

export function totalBleBurstWallSeconds(bursts: BleBurstEvent[], kind: BleBurstEvent["kind"]): number {
  return bursts
    .filter((burst) => burst.kind === kind)
    .reduce((sum, burst) => sum + Math.max(0, burst.endTime - burst.startTime), 0);
}

function createScanListenWindows(bursts: BleBurstEvent[]): ScanWindowEvent[] {
  return bursts.flatMap((burst) => {
    if (burst.kind !== "scan") {
      return [];
    }

    const windows: ScanWindowEvent[] = [];
    for (let time = burst.startTime; time < burst.endTime; time += SCAN_LISTEN_INTERVAL_SECONDS) {
      windows.push({
        startTime: time,
        endTime: Math.min(burst.endTime, time + SCAN_LISTEN_WINDOW_SECONDS),
        observerId: burst.animalId,
        scanPolicyId: burst.policyId
      });
    }
    return windows;
  });
}

export function estimateRssi(distanceMeters: number, radio: RadioConfig, rng: SeededRandom): number {
  const clampedDistance = Math.max(0.05, distanceMeters);
  return (
    radio.rssiAtOneMeter -
    10 * radio.pathLossExponent * Math.log10(clampedDistance) +
    rng.normal(0, radio.rssiNoiseSd)
  );
}

export function detectionProbability(rssi: number, radio: RadioConfig): number {
  return 1 / (1 + Math.exp(-(rssi - radio.rssiThreshold) / radio.rssiSlope));
}

function maybeDetectPair(
  observerStart: Animal,
  observerEnd: Animal,
  peerStart: Animal,
  peerEnd: Animal,
  epochStart: number,
  epochEnd: number,
  radio: RadioConfig,
  policyId: string,
  rng: SeededRandom,
  windowsByObserver: Map<string, ScanWindowEvent[]>,
  adsByAnimal: Map<string, AdvertisingEvent[]>,
  events: DetectionEvent[]
): void {
  if (!observerEnd.collar.valid || !peerEnd.collar.valid) {
    return;
  }

  const windows = windowsByObserver.get(observerEnd.id) ?? [];
  const ads = adsByAnimal.get(peerEnd.id) ?? [];

  for (const window of windows) {
    const matchingAd = ads.find((ad) => ad.time >= window.startTime && ad.time <= window.endTime);
    if (!matchingAd) {
      continue;
    }

    const distanceMeters = interpolatedAnimalDistance(
      observerStart,
      observerEnd,
      peerStart,
      peerEnd,
      matchingAd.time,
      epochStart,
      epochEnd
    );
    if (distanceMeters > radio.detectionRadiusMeters) {
      continue;
    }

    const rssi = estimateRssi(distanceMeters, radio, rng);
    if (rng.next() <= detectionProbability(rssi, radio)) {
      events.push({
        time: matchingAd.time,
        observerId: observerEnd.id,
        peerId: peerEnd.id,
        trueDistance: distanceMeters,
        rssi,
        scanPolicyId: policyId
      });
      break;
    }
  }
}

function groupScanWindowsByObserver(windows: ScanWindowEvent[]): Map<string, ScanWindowEvent[]> {
  const grouped = new Map<string, ScanWindowEvent[]>();
  for (const window of windows) {
    const observerWindows = grouped.get(window.observerId) ?? [];
    observerWindows.push(window);
    grouped.set(window.observerId, observerWindows);
  }
  return grouped;
}

function groupAdvertisingEventsByAnimal(events: AdvertisingEvent[]): Map<string, AdvertisingEvent[]> {
  const grouped = new Map<string, AdvertisingEvent[]>();
  for (const event of events) {
    const animalEvents = grouped.get(event.animalId) ?? [];
    animalEvents.push(event);
    grouped.set(event.animalId, animalEvents);
  }
  return grouped;
}

function deterministicJitter(animalId: string, eventTime: number, channel: "scan" | "advertise"): number {
  let hash = 2166136261;
  const key = `${animalId}:${Math.round(eventTime * 1000)}:${channel}`;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash / 0xffffffff - 0.5) * 1;
}

function deterministicPostIdleJitter(
  animalId: string,
  eventTime: number,
  channel: "scan" | "advertise",
  minSeconds: number,
  maxSeconds: number
): number {
  let hash = 2166136261;
  const key = `${animalId}:${Math.round(eventTime * 1000)}:${channel}:post`;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const u = hash / 0xffffffff;
  return minSeconds + u * Math.max(0, maxSeconds - minSeconds);
}

function avoidMinuteSafeZone(time: number, epochEnd: number, zoneSeconds: number): number {
  const secondsInMinute = ((time % 60) + 60) % 60;
  if (secondsInMinute >= 60 - zoneSeconds) {
    return Math.min(epochEnd, time + (60 - secondsInMinute + zoneSeconds));
  }
  if (secondsInMinute <= zoneSeconds) {
    return Math.min(epochEnd, time + (zoneSeconds - secondsInMinute));
  }
  return time;
}

function clampToEpoch(value: number, epochStart: number, epochEnd: number): number {
  return Math.max(epochStart, Math.min(epochEnd, value));
}
