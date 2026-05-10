import type { SweepPolicySummary } from "../sweep/sweepCandidates";
import type { SweepResultBundle } from "../sweep/adaptiveBleSweep";
import { defaultOptimizerBounds, type OptimizerBounds } from "./bounds";
import { generateAdaptiveCandidates } from "./candidateGeneration";
import { sweepFixedSummariesToCandidates } from "./fixedFromSweep";
import { sweepSummariesToTrainingRows } from "./extractTraining";
import { markPredictedPareto } from "./pareto";
import { clampPredictionToTrainingEnvelope } from "./predictionEnvelope";
import { computeRecommendations } from "./recommendations";
import {
  DEFAULT_RIDGE_LAMBDA,
  computeResponseSurfaceCalibrationDiagnostics,
  fitResponseSurface,
  predictResponseSurface,
  type ResponseSurfaceCalibrationDiagnostics,
  type ResponseSurfaceModel
} from "./responseSurface";
import {
  constrainBoundsToTrainingRows,
  trainingCoverageForCandidate
} from "./trainingCoverage";
import type { PredictedPolicyCandidate } from "./types";
import type { RecommendationSet } from "./types";

export type OptimizerPipelineInput = {
  summaries: SweepPolicySummary[];
  baselineSummary: SweepPolicySummary;
  candidateCount: number;
  optimizerSeed: string;
  bounds?: OptimizerBounds;
  ridgeLambda?: number;
  /** Keep generated adaptive candidates inside observed adaptive sweep coverage. Defaults to true. */
  constrainCandidatesToTrainingEnvelope?: boolean;
};

export type OptimizerPipelineResult = {
  model: ResponseSurfaceModel;
  trainingRowCount: number;
  calibrationDiagnostics: ResponseSurfaceCalibrationDiagnostics;
  candidateGenerationBounds: OptimizerBounds;
  constrainCandidatesToTrainingEnvelope: boolean;
  candidates: PredictedPolicyCandidate[];
  recommendations: RecommendationSet;
  baselineSummary: SweepPolicySummary;
};

function baselineSafeRatios(baseline: SweepPolicySummary): {
  capture: number;
  energy: number;
  efficiency: number;
} {
  const cap = baseline.meanCaptureRate > 1e-18 ? baseline.meanCaptureRate : 1;
  const en = baseline.meanMahPerDay > 1e-18 ? baseline.meanMahPerDay : 1;
  const eff = baseline.meanBleEfficiency > 1e-18 ? baseline.meanBleEfficiency : 1;
  return { capture: cap, energy: en, efficiency: eff };
}

export function runOptimizerPipeline(input: OptimizerPipelineInput): OptimizerPipelineResult {
  const bounds = input.bounds ?? defaultOptimizerBounds();
  const ridgeLambda = input.ridgeLambda ?? DEFAULT_RIDGE_LAMBDA;
  const constrainCandidatesToTrainingEnvelope = input.constrainCandidatesToTrainingEnvelope ?? true;

  const trainingRows = sweepSummariesToTrainingRows(input.summaries);
  const model = fitResponseSurface(trainingRows, bounds, ridgeLambda);
  const calibrationDiagnostics = computeResponseSurfaceCalibrationDiagnostics(trainingRows, bounds, ridgeLambda);

  const base = baselineSafeRatios(input.baselineSummary);
  const candidateGenerationBounds = constrainCandidatesToTrainingEnvelope
    ? constrainBoundsToTrainingRows(bounds, trainingRows)
    : bounds;

  const rawAdaptive = generateAdaptiveCandidates(input.candidateCount, input.optimizerSeed, candidateGenerationBounds);

  const adaptiveCandidates: PredictedPolicyCandidate[] = rawAdaptive.map((p, index) => {
    const id = `cand-${String(index).padStart(6, "0")}`;
    const predRaw = predictResponseSurface(model, p);
    const env = clampPredictionToTrainingEnvelope(
      {
        captureRate: predRaw.captureRate,
        mahPerDay: predRaw.mahPerDay,
        bleEfficiency: predRaw.bleEfficiency
      },
      trainingRows
    );
    const coverage = trainingCoverageForCandidate(p, trainingRows, bounds);
    const relCap = env.captureRate / base.capture;
    const relEn = env.mahPerDay / base.energy;
    const relEff = env.bleEfficiency / base.efficiency;

    return {
      candidateId: id,
      source: "predicted_adaptive",
      sweepPolicyId: id,
      baselineDrive: p.baselineDrive,
      motionWeight: p.motionWeight,
      peerWeight: p.peerWeight,
      tauPeerSeconds: p.tauPeerSeconds,
      fixedScanIntervalSeconds: null,
      fixedScanWindowSeconds: null,
      fixedAdvIntervalSeconds: null,
      predictedCaptureRate: env.captureRate,
      predictedMahPerDay: env.mahPerDay,
      predictedBleEfficiency: env.bleEfficiency,
      predictedRelativeCapture: relCap,
      predictedRelativeEnergy: relEn,
      predictedRelativeEfficiency: relEff,
      isPredictedPareto: false,
      recommendationTags: [],
      predictionClamped: env.clamped,
      trainingNearestDistance: coverage.nearestDistance,
      trainingOutsideEnvelope: coverage.outsideEnvelope,
      trainingOutsideAxes: coverage.outsideAxes
    };
  });

  const fixedCandidates = sweepFixedSummariesToCandidates(input.baselineSummary, input.summaries);

  const candidates = [...adaptiveCandidates, ...fixedCandidates];

  markPredictedPareto(candidates);
  const recommendations = computeRecommendations(candidates);

  return {
    model,
    trainingRowCount: trainingRows.length,
    calibrationDiagnostics,
    candidateGenerationBounds,
    constrainCandidatesToTrainingEnvelope,
    candidates,
    recommendations,
    baselineSummary: input.baselineSummary
  };
}

/** Convenience: bundle from finalizeSweepBundle. */
export function runOptimizerPipelineFromBundle(
  bundle: SweepResultBundle,
  options: {
    candidateCount: number;
    optimizerSeed: string;
    bounds?: OptimizerBounds;
    ridgeLambda?: number;
    constrainCandidatesToTrainingEnvelope?: boolean;
  }
): OptimizerPipelineResult {
  return runOptimizerPipeline({
    summaries: bundle.summaries,
    baselineSummary: bundle.baselineSummary,
    candidateCount: options.candidateCount,
    optimizerSeed: options.optimizerSeed,
    bounds: options.bounds,
    ridgeLambda: options.ridgeLambda,
    constrainCandidatesToTrainingEnvelope: options.constrainCandidatesToTrainingEnvelope
  });
}
