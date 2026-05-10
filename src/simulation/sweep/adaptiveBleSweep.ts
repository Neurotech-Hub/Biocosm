import { computeMetrics } from "../analysis";
import { juxtaMainCMode0FixedPolicy } from "../config";
import { mergeLogs, runSimulationToEnd, stepSimulation } from "../engine";
import type {
  FirmwarePolicyConfig,
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
  pickSweepCandidates,
  type CandidatePick,
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
export const SWEEP_QUICK_PEER_WEIGHTS = [0.35, 0.85] as const;
export const SWEEP_QUICK_TAU_PEER_SECONDS = [120, 600] as const;

/** When true, uses the full exploratory grid; otherwise the quick testing grid (default). */
export function isFullSweepGrid(): boolean {
  return import.meta.env.VITE_SWEEP_FULL_GRID === "true";
}

type SweepAxes = {
  baselineDrives: readonly number[];
  motionWeights: readonly number[];
  peerWeights: readonly number[];
  tauPeerSeconds: readonly number[];
};

export function getSweepAxes(): SweepAxes {
  if (isFullSweepGrid()) {
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

/** Number of adaptive policies in the active grid (24 quick, 90 full). */
export function adaptiveSweepPolicyCount(): number {
  const axes = getSweepAxes();
  return (
    axes.baselineDrives.length *
    axes.motionWeights.length *
    axes.peerWeights.length *
    axes.tauPeerSeconds.length
  );
}

/** Total simulation runs for a sweep (baseline + each adaptive), per spec seeds. */
export function sweepTrialCount(mode: "fast" | "report"): number {
  const adaptive = adaptiveSweepPolicyCount();
  const seeds = mode === "fast" ? 1 : SWEEP_REPORT_SEEDS.length;
  return seeds * (1 + adaptive);
}

export const SWEEP_REPORT_SEEDS = ["101", "202", "303"] as const;
export const SWEEP_BASELINE_POLICY_ID = "sweep-baseline-juxta-fixed";

export type SweepPolicyKind = "baseline_fixed" | "adaptive";

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

export function buildSweepGridPolicies(): MotionPeerAdaptivePolicyConfig[] {
  const axes = getSweepAxes();
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

export function seedsForSweepMode(mode: "fast" | "report", currentSeed: string): string[] {
  return mode === "fast" ? [currentSeed] : [...SWEEP_REPORT_SEEDS];
}

export function buildSweepTrials(mode: "fast" | "report", currentSeed: string): SweepTrial[] {
  const seeds = seedsForSweepMode(mode, currentSeed);
  const adaptivePolicies = buildSweepGridPolicies();
  const baselinePolicy: FirmwarePolicyConfig = {
    ...juxtaMainCMode0FixedPolicy,
    id: SWEEP_BASELINE_POLICY_ID,
    name: "Sweep baseline (Juxta fixed)"
  };

  const trials: SweepTrial[] = [];
  for (const seed of seeds) {
    trials.push({
      policyId: baselinePolicy.id,
      kind: "baseline_fixed",
      seed,
      policy: baselinePolicy
    });
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

  return {
    policyId: trial.policyId,
    kind: trial.kind,
    seed: trial.seed,
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
    const summary: SweepPolicySummary = {
      policyId,
      kind: kind === "baseline_fixed" ? "baseline_fixed" : "adaptive",
      label:
        kind === "baseline_fixed"
          ? "Fixed Juxta baseline"
          : `bd=${rows[0]?.baselineDrive} mw=${rows[0]?.motionWeight} pw=${rows[0]?.peerWeight} τp=${rows[0]?.tauPeerSeconds}s`,
      params:
        kind === "baseline_fixed" || rows[0]?.baselineDrive == null
          ? null
          : {
              baselineDrive: rows[0].baselineDrive!,
              motionWeight: rows[0].motionWeight!,
              peerWeight: rows[0].peerWeight!,
              tauPeerSeconds: rows[0].tauPeerSeconds!
            },
      meanCaptureRate: captureRates.reduce((a, b) => a + b, 0) / captureRates.length,
      meanMahPerDay: mean("mAhPerDay"),
      meanBleEfficiency: mean("bleEfficiency"),
      meanRelativeCapture: mean("relativeCapture"),
      meanRelativeEnergy: mean("relativeEnergy"),
      meanRelativeEfficiency: mean("relativeEfficiency"),
      stdCaptureRate: sampleStd(captureRates),
      seedsUsed
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

  summaries.sort((a, b) => b.meanCaptureRate - a.meanCaptureRate);

  if (!baselineSummary) {
    baselineSummary = {
      policyId: SWEEP_BASELINE_POLICY_ID,
      kind: "baseline_fixed",
      label: "Fixed Juxta baseline",
      params: null,
      meanCaptureRate: 0,
      meanMahPerDay: 0,
      meanBleEfficiency: 0,
      meanRelativeCapture: 1,
      meanRelativeEnergy: 1,
      meanRelativeEfficiency: 1,
      seedsUsed: 0
    };
  }

  return { summaries, baselineSummary };
}

export function buildSweepResultBundle(rawRows: SweepRawRow[], mode: "fast" | "report"): SweepResultBundle {
  const { summaries, baselineSummary } = aggregateSweepRows(rawRows);
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
): SweepResultBundle & { candidates: CandidatePick[] } {
  const bundle = buildSweepResultBundle(rawRows, mode);
  const candidates = pickSweepCandidates(
    [bundle.baselineSummary, ...bundle.summaries],
    bundle.baselineSummary.meanCaptureRate
  );
  return { ...bundle, candidates };
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
