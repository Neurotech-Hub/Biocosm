/** Default candidate generation / normalization bounds (spec §7.1). */
export const DEFAULT_OPTIMIZER_BOUNDS = {
  baselineDrive: { min: 0.05, max: 0.5 },
  motionWeight: { min: 0.1, max: 0.7 },
  peerWeight: { min: 0.2, max: 1.1 },
  tauPeerSeconds: { min: 60, max: 900 }
} as const;

export type OptimizerAxisBounds = { min: number; max: number };

export type OptimizerBounds = {
  baselineDrive: OptimizerAxisBounds;
  motionWeight: OptimizerAxisBounds;
  peerWeight: OptimizerAxisBounds;
  tauPeerSeconds: OptimizerAxisBounds;
};

export function defaultOptimizerBounds(): OptimizerBounds {
  return {
    baselineDrive: { ...DEFAULT_OPTIMIZER_BOUNDS.baselineDrive },
    motionWeight: { ...DEFAULT_OPTIMIZER_BOUNDS.motionWeight },
    peerWeight: { ...DEFAULT_OPTIMIZER_BOUNDS.peerWeight },
    tauPeerSeconds: { ...DEFAULT_OPTIMIZER_BOUNDS.tauPeerSeconds }
  };
}
