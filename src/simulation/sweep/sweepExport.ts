import type { SimulationConfig } from "../types";
import type { CandidatePick } from "./sweepCandidates";
import type { SweepRawRow, SweepResultBundle } from "./adaptiveBleSweep";
import {
  ADAPTIVE_SWEEP_TIMING_ANCHORS,
  SWEEP_HELD_ADAPTIVE,
  SWEEP_REPORT_SEEDS
} from "./adaptiveBleSweep";

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

const RAW_HEADERS = [
  "policyId",
  "seed",
  "baselineDrive",
  "motionWeight",
  "peerWeight",
  "tauPeerSeconds",
  "tauMotionSeconds",
  "motionGain",
  "peerGain",
  "peerMissPenalty",
  "allowEnergySavingDownscale",
  "captureRate",
  "mAhPerDay",
  "bleEfficiency",
  "relativeCapture",
  "relativeEnergy",
  "relativeEfficiency",
  "opportunityEpochs",
  "hitEpochs",
  "missedEpochs",
  "meanSamplingDrive",
  "percentTimeBelowFixed",
  "percentTimeNearFixed",
  "percentTimeAboveFixed",
  "meanScanIntervalSeconds",
  "meanScanWindowSeconds",
  "meanAdvIntervalSeconds"
] as const;

