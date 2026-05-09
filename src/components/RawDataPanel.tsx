import { resolveSpeciesPreset } from "../simulation/speciesModifiers";
import type { SimulationConfig, SimulationLogs, SimulationState } from "../simulation/types";

type RawDataPanelProps = {
  logs: SimulationLogs;
  config: SimulationConfig;
  timeline?: SimulationState[];
};

export function RawDataPanel({ logs, config, timeline = [] }: RawDataPanelProps) {
  const speciesPreset = resolveSpeciesPreset(config.speciesPresetId, config.speciesModifiers, config.advancedSpeciesOverrides);
  const sampledAnimalTraits = timeline[0]?.animals.map((animal) => animal.traits) ?? [];
  return (
    <section className="panel raw-data-panel">
      <h2>Raw Data Export</h2>
      <p className="helper-text">
        Frame-by-frame logs are kept out of the live scrub view for performance. Export them when you need detailed
        inspection outside the canvas QC workflow.
      </p>
      <div className="export-summary">
        <span>{logs.animalStates.length.toLocaleString()} animal-state rows</span>
        <span>{logs.trueDyads.length.toLocaleString()} true-dyad rows</span>
        <span>{logs.detections.length.toLocaleString()} detection rows</span>
        <span>{logs.bleBursts.length.toLocaleString()} BLE burst rows</span>
      </div>
      <div className="button-row">
        <button
          type="button"
          onClick={() =>
            downloadJson("biocosm-raw-logs.json", { config, speciesPreset, sampledAnimalTraits, logs })
          }
        >
          Export JSON
        </button>
        <button type="button" onClick={() => downloadCsvBundle(logs)}>
          Export CSV Bundle
        </button>
      </div>
    </section>
  );
}

function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, JSON.stringify(data, null, 2), "application/json");
}

function downloadCsvBundle(logs: SimulationLogs): void {
  const sections = [
    csvSection("animalStates", logs.animalStates),
    csvSection("trueDyads", logs.trueDyads),
    csvSection("detections", logs.detections),
    csvSection("bleBursts", logs.bleBursts),
    csvSection("scanWindows", logs.scanWindows),
    csvSection("collarStates", logs.collarStates),
    csvSection("energy", logs.energy)
  ];
  downloadBlob("biocosm-raw-logs.csv", sections.join("\n\n"), "text/csv");
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
