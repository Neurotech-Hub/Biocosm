import type { OptimizerBounds } from "./bounds";
import { normalizeAdaptiveParams } from "./normalize";
import type { AdaptiveCandidateParams } from "./candidateGeneration";
import type { OptimizerTrainingRow } from "./responseSurface";

export type TrainingCoverageDiagnostics = {
  nearestDistance: number;
  outsideEnvelope: boolean;
  outsideAxes: string[];
};

const AXES = ["baselineDrive", "motionWeight", "peerWeight", "tauPeerSeconds"] as const;

type Axis = (typeof AXES)[number];

function axisValues(row: Pick<OptimizerTrainingRow, Axis>): Record<Axis, number> {
  return {
    baselineDrive: row.baselineDrive,
    motionWeight: row.motionWeight,
    peerWeight: row.peerWeight,
    tauPeerSeconds: row.tauPeerSeconds
  };
}

function observedTrainingBounds(rows: OptimizerTrainingRow[]): Record<Axis, { min: number; max: number }> | null {
  if (rows.length === 0) {
    return null;
  }
  const initial = axisValues(rows[0]!);
  const out: Record<Axis, { min: number; max: number }> = {
    baselineDrive: { min: initial.baselineDrive, max: initial.baselineDrive },
    motionWeight: { min: initial.motionWeight, max: initial.motionWeight },
    peerWeight: { min: initial.peerWeight, max: initial.peerWeight },
    tauPeerSeconds: { min: initial.tauPeerSeconds, max: initial.tauPeerSeconds }
  };
  for (const row of rows) {
    const values = axisValues(row);
    for (const axis of AXES) {
      out[axis].min = Math.min(out[axis].min, values[axis]);
      out[axis].max = Math.max(out[axis].max, values[axis]);
    }
  }
  return out;
}

export function constrainBoundsToTrainingRows(
  bounds: OptimizerBounds,
  rows: OptimizerTrainingRow[]
): OptimizerBounds {
  const observed = observedTrainingBounds(rows);
  if (!observed) {
    return bounds;
  }
  return {
    baselineDrive: {
      min: Math.max(bounds.baselineDrive.min, observed.baselineDrive.min),
      max: Math.min(bounds.baselineDrive.max, observed.baselineDrive.max)
    },
    motionWeight: {
      min: Math.max(bounds.motionWeight.min, observed.motionWeight.min),
      max: Math.min(bounds.motionWeight.max, observed.motionWeight.max)
    },
    peerWeight: {
      min: Math.max(bounds.peerWeight.min, observed.peerWeight.min),
      max: Math.min(bounds.peerWeight.max, observed.peerWeight.max)
    },
    tauPeerSeconds: {
      min: Math.max(bounds.tauPeerSeconds.min, observed.tauPeerSeconds.min),
      max: Math.min(bounds.tauPeerSeconds.max, observed.tauPeerSeconds.max)
    }
  };
}

export function trainingCoverageForCandidate(
  params: AdaptiveCandidateParams,
  trainingRows: OptimizerTrainingRow[],
  bounds: OptimizerBounds
): TrainingCoverageDiagnostics {
  if (trainingRows.length === 0) {
    return { nearestDistance: 0, outsideEnvelope: false, outsideAxes: [] };
  }

  const candidateNorm = normalizeAdaptiveParams(
    params.baselineDrive,
    params.motionWeight,
    params.peerWeight,
    params.tauPeerSeconds,
    bounds
  );
  let nearestDistance = Infinity;
  for (const row of trainingRows) {
    const rowNorm = normalizeAdaptiveParams(
      row.baselineDrive,
      row.motionWeight,
      row.peerWeight,
      row.tauPeerSeconds,
      bounds
    );
    nearestDistance = Math.min(
      nearestDistance,
      Math.hypot(
        candidateNorm[0] - rowNorm[0],
        candidateNorm[1] - rowNorm[1],
        candidateNorm[2] - rowNorm[2],
        candidateNorm[3] - rowNorm[3]
      )
    );
  }

  const observed = observedTrainingBounds(trainingRows);
  const values = axisValues(params);
  const outsideAxes = observed
    ? AXES.filter((axis) => values[axis] < observed[axis].min || values[axis] > observed[axis].max)
    : [];

  return {
    nearestDistance: Number.isFinite(nearestDistance) ? nearestDistance : 0,
    outsideEnvelope: outsideAxes.length > 0,
    outsideAxes
  };
}
