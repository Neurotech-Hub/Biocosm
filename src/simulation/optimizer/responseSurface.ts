import type { OptimizerBounds } from "./bounds";
import { featuresFromNormalized, OPTIMIZER_FEATURE_COUNT } from "./features";
import { accumulateXtXy, addDiagonalInPlace, solveLinearSystem } from "./matrix";
import { normalizeAdaptiveParams } from "./normalize";

export const DEFAULT_RIDGE_LAMBDA = 1e-4;
export const MIN_ENERGY_FLOOR = 0.001;

export type OptimizerTrainingRow = {
  baselineDrive: number;
  motionWeight: number;
  peerWeight: number;
  tauPeerSeconds: number;
  captureRate: number;
  mahPerDay: number;
};

export type ResponseSurfaceModel = {
  featureCount: number;
  captureCoefficients: number[];
  energyCoefficients: number[];
  captureR2: number;
  energyR2: number;
  bounds: OptimizerBounds;
  ridgeLambda: number;
};

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    s += a[i]! * b[i]!;
  }
  return s;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function rSquared(y: number[], yHat: number[]): number {
  const n = y.length;
  if (n === 0) {
    return 0;
  }
  const yBar = mean(y);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i += 1) {
    const d = y[i]! - yBar;
    ssTot += d * d;
    const e = y[i]! - yHat[i]!;
    ssRes += e * e;
  }
  if (ssTot < 1e-18) {
    return 1;
  }
  return 1 - ssRes / ssTot;
}

export function fitResponseSurface(
  rows: OptimizerTrainingRow[],
  bounds: OptimizerBounds,
  ridgeLambda: number = DEFAULT_RIDGE_LAMBDA
): ResponseSurfaceModel {
  if (rows.length < OPTIMIZER_FEATURE_COUNT) {
    throw new Error(
      `Need at least ${OPTIMIZER_FEATURE_COUNT} adaptive training rows for the surrogate model; got ${rows.length}.`
    );
  }

  const X: number[][] = [];
  const yCap: number[] = [];
  const yEn: number[] = [];

  for (const row of rows) {
    const norm = normalizeAdaptiveParams(
      row.baselineDrive,
      row.motionWeight,
      row.peerWeight,
      row.tauPeerSeconds,
      bounds
    );
    X.push(featuresFromNormalized(norm));
    yCap.push(row.captureRate);
    yEn.push(row.mahPerDay);
  }

  const fitTarget = (y: number[]): { beta: number[]; r2: number } => {
    const { XtX, Xty } = accumulateXtXy(X, y);
    addDiagonalInPlace(XtX, ridgeLambda);
    const beta = solveLinearSystem(
      XtX.map((row) => [...row]),
      [...Xty]
    );
    const yHat = X.map((row) => dot(row, beta));
    return { beta, r2: rSquared(y, yHat) };
  };

  const capFit = fitTarget(yCap);
  const enFit = fitTarget(yEn);

  return {
    featureCount: OPTIMIZER_FEATURE_COUNT,
    captureCoefficients: capFit.beta,
    energyCoefficients: enFit.beta,
    captureR2: capFit.r2,
    energyR2: enFit.r2,
    bounds,
    ridgeLambda
  };
}

export type RawAdaptiveParams = {
  baselineDrive: number;
  motionWeight: number;
  peerWeight: number;
  tauPeerSeconds: number;
};

export function predictResponseSurface(model: ResponseSurfaceModel, params: RawAdaptiveParams): {
  captureRate: number;
  mahPerDay: number;
  bleEfficiency: number;
} {
  const norm = normalizeAdaptiveParams(
    params.baselineDrive,
    params.motionWeight,
    params.peerWeight,
    params.tauPeerSeconds,
    model.bounds
  );
  const phi = featuresFromNormalized(norm);
  let cap = dot(model.captureCoefficients, phi);
  let energy = dot(model.energyCoefficients, phi);
  cap = Math.min(1, Math.max(0, cap));
  energy = Math.max(MIN_ENERGY_FLOOR, energy);
  const bleEfficiency = energy > 0 ? cap / energy : 0;
  return { captureRate: cap, mahPerDay: energy, bleEfficiency };
}
