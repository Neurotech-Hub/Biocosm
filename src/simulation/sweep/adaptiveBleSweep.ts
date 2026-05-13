import {
  baselineFixedPolicyForSweep,
  bleBaselinePresetDefForSweep,
  blePolicyPresetIdForFixedPolicy,
  BLE_POLICY_CUSTOM_ID,
  buildAdaptiveAnchorsFromBaseline,
  getBlePolicyPreset,
  sweepBaselinePolicyId
} from "../blePolicyPresets";
import { computeMetrics } from "../analysis";
import { FIXED_ADVERTISING_BURST_SECONDS, FIXED_SCAN_BURST_SECONDS } from "../bleTimingAssumptions";
import { defaultSimulationConfig } from "../config";
import { mergeLogs, runSimulationToEnd, stepSimulation } from "../engine";
import type {
  FirmwarePolicyConfig,
  FixedPolicyConfig,
  MotionPeerAdaptivePolicyConfig,
  SimulationConfig,
  SimulationLogs,
  SimulationState,
  SweepPolicyKind
} from "../types";

export type { SweepPolicyKind } from "../types";
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

/** Spec §7 held constants for sweep runs. */
export const SWEEP_HELD_ADAPTIVE = {
  tauMotionSeconds: 180,
  motionGain: 0.35,
  peerGain: 0.45,
  peerMissPenalty: 0.2,
  allowEnergySavingDownscale: true,
  peerDetectionCountSaturation: 1,
  motionEventCountSaturation: 1
} as const;

/**
 * Single compact sweep grid (2×2×2×2 = **16** adaptive policies per seed). `minimal` / `quick` / `full` all use this grid for now.
 */
export const SWEEP_BASELINE_DRIVES = [0.1, 0.3] as const;
export const SWEEP_MOTION_WEIGHTS = [0.2, 0.5] as const;
export const SWEEP_PEER_WEIGHTS = [0.2, 0.5] as const;
export const SWEEP_TAU_PEER_SECONDS = [200, 600] as const;

export const SWEEP_FULL_BASELINE_DRIVES = SWEEP_BASELINE_DRIVES;
export const SWEEP_FULL_MOTION_WEIGHTS = SWEEP_MOTION_WEIGHTS;
export const SWEEP_FULL_PEER_WEIGHTS = SWEEP_PEER_WEIGHTS;
export const SWEEP_FULL_TAU_PEER_SECONDS = SWEEP_TAU_PEER_SECONDS;

export const SWEEP_QUICK_BASELINE_DRIVES = SWEEP_BASELINE_DRIVES;
export const SWEEP_QUICK_MOTION_WEIGHTS = SWEEP_MOTION_WEIGHTS;
export const SWEEP_QUICK_PEER_WEIGHTS = SWEEP_PEER_WEIGHTS;
export const SWEEP_QUICK_TAU_PEER_SECONDS = SWEEP_TAU_PEER_SECONDS;

export const SWEEP_MINIMAL_BASELINE_DRIVES = SWEEP_BASELINE_DRIVES;
export const SWEEP_MINIMAL_MOTION_WEIGHTS = SWEEP_MOTION_WEIGHTS;
export const SWEEP_MINIMAL_PEER_WEIGHTS = SWEEP_PEER_WEIGHTS;
export const SWEEP_MINIMAL_TAU_PEER_SECONDS = SWEEP_TAU_PEER_SECONDS;

/** Fixed-rate sweep uses firmware timing assumptions; only scan/advertise intervals are swept. */
export const SWEEP_FIXED_ADVERTISING_BURST_SECONDS = FIXED_ADVERTISING_BURST_SECONDS;

const SWEEP_FIXED_SCAN_INTERVALS = [10, 20, 30, 60, 120] as const;
const SWEEP_FIXED_ADV_INTERVALS = [1, 2, 5, 10, 20] as const;

type InactiveStretchVariantDef = {
  mult: number;
  idSuffix: string;
  baselineKind: SweepPolicyKind;
  fixedKind: SweepPolicyKind;
};

function sweepInactiveStretchVariants(_variant: SweepGridVariant): readonly InactiveStretchVariantDef[] {
  void _variant;
  return [
    {
      mult: 3,
      idSuffix: "i3",
      baselineKind: "baseline_fixed_inactive_scan_x3",
      fixedKind: "fixed_sweep_inactive_scan_x3"
    },
    {
      mult: 5,
      idSuffix: "i5",
      baselineKind: "baseline_fixed_inactive_scan_x5",
      fixedKind: "fixed_sweep_inactive_scan_x5"
    }
  ] as const;
}

