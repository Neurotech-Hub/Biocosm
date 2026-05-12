import { resolveSpeciesPreset } from "../simulation/speciesModifiers";
import type { FirmwareMinuteRecord, SimulationConfig, SimulationLogs, SimulationMetrics, SimulationState } from "../simulation/types";
import { InfoPopover } from "./InfoPopover";

type RawDataPanelProps = {
  logs: SimulationLogs;
  config: SimulationConfig;
  metrics: SimulationMetrics;
  timeline?: SimulationState[];
};

export function RawDataPanel({ logs, config, metrics, timeline = [] }: RawDataPanelProps) {
  const speciesPreset = resolveSpeciesPreset(config.speciesPresetId, config.speciesModifiers, config.advancedSpeciesOverrides);
  const sampledAnimalTraits = timeline[0]?.animals.map((animal) => animal.traits) ?? [];
  return (
    <section className="panel raw-data-panel">
      <div className="panel-title-row">
        <h2>Raw Data Export</h2>
        <InfoPopover label="Explain raw data export" title="Raw export and firmware-minute rollups">
          <p>
            Firmware-minute rollups collapse raw BLE detections into clock-minute buckets, similar to a collar log.
            Each observer gets one row per minute with unique peers and the strongest RSSI per peer.
          </p>
          <p>
            The <strong>energy</strong> CSV section is one row per simulation timestep: values are the{" "}
            <strong>cohort mean</strong> across animals (same series as the Simulation time-series energy chart).
          </p>
          <dl className="metric-definition-list">
            <dt>Observer-minute rows</dt>
            <dd>Number of observer/minute buckets that contain at least one detected peer.</dd>
            <dt>Peer entries (total)</dt>
            <dd>Sum of unique peer slots across observer-minute rows. This is derived from raw detection rows.</dd>
          </dl>
        </InfoPopover>
      </div>
      <div className="export-summary">
        <span>{logs.animalStates.length.toLocaleString()} animal-state rows</span>
        <span>{logs.trueDyads.length.toLocaleString()} true-dyad rows</span>
        <span>{logs.detections.length.toLocaleString()} detection rows</span>
        <span>{logs.bleBursts.length.toLocaleString()} BLE burst rows</span>
        <span>{logs.adaptiveBlePolicy.length.toLocaleString()} adaptive-policy rows</span>
        <span>{metrics.firmwareMinuteRecords.length.toLocaleString()} observer-minute rows</span>
      </div>
      <div className="button-row">
        <button
          type="button"
          onClick={() =>
            downloadJson("biocosm-raw-logs.json", {
              config,
              speciesPreset,
              sampledAnimalTraits,
              logs,
              firmwareMinuteRecords: metrics.firmwareMinuteRecords
            })
          }
        >
          Export JSON
        </button>
        <button type="button" onClick={() => downloadCsvBundle(logs, metrics.firmwareMinuteRecords)}>
          Export CSV Bundle
        </button>
      </div>
    </section>
  );
}

function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, JSON.stringify(data, null, 2), "application/json");
}

function downloadCsvBundle(logs: SimulationLogs, firmwareMinuteRecords: FirmwareMinuteRecord[]): void {
  const sections = [
    csvSection("animalStates", logs.animalStates),
    csvSection("trueDyads", logs.trueDyads),
    csvSection("detections", logs.detections),
    csvSection("bleBursts", logs.bleBursts),
    csvSection("scanWindows", logs.scanWindows),
    csvSection("adaptiveBlePolicy", logs.adaptiveBlePolicy),
    csvSection("firmwareMinuteRecords", firmwareMinuteRecordRows(firmwareMinuteRecords)),
    csvSection("collarStates", logs.collarStates),
    csvSection("energy (cohort mean per timestep)", logs.energy)
  ];
  downloadBlob("biocosm-raw-logs.csv", sections.join("\n\n"), "text/csv");
}

function firmwareMinuteRecordRows(records: FirmwareMinuteRecord[]): Record<string, unknown>[] {
  return records.map((record) => ({
    minuteBucketStartSeconds: record.minuteBucketStartSeconds,
    observerId: record.observerId,
    detectedPeerCount: record.detectedPeers.length,
    detectedPeers: record.detectedPeers.map((peer) => `${peer.peerId}:${peer.strongestRssi.toFixed(1)}dBm`).join(";")
  }));
}

function csvSection(name: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return `# ${name}\n`;
  }

  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\n");
  return `# ${name}\n${headers.join(",")}\n${body}`;
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(";") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function downloadBlob(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
