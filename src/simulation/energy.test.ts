import {
  defaultSimulationConfig,
  juxtaMainCMode0FixedPolicy,
  JUXTA_DATASHEET_SOCIAL_MODE_MICRO_AMPS,
  milliampHoursFromMeanMicroAmps
} from "./config";
import { computeEnergyLog, meanEnergyLog, MICROCOULOMBS_PER_MILLIAMP_HOUR } from "./energy";
import { runSimulation } from "./engine";
import type { BleBurstEvent, EnergyConfig } from "./types";
import { createInitialSimulation } from "./world";

/** Energy tuned to reproduce ~233 µA long-run Juxta social-mode calibration in integration tests below. */
function energyForJuxtaSocialDatasheetCheck(base: EnergyConfig): EnergyConfig {
  return {
    ...base,
    baselineCurrentMicroAmps: 78,
    componentBleActivityScale: 1.134,
    measuredSocial5s20sTotalMicroAmps: 233.09
  };
}

describe("energy model", () => {
  it("converts advertising µC to mAh via µC / 3_600_000", () => {
    expect(MICROCOULOMBS_PER_MILLIAMP_HOUR).toBe(3_600_000);
    expect((13 * 1000) / MICROCOULOMBS_PER_MILLIAMP_HOUR).toBeCloseTo((13 * 1000) / 3_600_000, 12);
  });

  it("with no bursts, only baseline contributes", () => {
    const energy = computeEnergyLog(120, 60, [], defaultSimulationConfig.energy);
    const expectedSteady = (defaultSimulationConfig.energy.baselineCurrentMicroAmps * 60) / 3_600_000;
    expect(energy.steadyMah).toBeCloseTo(expectedSteady, 6);
    expect(energy.scanMah).toBe(0);
    expect(energy.advertisingMah).toBe(0);
  });

  it("meanEnergyLog averages per-collar rows element-wise", () => {
    const burstsA: BleBurstEvent[] = [
      { kind: "scan", startTime: 0, endTime: 1.5, animalId: "animal-1", policyId: "p" }
    ];
    const burstsB: BleBurstEvent[] = [
      { kind: "scan", startTime: 0, endTime: 3, animalId: "animal-2", policyId: "p" }
    ];
    const config = {
      ...defaultSimulationConfig.energy,
      baselineCurrentMicroAmps: 0,
      advertisingEventIntervalSeconds: 10,
      componentBleActivityScale: 1
    };
    const a = computeEnergyLog(60, 60, burstsA, config, 0);
    const b = computeEnergyLog(60, 60, burstsB, config, 0);
    const m = meanEnergyLog(60, [a, b]);
    expect(m.totalMah).toBeCloseTo((a.totalMah + b.totalMah) / 2, 8);
    expect(m.cumulativeMah).toBeCloseTo((a.cumulativeMah + b.cumulativeMah) / 2, 8);
  });

  it("uses scan listen duty and advertising event charge instead of burst wall time", () => {
    const bursts: BleBurstEvent[] = [
      { kind: "scan", startTime: 0, endTime: 1.5, animalId: "animal-1", policyId: "fixed-rate" },
      { kind: "advertise", startTime: 10, endTime: 12, animalId: "animal-1", policyId: "fixed-rate" }
    ];
    const config = {
      ...defaultSimulationConfig.energy,
      baselineCurrentMicroAmps: 0,
      advertisingEventIntervalSeconds: 10,
      componentBleActivityScale: 1
    };

    const energy = computeEnergyLog(60, 60, bursts, config);

    expect(energy.scanMah).toBeCloseTo((0.375 * config.rxCurrentMa1MPhy) / 3600, 8);
    expect(energy.advertisingMah).toBeCloseTo(
      config.advEventChargeMicroCoulombs / MICROCOULOMBS_PER_MILLIAMP_HOUR,
      12
    );
  });

  it("datasheet mean current converts to mAh (233.09 µA × 24 h ≈ 5.59 mAh per device)", () => {
    const mah = milliampHoursFromMeanMicroAmps(JUXTA_DATASHEET_SOCIAL_MODE_MICRO_AMPS, 24);
    expect(mah).toBeCloseTo(5.594_16, 2);
  });

  it("24h Juxta Social Mode matches ~233 µA average per collar (±2%)", () => {
    const config = {
      ...defaultSimulationConfig,
      seed: "energy-day",
      animalCount: 1,
      startTimeSeconds: 0,
      timeStepSeconds: 60,
      activePolicy: { ...juxtaMainCMode0FixedPolicy },
      energy: energyForJuxtaSocialDatasheetCheck(defaultSimulationConfig.energy)
    };
    const steps = (24 * 3600) / config.timeStepSeconds;
    const final = runSimulation(createInitialSimulation(config), steps);
    const expectedMah = milliampHoursFromMeanMicroAmps(JUXTA_DATASHEET_SOCIAL_MODE_MICRO_AMPS, 24);
    expect(final.energy.cumulativeMah).toBeGreaterThanOrEqual(expectedMah * 0.98);
    expect(final.energy.cumulativeMah).toBeLessThanOrEqual(expectedMah * 1.02);
  });

  it("24h cohort-mean cumulative matches mean of per-animal cumulative tracks", () => {
    const base = {
      ...defaultSimulationConfig,
      seed: "energy-day",
      startTimeSeconds: 0,
      timeStepSeconds: 60,
      activePolicy: { ...juxtaMainCMode0FixedPolicy },
      energy: energyForJuxtaSocialDatasheetCheck(defaultSimulationConfig.energy)
    };
    const steps = (24 * 3600) / base.timeStepSeconds;
    const twelveState = runSimulation(createInitialSimulation({ ...base, animalCount: 12 }), steps);
    const twelve = twelveState.energy.cumulativeMah;
    const manualMean =
      twelveState.animals.reduce((sum, a) => sum + (twelveState.animalEnergyCumulativeMah[a.id] ?? 0), 0) /
      twelveState.animals.length;
    expect(twelve).toBeCloseTo(manualMean, 5);
    const one = runSimulation(createInitialSimulation({ ...base, animalCount: 1 }), steps).energy.cumulativeMah;
    const expectedMah = milliampHoursFromMeanMicroAmps(JUXTA_DATASHEET_SOCIAL_MODE_MICRO_AMPS, 24);
    expect(one).toBeGreaterThanOrEqual(expectedMah * 0.98);
    expect(one).toBeLessThanOrEqual(expectedMah * 1.02);
    expect(Math.abs(twelve - one) / one).toBeLessThanOrEqual(0.08);
  });

  it("projected mAh/day is stable for timeStepSeconds 30s vs 60s (common dashboard dts)", () => {
    const wallHours = 4;
    const base = {
      ...defaultSimulationConfig,
      seed: "dt-energy",
      animalCount: 1,
      startTimeSeconds: 0,
      activePolicy: { ...juxtaMainCMode0FixedPolicy },
      energy: energyForJuxtaSocialDatasheetCheck(defaultSimulationConfig.energy)
    };
    const dts = [30, 60] as const;
    const projected: number[] = [];
    for (const dt of dts) {
      const config = { ...base, timeStepSeconds: dt };
      const steps = Math.floor((wallHours * 3600) / dt);
      const mah = runSimulation(createInitialSimulation(config), steps).energy.cumulativeMah;
      projected.push(mah * (24 / wallHours));
    }
    const min = Math.min(...projected);
    const max = Math.max(...projected);
    const mid = (min + max) / 2 || 1;
    expect((max - min) / mid).toBeLessThanOrEqual(0.02);
  });
});
