import type { OptimizerBounds } from "./bounds";

/** Normalized design coordinates x1..x4 used in quadratic features (spec §6.2). */
export type NormalizedParams = readonly [number, number, number, number];

export function normalizeAdaptiveParams(
  baselineDrive: number,
  motionWeight: number,
  peerWeight: number,
  tauPeerSeconds: number,
  bounds: OptimizerBounds
): NormalizedParams {
  const x1 = linearNorm(baselineDrive, bounds.baselineDrive);
  const x2 = linearNorm(motionWeight, bounds.motionWeight);
  const x3 = linearNorm(peerWeight, bounds.peerWeight);
  const logMin = Math.log(bounds.tauPeerSeconds.min);
  const logMax = Math.log(bounds.tauPeerSeconds.max);
  const denom = logMax - logMin;
  const x4 = denom > 1e-18 ? (Math.log(tauPeerSeconds) - logMin) / denom : 0.5;
  return [clamp01(x1), clamp01(x2), clamp01(x3), clamp01(x4)];
}

function linearNorm(value: number, axis: { min: number; max: number }): number {
  const d = axis.max - axis.min;
  return d > 1e-18 ? (value - axis.min) / d : 0.5;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}
