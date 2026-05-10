import { computeMetrics } from "../analysis";
import { juxtaMainCMode0FixedPolicy } from "../config";
import { mergeLogs, runSimulationToEnd, stepSimulation } from "../engine";
import type {
  FirmwarePolicyConfig,
  FixedPolicyConfig,
  MotionPeerAdaptivePolicyConfig,
  SimulationConfig,
  SimulationLogs,
  SimulationState
} from "../types";
import { createInitialSimulation } from "../world";
import {
  computeMeanCollarTimingsFromTimeline,
  computeSamplingDriveDistribution
} from "./samplingDriveStats";
import {
  attachParetoEfficiency,
  pickSweepCandidates,
  type CandidatePick,
  type SweepPolicyParams,
  type SweepPolicySummary
} from "./sweepCandidates";

/** Spec §5 — first-pass sweep timing anchors (differs slightly from defaultAdaptivePolicy low/high). */
export const ADAPTIVE_SWEEP_TIMING_ANCHORS: MotionPeerAdaptivePolicyConfig["timingAnchors"] = {
  lowIntensity: {
    scanIntervalSeconds: 60,
    scanWindowSeconds: 0.75,
    advIntervalSeconds: 15
  },
  neutral: {
    scanIntervalSeconds: 20,
    scanWindowSeconds: 1.5,
    advIntervalSeconds: 5
  },
  highIntensity: {
    scanIntervalSeconds: 5,
    scanWindowSeconds: 3,
    advIntervalSeconds: 1.5
  },
  advertisingBurstDurationSeconds: 2
};

/** Spec §7 held constants for sweep runs. */
export const SWEEP_HELD_ADAPTIVE = {
  tauMotionSeconds: 120,
  motionGain: 0.35,
  peerGain: 0.5,
  peerMissPenalty: 0.25,
  allowEnergySavingDownscale: true,
  peerDetectionCountSaturation: 1,
  motionEventCountSaturation: 1
} as const;

/**
 * Full exploratory grid — brackets Juxta-neutral: low-duty savings, mid, and aggressive upscale (5×3×3×2 = **90** per seed).
 * Enable at build time with `VITE_SWEEP_FULL_GRID=true` (see sweep settings info popover in the UI).
 */
export const SWEEP_FULL_BASELINE_DRIVES = [0.08, 0.2, 0.32, 0.42, 0.5] as const;
export const SWEEP_FULL_MOTION_WEIGHTS = [0.15, 0.35, 0.55] as const;
export const SWEEP_FULL_PEER_WEIGHTS = [0.25, 0.5, 0.85] as const;
export const SWEEP_FULL_TAU_PEER_SECONDS = [120, 600] as const;

/**
 * Quick grid — same 3×2×2×2 = **24** cells: includes both energy-down and capture-up corners vs fixed Juxta.
 * (Prior revision skewed all weights low, clustering adaptives southwest of baseline on capture vs mAh.)
 */
export const SWEEP_QUICK_BASELINE_DRIVES = [0.12, 0.28, 0.45] as const;
export const SWEEP_QUICK_MOTION_WEIGHTS = [0.22, 0.5] as const;
export const SWEEP_QUICK_PEER_WEIGHTS = [0.35, 0.6, 0.85] as const;
export const SWEEP_QUICK_TAU_PEER_SECONDS = [120, 300, 600] as const;

/**
 * Fixed-rate sweep: **scan interval × advertise interval × scan window**; `advertisingBurstDurationSeconds` held at 2 s.
 * Juxta 5.6 (20s scan / 1.5s window / 5s **advertise interval**) is always in the grid.
 */
export const SWEEP_FIXED_BURST_SECONDS = 2 as const;
export const SWEEP_QUICK_FIXED_SCAN_INTERVALS = [10, 20, 40] as const;
export const SWEEP_QUICK_FIXED_ADV_INTERVALS = [5, 10, 15] as const;
export const SWEEP_QUICK_FIXED_SCAN_WINDOWS = [1.0, 1.5, 2.5] as const;

