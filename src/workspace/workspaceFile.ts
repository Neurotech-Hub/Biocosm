import { normalizeBlePolicyPresetId } from "../simulation/blePolicyPresets";
import { defaultSimulationConfig } from "../simulation/config";
import {
  DEFAULT_HARDWARE_ENERGY_PROFILE_ID,
  hardwareEnergyProfiles,
  normalizeHardwareEnergyProfileId
} from "../simulation/hardwareEnergyProfiles";
import { defaultSweepGridVariant, type SweepGridVariant } from "../simulation/sweep/adaptiveBleSweep";
import type { SimulationConfig } from "../simulation/types";

export const WORKSPACE_SCHEMA = "biocosm.workspace" as const;
export const WORKSPACE_VERSION = 2 as const;

export type WorkspaceTab = "simulator" | "sweep";

export type BiocosmWorkspaceFileV2 = {
  schema: typeof WORKSPACE_SCHEMA;
  version: typeof WORKSPACE_VERSION;
  savedAt: string;
  app: { name: "Biocosm" };
  config: SimulationConfig;
  view: { showTrueProximity: boolean; showObservedDetections: boolean };
  sweep: {
    mode: "fast" | "report";
    gridVariant: SweepGridVariant;
    reportSeedCount: number;
    wasRun: boolean;
  };
};

export type WorkspaceLoadParams = {
  config: SimulationConfig;
  view: { showTrueProximity: boolean; showObservedDetections: boolean };
  sweepMode: "fast" | "report";
  sweepGridVariant: SweepGridVariant;
  reportSeedCount: number;
  shouldRunSweep: boolean;
  workspaceTab: WorkspaceTab;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSweepGridVariant(value: unknown): value is SweepGridVariant {
  return value === "minimal" || value === "quick" || value === "full";
}

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  return value === "simulator" || value === "sweep";
}

/** Shallow merge for nested config objects we know are JSON-serializable. */
function mergeSimulationConfig(partial: unknown): SimulationConfig {
  const base = structuredClone(defaultSimulationConfig);
  if (!isPlainObject(partial)) {
    return base;
  }
  const p = partial as Record<string, unknown>;
  const merged = { ...base, ...p } as SimulationConfig;
  if (isPlainObject(p.enclosure)) {
    merged.enclosure = { ...base.enclosure, ...(p.enclosure as SimulationConfig["enclosure"]) };
  }
  if (isPlainObject(p.behavior)) {
    merged.behavior = { ...base.behavior, ...(p.behavior as SimulationConfig["behavior"]) };
  }
  if (isPlainObject(p.biology)) {
    merged.biology = { ...base.biology, ...(p.biology as SimulationConfig["biology"]) };
  }
  if (isPlainObject(p.motionSensor)) {
    merged.motionSensor = { ...base.motionSensor, ...(p.motionSensor as SimulationConfig["motionSensor"]) };
  }
  if (isPlainObject(p.radio)) {
    merged.radio = { ...base.radio, ...(p.radio as SimulationConfig["radio"]) };
  }
  if (isPlainObject(p.energy)) {
    merged.energy = { ...base.energy, ...(p.energy as SimulationConfig["energy"]), energyModel: "component" };
  }
  if (isPlainObject(p.bleScheduling)) {
    merged.bleScheduling = { ...base.bleScheduling, ...(p.bleScheduling as SimulationConfig["bleScheduling"]) };
  }
  if (p.activePolicy != null && typeof p.activePolicy === "object") {
    merged.activePolicy = p.activePolicy as SimulationConfig["activePolicy"];
  }
  if (isPlainObject(p.speciesModifiers)) {
    merged.speciesModifiers = { ...base.speciesModifiers, ...(p.speciesModifiers as SimulationConfig["speciesModifiers"]) };
  }
  if (p.advancedSpeciesOverrides != null && typeof p.advancedSpeciesOverrides === "object") {
    merged.advancedSpeciesOverrides = p.advancedSpeciesOverrides as SimulationConfig["advancedSpeciesOverrides"];
  }
  merged.blePolicyPresetId = normalizeBlePolicyPresetId(merged.blePolicyPresetId);
  const hwNorm = normalizeHardwareEnergyProfileId(String(merged.hardwareEnergyProfileId));
  merged.hardwareEnergyProfileId = hardwareEnergyProfiles[hwNorm] ? hwNorm : DEFAULT_HARDWARE_ENERGY_PROFILE_ID;
  merged.energy.energyModel = "component";
  return merged;
}

export type ParseWorkspaceResult =
  | { ok: true; data: WorkspaceLoadParams; warnings: string[] }
  | { ok: false; error: string };

export function buildWorkspaceFile(params: WorkspaceLoadParams): BiocosmWorkspaceFileV2 {
  return {
    schema: WORKSPACE_SCHEMA,
    version: WORKSPACE_VERSION,
    savedAt: new Date().toISOString(),
    app: { name: "Biocosm" },
    config: params.config,
    view: params.view,
    sweep: {
      mode: params.sweepMode,
      gridVariant: params.sweepGridVariant,
      reportSeedCount: params.reportSeedCount,
      wasRun: params.shouldRunSweep
    }
  };
}

