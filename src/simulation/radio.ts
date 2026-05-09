import { animalDistance } from "./geometry";
import { SeededRandom } from "./random";
import type { AdvertisingEvent, Animal, BleBurstEvent, DetectionEvent, RadioConfig, ScanWindowEvent, TrueContact } from "./types";

export const scanBurstDurationSeconds = 1.5;
export const advertisingBurstDurationSeconds = 2;
export const interBurstDelaySeconds = 0.1;
const scanListenIntervalSeconds = 0.05;
const scanListenWindowSeconds = 0.0125;
const advertisingPacketIntervalSeconds = 0.15;

export function computeTrueContacts(animals: Animal[], radio: RadioConfig, time: number): TrueContact[] {
  const contacts: TrueContact[] = [];
  for (let left = 0; left < animals.length; left += 1) {
    for (let right = left + 1; right < animals.length; right += 1) {
      const distance = animalDistance(animals[left], animals[right]);
      contacts.push({
        time,
        animalA: animals[left].id,
        animalB: animals[right].id,
        distance,
        withinDetectionRadius: distance <= radio.detectionRadiusMeters,
        withinSocialRadius: distance <= radio.socialRadiusMeters
      });
    }
  }
  return contacts;
}

export function simulateBleDetections(
  animals: Animal[],
  trueContacts: TrueContact[],
  radio: RadioConfig,
  policyId: string,
  time: number,
  rng: SeededRandom,
  bleBursts?: BleBurstEvent[]
): DetectionEvent[] {
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const bursts = bleBursts ?? createBleBurstEvents(animals, policyId, time - 60, time);
  const windows = createScanListenWindows(bursts);
  const ads = createAdvertisingEventsFromBursts(bursts);
  const windowsByObserver = groupScanWindowsByObserver(windows);
  const adsByAnimal = groupAdvertisingEventsByAnimal(ads);
  const events: DetectionEvent[] = [];

  for (const contact of trueContacts) {
    const animalA = animalById.get(contact.animalA);
    const animalB = animalById.get(contact.animalB);
    if (!animalA || !animalB || !contact.withinDetectionRadius) {
      continue;
    }

    maybeDetect(animalA, animalB, contact.distance, radio, policyId, rng, windowsByObserver, adsByAnimal, events);
    maybeDetect(animalB, animalA, contact.distance, radio, policyId, rng, windowsByObserver, adsByAnimal, events);
  }

  return events;
}

export function createBleBurstEvents(
  animals: Animal[],
  policyId: string,
  epochStart: number,
  epochEnd: number
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

    while (cursor < epochEnd && guard < 1000) {
      guard += 1;
      const scanDueAt = Math.max(cursor, nextScanDue);
      const advDueAt = Math.max(cursor, nextAdvDue);
      const kind: BleBurstEvent["kind"] = scanDueAt <= advDueAt ? "scan" : "advertise";
      const dueAt = kind === "scan" ? scanDueAt : advDueAt;

      if (dueAt >= epochEnd) {
        break;
      }

      const jitteredStart = avoidMinuteSafeZone(
        clampToEpoch(dueAt + deterministicJitter(animal.id, dueAt, kind), epochStart, epochEnd),
        epochEnd
      );
      const duration = kind === "scan" ? animal.collar.scanWindowSeconds : advertisingBurstDurationSeconds;
      const startTime = Math.max(cursor, jitteredStart);
      const endTime = Math.min(epochEnd, startTime + duration);

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
      cursor = endTime + interBurstDelaySeconds + deterministicPositiveJitter(animal.id, endTime, kind);
    }

    return bursts;
  });
}

export function createScanWindowEvents(
  animals: Animal[],
  policyId: string,
  epochStart: number,
  epochEnd: number,
  radioStepSeconds = 1
): ScanWindowEvent[] {
  void radioStepSeconds;
  return createScanWindowEventsFromBursts(createBleBurstEvents(animals, policyId, epochStart, epochEnd));
}

export function createAdvertisingEvents(
  animals: Animal[],
  epochStart: number,
  epochEnd: number,
  radioStepSeconds = 1
): AdvertisingEvent[] {
  void radioStepSeconds;
  return createAdvertisingEventsFromBursts(createBleBurstEvents(animals, "", epochStart, epochEnd));
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

export function createAdvertisingEventsFromBursts(bursts: BleBurstEvent[]): AdvertisingEvent[] {
  return bursts.flatMap((burst) => {
    if (burst.kind !== "advertise") {
      return [];
    }

    const packets: AdvertisingEvent[] = [];
    for (let time = burst.startTime; time <= burst.endTime; time += advertisingPacketIntervalSeconds) {
      packets.push({ time, animalId: burst.animalId });
    }
    return packets;
  });
}

function createScanListenWindows(bursts: BleBurstEvent[]): ScanWindowEvent[] {
  return bursts.flatMap((burst) => {
    if (burst.kind !== "scan") {
      return [];
    }

    const windows: ScanWindowEvent[] = [];
    for (let time = burst.startTime; time < burst.endTime; time += scanListenIntervalSeconds) {
      windows.push({
        startTime: time,
        endTime: Math.min(burst.endTime, time + scanListenWindowSeconds),
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

function maybeDetect(
  observer: Animal,
  peer: Animal,
  distanceMeters: number,
  radio: RadioConfig,
  policyId: string,
  rng: SeededRandom,
  windowsByObserver: Map<string, ScanWindowEvent[]>,
  adsByAnimal: Map<string, AdvertisingEvent[]>,
  events: DetectionEvent[]
): void {
  if (!observer.collar.valid || !peer.collar.valid) {
    return;
  }

  const windows = windowsByObserver.get(observer.id) ?? [];
  const ads = adsByAnimal.get(peer.id) ?? [];
  for (const window of windows) {
    const matchingAd = ads.find((ad) => ad.time >= window.startTime && ad.time <= window.endTime);
    if (!matchingAd) {
      continue;
    }

    const rssi = estimateRssi(distanceMeters, radio, rng);
    if (rng.next() <= detectionProbability(rssi, radio)) {
      events.push({
        time: matchingAd.time,
        observerId: observer.id,
        peerId: peer.id,
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

function deterministicPositiveJitter(animalId: string, eventTime: number, channel: "scan" | "advertise"): number {
  return deterministicJitter(animalId, eventTime, channel) + 0.5;
}

function avoidMinuteSafeZone(time: number, epochEnd: number): number {
  const secondsInMinute = ((time % 60) + 60) % 60;
  if (secondsInMinute >= 57) {
    return Math.min(epochEnd, time + (63 - secondsInMinute));
  }
  if (secondsInMinute <= 3) {
    return Math.min(epochEnd, time + (3 - secondsInMinute));
  }
  return time;
}

function clampToEpoch(value: number, epochStart: number, epochEnd: number): number {
  return Math.max(epochStart, Math.min(epochEnd, value));
}
