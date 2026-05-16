import {
  defaultSimulationConfig,
  juxtaMainCMode0FixedPolicy,
  JUXTA5_8_MEASURED_PROD_ROUTINE_MEAN_MICRO_AMPS,
  milliampHoursFromMeanMicroAmps
} from "./config";
import {
  benchCalibratedBleIncrementsMicroAmps,
  computeEnergyLog,
  meanEnergyLog,
  MICROCOULOMBS_PER_MILLIAMP_HOUR,
  ROUTINE_LINEAR_ENERGY_COEFFICIENTS,
  routineLinearAvgCurrentMicroAmps,
  routineLinearEpochMahFromAvgUa
} from "./energy";
import { runSimulation } from "./engine";
import type { BleBurstEvent, EnergyConfig, FixedPolicyConfig, SimulationLogs } from "./types";
import { createInitialSimulation } from "./world";

/** Component-model energy for tests that assert on RX listen windows and µC per packet. */
function componentEnergy(overrides: Partial<EnergyConfig> = {}): EnergyConfig {
  return {
    ...defaultSimulationConfig.energy,
    energyModel: "component",
    ...overrides
  };
}

/** `bench_duration` energy (default profile is routine-linear). */
function benchDurationEnergy(overrides: Partial<EnergyConfig> = {}): EnergyConfig {
  return {
    ...defaultSimulationConfig.energy,
    energyModel: "bench_duration",
    ...overrides
  };
}

function routineLinearEnergy(overrides: Partial<EnergyConfig> = {}): EnergyConfig {
  return {
    ...defaultSimulationConfig.energy,
    energyModel: "bench_routine_linear_v1",
    ...overrides
  };
}

function meanUaFromCumulativeMah(cumulativeMah: number, elapsedSeconds: number): number {
  const hours = elapsedSeconds / 3600;
  return hours > 1e-12 ? (cumulativeMah / hours) * 1000 : 0;
}

function meanUaFromRoutineModelOnLogs(logs: SimulationLogs, elapsedSeconds: number): number {
  const scanW = logs.bleBursts
    .filter((b) => b.kind === "scan")
    .reduce((s, b) => s + (b.endTime - b.startTime), 0);
  const advW = logs.bleBursts
    .filter((b) => b.kind === "advertise")
    .reduce((s, b) => s + (b.endTime - b.startTime), 0);
  const t = Math.max(elapsedSeconds, 1e-9);
  return routineLinearAvgCurrentMicroAmps(scanW / t, advW / t);
}

function fixedPolicyForDutyRegression(scanIntervalSeconds: number, advIntervalSeconds: number): FixedPolicyConfig {
  return {
    type: "fixed",
    id: `duty-${scanIntervalSeconds}-${advIntervalSeconds}`,
    name: "duty regression",
    scanIntervalSeconds,
    scanWindowSeconds: 3,
    advIntervalSeconds,
    advertisingBurstDurationSeconds: 1
  };
}