export function serializeSweepRawCsv(rows: SweepRawRow[]): string {
  const lines = [RAW_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.policyId,
        row.seed,
        row.baselineDrive ?? "",
        row.motionWeight ?? "",
        row.peerWeight ?? "",
        row.tauPeerSeconds ?? "",
        row.tauMotionSeconds,
        row.motionGain,
        row.peerGain,
        row.peerMissPenalty,
        row.allowEnergySavingDownscale,
        row.captureRate,
        row.mAhPerDay,
        row.bleEfficiency,
        row.relativeCapture,
        row.relativeEnergy,
        row.relativeEfficiency,
        row.opportunityEpochs,
        row.hitEpochs,
        row.missedEpochs,
        row.meanSamplingDrive ?? "",
        row.percentTimeBelowFixed ?? "",
        row.percentTimeNearFixed ?? "",
        row.percentTimeAboveFixed ?? "",
        row.meanScanIntervalSeconds,
        row.meanScanWindowSeconds,
        row.meanAdvIntervalSeconds
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

const SUMMARY_HEADERS = [
  "rank",
  "policyId",
  "label",
  "baselineDrive",
  "motionWeight",
  "peerWeight",
  "tauPeerSeconds",
  "meanCaptureRate",
  "stdCaptureRate",
  "meanMahPerDay",
  "meanBleEfficiency",
  "meanRelativeCapture",
  "meanRelativeEnergy",
  "meanRelativeEfficiency",
  "seedsUsed"
] as const;

export function serializeSweepSummaryCsv(
  bundle: SweepResultBundle,
  rankedAdaptiveIds: string[]
): string {
  const rankById = new Map(rankedAdaptiveIds.map((id, index) => [id, index + 1]));
  const lines = [SUMMARY_HEADERS.join(",")];

  const baselineRow = bundle.baselineSummary;
  lines.push(
    [
      "—",
      baselineRow.policyId,
      baselineRow.label,
      "",
      "",
      "",
      "",
      baselineRow.meanCaptureRate,
      baselineRow.stdCaptureRate ?? "",
      baselineRow.meanMahPerDay,
      baselineRow.meanBleEfficiency,
      baselineRow.meanRelativeCapture,
      baselineRow.meanRelativeEnergy,
      baselineRow.meanRelativeEfficiency,
      baselineRow.seedsUsed
    ]
      .map(csvEscape)
      .join(",")
  );

  for (const summary of bundle.summaries) {
    const rank = rankById.get(summary.policyId) ?? "";
    const p = summary.params;
    lines.push(
      [
        rank,
        summary.policyId,
        summary.label,
        p?.baselineDrive ?? "",
        p?.motionWeight ?? "",
        p?.peerWeight ?? "",
        p?.tauPeerSeconds ?? "",
        summary.meanCaptureRate,
        summary.stdCaptureRate ?? "",
        summary.meanMahPerDay,
        summary.meanBleEfficiency,
        summary.meanRelativeCapture,
        summary.meanRelativeEnergy,
        summary.meanRelativeEfficiency,
        summary.seedsUsed
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  return lines.join("\n");
}

export function buildSweepMarkdownReport(options: {
  baseConfig: SimulationConfig;
  bundle: SweepResultBundle;
  candidates: CandidatePick[];
}): string {
  const { baseConfig, bundle, candidates } = options;
  const lines: string[] = [];

  lines.push("# Adaptive BLE Policy Sweep Report", "");
  lines.push("## 1. Simulation settings", "");
  lines.push(`- Simulation length: ${baseConfig.simulationLengthSeconds}s`);
  lines.push(`- Time step: ${baseConfig.timeStepSeconds}s`);
  lines.push(`- Animal count: ${baseConfig.animalCount}`);
  lines.push(`- Species preset: ${baseConfig.speciesPresetId}`);
  lines.push(`- Enclosure: ${baseConfig.enclosure.width}×${baseConfig.enclosure.height} m`);
  lines.push(`- Detection radius: ${baseConfig.radio.detectionRadiusMeters} m`);
  lines.push(`- Seeds: ${bundle.seedsUsed.join(", ")}`);
  lines.push(`- Mode: ${bundle.mode === "fast" ? "Fast preview (current seed)" : `Report (${SWEEP_REPORT_SEEDS.join(", ")})`}`);
  lines.push("");
  lines.push("### Fixed baseline (sweep reference)");
  lines.push(`- Scan ${juxtaTimingSnippet()}`);
  lines.push("");
  lines.push("### Adaptive timing anchors (held)");
  lines.push(`- Low: scan ${ADAPTIVE_SWEEP_TIMING_ANCHORS.lowIntensity.scanIntervalSeconds}s / window ${ADAPTIVE_SWEEP_TIMING_ANCHORS.lowIntensity.scanWindowSeconds}s / adv ${ADAPTIVE_SWEEP_TIMING_ANCHORS.lowIntensity.advIntervalSeconds}s`);
  lines.push(`- Neutral: ${ADAPTIVE_SWEEP_TIMING_ANCHORS.neutral.scanIntervalSeconds}s / ${ADAPTIVE_SWEEP_TIMING_ANCHORS.neutral.scanWindowSeconds}s / ${ADAPTIVE_SWEEP_TIMING_ANCHORS.neutral.advIntervalSeconds}s`);
  lines.push(`- High: ${ADAPTIVE_SWEEP_TIMING_ANCHORS.highIntensity.scanIntervalSeconds}s / ${ADAPTIVE_SWEEP_TIMING_ANCHORS.highIntensity.scanWindowSeconds}s / ${ADAPTIVE_SWEEP_TIMING_ANCHORS.highIntensity.advIntervalSeconds}s`);
  lines.push(`- Held: τ motion ${SWEEP_HELD_ADAPTIVE.tauMotionSeconds}s, motion gain ${SWEEP_HELD_ADAPTIVE.motionGain}, peer gain ${SWEEP_HELD_ADAPTIVE.peerGain}, peer penalty ${SWEEP_HELD_ADAPTIVE.peerMissPenalty}, downscale ${SWEEP_HELD_ADAPTIVE.allowEnergySavingDownscale}`);
  lines.push("");

  lines.push("## 2. Fixed-rate baseline", "");
  const b = bundle.baselineSummary;
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| BLE capture rate | ${b.meanCaptureRate.toFixed(4)} |`);
  lines.push(`| mAh/day | ${b.meanMahPerDay.toFixed(4)} |`);
  lines.push(`| BLE efficiency (rate / mAh·day⁻¹) | ${b.meanBleEfficiency.toFixed(4)} |`);
  lines.push("");

  lines.push("## 3. Top recommendations", "");
  for (const pick of candidates) {
    const title =
      pick.role === "energySaving"
        ? "Energy-saving candidate"
        : pick.role === "balanced"
          ? "Balanced candidate"
          : "High-capture candidate";
    lines.push(`### ${title}`);
    if (!pick.summary) {
      lines.push("*No policy selected.*", "");
      continue;
    }
    const s = pick.summary;
    lines.push(`- Policy: \`${s.policyId}\``);
    lines.push(`- Mean capture: ${s.meanCaptureRate.toFixed(4)} (rel ${s.meanRelativeCapture.toFixed(3)})`);
    lines.push(`- Mean mAh/day: ${s.meanMahPerDay.toFixed(4)} (rel energy ${s.meanRelativeEnergy.toFixed(3)})`);
    lines.push(`- Meets threshold: ${pick.meetsThreshold ? "yes" : "no"}`);
    if (pick.note) {
      lines.push(`- Note: ${pick.note}`);
    }
    lines.push("");
  }

  lines.push("## 4. Notes and caveats", "");
  lines.push(
    "This is a direction-setting sweep, not a final firmware optimizer. Results depend on movement, social, and radio assumptions. BLE efficiency should not be interpreted without the capture-rate threshold. Adaptive policy uses the same capture-rate metric as fixed-rate mode."
  );
  lines.push("");

  lines.push("## 5. Export", "");
  lines.push("Use the UI to download raw CSV (per seed), summary CSV, and machine-readable tables.");

  return lines.join("\n");
}

function juxtaTimingSnippet(): string {
  return "20s interval / 1.5s window / 5s advertise / 2s burst (Juxta-style)";
}
