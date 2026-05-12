import type { ReactNode } from "react";
import { deviceLifetimeDaysFromMeanMicroAmps } from "../simulation/analysis";
import type { SimulationMetrics } from "../simulation/types";
import { InfoPopover } from "./InfoPopover";

type MetricsPanelProps = {
  metrics: SimulationMetrics;
  animalCount: number;
  batteryCapacityMah: number;
};

export function MetricsPanel({ metrics, animalCount, batteryCapacityMah }: MetricsPanelProps) {
  const scanEffort = animalCount > 0 ? metrics.scanWindows / animalCount : 0;
  const deviceLifetimeDays = deviceLifetimeDaysFromMeanMicroAmps(
    batteryCapacityMah,
    metrics.meanEnergyCurrentMicroAmpsPerCollar
  );

  return (
    <section className="panel metrics-panel">
      <div className="panel-title-row">
        <h2>Whole-Simulation Policy Metrics</h2>
        <InfoPopover label="Explain whole-simulation metrics" title="Metric definitions">
          <dl className="metric-definition-list">
            <dt>BLE capture rate</dt>
            <dd>
              Fraction of in-range valid dyad epochs where the simulated BLE system recorded at least one detection for
              that unordered pair during the same epoch.
            </dd>
            <dt>Raw detection density</dt>
            <dd>Total detection events divided by in-range opportunity epochs. It can exceed 1 when multiple directed detections happen in one epoch.</dd>
            <dt>True contact steps</dt>
            <dd>Ground-truth dyad epochs inside the social-radius threshold with both collars valid.</dd>
            <dt>Scan windows</dt>
            <dd>Firmware-style scan windows scheduled across the whole run. Negative windows are scans that found no peer.</dd>
            <dt>Energy and battery</dt>
            <dd>
              Cohort mean across simulated animals: each timestep averages per-collar energy logs. Capture/mAh uses
              that mean cumulative drain. Device lifetime assumes constant mean draw over 24 h and full usable pack
              capacity per device.
            </dd>
          </dl>
        </InfoPopover>
      </div>
      <div className="metric-hero-grid">
        <Metric
          label="BLE capture rate"
          value={`${Math.round(metrics.bleCaptureRate * 100)}%`}
          emphasized
          hero
        />
        <Metric
          label="BLE efficiency (hits / mAh)"
          value={metrics.capturePerMah.toFixed(1)}
          emphasized
          hero
        />
      </div>
      <div className="metric-sections">
        <MetricSection title="BLE Capture & Recall">
          <Metric
            label="Captured in-range intervals / opportunities"
            value={`${metrics.bleCaptureHits} / ${metrics.bleCaptureOpportunities}`}
          />
          <Metric label="Raw detection density" value={metrics.rawDetectionDensity.toFixed(2)} />
          <Metric label="True contact steps" value={metrics.trueContactSteps.toString()} />
          <Metric label="Observed detections" value={metrics.observedDetections.toString()} />
          <Metric label="Unique observed dyads" value={metrics.uniqueObservedDyads.toString()} />
        </MetricSection>

        <MetricSection title="Scanning & Radio">
          <Metric label="Scan windows" value={metrics.scanWindows.toString()} />
          <Metric label="Negative scan windows" value={metrics.negativeScanWindows.toString()} />
          <Metric label="Scan windows / animal" value={scanEffort.toFixed(1)} />
        </MetricSection>

        <MetricSection title="Energy (cohort mean)">
          <Metric label="Energy used" value={`${metrics.energyUsedMah.toFixed(3)} mAh`} />
          <Metric label="Battery remaining" value={`${Math.round(metrics.batteryRemainingPercent * 100)}%`} />
          <Metric label="Estimated voltage" value={`${metrics.estimatedVoltage.toFixed(2)} V`} />
          <Metric label="Mean current draw" value={`${metrics.meanEnergyCurrentMicroAmpsPerCollar.toFixed(0)} µA`} />
          <Metric
            label="Device lifetime"
            value={deviceLifetimeDays != null ? `${deviceLifetimeDays.toFixed(1)} days` : "—"}
          />
        </MetricSection>
      </div>
      {metrics.energyModelWarning ? <p className="helper-text">{metrics.energyModelWarning}</p> : null}
      <p className="helper-text metrics-panel-footnote">
        BLE energy and battery numbers are <strong>cohort means</strong> (per timestep, average across all simulated
        animals): use them for population-average drain and voltage; match per-device datasheet figures to a single
        animal’s trajectory in logs if needed. Raw detection density and interval capture rate are separate measures,
        with capture bounded by opportunity epochs and raw density counting detection events.
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

function Metric({
  label,
  value,
  emphasized = false,
  hero = false
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  hero?: boolean;
}) {
  const className = [
    "metric-card",
    emphasized ? "metric-card-primary" : "",
    hero ? "metric-card-hero" : ""
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