export const SWEEP_FULL_FIXED_SCAN_INTERVALS = [5, 10, 15, 20, 30] as const;
export const SWEEP_FULL_FIXED_ADV_INTERVALS = [5, 10, 15, 20] as const;
export const SWEEP_FULL_FIXED_SCAN_WINDOWS = [0.5, 1.0, 1.5, 2.0, 2.5] as const;

/** When true, uses the full exploratory grid; otherwise the quick testing grid (default). */
export function isFullSweepGrid(): boolean {
  return import.meta.env.VITE_SWEEP_FULL_GRID === "true";
}

/** Quick vs full Cartesian grids (same shapes as build-flag quick/full). */
export type SweepGridVariant = "quick" | "full";

export function defaultSweepGridVariant(): SweepGridVariant {
  return isFullSweepGrid() ? "full" : "quick";
}

function resolveGridVariant(variant?: SweepGridVariant): SweepGridVariant {
  return variant ?? defaultSweepGridVariant();
}

type SweepAxes = {
  baselineDrives: readonly number[];
  motionWeights: readonly number[];
  peerWeights: readonly number[];
  tauPeerSeconds: readonly number[];
};

export type FixedSweepAxes = {
  scanIntervals: readonly number[];
  advIntervals: readonly number[];
  scanWindows: readonly number[];
};

export function getFixedSweepAxes(variant?: SweepGridVariant): FixedSweepAxes {
  const v = resolveGridVariant(variant);
  if (v === "full") {
    return {
      scanIntervals: SWEEP_FULL_FIXED_SCAN_INTERVALS,
      advIntervals: SWEEP_FULL_FIXED_ADV_INTERVALS,
      scanWindows: SWEEP_FULL_FIXED_SCAN_WINDOWS
    };
  }
  return {
    scanIntervals: SWEEP_QUICK_FIXED_SCAN_INTERVALS,
    advIntervals: SWEEP_QUICK_FIXED_ADV_INTERVALS,
    scanWindows: SWEEP_QUICK_FIXED_SCAN_WINDOWS
  };
}

export function getSweepAxes(variant?: SweepGridVariant): SweepAxes {
  const v = resolveGridVariant(variant);
  if (v === "full") {
    return {
      baselineDrives: SWEEP_FULL_BASELINE_DRIVES,
      motionWeights: SWEEP_FULL_MOTION_WEIGHTS,
      peerWeights: SWEEP_FULL_PEER_WEIGHTS,
      tauPeerSeconds: SWEEP_FULL_TAU_PEER_SECONDS
    };
  }
  return {
    baselineDrives: SWEEP_QUICK_BASELINE_DRIVES,
    motionWeights: SWEEP_QUICK_MOTION_WEIGHTS,
    peerWeights: SWEEP_QUICK_PEER_WEIGHTS,
    tauPeerSeconds: SWEEP_QUICK_TAU_PEER_SECONDS
  };
}

/** Number of adaptive policies in the active grid (54 quick, 90 full). */
export function adaptiveSweepPolicyCount(variant?: SweepGridVariant): number {
  const axes = getSweepAxes(variant);
  return (
    axes.baselineDrives.length *
    axes.motionWeights.length *
    axes.peerWeights.length *
    axes.tauPeerSeconds.length
  );
}

/** Number of fixed-rate policies per seed (includes Juxta 5.6 as baseline reference). */
export function fixedSweepPolicyCount(variant?: SweepGridVariant): number {
  const ax = getFixedSweepAxes(variant);
  return ax.scanIntervals.length * ax.advIntervals.length * ax.scanWindows.length;
}

/** Policies per seed: full fixed grid + adaptive grid. */
export function policiesPerSweepSeed(variant?: SweepGridVariant): number {
  return fixedSweepPolicyCount(variant) + adaptiveSweepPolicyCount(variant);
}

/** Pool for report mode; first N used when report seed count is N (1–5). */
export const SWEEP_REPORT_SEED_POOL = ["101", "202", "303", "404", "505"] as const;

export const DEFAULT_REPORT_SEED_COUNT = 3;