describe("energy model", () => {
  it("converts advertising µC to mAh via µC / 3_600_000", () => {
    expect(MICROCOULOMBS_PER_MILLIAMP_HOUR).toBe(3_600_000);
    expect((13 * 1000) / MICROCOULOMBS_PER_MILLIAMP_HOUR).toBeCloseTo((13 * 1000) / 3_600_000, 12);
  });

  it("with no bursts, bench_duration uses shelf only", () => {
    const energy = computeEnergyLog(120, 60, [], benchDurationEnergy());
    const shelf = defaultSimulationConfig.energy.benchShelfCurrentMicroAmps;
    const expectedSteady = (shelf * 60) / 3_600_000;
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
    const cfg = componentEnergy({
      baselineCurrentMicroAmps: 0,
      advertisingEventIntervalSeconds: 10,
      componentBleActivityScale: 1
    });
    const a = computeEnergyLog(60, 60, burstsA, cfg, 0);
    const b = computeEnergyLog(60, 60, burstsB, cfg, 0);
    const m = meanEnergyLog(60, [a, b]);
    expect(m.totalMah).toBeCloseTo((a.totalMah + b.totalMah) / 2, 8);
    expect(m.cumulativeMah).toBeCloseTo((a.cumulativeMah + b.cumulativeMah) / 2, 8);
  });

  it("component model uses scan listen duty and advertising event charge instead of burst wall time", () => {
    const bursts: BleBurstEvent[] = [
      { kind: "scan", startTime: 0, endTime: 1.5, animalId: "animal-1", policyId: "fixed-rate" },
      { kind: "advertise", startTime: 10, endTime: 12, animalId: "animal-1", policyId: "fixed-rate" }
    ];
    const cfg = componentEnergy({
      baselineCurrentMicroAmps: 0,
      advertisingEventIntervalSeconds: 10,
      componentBleActivityScale: 1
    });

    const energy = computeEnergyLog(60, 60, bursts, cfg);

    expect(energy.scanMah).toBeCloseTo((0.375 * cfg.rxCurrentMa1MPhy) / 3600, 8);
    expect(energy.advertisingMah).toBeCloseTo(
      cfg.advEventChargeMicroCoulombs / MICROCOULOMBS_PER_MILLIAMP_HOUR,
      12
    );
  });

  it("bench_duration scales burst increments so reference duties hit production mean", () => {
    const d = benchDurationEnergy();
    const inc = benchCalibratedBleIncrementsMicroAmps(d);
    const meanUa =
      inc.shelfUa +
      inc.advActiveUa * d.benchProductionAdvDuty +
      inc.scanActiveUa * d.benchProductionScanDuty;
    expect(meanUa).toBeCloseTo(d.measuredSocial5s20sTotalMicroAmps, 6);
  });

  it("bench_duration uses advertise and scan burst wall seconds", () => {
    const bursts: BleBurstEvent[] = [
      { kind: "advertise", startTime: 0, endTime: 1, animalId: "a", policyId: "p" },
      { kind: "scan", startTime: 1, endTime: 2.5, animalId: "a", policyId: "p" }
    ];
    const cfg = benchDurationEnergy({ benchWallTimeCalibrationScale: 1 });
    const { advActiveUa, scanActiveUa, shelfUa } = benchCalibratedBleIncrementsMicroAmps(cfg);
    const epoch = 10;
    const row = computeEnergyLog(epoch, epoch, bursts, cfg, 0);
    expect(row.steadyMah).toBeCloseTo((shelfUa * epoch) / 3_600_000, 8);
    expect(row.advertisingMah).toBeCloseTo((advActiveUa * 1) / 3_600_000, 8);
    expect(row.scanMah).toBeCloseTo((scanActiveUa * 1.5) / 3_600_000, 8);
  });

  it("Juxta5-8 bench mean current converts to mAh (467.891 µA × 24 h ≈ 11.23 mAh per device)", () => {
    const mah = milliampHoursFromMeanMicroAmps(JUXTA5_8_MEASURED_PROD_ROUTINE_MEAN_MICRO_AMPS, 24);
    expect(mah).toBeCloseTo(11.229_384, 2);
  });

  it("24h default fixed policy: cohort mean current matches routine-linear model on merged burst duties (±3%)", () => {
    const config = {
      ...defaultSimulationConfig,
      seed: "energy-day",
      animalCount: 1,
      startTimeSeconds: 0,
      timeStepSeconds: 60,
      activePolicy: { ...juxtaMainCMode0FixedPolicy },
      energy: routineLinearEnergy()
    };
    const steps = (24 * 3600) / config.timeStepSeconds;
    const final = runSimulation(createInitialSimulation(config), steps);
    const elapsed = final.time;
    const expectedUa = meanUaFromRoutineModelOnLogs(final.logs, elapsed);
    const actualUa = meanUaFromCumulativeMah(final.energy.cumulativeMah, elapsed);
    expect(Math.abs(actualUa - expectedUa) / expectedUa).toBeLessThanOrEqual(0.03);
  });

  it("24h cohort-mean cumulative matches mean of per-animal cumulative tracks", () => {
    const base = {
      ...defaultSimulationConfig,
      seed: "energy-day",
      startTimeSeconds: 0,
      timeStepSeconds: 60,
      activePolicy: { ...juxtaMainCMode0FixedPolicy },
      energy: routineLinearEnergy()
    };
    const steps = (24 * 3600) / base.timeStepSeconds;
    const twelveState = runSimulation(createInitialSimulation({ ...base, animalCount: 12 }), steps);
    const twelve = twelveState.energy.cumulativeMah;
    const manualMean =
      twelveState.animals.reduce((sum, a) => sum + (twelveState.animalEnergyCumulativeMah[a.id] ?? 0), 0) /
      twelveState.animals.length;
    expect(twelve).toBeCloseTo(manualMean, 5);
    const oneState = runSimulation(createInitialSimulation({ ...base, animalCount: 1 }), steps);
    const one = oneState.energy.cumulativeMah;
    const elapsed = oneState.time;
    const expectedOneUa = meanUaFromRoutineModelOnLogs(oneState.logs, elapsed);
    const actualOneUa = meanUaFromCumulativeMah(one, elapsed);
    expect(Math.abs(actualOneUa - expectedOneUa) / expectedOneUa).toBeLessThanOrEqual(0.03);
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
      energy: routineLinearEnergy()
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

describe("bench_routine_linear_v1", () => {
  const coeffs = ROUTINE_LINEAR_ENERGY_COEFFICIENTS;

  it("no BLE activity: scanDuty and advDuty are 0; avgCurrentUa equals intercept", () => {
    const cfg = routineLinearEnergy({ batteryCapacityMah: 100 });
    const epochSeconds = 60;
    const row = computeEnergyLog(60, epochSeconds, [], cfg, 0);
    const avgUa = routineLinearAvgCurrentMicroAmps(0, 0, coeffs);
    expect(avgUa).toBeCloseTo(coeffs.interceptCurrentUa, 9);
    expect(row.scanMah).toBe(0);
    expect(row.advertisingMah).toBe(0);
    expect(row.steadyMah).toBeCloseTo(routineLinearEpochMahFromAvgUa(coeffs.interceptCurrentUa, epochSeconds), 12);
    expect(row.totalMah).toBeCloseTo(routineLinearEpochMahFromAvgUa(avgUa, epochSeconds), 12);
  });

  it("scan-only epoch: avgCurrentUa matches intercept + scanDutyCoeff * scanDuty", () => {
    const cfg = routineLinearEnergy();
    const epochSeconds = 60;
    const bursts: BleBurstEvent[] = [
      { kind: "scan", startTime: 0, endTime: 30, animalId: "a", policyId: "p" }
    ];
    const scanDuty = 30 / epochSeconds;
    const expectedUa = routineLinearAvgCurrentMicroAmps(scanDuty, 0, coeffs);
    const row = computeEnergyLog(60, epochSeconds, bursts, cfg, 0);
    expect(expectedUa).toBeCloseTo(coeffs.interceptCurrentUa + coeffs.scanDutyCoeffUa * scanDuty, 9);
    expect(row.totalMah).toBeCloseTo(routineLinearEpochMahFromAvgUa(expectedUa, epochSeconds), 10);
    expect(row.scanMah).toBeCloseTo(routineLinearEpochMahFromAvgUa(coeffs.scanDutyCoeffUa * scanDuty, epochSeconds), 10);
    expect(row.advertisingMah).toBe(0);
  });

  it("advertise-only epoch: avgCurrentUa matches intercept + advDutyCoeff * advDuty", () => {
    const cfg = routineLinearEnergy();
    const epochSeconds = 120;
    const bursts: BleBurstEvent[] = [
      { kind: "advertise", startTime: 0, endTime: 24, animalId: "a", policyId: "p" }
    ];
    const advDuty = 24 / epochSeconds;
    const expectedUa = routineLinearAvgCurrentMicroAmps(0, advDuty, coeffs);
    const row = computeEnergyLog(120, epochSeconds, bursts, cfg, 0);
    expect(expectedUa).toBeCloseTo(coeffs.interceptCurrentUa + coeffs.advDutyCoeffUa * advDuty, 9);
    expect(row.totalMah).toBeCloseTo(routineLinearEpochMahFromAvgUa(expectedUa, epochSeconds), 10);
    expect(row.scanMah).toBe(0);
  });

  it("mixed epoch: avgCurrentUa matches full linear formula", () => {
    const cfg = routineLinearEnergy();
    const epochSeconds = 100;
    const bursts: BleBurstEvent[] = [
      { kind: "scan", startTime: 0, endTime: 10, animalId: "a", policyId: "p" },
      { kind: "advertise", startTime: 50, endTime: 65, animalId: "a", policyId: "p" }
    ];
    const scanDuty = 10 / epochSeconds;
    const advDuty = 15 / epochSeconds;
    const expectedUa = routineLinearAvgCurrentMicroAmps(scanDuty, advDuty, coeffs);
    const row = computeEnergyLog(100, epochSeconds, bursts, cfg, 0);
    expect(row.totalMah).toBeCloseTo(routineLinearEpochMahFromAvgUa(expectedUa, epochSeconds), 10);
    expect(row.steadyMah + row.scanMah + row.advertisingMah).toBeCloseTo(row.totalMah, 10);
  });

  it("mAh conversion: epochMah === (avgCurrentUa / 1000) * (epochSeconds / 3600)", () => {
    const cfg = routineLinearEnergy();
    const epochSeconds = 45;
    const bursts: BleBurstEvent[] = [
      { kind: "scan", startTime: 0, endTime: 9, animalId: "a", policyId: "p" },
      { kind: "advertise", startTime: 10, endTime: 18, animalId: "a", policyId: "p" }
    ];
    const scanDuty = 9 / epochSeconds;
    const advDuty = 8 / epochSeconds;
    const avgUa = routineLinearAvgCurrentMicroAmps(scanDuty, advDuty, coeffs);
    const row = computeEnergyLog(45, epochSeconds, bursts, cfg, 0);
    const expectedMah = (avgUa / 1000) * (epochSeconds / 3600);
    expect(row.totalMah).toBeCloseTo(expectedMah, 12);
  });

  it("regression: mixed bench schedules — mean µA from cumulative matches routine model on merged duties (±3%)", () => {
    const wallSeconds = 8 * 3600;
    const schedules: [number, number][] = [
      [30, 5],
      [60, 20],
      [10, 1]
    ];
    for (const [scanIntervalSeconds, advIntervalSeconds] of schedules) {
      const config = {
        ...defaultSimulationConfig,
        seed: `duty-${scanIntervalSeconds}-${advIntervalSeconds}`,
        animalCount: 1,
        startTimeSeconds: 0,
        timeStepSeconds: 60,
        simulationLengthSeconds: wallSeconds,
        activePolicy: fixedPolicyForDutyRegression(scanIntervalSeconds, advIntervalSeconds),
        energy: routineLinearEnergy()
      };
      const steps = wallSeconds / config.timeStepSeconds;
      const final = runSimulation(createInitialSimulation(config), steps);
      const elapsed = final.time;
      const modelUa = meanUaFromRoutineModelOnLogs(final.logs, elapsed);
      const actualUa = meanUaFromCumulativeMah(final.energy.cumulativeMah, elapsed);
      expect(Math.abs(actualUa - modelUa) / modelUa).toBeLessThanOrEqual(0.03);
    }
  });
});