export function serializeWorkspaceFile(data: BiocosmWorkspaceFileV2): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function parseWorkspaceV2(parsed: Record<string, unknown>, warnings: string[]): WorkspaceLoadParams {
  const config = mergeSimulationConfig(parsed.config);
  const viewRaw = isPlainObject(parsed.view) ? (parsed.view as Record<string, unknown>) : {};
  const showTrueProximity = viewRaw.showTrueProximity !== false;
  const showObservedDetections = viewRaw.showObservedDetections !== false;

  const sw = isPlainObject(parsed.sweep) ? (parsed.sweep as Record<string, unknown>) : {};
  let sweepMode: "fast" | "report" = sw.mode === "report" ? "report" : "fast";
  if (sw.mode != null && sw.mode !== "fast" && sw.mode !== "report") {
    warnings.push("Invalid sweep.mode; defaulting to fast.");
    sweepMode = "fast";
  }
  const gridVariant: SweepGridVariant = isSweepGridVariant(sw.gridVariant)
    ? sw.gridVariant
    : defaultSweepGridVariant();
  if (sw.gridVariant != null && !isSweepGridVariant(sw.gridVariant)) {
    warnings.push("Invalid sweep.gridVariant; using default grid.");
  }
  const reportSeedCount = isFiniteNumber(sw.reportSeedCount)
    ? Math.min(5, Math.max(1, Math.floor(sw.reportSeedCount)))
    : 3;
  const shouldRunSweep = sw.wasRun === true;

  return {
    config,
    view: { showTrueProximity, showObservedDetections },
    sweepMode,
    sweepGridVariant: gridVariant,
    reportSeedCount,
    shouldRunSweep,
    workspaceTab: "simulator"
  };
}

/** Migrate legacy v1 workspace files (build + sweep result) into params-only load semantics. */
function parseWorkspaceV1(parsed: Record<string, unknown>, warnings: string[]): WorkspaceLoadParams {
  if (!isPlainObject(parsed.simulator)) {
    warnings.push("Missing simulator object; using default configuration.");
  }
  const sim = isPlainObject(parsed.simulator) ? (parsed.simulator as Record<string, unknown>) : {};
  const config = mergeSimulationConfig(sim.draftConfig ?? sim.builtConfig);
  const view = isPlainObject(sim.view) ? sim.view : {};
  const showTrueProximity = (view as Record<string, unknown>).showTrueProximity !== false;
  const showObservedDetections = (view as Record<string, unknown>).showObservedDetections !== false;

  const sw = isPlainObject(parsed.sweep) ? (parsed.sweep as Record<string, unknown>) : {};
  let sweepMode: "fast" | "report" = sw.mode === "report" ? "report" : "fast";
  if (sw.mode != null && sw.mode !== "fast" && sw.mode !== "report") {
    warnings.push("Invalid sweep.mode; defaulting to fast.");
    sweepMode = "fast";
  }
  const gridVariant: SweepGridVariant = isSweepGridVariant(sw.gridVariant)
    ? sw.gridVariant
    : defaultSweepGridVariant();
  if (sw.gridVariant != null && !isSweepGridVariant(sw.gridVariant)) {
    warnings.push("Invalid sweep.gridVariant; using default grid.");
  }
  const reportSeedCount = isFiniteNumber(sw.reportSeedCount)
    ? Math.min(5, Math.max(1, Math.floor(sw.reportSeedCount)))
    : 3;
  const shouldRunSweep = sw.result != null;

  const ui = isPlainObject(parsed.ui) ? (parsed.ui as Record<string, unknown>) : {};
  let workspaceTab: WorkspaceTab = "simulator";
  if (isWorkspaceTab(ui.workspaceTab)) {
    workspaceTab = ui.workspaceTab;
  } else if (ui.workspaceTab != null) {
    warnings.push("Invalid ui.workspaceTab; defaulting to simulator.");
  }

  warnings.push("Loaded legacy workspace format (v1); simulator and sweep will be rebuilt from parameters.");

  return {
    config,
    view: { showTrueProximity, showObservedDetections },
    sweepMode,
    sweepGridVariant: gridVariant,
    reportSeedCount,
    shouldRunSweep,
    workspaceTab
  };
}

export function parseWorkspaceFileText(text: string): ParseWorkspaceResult {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: "Workspace root must be an object" };
  }
  if (parsed.schema !== WORKSPACE_SCHEMA) {
    return { ok: false, error: `Unknown workspace schema: ${String(parsed.schema)}` };
  }
  if (typeof parsed.savedAt !== "string") {
    return { ok: false, error: "Missing savedAt" };
  }

  const version = parsed.version;
  if (version === WORKSPACE_VERSION) {
    const data = parseWorkspaceV2(parsed, warnings);
    return { ok: true, data, warnings };
  }
  if (version === 1) {
    const data = parseWorkspaceV1(parsed, warnings);
    return { ok: true, data, warnings };
  }
  return { ok: false, error: `Unsupported workspace version: ${String(version)}` };
}

export function workspaceFilename(seed: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const safeSeed = String(seed).replace(/[^\w.-]+/g, "_");
  return `biocosm-workspace-seed-${safeSeed}-${day}.biocosm.json`;
}

export function downloadWorkspaceJson(filename: string, jsonText: string): void {
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function readTextFromFile(file: File): Promise<string> {
  return file.text();
}
