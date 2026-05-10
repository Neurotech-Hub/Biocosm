import type { OptimizerCandidateSource } from "./candidateSource";

/** Predicted candidate row (spec §8); may be surrogate output or observed fixed sweep row. */
export type PredictedPolicyCandidate = {
  candidateId: string;
  source: OptimizerCandidateSource;
  /** Sweep policy id (for observed fixed: actual id; for adaptive predicted: same as candidateId). */
  sweepPolicyId: string;
  baselineDrive: number;
  motionWeight: number;
  peerWeight: number;
  tauPeerSeconds: number;
  /** Present when source is observed_fixed (scan / listen window / advertise interval, seconds). */
  fixedScanIntervalSeconds?: number | null;
  fixedScanWindowSeconds?: number | null;
  fixedAdvIntervalSeconds?: number | null;
  predictedCaptureRate: number;
  predictedMahPerDay: number;
  predictedBleEfficiency: number;
  predictedRelativeCapture: number;
  predictedRelativeEnergy: number;
  predictedRelativeEfficiency: number;
  isPredictedPareto: boolean;
  recommendationTags: string[];
};

export type RecommendationRole =
  | "energySaving"
  | "balanced"
  | "highCapture"
  | "maxEfficiency"
  | "paretoKnee";

export type RecommendationPick = {
  role: RecommendationRole;
  label: string;
  candidate: PredictedPolicyCandidate | null;
  note?: string;
};

export type RecommendationSet = {
  picks: RecommendationPick[];
};

/** Verification row (spec §11.1). */
export type VerifiedCandidateResult = {
  candidateId: string;
  recommendationRole: string;
  predictedCaptureRate: number;
  verifiedCaptureRate: number;
  predictedMahPerDay: number;
  verifiedMahPerDay: number;
  predictedBleEfficiency: number;
  verifiedBleEfficiency: number;
  capturePredictionError: number;
  energyPredictionError: number;
  efficiencyPredictionError: number;
};
