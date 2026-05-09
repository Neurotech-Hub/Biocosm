import { computeMetrics } from "../simulation/analysis";
import type { SimulationState } from "../simulation/types";

type MetricsPanelProps = {
  state: SimulationState;
};

export function MetricsPanel({ state }: MetricsPanelProps) {
  const metrics = computeMetrics(state);
  const scanEffort = state.animals.length > 0 ? metrics.scanWindows / state.animals.length : 0;

  return (
    <section className="panel metrics-panel">
      <h2>Phase 1 Metrics</h2>
      <div className="metric-grid">
        <Metric label="True contact steps" value={metrics.trueContactSteps.toString()} />
        <Metric label="Observed detections" value={metrics.observedDetections.toString()} />
        <Metric label="Unique observed dyads" value={metrics.uniqueObservedDyads.toString()} />
        <Metric label="Scan windows" value={metrics.scanWindows.toString()} />
        <Metric label="Negative scan windows" value={metrics.negativeScanWindows.toString()} />
        <Metric label="Detections / opportunity" value={metrics.recallEstimate.toFixed(2)} />
        <Metric label="Scan windows / animal" value={scanEffort.toFixed(1)} />
        <Metric label="Current detections" value={state.detections.length.toString()} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