/** First `count` seeds from the report pool (clamped 1–5). */
export function reportSeedsForCount(count: number): string[] {
  const n = Math.min(5, Math.max(1, Math.floor(count)));
  return Array.from(SWEEP_REPORT_SEED_POOL.slice(0, n));
}

/** @deprecated Use reportSeedsForCount(DEFAULT_REPORT_SEED_COUNT); kept for callers expecting three seeds. */
export const SWEEP_REPORT_SEEDS = ["101", "202", "303"] as const;

export type BuildSweepTrialsOptions = {
  gridVariant?: SweepGridVariant;
  /** Report mode only; default 3 (101, 202, 303). */
  reportSeedCount?: number;
};

/** Total simulation runs (fixed + adaptive trials) for the selected seeds and grid. */
export function sweepTrialCount(mode: "fast" | "report", options?: BuildSweepTrialsOptions): number {
  const variant = resolveGridVariant(options?.gridVariant);
  const perSeed = policiesPerSweepSeed(variant);
  const seedRows =
    mode === "fast"
      ? 1
      : reportSeedsForCount(options?.reportSeedCount ?? DEFAULT_REPORT_SEED_COUNT).length;
  return seedRows * perSeed;
}
export const SWEEP_BASELINE_POLICY_ID = "sweep-baseline-juxta-fixed";

export type SweepPolicyKind = "baseline_fixed" | "fixed_sweep" | "adaptive";

export type SweepTrial = {
  policyId: string;
  kind: SweepPolicyKind;
  seed: string;
  policy: FirmwarePolicyConfig;
};

export type SweepRawRow = {
  policyId: string;
  kind: SweepPolicyKind;
  seed: string;
  /** Configured schedule for fixed policies; null for adaptive. */
  scheduledScanIntervalSeconds: number | null;
  scheduledScanWindowSeconds: number | null;
  scheduledAdvIntervalSeconds: number | null;
  baselineDrive: number | null;
  motionWeight: number | null;
  peerWeight: number | null;
  tauPeerSeconds: number | null;
  tauMotionSeconds: number;
  motionGain: number;
  peerGain: number;
  peerMissPenalty: number;
  allowEnergySavingDownscale: boolean;
  captureRate: number;
  mAhPerDay: number;
  bleEfficiency: number;
  relativeCapture: number;
  relativeEnergy: number;
  relativeEfficiency: number;
  opportunityEpochs: number;
  hitEpochs: number;
  missedEpochs: number;
  meanSamplingDrive: number | null;
  percentTimeBelowFixed: number | null;
  percentTimeNearFixed: number | null;
  percentTimeAboveFixed: number | null;
  meanScanIntervalSeconds: number;
  meanScanWindowSeconds: number;
  meanAdvIntervalSeconds: number;
};

export type SweepResultBundle = {
  rawRows: SweepRawRow[];
  summaries: SweepPolicySummary[];
  baselineSummary: SweepPolicySummary;
  seedsUsed: string[];
  mode: "fast" | "report";
};

export type SweepBundleWithCandidates = SweepResultBundle & { candidates: CandidatePick[] };

export function sweepAdaptivePolicyFromGrid(
  baselineDrive: number,
  motionWeight: number,
  peerWeight: number,
  tauPeerSeconds: number
): MotionPeerAdaptivePolicyConfig {
  const id = `sweep-adaptive-bd${baselineDrive}-mw${motionWeight}-pw${peerWeight}-tau${tauPeerSeconds}`;
  return {
    id,
    type: "motion_peer_adaptive",
    name: "Adaptive sweep trial",
    timingAnchors: {
      lowIntensity: { ...ADAPTIVE_SWEEP_TIMING_ANCHORS.lowIntensity },
      neutral: { ...ADAPTIVE_SWEEP_TIMING_ANCHORS.neutral },
      highIntensity: { ...ADAPTIVE_SWEEP_TIMING_ANCHORS.highIntensity },
      advertisingBurstDurationSeconds: ADAPTIVE_SWEEP_TIMING_ANCHORS.advertisingBurstDurationSeconds
    },
    baselineDrive,
    motionWeight,
    peerWeight,
    tauPeerSeconds,
    ...SWEEP_HELD_ADAPTIVE
  };
}

