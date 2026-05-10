import type { SweepResultBundle } from "../sweep/adaptiveBleSweep";
import type { OptimizerBounds } from "./bounds";
import type { OptimizerPipelineResult } from "./pipeline";
import type { PredictedPolicyCandidate } from "./types";
import type { RecommendationPick } from "./types";
import type { VerifiedCandidateResult } from "./types";

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const PRED_HEADERS = [
  "candidateId",
  "source",
  "sweepPolicyId",
  "baselineDrive",
  "motionWeight",
  "peerWeight",
  "tauPeerSeconds",
  "fixedScanIntervalSeconds",
  "fixedScanWindowSeconds",
  "fixedAdvIntervalSeconds",
  "predictedCaptureRate",
  "predictedMahPerDay",
  "predictedBleEfficiency",
  "predictedRelativeCapture",
  "predictedRelativeEnergy",
  "predictedRelativeEfficiency",
  "isPredictedPareto",
  "recommendationTags"
] as const;

export function serializeOptimizerPredictionsCsv(candidates: PredictedPolicyCandidate[]): string {
  const lines = [PRED_HEADERS.join(",")];
  for (const c of candidates) {
    lines.push(
      [
        c.candidateId,
        c.source,
        c.sweepPolicyId,
        c.baselineDrive,
        c.motionWeight,
        c.peerWeight,
        c.tauPeerSeconds,
        c.fixedScanIntervalSeconds ?? "",
        c.fixedScanWindowSeconds ?? "",
        c.fixedAdvIntervalSeconds ?? "",
        c.predictedCaptureRate,
        c.predictedMahPerDay,
        c.predictedBleEfficiency,
        c.predictedRelativeCapture,
        c.predictedRelativeEnergy,
        c.predictedRelativeEfficiency,
        c.isPredictedPareto,
        c.recommendationTags.join(";")
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

const REC_HEADERS = [
  "role",
  "label",
  "note",
  "candidateId",
  "source",
  "sweepPolicyId",
  "baselineDrive",
  "motionWeight",
  "peerWeight",
  "tauPeerSeconds",
  "predictedCaptureRate",
  "predictedMahPerDay",
  "predictedBleEfficiency",
  "predictedRelativeCapture",
  "predictedRelativeEnergy",
  "predictedRelativeEfficiency",
  "isPredictedPareto"
] as const;

export function serializeOptimizerRecommendationsCsv(picks: RecommendationPick[]): string {
  const lines = [REC_HEADERS.join(",")];
  for (const p of picks) {
    const c = p.candidate;
    lines.push(
      [
        p.role,
        p.label,
        p.note ?? "",
        c?.candidateId ?? "",
        c?.source ?? "",
        c?.sweepPolicyId ?? "",
        c?.baselineDrive ?? "",
        c?.motionWeight ?? "",
        c?.peerWeight ?? "",
        c?.tauPeerSeconds ?? "",
        c?.predictedCaptureRate ?? "",
        c?.predictedMahPerDay ?? "",
        c?.predictedBleEfficiency ?? "",
        c?.predictedRelativeCapture ?? "",
        c?.predictedRelativeEnergy ?? "",
        c?.predictedRelativeEfficiency ?? "",
        c?.isPredictedPareto ?? ""
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

const VER_HEADERS = [
  "candidateId",
  "recommendationRole",
  "predictedCaptureRate",
  "verifiedCaptureRate",
  "predictedMahPerDay",
  "verifiedMahPerDay",
  "predictedBleEfficiency",
  "verifiedBleEfficiency",
  "capturePredictionError",
  "energyPredictionError",
  "efficiencyPredictionError"
] as const;

export function serializeOptimizerVerificationCsv(rows: VerifiedCandidateResult[]): string {
  const lines = [VER_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.candidateId,
        r.recommendationRole,
        r.predictedCaptureRate,
        r.verifiedCaptureRate,
        r.predictedMahPerDay,
        r.verifiedMahPerDay,
        r.predictedBleEfficiency,
        r.verifiedBleEfficiency,
        r.capturePredictionError,
        r.energyPredictionError,
        r.efficiencyPredictionError
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

const CAP_WARN_ABS = 0.15;
const ENERGY_WARN_ABS = 0.5;

function verificationAgreementSummary(rows: VerifiedCandidateResult[]): string[] {
  if (rows.length === 0) {
    return [];
  }
  const out: string[] = [];
  let maxCap = 0;
  let maxEn = 0;
  let maxEff = 0;
  for (const r of rows) {
    maxCap = Math.max(maxCap, Math.abs(r.capturePredictionError));
    maxEn = Math.max(maxEn, Math.abs(r.energyPredictionError));
    maxEff = Math.max(maxEff, Math.abs(r.efficiencyPredictionError));
  }
  out.push(`- Largest |Δ capture| across roles: ${maxCap.toFixed(4)}`);
  out.push(`- Largest |Δ mAh/day| across roles: ${maxEn.toFixed(4)}`);
  out.push(`- Largest |Δ efficiency| across roles: ${maxEff.toFixed(4)}`);
  if (maxCap > CAP_WARN_ABS || maxEn > ENERGY_WARN_ABS) {
    out.push(
      `- **Warning:** at least one role exceeds typical sanity bands (|Δ capture| > ${CAP_WARN_ABS} and/or |Δ mAh/day| > ${ENERGY_WARN_ABS}). Surrogate predictions are directional; lean on verification and domain checks.`
    );
  }
  return out;
}

export type OptimizerMarkdownInput = {
  bundle: SweepResultBundle;
  pipeline: OptimizerPipelineResult;
  bounds: OptimizerBounds;
  candidateCount: number;
  optimizerSeed: string;
  verification?: VerifiedCandidateResult[];
};

export function buildOptimizerMarkdownReport(input: OptimizerMarkdownInput): string {
  const { bundle, pipeline, bounds } = input;
  const m = pipeline.model;
  const lines: string[] = [];

  lines.push("# Policy optimizer report");
  lines.push("");
  lines.push("## Sweep source");
  lines.push(`- Mode: ${bundle.mode}`);
  lines.push(`- Seeds used: ${bundle.seedsUsed.join(", ")}`);
  lines.push(`- Summary rows: ${bundle.summaries.length}`);
  lines.push(`- Raw rows: ${bundle.rawRows.length}`);
  lines.push(`- Baseline policy: ${bundle.baselineSummary.policyId} (${bundle.baselineSummary.label})`);
  lines.push("");
  lines.push("## Model fit");
  lines.push(`- Training adaptive rows: ${pipeline.trainingRowCount}`);
  lines.push(`- Feature count: ${m.featureCount}`);
  lines.push(`- Ridge lambda: ${m.ridgeLambda}`);
  lines.push(`- R² capture: ${m.captureR2.toFixed(6)}`);
  lines.push(`- R² energy (mAh/day): ${m.energyR2.toFixed(6)}`);
  lines.push("");
  lines.push("## Candidate generation");
  lines.push(`- Seed: ${input.optimizerSeed}`);
  lines.push(`- Candidate count: ${input.candidateCount}`);
  lines.push(`- baselineDrive: [${bounds.baselineDrive.min}, ${bounds.baselineDrive.max}]`);
  lines.push(`- motionWeight: [${bounds.motionWeight.min}, ${bounds.motionWeight.max}]`);
  lines.push(`- peerWeight: [${bounds.peerWeight.min}, ${bounds.peerWeight.max}]`);
  lines.push(`- tauPeerSeconds (log-uniform): [${bounds.tauPeerSeconds.min}, ${bounds.tauPeerSeconds.max}]`);
  lines.push("");
  lines.push("## Recommended candidates");
  for (const p of pipeline.recommendations.picks) {
    lines.push(`### ${p.label}`);
    if (p.note) {
      lines.push(`- Note: ${p.note}`);
    }
    const c = p.candidate;
    if (!c) {
      lines.push("- *(none)*");
      continue;
    }
    lines.push(`- candidateId: ${c.candidateId}`);
    lines.push(`- source: ${c.source}; sweepPolicyId: ${c.sweepPolicyId}`);
    if (c.source === "observed_fixed") {
      const fs = c.fixedScanIntervalSeconds;
      const fw = c.fixedScanWindowSeconds;
      const fa = c.fixedAdvIntervalSeconds;
      if (fs != null && fw != null && fa != null) {
        lines.push(`- Fixed schedule (s): scanInterval=${fs}, scanWindow=${fw}, advertiseInterval=${fa}`);
      }
    }
    lines.push(`- Params: baselineDrive=${c.baselineDrive}, motionWeight=${c.motionWeight}, peerWeight=${c.peerWeight}, tauPeerSeconds=${c.tauPeerSeconds}`);
    lines.push(`- Predicted capture: ${c.predictedCaptureRate.toFixed(6)}, mAh/day: ${c.predictedMahPerDay.toFixed(6)}, efficiency: ${c.predictedBleEfficiency.toFixed(6)}`);
  }
  lines.push("");
  if (input.verification && input.verification.length > 0) {
    lines.push("## Verification (per recommendation role)");
    for (const v of input.verification) {
      lines.push(`- **${v.recommendationRole}** (${v.candidateId}): predicted capture ${v.predictedCaptureRate.toFixed(4)} → verified ${v.verifiedCaptureRate.toFixed(4)}; mAh/day ${v.predictedMahPerDay.toFixed(4)} → ${v.verifiedMahPerDay.toFixed(4)}`);
    }
    lines.push("");
    lines.push("### Prediction vs verification agreement");
    for (const line of verificationAgreementSummary(input.verification)) {
      lines.push(line);
    }
    lines.push("");
  }
  lines.push("## Caveats and notes");
  lines.push(
    "- The optimizer fits an empirical model to completed simulation sweeps. Recommendations may be **predicted_adaptive** (surrogate) or **observed_fixed** (from the sweep table, including the Juxta baseline when selected). None are final firmware settings — verify in simulation and on hardware before deployment."
  );
  lines.push(
    "- The model is trained under the current movement, sociality, radio, and energy assumptions. Changing species, enclosure, detection radius, or energy model may change the recommended policy."
  );
  lines.push(
    "- Sweep report rows may average multiple seeds; automatic verification and the Simulator use the current built world and a single seed."
  );
  lines.push("");

  return lines.join("\n");
}
