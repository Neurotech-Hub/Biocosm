import type {
  PredictedPolicyCandidate,
  RecommendationPick,
  RecommendationRole,
  RecommendationSet
} from "./types";

function tagCandidate(candidate: PredictedPolicyCandidate, tag: string): void {
  if (!candidate.recommendationTags.includes(tag)) {
    candidate.recommendationTags.push(tag);
  }
}

export function computeRecommendations(candidates: PredictedPolicyCandidate[]): RecommendationSet {
  if (candidates.length === 0) {
    return {
      picks: [
        rolePick("energySaving", "Energy-saving", null, "No candidates generated."),
        rolePick("balanced", "Balanced", null, "No candidates generated."),
        rolePick("highCapture", "High capture", null, "No candidates generated."),
        rolePick("maxEfficiency", "Max efficiency", null, "No candidates generated."),
        rolePick("paretoKnee", "Pareto knee", null, "No candidates generated.")
      ]
    };
  }

  const picks: RecommendationPick[] = [];

  // §10.1 Energy-saving
  const esEligible = candidates.filter(
    (c) => c.predictedRelativeEnergy < 1 && c.predictedRelativeCapture >= 0.9
  );
  let esPick: PredictedPolicyCandidate | null = null;
  let esNote: string | undefined;
  if (esEligible.length > 0) {
    esPick = esEligible.reduce((a, b) =>
      a.predictedRelativeEnergy <= b.predictedRelativeEnergy ? a : b
    );
  } else {
    esPick = candidates.reduce((a, b) =>
      a.predictedRelativeCapture >= b.predictedRelativeCapture ? a : b
    );
    esNote = "No candidate met the 90% capture-retention threshold.";
  }
  if (esPick) {
    tagCandidate(esPick, "Energy-saving");
  }
  picks.push(rolePick("energySaving", "Energy-saving", esPick, esNote));

  // §10.2 Balanced
  const balEligible = candidates.filter(
    (c) => c.predictedRelativeCapture >= 1 && c.predictedRelativeEnergy <= 1.15
  );
  let balPick: PredictedPolicyCandidate | null = null;
  let balNote: string | undefined;
  if (balEligible.length > 0) {
    balPick = balEligible.reduce((a, b) =>
      a.predictedBleEfficiency >= b.predictedBleEfficiency ? a : b
    );
  } else {
    const fallback = candidates.filter((c) => c.predictedRelativeCapture >= 0.9);
    const pool = fallback.length > 0 ? fallback : candidates;
    balPick = pool.reduce((a, b) =>
      a.predictedBleEfficiency >= b.predictedBleEfficiency ? a : b
    );
    balNote =
      balEligible.length === 0 && fallback.length > 0
        ? "No candidate met balanced thresholds; showing best efficiency among ≥90% relative capture."
        : undefined;
  }
  if (balPick) {
    tagCandidate(balPick, "Balanced");
  }
  picks.push(rolePick("balanced", "Balanced", balPick, balNote));

  // §10.3 High capture
  const hiPick = candidates.reduce((a, b) =>
    a.predictedCaptureRate >= b.predictedCaptureRate ? a : b
  );
  tagCandidate(hiPick, "High capture");
  picks.push(rolePick("highCapture", "High capture", hiPick));

  // §10.4 Max efficiency
  const meEligible = candidates.filter((c) => c.predictedRelativeCapture >= 0.8);
  const mePool = meEligible.length > 0 ? meEligible : candidates;
  const mePick = mePool.reduce((a, b) =>
    a.predictedBleEfficiency >= b.predictedBleEfficiency ? a : b
  );
  tagCandidate(mePick, "Max efficiency");
  picks.push(rolePick("maxEfficiency", "Max efficiency", mePick));

  // §10.5 Pareto knee
  const pareto = candidates.filter((c) => c.isPredictedPareto);
  let kneePick: PredictedPolicyCandidate | null = null;
  if (pareto.length === 1) {
    kneePick = pareto[0]!;
  } else if (pareto.length > 1) {
    const relEns = pareto.map((c) => c.predictedRelativeEnergy);
    const relCaps = pareto.map((c) => c.predictedRelativeCapture);
    const minE = Math.min(...relEns);
    const maxE = Math.max(...relEns);
    const minC = Math.min(...relCaps);
    const maxC = Math.max(...relCaps);
    const denE = maxE - minE;
    const denC = maxC - minC;
    let best: PredictedPolicyCandidate | null = null;
    let bestDist = Infinity;
    for (const c of pareto) {
      const normE =
        denE > 1e-18 ? (c.predictedRelativeEnergy - minE) / denE : 0;
      const normC =
        denC > 1e-18 ? (c.predictedRelativeCapture - minC) / denC : 0.5;
      const dist = Math.hypot(normE - 0, normC - 1);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    kneePick = best;
  }
  if (kneePick) {
    tagCandidate(kneePick, "Pareto knee");
  }
  picks.push(
    rolePick(
      "paretoKnee",
      "Pareto knee",
      kneePick,
      pareto.length === 0 ? "No predicted Pareto points." : undefined
    )
  );

  return { picks };
}

function rolePick(
  role: RecommendationRole,
  label: string,
  candidate: PredictedPolicyCandidate | null,
  note?: string
): RecommendationPick {
  return { role, label, candidate, note };
}