export function buildSweepGridPolicies(variant?: SweepGridVariant): MotionPeerAdaptivePolicyConfig[] {
  const axes = getSweepAxes(variant);
  const policies: MotionPeerAdaptivePolicyConfig[] = [];
  for (const baselineDrive of axes.baselineDrives) {
    for (const motionWeight of axes.motionWeights) {
      for (const peerWeight of axes.peerWeights) {
        for (const tauPeerSeconds of axes.tauPeerSeconds) {
          policies.push(sweepAdaptivePolicyFromGrid(baselineDrive, motionWeight, peerWeight, tauPeerSeconds));
        }
      }
    }
  }
  return policies;
}

function isJuxta56Schedule(
  scanIntervalSeconds: number,
  advIntervalSeconds: number,
  scanWindowSeconds: number
): boolean {
  return (
    scanIntervalSeconds === juxtaMainCMode0FixedPolicy.scanIntervalSeconds &&
    advIntervalSeconds === juxtaMainCMode0FixedPolicy.advIntervalSeconds &&
    scanWindowSeconds === juxtaMainCMode0FixedPolicy.scanWindowSeconds
  );
}

/** One entry per fixed-rate combo in the active grid; Juxta 5.6 is tagged `baseline_fixed`. */
export function buildFixedSweepTrialDefs(variant?: SweepGridVariant): Omit<SweepTrial, "seed">[] {
  const axes = getFixedSweepAxes(variant);
  const trials: Omit<SweepTrial, "seed">[] = [];
  for (const scanIntervalSeconds of axes.scanIntervals) {
    for (const advIntervalSeconds of axes.advIntervals) {
      for (const scanWindowSeconds of axes.scanWindows) {
        if (isJuxta56Schedule(scanIntervalSeconds, advIntervalSeconds, scanWindowSeconds)) {
          const policy: FixedPolicyConfig = {
            ...juxtaMainCMode0FixedPolicy,
            id: SWEEP_BASELINE_POLICY_ID,
            name: "Juxta 5.6 (reference)",
            advertisingBurstDurationSeconds: SWEEP_FIXED_BURST_SECONDS
          };
          trials.push({
            policyId: SWEEP_BASELINE_POLICY_ID,
            kind: "baseline_fixed",
            policy
          });
        } else {
          const policyId = `sweep-fixed-s${scanIntervalSeconds}-a${advIntervalSeconds}-w${scanWindowSeconds}`;
          const policy: FixedPolicyConfig = {
            type: "fixed",
            id: policyId,
            name: `Fixed ${scanIntervalSeconds}s scan / ${scanWindowSeconds}s window / ${advIntervalSeconds}s adv`,
            scanIntervalSeconds,
            scanWindowSeconds,
            advIntervalSeconds,
            advertisingBurstDurationSeconds: SWEEP_FIXED_BURST_SECONDS
          };
          trials.push({
            policyId,
            kind: "fixed_sweep",
            policy
          });
        }
      }
    }
  }
  return trials;
}

export function seedsForSweepMode(
  mode: "fast" | "report",
  currentSeed: string,
  options?: Pick<BuildSweepTrialsOptions, "reportSeedCount">
): string[] {
  if (mode === "fast") {
    return [currentSeed];
  }
  return reportSeedsForCount(options?.reportSeedCount ?? DEFAULT_REPORT_SEED_COUNT);
}

export function buildSweepTrials(
  mode: "fast" | "report",
  currentSeed: string,
  options?: BuildSweepTrialsOptions
): SweepTrial[] {
  const variant = resolveGridVariant(options?.gridVariant);
  const seeds = seedsForSweepMode(mode, currentSeed, {
    reportSeedCount: options?.reportSeedCount
  });
  const adaptivePolicies = buildSweepGridPolicies(variant);
  const fixedTrialDefs = buildFixedSweepTrialDefs(variant);

  const trials: SweepTrial[] = [];
  for (const seed of seeds) {
    for (const def of fixedTrialDefs) {
      trials.push({
        policyId: def.policyId,
        kind: def.kind,
        seed,
        policy: def.policy
      });
    }
    for (const adaptive of adaptivePolicies) {
      trials.push({
        policyId: adaptive.id,
        kind: "adaptive",
        seed,
        policy: adaptive
      });
    }
  }
  return trials;
}

