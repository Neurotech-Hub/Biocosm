import { SeededRandom } from "../random";
import type { OptimizerBounds } from "./bounds";

export type AdaptiveCandidateParams = {
  baselineDrive: number;
  motionWeight: number;
  peerWeight: number;
  tauPeerSeconds: number;
};

/** Uniform on [min,max]; log-uniform on tau (spec §7). */
export function generateAdaptiveCandidates(
  count: number,
  seed: string,
  bounds: OptimizerBounds
): AdaptiveCandidateParams[] {
  const rng = new SeededRandom(seed);
  const out: AdaptiveCandidateParams[] = [];
  const logTauMin = Math.log(bounds.tauPeerSeconds.min);
  const logTauMax = Math.log(bounds.tauPeerSeconds.max);

  for (let i = 0; i < count; i += 1) {
    const baselineDrive = rng.range(bounds.baselineDrive.min, bounds.baselineDrive.max);
    const motionWeight = rng.range(bounds.motionWeight.min, bounds.motionWeight.max);
    const peerWeight = rng.range(bounds.peerWeight.min, bounds.peerWeight.max);
    const logTau = rng.range(logTauMin, logTauMax);
    const tauPeerSeconds = Math.exp(logTau);
    out.push({
      baselineDrive,
      motionWeight,
      peerWeight,
      tauPeerSeconds
    });
  }
  return out;
}

/** Optional 10×10×10×10 debug grid (spec §7.3). */
export function generateCandidateGrid10(bounds: OptimizerBounds): AdaptiveCandidateParams[] {
  const n = 10;
  const out: AdaptiveCandidateParams[] = [];
  for (let i = 0; i < n; i += 1) {
    const tBd =
      bounds.baselineDrive.min +
      (i / (n - 1)) * (bounds.baselineDrive.max - bounds.baselineDrive.min);
    for (let j = 0; j < n; j += 1) {
      const tMw =
        bounds.motionWeight.min + (j / (n - 1)) * (bounds.motionWeight.max - bounds.motionWeight.min);
      for (let k = 0; k < n; k += 1) {
        const tPw =
          bounds.peerWeight.min + (k / (n - 1)) * (bounds.peerWeight.max - bounds.peerWeight.min);
        for (let l = 0; l < n; l += 1) {
          const logMin = Math.log(bounds.tauPeerSeconds.min);
          const logMax = Math.log(bounds.tauPeerSeconds.max);
          const logTau = logMin + (l / (n - 1)) * (logMax - logMin);
          out.push({
            baselineDrive: tBd,
            motionWeight: tMw,
            peerWeight: tPw,
            tauPeerSeconds: Math.exp(logTau)
          });
        }
      }
    }
  }
  return out;
}
