import type { SimulationMetrics } from "../simulation/types";

type MetricsPanelProps = {
  metrics: SimulationMetrics;
  animalCount: number;
};

export function MetricsPanel({ metrics, animalCount }: MetricsPanelProps) {
  const scanEffort = animalCount > 0 ? metrics.scanWindows / animalCount : 0;

  return (
    <section className="panel metrics-panel">
      <h2>Whole-Simulation Policy Metrics</h2>
      <div className="metric-grid">
        <Metric
          label="BLE capture rate (interval-level)"
          value={`${Math.round(metrics.bleCaptureRate * 100)}%`}
          emphasized
        />
        <Metric
          label="Captured in-range intervals / opportunities"
          value={`${metrics.bleCaptureHits} / ${metrics.bleCaptureOpportunities}`}
        />
        <Metric label="Firmware-minute peer entries (total)" value={metrics.firmwareMinuteObserverSlots.toString()} />
        <Metric label="Firmware-minute observer rows" value={metrics.firmwareMinuteRecords.length.toString()} />
        <Metric label="True contact steps" value={metrics.trueContactSteps.toString()} />
        <Metric label="Observed detections" value={metrics.observedDetections.toString()} />
        <Metric label="Unique observed dyads" value={metrics.uniqueObservedDyads.toString()} />
        <Metric label="Scan windows" value={metrics.scanWindows.toString()} />
        <Metric label="Negative scan windows" value={metrics.negativeScanWindows.toString()} />
        <Metric label="Detections / opportunity" value={metrics.recallEstimate.toFixed(2)} />
        <Metric label="Scan windows / animal" value={scanEffort.toFixed(1)} />
        <Metric label="Animals with scan bursts" value={metrics.scanningAnimals.toString()} />
        <Metric label="Animals with ad bursts" value={metrics.advertisingAnimals.toString()} />
        <Metric label="Mean sampling drive" value={metrics.meanSamplingDrive.toFixed(2)} />
        <Metric label="Mean scan interval" value={`${Math.round(metrics.meanScanIntervalSeconds)}s`} />
        <Metric label="Energy used" value={`${metrics.energyUsedMah.toFixed(3)} mAh`} />
        <Metric label="Battery remaining" value={`${Math.round(metrics.batteryRemainingPercent * 100)}%`} />
        <Metric label="Estimated voltage" value={`${metrics.estimatedVoltage.toFixed(2)} V`} />
        <Metric label="Capture / mAh" value={metrics.capturePerMah.toFixed(1)} />
      </div>
      <p className="helper-text">
        Firmware-minute metrics collapse detections like a collar minute record: unique peers per observer per clock
        minute, keeping the strongest RSSI. Raw detection count and interval capture rate are separate measures.
      </p>
    </section>
  );
}

function Metric({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className={emphasized ? "metric-card metric-card-primary" : "metric-card"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
