import { pairKey } from "./geometry";
import type {
  DetectionEvent,
  FirmwareMinuteRecord,
  SimulationLogs,
  SimulationMetrics,
  SimulationState
} from "./types";

function isJuxtaMaincSocialFixedPolicy(policy: SimulationState["config"]["activePolicy"]): boolean {
  if (policy.type !== "fixed") {
    return false;
  }
  return (
    policy.scanIntervalSeconds === 20 &&
    policy.advIntervalSeconds === 5 &&
    policy.scanWindowSeconds === 1.5 &&
    (policy.advertisingBurstDurationSeconds ?? 2) === 2
  );
}

function energyModelWarningFor(
  state: SimulationState,
  meanEnergyCurrentMicroAmpsPerCollar: number
): string | undefined {
  const { energy, activePolicy } = state.config;
  if (energy.energyModel !== "component") {
    return undefined;
  }
  if (!isJuxtaMaincSocialFixedPolicy(activePolicy)) {
    return undefined;
  }
  if (state.time < 60) {
    return undefined;
  }
  if (meanEnergyCurrentMicroAmpsPerCollar > 3 * energy.measuredSocial5s20sTotalMicroAmps) {
    return "Predicted draw is more than 3× the Juxta 5s/20s bench reference — check for burst-wall × TX-style double counting or a policy mismatch.";
  }
  return undefined;
}

export function buildFirmwareMinuteRecords(
  detections: DetectionEvent[],
  startTimeSeconds: number
): FirmwareMinuteRecord[] {
  type Row = { minuteBucketStartSeconds: number; observerId: string; peers: Map<string, number> };
  const rows = new Map<string, Row>();

  for (const event of detections) {
    const absoluteSeconds = startTimeSeconds + event.time;
    const minuteBucketStartSeconds = Math.floor(absoluteSeconds / 60) * 60;
    const key = `${minuteBucketStartSeconds}|${event.observerId}`;
    let row = rows.get(key);
    if (!row) {
      row = { minuteBucketStartSeconds, observerId: event.observerId, peers: new Map() };
      rows.set(key, row);
    }
    const prev = row.peers.get(event.peerId);
    if (prev === undefined || event.rssi > prev) {
      row.peers.set(event.peerId, event.rssi);
    }
  }

  const records: FirmwareMinuteRecord[] = [...rows.values()].map((row) => ({
    minuteBucketStartSeconds: row.minuteBucketStartSeconds,
    observerId: row.observerId,
    detectedPeers: [...row.peers.entries()].map(([peerId, strongestRssi]) => ({ peerId, strongestRssi }))
  }));

  records.sort(
    (a, b) =>
      a.minuteBucketStartSeconds - b.minuteBucketStartSeconds ||
      a.observerId.localeCompare(b.observerId)
  );
  return records;
}

export function computeMetrics(state: SimulationState, logs: SimulationLogs = state.logs): SimulationMetrics {
  const logMetrics = computeMetricsFromLogs(logs, state.config.startTimeSeconds);
  const animalCount = Math.max(1, state.animals.length);
  const capture = computeBleCapture(state, logs);
  const latestEnergy = logs.energy.at(-1) ?? state.energy;
  const elapsedHours = state.time / 3600;
  const meanEnergyCurrentMicroAmpsPerCollar =
    elapsedHours > 1e-9 ? (latestEnergy.cumulativeMah / elapsedHours) * 1000 : 0;
  const energyModelWarning = energyModelWarningFor(state, meanEnergyCurrentMicroAmpsPerCollar);
  return {
    ...logMetrics,
    bleCaptureRate: capture.opportunities > 0 ? capture.hits / capture.opportunities : 0,
    bleCaptureHits: capture.hits,
    bleCaptureOpportunities: capture.opportunities,
    scanningAnimals: new Set(logs.bleBursts.filter((burst) => burst.kind === "scan").map((burst) => burst.animalId)).size,
    advertisingAnimals: new Set(logs.bleBursts.filter((burst) => burst.kind === "advertise").map((burst) => burst.animalId))
      .size,
    meanSamplingDrive: state.animals.reduce((sum, animal) => sum + animal.collar.samplingDrive, 0) / animalCount,
    meanScanIntervalSeconds:
      state.animals.reduce((sum, animal) => sum + animal.collar.scanIntervalSeconds, 0) / animalCount,
    energyUsedMah: latestEnergy.cumulativeMah,
    meanEnergyCurrentMicroAmpsPerCollar,
    batteryRemainingPercent: latestEnergy.remainingPercent,
    estimatedVoltage: latestEnergy.estimatedVoltage,
    capturePerMah: latestEnergy.cumulativeMah > 0 ? capture.hits / latestEnergy.cumulativeMah : 0,
    energyModelWarning
  };
}

export function computeMetricsFromLogs(
  logs: SimulationLogs,
  startTimeSecondsForMinuteRecords = 0
): SimulationMetrics {
  const trueContactSteps = logs.trueDyads.filter((dyad) => dyad.withinSocialRadius && dyad.bothCollarsValid).length;
  const observedDyads = new Set(logs.detections.map((event) => pairKey(event.observerId, event.peerId)));
  const trueDetectionOpportunities = logs.trueDyads.filter((dyad) => dyad.withinDetectionRadius && dyad.bothCollarsValid).length;
  const firmwareMinuteRecords = buildFirmwareMinuteRecords(logs.detections, startTimeSecondsForMinuteRecords);
  const firmwareMinuteObserverSlots = firmwareMinuteRecords.reduce(
    (sum, record) => sum + record.detectedPeers.length,
    0
  );

  return {
    trueContactSteps,
    observedDetections: logs.detections.length,
    scanWindows: logs.scanWindows.length,
    negativeScanWindows: logs.scanWindows.filter((window) => !window.detectedAnyPeer).length,
    uniqueObservedDyads: observedDyads.size,
    recallEstimate: trueDetectionOpportunities > 0 ? logs.detections.length / trueDetectionOpportunities : 0,
    bleCaptureRate: 0,
    bleCaptureHits: 0,
    bleCaptureOpportunities: 0,
    firmwareMinuteRecords,
    firmwareMinuteObserverSlots,
    scanningAnimals: 0,
    advertisingAnimals: 0,
    meanSamplingDrive: 0,
    meanScanIntervalSeconds: 0,
    energyUsedMah: logs.energy.at(-1)?.cumulativeMah ?? 0,
    meanEnergyCurrentMicroAmpsPerCollar: 0,
    batteryRemainingPercent: logs.energy.at(-1)?.remainingPercent ?? 1,
    estimatedVoltage: logs.energy.at(-1)?.estimatedVoltage ?? 0,
    capturePerMah: 0,
    energyModelWarning: undefined
  };
}

function computeBleCapture(state: SimulationState, logs: SimulationLogs): { hits: number; opportunities: number } {
  let opportunities = 0;
  let hits = 0;
  const dt = state.config.timeStepSeconds;

  for (const dyad of logs.trueDyads) {
    if (!dyad.withinDetectionRadius || !dyad.bothCollarsValid) {
      continue;
    }

    opportunities += 1;
    const dyadKey = pairKey(dyad.animalA, dyad.animalB);
    const epochStart = dyad.time - dt;
    const detected = logs.detections.some(
      (event) => pairKey(event.observerId, event.peerId) === dyadKey && event.time > epochStart && event.time <= dyad.time
    );

    if (detected) {
      hits += 1;
    }
  }

  return { hits, opportunities };
}
