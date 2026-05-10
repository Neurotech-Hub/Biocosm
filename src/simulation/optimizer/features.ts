import type { NormalizedParams } from "./normalize";

export const OPTIMIZER_FEATURE_COUNT = 15;

/** Quadratic + pairwise interactions on normalized x1..x4 (spec §6.1). */
export function featuresFromNormalized(x: NormalizedParams): number[] {
  const [x1, x2, x3, x4] = x;
  return [
    1,
    x1,
    x2,
    x3,
    x4,
    x1 * x1,
    x2 * x2,
    x3 * x3,
    x4 * x4,
    x1 * x2,
    x1 * x3,
    x1 * x4,
    x2 * x3,
    x2 * x4,
    x3 * x4
  ];
}
