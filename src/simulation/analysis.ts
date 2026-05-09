import { pairKey } from "./geometry";
import type { SimulationLogs, SimulationMetrics, SimulationState } from "./types";

export function computeMetrics(state: SimulationState): SimulationMetrics {
  return computeMetricsFromLogs(state.logs);
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
    recallEstimate: trueDetectionOpportunities > 0 ? logs.detections.length / trueDetectionOpportunities : 0
  };
}
