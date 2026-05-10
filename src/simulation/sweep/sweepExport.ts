import type { SimulationConfig } from "../types";
import type { CandidatePick, SweepPolicyParams } from "./sweepCandidates";
import type { SweepRawRow, SweepResultBundle } from "./adaptiveBleSweep";
import type { SweepPolicySummary } from "./sweepCandidates";
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
  "kind",
  "scheduledScanIntervalSeconds",
  "scheduledScanWindowSeconds",
  "scheduledAdvIntervalSeconds",
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
        row.kind,
        row.scheduledScanIntervalSeconds ?? "",
        row.scheduledScanWindowSeconds ?? "",
        row.scheduledAdvIntervalSeconds ?? "",
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
  "kind",
  "adaptive_baselineDrive",
  "adaptive_motionWeight",
  "adaptive_peerWeight",
  "adaptive_tauPeerSeconds",
  "fixed_scanIntervalSeconds",
  "fixed_scanWindowSeconds",
  "fixed_advIntervalSeconds",
  "meanCaptureRate",
  "stdCaptureRate",
  "meanMahPerDay",
  "meanBleEfficiency",
  "meanRelativeCapture",
  "meanRelativeEnergy",
  "meanRelativeEfficiency",
  "seedsUsed",
  "isParetoEfficient"
] as const;

function summaryParamColumns(params: SweepPolicyParams | null): {
  bd: string;
  mw: string;
  pw: string;
  tau: string;
  scan: string;
  win: string;
  adv: string;
} {
  if (!params) {
    return { bd: "", mw: "", pw: "", tau: "", scan: "", win: "", adv: "" };
  }
  if (params.family === "adaptive") {
    return {
      bd: String(params.baselineDrive),
      mw: String(params.motionWeight),
      pw: String(params.peerWeight),
      tau: String(params.tauPeerSeconds),
      scan: "",
      win: "",
      adv: ""
    };
  }
  return {
    bd: "",
    mw: "",
    pw: "",
    tau: "",
    scan: String(params.scanIntervalSeconds),
    win: String(params.scanWindowSeconds),
    adv: String(params.advIntervalSeconds)
  };
}

/** Juxta baseline + all sweep summaries, sorted by mean BLE efficiency (matches UI table). */
function summariesRankedByEfficiency(bundle: SweepResultBundle): SweepPolicySummary[] {
  return [bundle.baselineSummary, ...bundle.summaries].sort(
    (a, b) => b.meanBleEfficiency - a.meanBleEfficiency
  );
}

export function serializeSweepSummaryCsv(bundle: SweepResultBundle): string {
  const ranked = summariesRankedByEfficiency(bundle);
  const lines = [SUMMARY_HEADERS.join(",")];

  for (let index = 0; index < ranked.length; index++) {
    const summary = ranked[index]!;
    const rank = index + 1;
    const c = summaryParamColumns(summary.params);
    lines.push(
      [
        rank,
        summary.policyId,
        summary.label,
        summary.kind,
        c.bd,
        c.mw,
        c.pw,
        c.tau,
        c.scan,
        c.win,
        c.adv,
        summary.meanCaptureRate,
        summary.stdCaptureRate ?? "",
        summary.meanMahPerDay,
        summary.meanBleEfficiency,
        summary.meanRelativeCapture,
        summary.meanRelativeEnergy,
        summary.meanRelativeEfficiency,
        summary.seedsUsed,
        summary.isParetoEfficient ? "true" : "false"
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

  lines.push("# BLE policy sweep report (fixed + adaptive)", "");
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

  lines.push("## 3. Top recommendations (efficiency leaders)", "");
  for (const pick of candidates) {
    const title = pick.role === "bestFixed" ? "Best fixed-rate (incl. Juxta 5.6 pool)" : "Best adaptive";
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
