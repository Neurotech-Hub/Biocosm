import { SeededRandom } from "./random";
import type { Animal, AnimalObservation, MotionSensorConfig } from "./types";

export function computeMotionObservations(
  time: number,
  previousAnimals: Animal[],
  animals: Animal[],
  config: MotionSensorConfig,
  rng: SeededRandom
): AnimalObservation[] {
  const previousById = new Map(previousAnimals.map((animal) => [animal.id, animal]));

  return animals.map((animal) => {
    const previous = previousById.get(animal.id);
    const trueMotion = previous
      ? Math.hypot(animal.position.x - previous.position.x, animal.position.y - previous.position.y)
      : 0;
    const motionMagnitude = Math.max(0, trueMotion + rng.normal(0, config.noiseSdMeters));
    const trulyMoving = trueMotion > config.thresholdMetersPerStep;
    let motionDetected = motionMagnitude > config.thresholdMetersPerStep;

    if (!trulyMoving && rng.next() < config.falsePositiveRate) {
      motionDetected = true;
    }
    if (trulyMoving && rng.next() < config.falseNegativeRate) {
      motionDetected = false;
    }

    return {
      time,
      animalId: animal.id,
      motionDetected,
      motionMagnitude,
      collarValid: animal.collar.valid
    };
  });
}
