import { bleBaselinePresetDefForSweep, buildAdaptiveAnchorsFromBaseline } from "../blePolicyPresets";
import { getHardwareEnergyProfile } from "../hardwareEnergyProfiles";
import type { SimulationConfig } from "../types";
import type { CandidatePick, SweepPolicyParams } from "./sweepCandidates";
import type { SweepRawRow, SweepResultBundle } from "./adaptiveBleSweep";
import type { SweepPolicySummary } from "./sweepCandidates";
import { SWEEP_HELD_ADAPTIVE } from "./adaptiveBleSweep";

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
  "scheduledAdvertisingBurstDurationSeconds",
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
        row.scheduledAdvertisingBurstDurationSeconds ?? "",
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

/** Comparison baseline + all sweep summaries, sorted by mean BLE efficiency (matches UI table). */
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
  const presetDef = bleBaselinePresetDefForSweep(baseConfig);
  const anchors = buildAdaptiveAnchorsFromBaseline(presetDef);
  const hwLabel =
    getHardwareEnergyProfile(baseConfig.hardwareEnergyProfileId)?.label ?? baseConfig.hardwareEnergyProfileId;

  lines.push("# BLE policy sweep report (fixed + adaptive)", "");
  lines.push("## 1. Simulation settings", "");
  lines.push(`- Simulation length: ${baseConfig.simulationLengthSeconds}s`);
  lines.push(`- Time step: ${baseConfig.timeStepSeconds}s`);
  lines.push(`- Animal count: ${baseConfig.animalCount}`);
  lines.push(`- Species preset: ${baseConfig.speciesPresetId}`);
  lines.push(`- Enclosure: ${baseConfig.enclosure.width}×${baseConfig.enclosure.height} m`);
  lines.push(`- Detection radius: ${baseConfig.radio.detectionRadiusMeters} m`);
  lines.push(`- Seeds: ${bundle.seedsUsed.join(", ")}`);
  lines.push(`- Comparison BLE baseline: **${presetDef.label}** (\`${presetDef.id}\`)`);
  lines.push(`- Hardware energy profile: **${hwLabel}** (\`${baseConfig.hardwareEnergyProfileId}\`)`);
  lines.push(
    `- Mode: ${
      bundle.mode === "fast"
        ? "Fast preview (current seed)"
        : `Report — aggregated across seeds: ${bundle.seedsUsed.join(", ")}`
    }`
  );
  if (presetDef.id === "general-discovery") {
    lines.push(
      "- Note: The default BLE policy is asymmetric because scan/advertise overlap drives proximity capture. Frequent advertising gives scanning collars more opportunities to detect nearby peers."
    );
  }
  if (presetDef.id === "symmetric-example") {
    lines.push(
      "- Warning: The selected baseline is symmetric and may not represent an efficient discovery schedule."
    );
  }
  lines.push("");
  lines.push("### Comparison baseline schedule");
  lines.push(
    `- Scan ${presetDef.scanIntervalSeconds}s interval / ${presetDef.scanWindowSeconds}s window / ${presetDef.advIntervalSeconds}s advertise / ${presetDef.advertisingBurstDurationSeconds}s burst`
  );
  lines.push("");
  lines.push("### Adaptive timing anchors (held)");
  lines.push(
    `- Low: scan ${anchors.lowIntensity.scanIntervalSeconds}s / window ${anchors.lowIntensity.scanWindowSeconds}s / adv ${anchors.lowIntensity.advIntervalSeconds}s`
  );
  lines.push(
    `- Neutral: ${anchors.neutral.scanIntervalSeconds}s / ${anchors.neutral.scanWindowSeconds}s / ${anchors.neutral.advIntervalSeconds}s`
  );
  lines.push(
    `- High: ${anchors.highIntensity.scanIntervalSeconds}s / ${anchors.highIntensity.scanWindowSeconds}s / ${anchors.highIntensity.advIntervalSeconds}s`
  );
  lines.push(`- Burst (anchors): ${anchors.advertisingBurstDurationSeconds}s`);
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
    const title =
      pick.role === "bestFixed" ? "Best fixed-rate (incl. comparison baseline pool)" : "Best adaptive";
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