/** Rows per fixed (scan interval, advertise interval) combo: baseline + inactive stretch variants. */
export function fixedSweepRowsPerCombo(variant: SweepGridVariant): number {
  return 1 + sweepInactiveStretchVariants(variant).length;
}

/** Reserved: all sweep variants currently share the same compact grid. */
export function isFullSweepGrid(): boolean {
  return import.meta.env.VITE_SWEEP_FULL_GRID === "true";
}

/** Grid variant labels are kept for UI/API; axes are identical for every value today. */
export type SweepGridVariant = "minimal" | "quick" | "full";

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
  /** Scan window is not swept; fixed policies use the simulator's fixed scan-burst assumption (seconds). */
  heldScanWindowSeconds: number;
};

function roundIntervalSeconds(v: number): number {
  if (!Number.isFinite(v) || v <= 0) {
    return 1;
  }
  return Math.max(1, Math.round(v * 100) / 100);
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
}

/** Fixed-rate Cartesian axes: scan and advertise intervals only; scan window follows the baseline preset. */
export function getFixedSweepAxes(variant: SweepGridVariant | undefined, baseline: FixedPolicyConfig): FixedSweepAxes {
  void variant;
  void baseline;
  const scanSrc: number[] = [...SWEEP_FIXED_SCAN_INTERVALS];
  const advSrc: number[] = [...SWEEP_FIXED_ADV_INTERVALS];
  return {
    scanIntervals: uniqueSorted(scanSrc.map(roundIntervalSeconds)),
    advIntervals: uniqueSorted(advSrc.map(roundIntervalSeconds)),
    heldScanWindowSeconds: FIXED_SCAN_BURST_SECONDS
  };
}

export function getSweepAxes(variant?: SweepGridVariant): SweepAxes {
  void variant;
  return {
    baselineDrives: SWEEP_BASELINE_DRIVES,
    motionWeights: SWEEP_MOTION_WEIGHTS,
    peerWeights: SWEEP_PEER_WEIGHTS,
    tauPeerSeconds: SWEEP_TAU_PEER_SECONDS
  };
}

/** Number of adaptive policies in the active grid (16 for every variant today). */
export function adaptiveSweepPolicyCount(variant?: SweepGridVariant): number {
  const axes = getSweepAxes(variant);
  return (
    axes.baselineDrives.length *
    axes.motionWeights.length *
    axes.peerWeights.length *
    axes.tauPeerSeconds.length
  );
}

/** Number of fixed-rate policies per seed: comparison baseline block (with inactive variants) plus grid combos that are not an exact duplicate of baseline. */
export function fixedSweepPolicyCount(variant?: SweepGridVariant, baseline?: FixedPolicyConfig): number {
  const b = baseline ?? baselineFixedPolicyForSweep(defaultSimulationConfig);
  const v = resolveGridVariant(variant);
  const ax = getFixedSweepAxes(variant, b);
  const perCombo = fixedSweepRowsPerCombo(v);
  let baselineMatchingCells = 0;
  for (const scanIntervalSeconds of ax.scanIntervals) {
    for (const advIntervalSeconds of ax.advIntervals) {
      if (schedulesMatchSweepBaseline(scanIntervalSeconds, advIntervalSeconds, b)) {
        baselineMatchingCells += 1;
      }
    }
  }
  const totalCells = ax.scanIntervals.length * ax.advIntervals.length;
  const nonMatchingCells = totalCells - baselineMatchingCells;
  return perCombo * (1 + nonMatchingCells);
}

/** Policies per seed: full fixed grid + adaptive grid. */
export function policiesPerSweepSeed(variant?: SweepGridVariant, baseline?: FixedPolicyConfig): number {
  return fixedSweepPolicyCount(variant, baseline) + adaptiveSweepPolicyCount(variant);
}

/** Pool for report mode; first N used when report seed count is N (1–5). */
export const SWEEP_REPORT_SEED_POOL = ["101", "202", "303", "404", "505"] as const;

export const DEFAULT_REPORT_SEED_COUNT = 3;