/** Counts and axes for the Sweep sidebar (“what this sweep exercises”). */
export function sweepExecutionSummary(input: {
  gridVariant: SweepGridVariant;
  mode: "fast" | "report";
  builtSeed: string;
  reportSeedCount?: number;
}): {
  variant: SweepGridVariant;
  adaptiveAxes: SweepAxes;
  fixedAxes: FixedSweepAxes;
  policiesPerSeed: number;
  simulationSeeds: string[];
  totalTrials: number;
} {
  const variant = resolveGridVariant(input.gridVariant);
  const policiesPerSeed = policiesPerSweepSeed(variant);
  const simulationSeeds = seedsForSweepMode(input.mode, input.builtSeed, {
    reportSeedCount: input.reportSeedCount
  });
  const totalTrials = sweepTrialCount(input.mode, {
    gridVariant: input.gridVariant,
    reportSeedCount: input.reportSeedCount
  });
  return {
    variant,
    adaptiveAxes: getSweepAxes(variant),
    fixedAxes: getFixedSweepAxes(variant),
    policiesPerSeed,
    simulationSeeds,
    totalTrials
  };
}

function computeMahPerDay(finalState: SimulationState, cumulativeMah: number): number {
  const wallHours = finalState.time / 3600;
  return wallHours > 1e-9 ? (cumulativeMah / wallHours) * 24 : 0;
}

export function computeSweepRowFromRun(
  trial: SweepTrial,
  finalState: SimulationState,
  mergedLogs: SimulationLogs,
  timeline: SimulationState[]
): Omit<SweepRawRow, "relativeCapture" | "relativeEnergy" | "relativeEfficiency"> {
  const metrics = computeMetrics(finalState, mergedLogs);
  const cumulativeMah = mergedLogs.energy.at(-1)?.cumulativeMah ?? 0;
  const mAhPerDay = computeMahPerDay(finalState, cumulativeMah);
  const captureRate = metrics.bleCaptureRate;
  const bleEfficiency = mAhPerDay > 1e-12 ? captureRate / mAhPerDay : 0;
  const opportunities = metrics.bleCaptureOpportunities;
  const hits = metrics.bleCaptureHits;
  const drive = computeSamplingDriveDistribution(timeline);
  const timings = computeMeanCollarTimingsFromTimeline(timeline);

  const policy = trial.policy;
  const adaptive = policy.type === "motion_peer_adaptive" ? policy : null;
  const fixed = policy.type === "fixed" ? policy : null;

  return {
    policyId: trial.policyId,
    kind: trial.kind,
    seed: trial.seed,
    scheduledScanIntervalSeconds: fixed?.scanIntervalSeconds ?? null,
    scheduledScanWindowSeconds: fixed?.scanWindowSeconds ?? null,
    scheduledAdvIntervalSeconds: fixed?.advIntervalSeconds ?? null,
    baselineDrive: adaptive?.baselineDrive ?? null,
    motionWeight: adaptive?.motionWeight ?? null,
    peerWeight: adaptive?.peerWeight ?? null,
    tauPeerSeconds: adaptive?.tauPeerSeconds ?? null,
    tauMotionSeconds: adaptive?.tauMotionSeconds ?? SWEEP_HELD_ADAPTIVE.tauMotionSeconds,
    motionGain: adaptive?.motionGain ?? SWEEP_HELD_ADAPTIVE.motionGain,
    peerGain: adaptive?.peerGain ?? SWEEP_HELD_ADAPTIVE.peerGain,
    peerMissPenalty: adaptive?.peerMissPenalty ?? SWEEP_HELD_ADAPTIVE.peerMissPenalty,
    allowEnergySavingDownscale: adaptive?.allowEnergySavingDownscale ?? SWEEP_HELD_ADAPTIVE.allowEnergySavingDownscale,
    captureRate,
    mAhPerDay,
    bleEfficiency,
    opportunityEpochs: opportunities,
    hitEpochs: hits,
    missedEpochs: Math.max(0, opportunities - hits),
    meanSamplingDrive: drive.meanSamplingDrive,
    percentTimeBelowFixed: drive.percentTimeBelowFixed,
    percentTimeNearFixed: drive.percentTimeNearFixed,
    percentTimeAboveFixed: drive.percentTimeAboveFixed,
    meanScanIntervalSeconds: timings.meanScanIntervalSeconds,
    meanScanWindowSeconds: timings.meanScanWindowSeconds,
    meanAdvIntervalSeconds: timings.meanAdvIntervalSeconds
  };
}

