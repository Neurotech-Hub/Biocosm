import { pairKey } from "./geometry";
import type { SimulationLogs, SimulationMetrics, SimulationState } from "./types";

export function computeMetrics(state: SimulationState, logs: SimulationLogs = state.logs): SimulationMetrics {
  const logMetrics = computeMetricsFromLogs(logs);
  const animalCount = Math.max(1, state.animals.length);
  const capture = computeBleCapture(state, logs);
  const latestEnergy = logs.energy.at(-1) ?? state.energy;
  return {
    ...logMetrics,
    bleCaptureRate: capture.opportunities > 0 ? capture.hits / capture.opportunities : 0,
    bleCaptureHits: capture.hits,
    bleCaptureOpportunities: capture.opportunities,
    scanningAnimals: new Set(logs.bleBursts.filter((burst) => burst.kind === "scan").map((burst) => burst.animalId)).size,
    advertisingAnimals: new Set(logs.bleBursts.filter((burst) => burst.kind === "advertise").map((burst) => burst.animalId)).size,
    meanSamplingDrive: state.animals.reduce((sum, animal) => sum + animal.collar.samplingDrive, 0) / animalCount,
    meanScanIntervalSeconds:
      state.animals.reduce((sum, animal) => sum + animal.collar.scanIntervalSeconds, 0) / animalCount,
    energyUsedMah: latestEnergy.cumulativeMah,
    batteryRemainingPercent: latestEnergy.remainingPercent,
    estimatedVoltage: latestEnergy.estimatedVoltage,
    capturePerMah: latestEnergy.cumulativeMah > 0 ? capture.hits / latestEnergy.cumulativeMah : 0
  };
}

export function computeMetricsFromLogs(logs: SimulationLogs): SimulationMetrics {
  const trueContactSteps = logs.trueDyads.filter((dyad) => dyad.withinSocialRadius && dyad.bothCollarsValid).length;
  const observedDyads = new Set(logs.detections.map((event) => pairKey(event.observerId, event.peerId)));
  const trueDetectionOpportunities = logs.trueDyads.filter((dyad) => dyad.withinDetectionRadius && dyad.bothCollarsValid).length;

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
    scanningAnimals: 0,
    advertisingAnimals: 0,
    meanSamplingDrive: 0,
    meanScanIntervalSeconds: 0,
    energyUsedMah: logs.energy.at(-1)?.cumulativeMah ?? 0,
    batteryRemainingPercent: logs.energy.at(-1)?.remainingPercent ?? 1,
    estimatedVoltage: logs.energy.at(-1)?.estimatedVoltage ?? 0,
    capturePerMah: 0
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
