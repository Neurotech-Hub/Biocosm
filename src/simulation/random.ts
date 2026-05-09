export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  static fromState(state: number): SeededRandom {
    const rng = new SeededRandom(1);
    rng.state = state >>> 0;
    return rng;
  }

  getState(): number {
    return this.state >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  integer(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  normal(mean = 0, sd = 1): number {
    const u1 = Math.max(this.next(), Number.EPSILON);
    const u2 = this.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * sd;
  }

  triangular(min: number, mode: number, max: number): number {
    const u = this.next();
    const c = (mode - min) / (max - min);
    if (u < c) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    }
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }

  weightedIndex(weights: number[]): number {
    const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
    if (total <= 0) {
      return this.integer(0, weights.length - 1);
    }

    let cursor = this.next() * total;
    for (let index = 0; index < weights.length; index += 1) {
      cursor -= Math.max(0, weights[index]);
      if (cursor <= 0) {
        return index;
      }
    }

    return weights.length - 1;
  }
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