/** First `count` seeds from the report pool (clamped 1–5). */
export function reportSeedsForCount(count: number): string[] {
  const n = Math.min(5, Math.max(1, Math.floor(count)));
  return Array.from(SWEEP_REPORT_SEED_POOL.slice(0, n));
}

export type BuildSweepTrialsOptions = {
  gridVariant?: SweepGridVariant;
  /** Report mode only; default 3 (101, 202, 303). */
  reportSeedCount?: number;
  /** Drives baseline-relative fixed grid and adaptive anchors (defaults to General discovery). */
  simulationConfig?: SimulationConfig;
};

function baselineFixedForSweepOptions(options?: BuildSweepTrialsOptions): FixedPolicyConfig {
  return baselineFixedPolicyForSweep(options?.simulationConfig ?? defaultSimulationConfig);
}

/** Total simulation runs (fixed + adaptive trials) for the selected seeds and grid. */
export function sweepTrialCount(mode: "fast" | "report", options?: BuildSweepTrialsOptions): number {
  const variant = resolveGridVariant(options?.gridVariant);
  const baseline = baselineFixedForSweepOptions(options);
  const perSeed = policiesPerSweepSeed(variant, baseline);
  const seedRows =
    mode === "fast"
      ? 1
      : reportSeedsForCount(options?.reportSeedCount ?? DEFAULT_REPORT_SEED_COUNT).length;
  return seedRows * perSeed;
}

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
  /** Fixed policies only: bout-delayed inactive scan stretch enabled. */
  doubleWhenInactive: boolean;
  /** Fixed + inactive stretch: configured scan interval multiplier, or `"inf"`; null when not applicable. */
  inactiveScanIntervalMultiplier: FixedPolicyConfig["inactiveScanIntervalMultiplier"] | null;
  /** Configured schedule for fixed policies; null for adaptive. */
  scheduledScanIntervalSeconds: number | null;
  scheduledScanWindowSeconds: number | null;
  scheduledAdvIntervalSeconds: number | null;
  scheduledAdvertisingBurstDurationSeconds: number | null;
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
  tauPeerSeconds: number,
  timingAnchors: MotionPeerAdaptivePolicyConfig["timingAnchors"]
): MotionPeerAdaptivePolicyConfig {
  const id = `sweep-adaptive-bd${baselineDrive}-mw${motionWeight}-pw${peerWeight}-tau${tauPeerSeconds}`;
  return {
    id,
    type: "motion_peer_adaptive",
    name: "Adaptive sweep trial",
    timingAnchors: {
      lowIntensity: { ...timingAnchors.lowIntensity },
      neutral: { ...timingAnchors.neutral },
      highIntensity: { ...timingAnchors.highIntensity },
      advertisingBurstDurationSeconds: timingAnchors.advertisingBurstDurationSeconds
    },
    baselineDrive,
    motionWeight,
    peerWeight,
    tauPeerSeconds,
    ...SWEEP_HELD_ADAPTIVE
  };
}

export function buildSweepGridPolicies(
  variant: SweepGridVariant | undefined,
  timingAnchors: MotionPeerAdaptivePolicyConfig["timingAnchors"]
): MotionPeerAdaptivePolicyConfig[] {
  const axes = getSweepAxes(variant);
  const policies: MotionPeerAdaptivePolicyConfig[] = [];
  for (const baselineDrive of axes.baselineDrives) {
    for (const motionWeight of axes.motionWeights) {
      for (const peerWeight of axes.peerWeights) {
        for (const tauPeerSeconds of axes.tauPeerSeconds) {
          policies.push(
            sweepAdaptivePolicyFromGrid(baselineDrive, motionWeight, peerWeight, tauPeerSeconds, timingAnchors)
          );
        }
      }
    }
  }
  return policies;
}

function schedulesMatchSweepBaseline(
  scanIntervalSeconds: number,
  advIntervalSeconds: number,
  baseline: FixedPolicyConfig
): boolean {
  return scanIntervalSeconds === baseline.scanIntervalSeconds && advIntervalSeconds === baseline.advIntervalSeconds;
}

