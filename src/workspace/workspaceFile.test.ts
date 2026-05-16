import { describe, expect, it } from "vitest";
import { defaultSimulationConfig } from "../simulation/config";
import { DEFAULT_HARDWARE_ENERGY_PROFILE_ID } from "../simulation/hardwareEnergyProfiles";
import {
  buildWorkspaceFile,
  parseWorkspaceFileText,
  serializeWorkspaceFile,
  WORKSPACE_SCHEMA,
  WORKSPACE_VERSION,
  type WorkspaceLoadParams
} from "./workspaceFile";

describe("workspaceFile", () => {
  it("round-trips v2 params-only workspace", () => {
    const params: WorkspaceLoadParams = {
      config: { ...defaultSimulationConfig, seed: "workspace-v2" },
      view: { showTrueProximity: false, showObservedDetections: true },
      sweepMode: "report",
      reportSeedCount: 4,
      shouldRunSweep: true,
      workspaceTab: "simulator"
    };
    const original = buildWorkspaceFile(params);
    const text = serializeWorkspaceFile(original);
    const parsed = parseWorkspaceFileText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data.config.seed).toBe("workspace-v2");
    expect(parsed.data.view.showTrueProximity).toBe(false);
    expect(parsed.data.sweepMode).toBe("report");
    expect(parsed.data.reportSeedCount).toBe(4);
    expect(JSON.parse(text).sweep.gridVariant).toBeUndefined();
    expect(parsed.data.shouldRunSweep).toBe(true);
  });

  it("parses wasRun false as shouldRunSweep false", () => {
    const f = buildWorkspaceFile({
      config: defaultSimulationConfig,
      view: { showTrueProximity: true, showObservedDetections: true },
      sweepMode: "fast",
      reportSeedCount: 3,
      shouldRunSweep: false,
      workspaceTab: "simulator"
    });
    const parsed = parseWorkspaceFileText(serializeWorkspaceFile(f));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data.shouldRunSweep).toBe(false);
  });

  it("rejects wrong schema and version", () => {
    expect(parseWorkspaceFileText(JSON.stringify({ schema: "x", version: 2 })).ok).toBe(false);
    expect(parseWorkspaceFileText(JSON.stringify({ schema: WORKSPACE_SCHEMA, version: 99 })).ok).toBe(false);
  });

  it("rejects invalid JSON", () => {
    expect(parseWorkspaceFileText("{").ok).toBe(false);
  });

  it("migrates legacy juxta-v56 hardware energy profile id to the generic profile", () => {
    const f = buildWorkspaceFile({
      config: { ...defaultSimulationConfig, seed: "hw-mig", hardwareEnergyProfileId: "juxta-v56" },
      view: { showTrueProximity: true, showObservedDetections: true },
      sweepMode: "fast",
      reportSeedCount: 3,
      shouldRunSweep: false,
      workspaceTab: "simulator"
    });
    const parsed = parseWorkspaceFileText(serializeWorkspaceFile(f));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data.config.hardwareEnergyProfileId).toBe(DEFAULT_HARDWARE_ENERGY_PROFILE_ID);
    expect(parsed.data.config.energy.energyModel).toBe("bench_routine_linear_v1");
  });

  it("parses minimal v2 when sweep section uses defaults for missing fields", () => {
    const minimal = {
      schema: WORKSPACE_SCHEMA,
      version: WORKSPACE_VERSION,
      savedAt: "2026-01-01T00:00:00.000Z",
      app: { name: "Biocosm" },
      config: { ...defaultSimulationConfig, seed: "minimal" },
      view: {},
      sweep: {}
    };
    const parsed = parseWorkspaceFileText(JSON.stringify(minimal));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data.config.seed).toBe("minimal");
    expect(parsed.data.shouldRunSweep).toBe(false);
  });

  it("migrates v1 workspace: uses draftConfig and infers shouldRunSweep from result", () => {
    const v1 = {
      schema: WORKSPACE_SCHEMA,
      version: 1,
      savedAt: "2026-01-01T00:00:00.000Z",
      app: { name: "Biocosm" },
      simulator: {
        draftConfig: { ...defaultSimulationConfig, seed: "legacy" },
        builtConfig: defaultSimulationConfig,
        isBuildDirty: false,
        currentStep: 0,
        view: { showTrueProximity: true, showObservedDetections: false }
      },
      sweep: {
        mode: "fast",
        gridVariant: "quick",
        reportSeedCount: 3,
        result: { placeholder: true }
      },
      ui: { workspaceTab: "sweep" }
    };
    const parsed = parseWorkspaceFileText(JSON.stringify(v1));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data.config.seed).toBe("legacy");
    expect(parsed.data.shouldRunSweep).toBe(true);
    expect(parsed.data.workspaceTab).toBe("sweep");
    expect(parsed.warnings.some((w) => w.includes("legacy"))).toBe(true);
  });

  it("migrates v1 without sweep result as shouldRunSweep false", () => {
    const v1 = {
      schema: WORKSPACE_SCHEMA,
      version: 1,
      savedAt: "2026-01-01T00:00:00.000Z",
      app: { name: "Biocosm" },
      simulator: {
        draftConfig: { ...defaultSimulationConfig, seed: "no-sweep" },
        builtConfig: defaultSimulationConfig,
        isBuildDirty: false,
        currentStep: 0,
        view: {}
      },
      sweep: {
        mode: "fast",
        gridVariant: "quick",
        reportSeedCount: 3
      },
      ui: { workspaceTab: "simulator" }
    };
    const parsed = parseWorkspaceFileText(JSON.stringify(v1));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.data.shouldRunSweep).toBe(false);
  });
});