export function attachRelativesToRows(
  rows: Omit<SweepRawRow, "relativeCapture" | "relativeEnergy" | "relativeEfficiency">[]
): SweepRawRow[] {
  const baselineBySeed = new Map<
    string,
    { captureRate: number; mAhPerDay: number; bleEfficiency: number }
  >();
  for (const row of rows) {
    if (row.kind === "baseline_fixed") {
      baselineBySeed.set(row.seed, {
        captureRate: row.captureRate,
        mAhPerDay: row.mAhPerDay,
        bleEfficiency: row.bleEfficiency
      });
    }
  }

  return rows.map((row) => {
    const base = baselineBySeed.get(row.seed);
    if (!base || base.captureRate <= 0 || base.mAhPerDay <= 0 || base.bleEfficiency <= 0) {
      return {
        ...row,
        relativeCapture: row.captureRate > 0 && base && base.captureRate > 0 ? row.captureRate / base.captureRate : 0,
        relativeEnergy: base && base.mAhPerDay > 0 ? row.mAhPerDay / base.mAhPerDay : 0,
        relativeEfficiency: base && base.bleEfficiency > 0 ? row.bleEfficiency / base.bleEfficiency : 0
      };
    }
    return {
      ...row,
      relativeCapture: row.captureRate / base.captureRate,
      relativeEnergy: row.mAhPerDay / base.mAhPerDay,
      relativeEfficiency: row.bleEfficiency / base.bleEfficiency
    };
  });
}

