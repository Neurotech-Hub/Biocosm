import type { ReactNode } from "react";

export function LegendPanel() {
  return (
    <section className="panel legend-panel" aria-label="Simulation legend">
      <h2>Legend</h2>
      <div className="legend-grid">
        <LegendItem label="Path / tunnel" sample={<span className="legend-line path-line" />} />
        <LegendItem label="True social proximity" sample={<span className="legend-line true-line" />} />
        <LegendItem label="Observed BLE detection" sample={<span className="legend-line observed-line" />} />
        <LegendItem label="Scan found peer" sample={<span className="legend-ring scan-summary-ring" />} />
        <LegendItem label="Advertisement detected" sample={<span className="legend-dot advertising-summary-dot" />} />
        <LegendItem label="Path node" sample={<span className="path-node-diamond" />} />
        <LegendItem label="Moving animal" sample={<span className="legend-dot moving-dot" />} />
        <LegendItem label="Sleeping animal" sample={<span className="legend-dot sleeping-dot" />} />
        <LegendItem label="Stationary animal" sample={<span className="legend-dot stationary-dot" />} />
      </div>
    </section>
  );
}

function LegendItem({ label, sample }: { label: string; sample: ReactNode }) {
  return (
    <div className="legend-item">
      <span className="legend-sample">{sample}</span>
      <span>{label}</span>
    </div>
  );
}