/** One entry per fixed-rate combo; baseline schedule is always swept first, then Cartesian grid (skipping an exact duplicate of baseline). */
export function buildFixedSweepTrialDefs(
  variant: SweepGridVariant | undefined,
  simulationConfig: SimulationConfig
): Omit<SweepTrial, "seed">[] {
  const baselineFixed = baselineFixedPolicyForSweep(simulationConfig);
  const burstSeconds = SWEEP_FIXED_ADVERTISING_BURST_SECONDS;
  const baselinePolicyId = sweepBaselinePolicyId(simulationConfig.blePolicyPresetId);
  const presetLabel =
    simulationConfig.blePolicyPresetId !== BLE_POLICY_CUSTOM_ID
      ? getBlePolicyPreset(simulationConfig.blePolicyPresetId)?.label ?? simulationConfig.blePolicyPresetId
      : "Custom";
  const axes = getFixedSweepAxes(variant, baselineFixed);
  const trials: Omit<SweepTrial, "seed">[] = [];
  const v = resolveGridVariant(variant);
  const inactiveVariants = sweepInactiveStretchVariants(v);

  const pushFixedSweepCombo = (
    basePolicyId: string,
    baseKind: "baseline_fixed" | "fixed_sweep",
    basePolicy: FixedPolicyConfig
  ) => {
    trials.push({ policyId: basePolicyId, kind: baseKind, policy: basePolicy });
    for (const stretch of inactiveVariants) {
      const pid = `${basePolicyId}-${stretch.idSuffix}`;
      const mult = stretch.mult as FixedPolicyConfig["inactiveScanIntervalMultiplier"];
      const stretchPolicy: FixedPolicyConfig = {
        ...basePolicy,
        id: pid,
        doubleWhenInactive: true,
        inactiveScanIntervalMultiplier: mult,
        name:
          baseKind === "baseline_fixed"
            ? `Baseline (inactive scan ×${mult}): ${presetLabel}`
            : `${basePolicy.name} — inactive scan ×${mult}`
      };
      const kind = baseKind === "baseline_fixed" ? stretch.baselineKind : stretch.fixedKind;
      trials.push({ policyId: pid, kind, policy: stretchPolicy });
    }
  };

  const baselinePolicy: FixedPolicyConfig = {
    ...baselineFixed,
    id: baselinePolicyId,
    name: `Baseline: ${presetLabel}`,
    advertisingBurstDurationSeconds: burstSeconds
  };
  pushFixedSweepCombo(baselinePolicyId, "baseline_fixed", baselinePolicy);

  for (const scanIntervalSeconds of axes.scanIntervals) {
    for (const advIntervalSeconds of axes.advIntervals) {
      if (schedulesMatchSweepBaseline(scanIntervalSeconds, advIntervalSeconds, baselineFixed)) {
        continue;
      }
      const scanWindowSeconds = axes.heldScanWindowSeconds;
      const policyId = `sweep-fixed-s${scanIntervalSeconds}-a${advIntervalSeconds}`;
      const policy: FixedPolicyConfig = {
        type: "fixed",
        id: policyId,
        name: `Fixed ${scanIntervalSeconds}s scan / ${advIntervalSeconds}s adv`,
        scanIntervalSeconds,
        scanWindowSeconds,
        advIntervalSeconds,
        advertisingBurstDurationSeconds: burstSeconds
      };
      pushFixedSweepCombo(policyId, "fixed_sweep", policy);
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
  const simConfig = options?.simulationConfig ?? defaultSimulationConfig;
  const presetDef = bleBaselinePresetDefForSweep(simConfig);
  const timingAnchors = buildAdaptiveAnchorsFromBaseline(presetDef);
  const seeds = seedsForSweepMode(mode, currentSeed, {
    reportSeedCount: options?.reportSeedCount
  });
  const adaptivePolicies = buildSweepGridPolicies(variant, timingAnchors);
  const fixedTrialDefs = buildFixedSweepTrialDefs(variant, simConfig);

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
  simulationConfig?: SimulationConfig;
}): {
  variant: SweepGridVariant;
  adaptiveAxes: SweepAxes;
  fixedAxes: FixedSweepAxes;
  policiesPerSeed: number;
  simulationSeeds: string[];
  totalTrials: number;
} {
  const variant = resolveGridVariant(input.gridVariant);
  const simConfig = input.simulationConfig ?? defaultSimulationConfig;
  const baseline = baselineFixedPolicyForSweep(simConfig);
  const policiesPerSeed = policiesPerSweepSeed(variant, baseline);
  const simulationSeeds = seedsForSweepMode(input.mode, input.builtSeed, {
    reportSeedCount: input.reportSeedCount
  });
  const totalTrials = sweepTrialCount(input.mode, {
    gridVariant: input.gridVariant,
    reportSeedCount: input.reportSeedCount,
    simulationConfig: simConfig
  });
  return {
    variant,
    adaptiveAxes: getSweepAxes(variant),
    fixedAxes: getFixedSweepAxes(variant, baseline),
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
    doubleWhenInactive: fixed?.doubleWhenInactive === true,
    inactiveScanIntervalMultiplier:
      fixed?.doubleWhenInactive === true ? (fixed.inactiveScanIntervalMultiplier ?? 2) : null,
    scheduledScanIntervalSeconds: fixed?.scanIntervalSeconds ?? null,
    scheduledScanWindowSeconds: fixed?.scanWindowSeconds ?? null,
    scheduledAdvIntervalSeconds: fixed?.advIntervalSeconds ?? null,
    scheduledAdvertisingBurstDurationSeconds:
      fixed?.advertisingBurstDurationSeconds ?? null,
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

function isFixedSweepSummaryKind(kind: SweepPolicyKind): boolean {
  return (
    kind === "baseline_fixed" ||
    kind === "fixed_sweep" ||
    kind === "baseline_fixed_inactive_scan_x3" ||
    kind === "fixed_sweep_inactive_scan_x3" ||
    kind === "baseline_fixed_inactive_scan_x5" ||
    kind === "fixed_sweep_inactive_scan_x5"
  );
}

function isInactiveStretchSweepKind(kind: SweepPolicyKind): boolean {
  return (
    kind === "baseline_fixed_inactive_scan_x3" ||
    kind === "fixed_sweep_inactive_scan_x3" ||
    kind === "baseline_fixed_inactive_scan_x5" ||
    kind === "fixed_sweep_inactive_scan_x5"
  );
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
  if (isFixedSweepSummaryKind(kind)) {
    if (
      r.scheduledScanIntervalSeconds == null ||
      r.scheduledScanWindowSeconds == null ||
      r.scheduledAdvIntervalSeconds == null
    ) {
      return null;
    }
    const inactiveStretch = isInactiveStretchSweepKind(kind);
    const mult = inactiveStretch ? (r.inactiveScanIntervalMultiplier ?? 3) : undefined;
    return {
      family: "fixed",
      scanIntervalSeconds: r.scheduledScanIntervalSeconds,
      scanWindowSeconds: r.scheduledScanWindowSeconds,
      advIntervalSeconds: r.scheduledAdvIntervalSeconds,
      advertisingBurstDurationSeconds: r.scheduledAdvertisingBurstDurationSeconds ?? undefined,
      doubleWhenInactive: inactiveStretch ? true : undefined,
      inactiveScanIntervalMultiplier: inactiveStretch
        ? (mult as FixedPolicyConfig["inactiveScanIntervalMultiplier"])
        : undefined
    };
  }
  return null;
}

function summaryLabelForKind(kind: SweepPolicyKind, rows: SweepRawRow[]): string {
  const r = rows[0]!;
  if (kind === "baseline_fixed") {
    const pseudo: FixedPolicyConfig = {
      type: "fixed",
      id: "summary-baseline",
      name: "baseline",
      scanIntervalSeconds: r.scheduledScanIntervalSeconds ?? 0,
      scanWindowSeconds: r.scheduledScanWindowSeconds ?? 0,
      advIntervalSeconds: r.scheduledAdvIntervalSeconds ?? 0,
      advertisingBurstDurationSeconds: r.scheduledAdvertisingBurstDurationSeconds ?? 2
    };
    const pid = blePolicyPresetIdForFixedPolicy(pseudo);
    const label =
      pid !== BLE_POLICY_CUSTOM_ID ? getBlePolicyPreset(pid)?.label ?? pid : "Custom";
    return `Baseline: ${label}`;
  }
  if (kind === "fixed_sweep") {
    const s = r.scheduledScanIntervalSeconds ?? "?";
    const a = r.scheduledAdvIntervalSeconds ?? "?";
    return `Fixed ${s}s scan / ${a}s adv`;
  }
  if (kind === "baseline_fixed_inactive_scan_x3") {
    const pid = blePolicyPresetIdForFixedPolicy({
      type: "fixed",
      id: "summary-baseline-i3",
      name: "baseline-i3",
      scanIntervalSeconds: r.scheduledScanIntervalSeconds ?? 0,
      scanWindowSeconds: r.scheduledScanWindowSeconds ?? 0,
      advIntervalSeconds: r.scheduledAdvIntervalSeconds ?? 0,
      advertisingBurstDurationSeconds: r.scheduledAdvertisingBurstDurationSeconds ?? 2
    });
    const label =
      pid !== BLE_POLICY_CUSTOM_ID ? getBlePolicyPreset(pid)?.label ?? pid : "Custom";
    return `Baseline (inactive scan ×3): ${label}`;
  }
  if (kind === "fixed_sweep_inactive_scan_x3") {
    const s = r.scheduledScanIntervalSeconds ?? "?";
    const a = r.scheduledAdvIntervalSeconds ?? "?";
    return `Fixed ${s}s scan / ${a}s adv — inactive scan ×3`;
  }
  if (kind === "baseline_fixed_inactive_scan_x5") {
    const pid = blePolicyPresetIdForFixedPolicy({
      type: "fixed",
      id: "summary-baseline-i5",
      name: "baseline-i5",
      scanIntervalSeconds: r.scheduledScanIntervalSeconds ?? 0,
      scanWindowSeconds: r.scheduledScanWindowSeconds ?? 0,
      advIntervalSeconds: r.scheduledAdvIntervalSeconds ?? 0,
      advertisingBurstDurationSeconds: r.scheduledAdvertisingBurstDurationSeconds ?? 2
    });
    const label =
      pid !== BLE_POLICY_CUSTOM_ID ? getBlePolicyPreset(pid)?.label ?? pid : "Custom";
    return `Baseline (inactive scan ×5): ${label}`;
  }
  if (kind === "fixed_sweep_inactive_scan_x5") {
    const s = r.scheduledScanIntervalSeconds ?? "?";
    const a = r.scheduledAdvIntervalSeconds ?? "?";
    return `Fixed ${s}s scan / ${a}s adv — inactive scan ×5`;
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
      kind === "baseline_fixed"
        ? "baseline_fixed"
        : kind === "baseline_fixed_inactive_scan_x3"
          ? "baseline_fixed_inactive_scan_x3"
          : kind === "baseline_fixed_inactive_scan_x5"
            ? "baseline_fixed_inactive_scan_x5"
            : kind === "fixed_sweep"
              ? "fixed_sweep"
              : kind === "fixed_sweep_inactive_scan_x3"
                ? "fixed_sweep_inactive_scan_x3"
                : kind === "fixed_sweep_inactive_scan_x5"
                  ? "fixed_sweep_inactive_scan_x5"
                  : "adaptive";

    const summary: SweepPolicySummary = {
      policyId,
      kind: policyKind,
      isComparisonBaseline: kind === "baseline_fixed",
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
      policyId: "sweep-baseline-missing",
      kind: "baseline_fixed",
      label: "Comparison baseline (missing)",
      isComparisonBaseline: true,
      params: null,
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
export function firmwarePolicyFromSweepSummary(
  summary: SweepPolicySummary,
  sweepBaseConfig?: SimulationConfig
): FirmwarePolicyConfig | null {
  if (!summary.params) {
    return null;
  }
  if (summary.params.family === "adaptive") {
    const p = summary.params;
    const presetDef = bleBaselinePresetDefForSweep(sweepBaseConfig ?? defaultSimulationConfig);
    const anchors = buildAdaptiveAnchorsFromBaseline(presetDef);
    const built = sweepAdaptivePolicyFromGrid(
      p.baselineDrive,
      p.motionWeight,
      p.peerWeight,
      p.tauPeerSeconds,
      anchors
    );
    return { ...built, id: summary.policyId, name: summary.label };
  }
  const p = summary.params;
  const burst = p.advertisingBurstDurationSeconds ?? 2;
  const fixed: FixedPolicyConfig = {
    type: "fixed",
    id: summary.policyId,
    name: summary.label,
    scanIntervalSeconds: p.scanIntervalSeconds,
    scanWindowSeconds: p.scanWindowSeconds,
    advIntervalSeconds: p.advIntervalSeconds,
    advertisingBurstDurationSeconds: burst
  };
  if (p.doubleWhenInactive === true) {
    fixed.doubleWhenInactive = true;
  }
  if (p.inactiveScanIntervalMultiplier != null) {
    fixed.inactiveScanIntervalMultiplier = p.inactiveScanIntervalMultiplier;
  }
  return fixed;
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
