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
  /** Present when source is observed_fixed (scan interval / fixed scan burst / advertise interval, seconds). */
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
  /** True when raw surrogate output was clamped to the observed training metric envelope. */
  predictionClamped: boolean;
  /** Nearest normalized distance to an adaptive sweep training point; null for observed fixed rows. */
  trainingNearestDistance: number | null;
  /** True when this adaptive candidate is outside the observed adaptive sweep axis envelope. */
  trainingOutsideEnvelope: boolean;
  /** Axis ids outside observed adaptive sweep coverage, e.g. baselineDrive or tauPeerSeconds. */
  trainingOutsideAxes: string[];
};

export type RecommendationRole =
  | "energySaving"
  | "balanced"
  | "highCapture"
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
  source: OptimizerCandidateSource;
  sweepPolicyId: string;
  baselineDrive: number;
  motionWeight: number;
  peerWeight: number;
  tauPeerSeconds: number;
  fixedScanIntervalSeconds: number | null;
  fixedScanWindowSeconds: number | null;
  fixedAdvIntervalSeconds: number | null;
  verificationSeedMode: "builtSeedSingle" | "sweepSeedsMean";
  verificationSeeds: string[];
  predictionClamped: boolean;
  trainingNearestDistance: number | null;
  trainingOutsideEnvelope: boolean;
  trainingOutsideAxes: string[];
  predictedCaptureRate: number;
  verifiedCaptureRate: number;
  predictedMahPerDay: number;
  verifiedMahPerDay: number;
  predictedBleEfficiency: number;
  verifiedBleEfficiency: number;
  predictedRelativeCapture: number;
  predictedRelativeEnergy: number;
  predictedRelativeEfficiency: number;
  verifiedRelativeCapture: number;
  verifiedRelativeEnergy: number;
  verifiedRelativeEfficiency: number;
  capturePredictionError: number;
  energyPredictionError: number;
  efficiencyPredictionError: number;
  captureRelativeError: number;
  energyRelativeError: number;
  efficiencyRelativeError: number;
};