function sampleStd(values: number[]): number {
  const n = values.length;
  if (n < 2) {
    return 0;
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

function buildSummaryParams(rows: SweepRawRow[], kind: SweepPolicyKind): SweepPolicyParams | null {
  const r = rows[0]!;
  if (kind === "adaptive") {
    if (
      r.baselineDrive == null ||
      r.motionWeight == null ||
      r.peerWeight == null ||
      r.tauPeerSeconds == null
    ) {
      return null;
    }
    return {
      family: "adaptive",
      baselineDrive: r.baselineDrive,
      motionWeight: r.motionWeight,
      peerWeight: r.peerWeight,
      tauPeerSeconds: r.tauPeerSeconds
    };
  }
  if (kind === "baseline_fixed" || kind === "fixed_sweep") {
    if (
      r.scheduledScanIntervalSeconds == null ||
      r.scheduledScanWindowSeconds == null ||
      r.scheduledAdvIntervalSeconds == null
    ) {
      return null;
    }
    return {
      family: "fixed",
      scanIntervalSeconds: r.scheduledScanIntervalSeconds,
      scanWindowSeconds: r.scheduledScanWindowSeconds,
      advIntervalSeconds: r.scheduledAdvIntervalSeconds
    };
  }
  return null;
}

function summaryLabelForKind(kind: SweepPolicyKind, rows: SweepRawRow[]): string {
  const r = rows[0]!;
  if (kind === "baseline_fixed") {
    return "Juxta 5.6 (reference)";
  }
  if (kind === "fixed_sweep") {
    const s = r.scheduledScanIntervalSeconds ?? "?";
    const w = r.scheduledScanWindowSeconds ?? "?";
    const a = r.scheduledAdvIntervalSeconds ?? "?";
    return `Fixed ${s}s scan / ${w}s win / ${a}s adv`;
  }
  return `bd=${r.baselineDrive} mw=${r.motionWeight} pw=${r.peerWeight} τp=${r.tauPeerSeconds}s`;
}

export function aggregateSweepRows(rawRows: SweepRawRow[]): {
  summaries: SweepPolicySummary[];
  baselineSummary: SweepPolicySummary;
} {
  const byPolicy = new Map<string, SweepRawRow[]>();
  for (const row of rawRows) {
    const list = byPolicy.get(row.policyId) ?? [];
    list.push(row);
    byPolicy.set(row.policyId, list);
  }

  const summaries: SweepPolicySummary[] = [];
  let baselineSummary: SweepPolicySummary | null = null;

  for (const [policyId, rows] of byPolicy) {
    const kind = rows[0]?.kind ?? "adaptive";
    const seedsUsed = rows.length;
    const mean = (field: keyof SweepRawRow) =>
      rows.reduce((sum, row) => sum + (typeof row[field] === "number" ? (row[field] as number) : 0), 0) / rows.length;

    const captureRates = rows.map((row) => row.captureRate);
    const policyKind: SweepPolicySummary["kind"] =
      kind === "baseline_fixed" ? "baseline_fixed" : kind === "fixed_sweep" ? "fixed_sweep" : "adaptive";

    const summary: SweepPolicySummary = {
      policyId,
      kind: policyKind,
      isJuxtaReference: kind === "baseline_fixed",
      label: summaryLabelForKind(kind, rows),
      params: buildSummaryParams(rows, kind),
      meanCaptureRate: captureRates.reduce((a, b) => a + b, 0) / captureRates.length,
      meanMahPerDay: mean("mAhPerDay"),
      meanBleEfficiency: mean("bleEfficiency"),
      meanRelativeCapture: mean("relativeCapture"),
      meanRelativeEnergy: mean("relativeEnergy"),
      meanRelativeEfficiency: mean("relativeEfficiency"),
      stdCaptureRate: sampleStd(captureRates),
      seedsUsed,
      isParetoEfficient: false
    };

    if (kind === "baseline_fixed") {
      baselineSummary = {
        ...summary,
        stdCaptureRate: sampleStd(captureRates)
      };
    } else {
      summaries.push(summary);
    }
  }

  summaries.sort((a, b) => b.meanBleEfficiency - a.meanBleEfficiency);

  if (!baselineSummary) {
    baselineSummary = {
      policyId: SWEEP_BASELINE_POLICY_ID,
      kind: "baseline_fixed",
      label: "Juxta 5.6 (reference)",
      isJuxtaReference: true,
      params: {
        family: "fixed",
        scanIntervalSeconds: juxtaMainCMode0FixedPolicy.scanIntervalSeconds,
        scanWindowSeconds: juxtaMainCMode0FixedPolicy.scanWindowSeconds,
        advIntervalSeconds: juxtaMainCMode0FixedPolicy.advIntervalSeconds
      },
      meanCaptureRate: 0,
      meanMahPerDay: 0,
      meanBleEfficiency: 0,
      meanRelativeCapture: 1,
      meanRelativeEnergy: 1,
      meanRelativeEfficiency: 1,
      seedsUsed: 0,
      isParetoEfficient: false
    };
  }

  return { summaries, baselineSummary };
}

export function buildSweepResultBundle(rawRows: SweepRawRow[], mode: "fast" | "report"): SweepResultBundle {
  const aggregated = aggregateSweepRows(rawRows);
  const { baselineSummary, summaries } = attachParetoEfficiency(aggregated.baselineSummary, aggregated.summaries);
  const seedsUsed = [...new Set(rawRows.map((row) => row.seed))];
  return {
    rawRows,
    summaries,
    baselineSummary,
    seedsUsed,
    mode
  };
}

export function finalizeSweepBundle(
  rawRows: SweepRawRow[],
  mode: "fast" | "report"
): SweepBundleWithCandidates {
  const bundle = buildSweepResultBundle(rawRows, mode);
  const candidates = pickSweepCandidates(
    bundle.baselineSummary,
    bundle.summaries,
    bundle.baselineSummary.meanCaptureRate
  );
  return { ...bundle, candidates };
}

/** Build an active policy config for loading a sweep row into the Simulator. */
export function firmwarePolicyFromSweepSummary(summary: SweepPolicySummary): FirmwarePolicyConfig | null {
  if (!summary.params) {
    return null;
  }
  if (summary.params.family === "adaptive") {
    const p = summary.params;
    const built = sweepAdaptivePolicyFromGrid(p.baselineDrive, p.motionWeight, p.peerWeight, p.tauPeerSeconds);
    return { ...built, id: summary.policyId, name: summary.label };
  }
  const p = summary.params;
  return {
    type: "fixed",
    id: summary.policyId,
    name: summary.label,
    scanIntervalSeconds: p.scanIntervalSeconds,
    scanWindowSeconds: p.scanWindowSeconds,
    advIntervalSeconds: p.advIntervalSeconds,
    advertisingBurstDurationSeconds: SWEEP_FIXED_BURST_SECONDS
  };
}

export function runSingleSweepTrialSync(baseConfig: SimulationConfig, trial: SweepTrial): SweepRawRow {
  const config = structuredClone(baseConfig);
  config.seed = trial.seed;
  config.activePolicy = trial.policy;
  const initial = createInitialSimulation(config);
  const { finalState, mergedLogs, timeline } = runSimulationToEnd(initial);
  const partial = computeSweepRowFromRun(trial, finalState, mergedLogs, timeline);
  return attachRelativesToRows([partial])[0]!;
}

/** Chunked async full simulation (keeps UI responsive). */
export function runSimulationToEndChunked(
  initialState: SimulationState,
  options: {
    chunkSize?: number;
    shouldAbort?: () => boolean;
    onChunk?: () => void;
  } = {}
): Promise<{ finalState: SimulationState; mergedLogs: SimulationLogs; timeline: SimulationState[] }> {
  const chunkSize = options.chunkSize ?? Math.max(10, Math.ceil(
    Math.floor(initialState.config.simulationLengthSeconds / initialState.config.timeStepSeconds) / 60
  ));

  return new Promise((resolve, reject) => {
    const timeline: SimulationState[] = [initialState];
    let logs = initialState.logs;
    const totalSteps = Math.floor(initialState.config.simulationLengthSeconds / initialState.config.timeStepSeconds);
    let current = initialState;
    let step = 0;

    const tick = () => {
      if (options.shouldAbort?.()) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      const chunkEnd = Math.min(totalSteps, step + chunkSize);
      for (; step < chunkEnd; step += 1) {
        current = stepSimulation(current);
        logs = mergeLogs(logs, current.logs);
        timeline.push(current);
      }

      options.onChunk?.();

      if (step < totalSteps) {
        window.setTimeout(tick, 0);
        return;
      }

      resolve({ finalState: current, mergedLogs: logs, timeline });
    };

    window.setTimeout(tick, 0);
  });
}

export async function runSweepTrialsChunked(
  baseConfig: SimulationConfig,
  trials: SweepTrial[],
  options: {
    signal?: AbortSignal;
    chunkSize?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<SweepRawRow[]> {
  const total = trials.length;
  const partialRows: Omit<SweepRawRow, "relativeCapture" | "relativeEnergy" | "relativeEfficiency">[] = [];

  for (let index = 0; index < trials.length; index += 1) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const trial = trials[index]!;
    const config = structuredClone(baseConfig);
    config.seed = trial.seed;
    config.activePolicy = trial.policy;
    const initial = createInitialSimulation(config);

    const { finalState, mergedLogs, timeline } = await runSimulationToEndChunked(initial, {
      chunkSize: options.chunkSize,
      shouldAbort: () => Boolean(options.signal?.aborted)
    });

    partialRows.push(computeSweepRowFromRun(trial, finalState, mergedLogs, timeline));
    options.onProgress?.(index + 1, total);
  }

  return attachRelativesToRows(partialRows);
}
