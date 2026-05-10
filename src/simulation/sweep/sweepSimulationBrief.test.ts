import { describe, expect, it } from "vitest";
import { defaultSimulationConfig } from "../config";
import { buildSweepSimulationBrief } from "./sweepSimulationBrief";

describe("buildSweepSimulationBrief", () => {
  it("includes species, seeds for fast mode, and sweep policy note", () => {
    const rows = buildSweepSimulationBrief(
      { ...defaultSimulationConfig, seed: "99", speciesPresetId: "lab_mouse" },
      "fast"
    );
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel.Species).toContain("mouse");
    expect(byLabel.Seeds).toContain("99");
    expect(byLabel.Seeds).toContain("Fast preview");
    expect(byLabel["Collar policy"]).toMatch(/Sweep substitutes/);
  });

  it("uses report seeds in report mode", () => {
    const rows = buildSweepSimulationBrief(defaultSimulationConfig, "report");
    const seeds = rows.find((r) => r.label === "Seeds")?.value ?? "";
    expect(seeds).toContain("101");
    expect(seeds).toContain("303");
    expect(seeds).toContain("aggregated");
  });
});
