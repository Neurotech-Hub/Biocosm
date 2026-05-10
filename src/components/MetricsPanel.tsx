import type { ReactNode } from "react";
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
      <div className="metric-sections">
        <MetricSection title="BLE Capture & Recall">
          <Metric
            label="BLE capture rate (interval-level)"
            value={`${Math.round(metrics.bleCaptureRate * 100)}%`}
            emphasized
          />
          <Metric
            label="Captured in-range intervals / opportunities"
            value={`${metrics.bleCaptureHits} / ${metrics.bleCaptureOpportunities}`}
          />
          <Metric label="Detections / opportunity" value={metrics.recallEstimate.toFixed(2)} />
          <Metric label="True contact steps" value={metrics.trueContactSteps.toString()} />
          <Metric label="Observed detections" value={metrics.observedDetections.toString()} />
          <Metric label="Unique observed dyads" value={metrics.uniqueObservedDyads.toString()} />
        </MetricSection>

        <MetricSection title="Firmware-Minute Rollups">
          <Metric label="Peer entries (total)" value={metrics.firmwareMinuteObserverSlots.toString()} />
          <Metric label="Observer rows" value={metrics.firmwareMinuteRecords.length.toString()} />
        </MetricSection>

        <MetricSection title="Scanning & Radio">
          <Metric label="Scan windows" value={metrics.scanWindows.toString()} />
          <Metric label="Negative scan windows" value={metrics.negativeScanWindows.toString()} />
          <Metric label="Scan windows / animal" value={scanEffort.toFixed(1)} />
          <Metric label="Animals with scan bursts" value={metrics.scanningAnimals.toString()} />
          <Metric label="Animals with ad bursts" value={metrics.advertisingAnimals.toString()} />
          <Metric label="Mean sampling drive" value={metrics.meanSamplingDrive.toFixed(2)} />
          <Metric label="Mean scan interval" value={`${Math.round(metrics.meanScanIntervalSeconds)}s`} />
        </MetricSection>

        <MetricSection title="Energy (Representative Collar)">
          <Metric
            label="Mean current draw"
            value={`${metrics.meanEnergyCurrentMicroAmpsPerCollar.toFixed(0)} µA`}
          />
          <Metric label="Energy used" value={`${metrics.energyUsedMah.toFixed(3)} mAh`} />
          <Metric label="Battery remaining" value={`${Math.round(metrics.batteryRemainingPercent * 100)}%`} />
          <Metric label="Estimated voltage" value={`${metrics.estimatedVoltage.toFixed(2)} V`} />
          <Metric label="Capture / mAh" value={metrics.capturePerMah.toFixed(1)} />
        </MetricSection>
      </div>
      {metrics.energyModelWarning ? <p className="helper-text">{metrics.energyModelWarning}</p> : null}
      <p className="helper-text">
        BLE energy and battery numbers model a <strong>single representative collar</strong> (first valid animal in the
        list), not a fleet total — match these to per-device figures on the datasheet.
      </p>
      <p className="helper-text">
        Firmware-minute metrics collapse detections like a collar minute record: unique peers per observer per clock
        minute, keeping the strongest RSSI. Raw detection count and interval capture rate are separate measures.
      </p>
    </section>
  );
}

function MetricSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="metric-section">
      <h3 className="metrics-section-title">{title}</h3>
      <div className="metric-grid">{children}</div>
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
