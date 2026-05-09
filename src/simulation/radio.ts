import { animalDistance } from "./geometry";
import { SeededRandom } from "./random";
import type { Animal, DetectionEvent, RadioConfig, TrueContact } from "./types";

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
  rng: SeededRandom
): DetectionEvent[] {
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const events: DetectionEvent[] = [];

  for (const contact of trueContacts) {
    const animalA = animalById.get(contact.animalA);
    const animalB = animalById.get(contact.animalB);
    if (!animalA || !animalB || !contact.withinDetectionRadius) {
      continue;
    }

    maybeDetect(animalA, animalB, contact.distance, radio, policyId, time, rng, events);
    maybeDetect(animalB, animalA, contact.distance, radio, policyId, time, rng, events);
  }

  return events;
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
  time: number,
  rng: SeededRandom,
  events: DetectionEvent[]
): void {
  if (!observer.collar.scanActive || !peer.collar.advActive || !observer.collar.valid || !peer.collar.valid) {
    return;
  }

  const rssi = estimateRssi(distanceMeters, radio, rng);
  if (rng.next() <= detectionProbability(rssi, radio)) {
    events.push({
      time,
      observerId: observer.id,
      peerId: peer.id,
      trueDistance: distanceMeters,
      rssi,
      scanPolicyId: policyId
    });
  }
}
