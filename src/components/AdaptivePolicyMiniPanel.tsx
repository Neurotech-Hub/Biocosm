import { useMemo, useState } from "react";
import { adaptiveSamplingDrive } from "../simulation/policies/adaptive";
import type { AdaptiveBlePolicyLog, Animal, FirmwarePolicyConfig, SimulationState } from "../simulation/types";

type AdaptivePolicyMiniPanelProps = {
  state: SimulationState;
  timeline: SimulationState[];
};

type DriveSummary = {
  samplingDrive: number;
  baselineContribution: number;
  motionContribution: number;
  peerContribution: number;
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
  advertisingBurstDurationSeconds: number;
  combinedEnvelopeDuty: number;
  saturatedScheduleWarning: boolean;
};

export function AdaptivePolicyMiniPanel({ state, timeline }: AdaptivePolicyMiniPanelProps) {
  const [selectedAnimalId, setSelectedAnimalId] = useState("cohort");
  const animalIds = state.animals.map((animal) => animal.id);
  const policy = state.config.activePolicy;
  const driveSeries = useMemo(
    () => buildDriveSeries(timeline, selectedAnimalId, policy).slice(-96),
    [timeline, selectedAnimalId, policy]
  );

  if (policy.type !== "motion_peer_adaptive") {
    return null;
  }

  const summary = summarizeCurrentDrive(state, selectedAnimalId, policy);
  const fixedDuty = dutyFromTiming({
    scanIntervalSeconds: policy.timingAnchors.neutral.scanIntervalSeconds,
    scanWindowSeconds: policy.timingAnchors.neutral.scanWindowSeconds,
    advIntervalSeconds: policy.timingAnchors.neutral.advIntervalSeconds,
    advertisingBurstDurationSeconds: policy.timingAnchors.advertisingBurstDurationSeconds
  });
  const relativeIntensity = fixedDuty > 0 ? summary.combinedEnvelopeDuty / fixedDuty : 0;

  return (
    <section className="adaptive-mini-panel">
      <div className="adaptive-mini-header">
        <h4>Adaptive policy</h4>
        <select
          aria-label="Adaptive policy mini panel subject"
          value={selectedAnimalId}
          onChange={(event) => setSelectedAnimalId(event.target.value)}
        >
          <option value="cohort">Cohort average</option>
          {animalIds.map((animalId) => (
            <option key={animalId} value={animalId}>
              {animalId}
            </option>
          ))}
        </select>
      </div>

      <DriveSparkline points={driveSeries} currentDrive={summary.samplingDrive} />

      <div className="adaptive-drive-bands" aria-label="Sampling drive bands">
        <span>Below fixed-rate</span>
        <span>0.5 = fixed-rate baseline</span>
        <span>Above fixed-rate</span>
      </div>

      <div className="drive-breakdown">
        <div>
          <span>Baseline {summary.baselineContribution.toFixed(2)}</span>
          <span>Motion +{summary.motionContribution.toFixed(2)}</span>
          <span>Peer +{summary.peerContribution.toFixed(2)}</span>
        </div>
        <strong>Drive {summary.samplingDrive.toFixed(2)}</strong>
      </div>

      <div className="drive-contribution-bar" aria-label="Drive contribution breakdown">
        <span style={{ width: `${Math.min(100, summary.baselineContribution * 100)}%` }} />
        <span style={{ width: `${Math.min(100, summary.motionContribution * 100)}%` }} />
        <span style={{ width: `${Math.min(100, summary.peerContribution * 100)}%` }} />
      </div>

      <div className="adaptive-schedule-chips">
        <span>Scan every {summary.scanIntervalSeconds.toFixed(1)}s</span>
        <span>Window {summary.scanWindowSeconds.toFixed(1)}s</span>
        <span>Adv every {summary.advIntervalSeconds.toFixed(1)}s</span>
        <span>{relativeIntensity.toFixed(1)}x fixed-rate schedule intensity</span>
      </div>

      {summary.saturatedScheduleWarning ? (
        <p className="helper-text warning-text">
          High schedule pressure means scan/advertise envelopes occupy much of the epoch. This is not equal to radio-on duty or current draw.
        </p>
      ) : null}
    </section>
  );
}

function DriveSparkline({ points, currentDrive }: { points: number[]; currentDrive: number }) {
  const width = 280;
  const height = 72;
  const path = points
    .map((value, index) => {
      const x = points.length > 1 ? (index / (points.length - 1)) * width : width;
      const y = height - Math.max(0, Math.min(1, value)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="adaptive-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent sampling drive">
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} />
      <text x={width / 2} y="12" textAnchor="middle">0.5 fixed-rate</text>
      <polyline points={path || `0,${height}`} />
      <circle cx={width} cy={height - Math.max(0, Math.min(1, currentDrive)) * height} r="3" />
    </svg>
  );
}

function buildDriveSeries(
  timeline: SimulationState[],
  selectedAnimalId: string,
  policy: FirmwarePolicyConfig
): number[] {
  if (policy.type !== "motion_peer_adaptive") {
    return timeline.map(() => 0);
  }
  return timeline.map((state) => {
    const animals = selectedAnimalId === "cohort"
      ? state.animals
      : state.animals.filter((animal) => animal.id === selectedAnimalId);
    return average(
      animals.map((animal) =>
        adaptiveSamplingDrive(policy, animal.collar.motionDrive, animal.collar.peerDrive)
      )
    );
  });
}

function summarizeCurrentDrive(
  state: SimulationState,
  selectedAnimalId: string,
  policy: FirmwarePolicyConfig
): DriveSummary {
  const logs = selectedAnimalId === "cohort"
    ? state.logs.adaptiveBlePolicy
    : state.logs.adaptiveBlePolicy.filter((row) => row.animalId === selectedAnimalId);
  if (logs.length > 0) {
    return summarizePolicyLogs(logs);
  }

  const animals = selectedAnimalId === "cohort"
    ? state.animals
    : state.animals.filter((animal) => animal.id === selectedAnimalId);
  return summarizeAnimals(animals, policy);
}

function summarizePolicyLogs(logs: AdaptiveBlePolicyLog[]): DriveSummary {
  return {
    samplingDrive: average(logs.map((row) => row.samplingDrive)),
    baselineContribution: average(logs.map((row) => row.baselineContribution)),
    motionContribution: average(logs.map((row) => row.motionContribution)),
    peerContribution: average(logs.map((row) => row.peerContribution)),
    scanIntervalSeconds: average(logs.map((row) => row.scanIntervalSeconds)),
    scanWindowSeconds: average(logs.map((row) => row.scanWindowSeconds)),
    advIntervalSeconds: average(logs.map((row) => row.advIntervalSeconds)),
    advertisingBurstDurationSeconds: average(logs.map((row) => row.advertisingBurstDurationSeconds)),
    combinedEnvelopeDuty: average(logs.map((row) => row.combinedEnvelopeDuty)),
    saturatedScheduleWarning: logs.some((row) => row.saturatedScheduleWarning)
  };
}

function summarizeAnimals(animals: Animal[], policy: FirmwarePolicyConfig): DriveSummary {
  if (policy.type !== "motion_peer_adaptive") {
    const timing = animals[0]?.collar;
    const empty = {
      samplingDrive: 0,
      baselineContribution: 0,
      motionContribution: 0,
      peerContribution: 0,
      scanIntervalSeconds: timing?.scanIntervalSeconds ?? 0,
      scanWindowSeconds: timing?.scanWindowSeconds ?? 0,
      advIntervalSeconds: timing?.advIntervalSeconds ?? 0,
      advertisingBurstDurationSeconds: timing?.advertisingBurstDurationSeconds ?? 0,
      combinedEnvelopeDuty: 0,
      saturatedScheduleWarning: false
    };
    return empty;
  }

  const summary = {
    samplingDrive: average(
      animals.map((animal) =>
        adaptiveSamplingDrive(policy, animal.collar.motionDrive, animal.collar.peerDrive)
      )
    ),
    baselineContribution: policy.baselineDrive,
    motionContribution: average(animals.map((animal) => policy.motionWeight * animal.collar.motionDrive)),
    peerContribution: average(animals.map((animal) => policy.peerWeight * animal.collar.peerDrive)),
    scanIntervalSeconds: average(animals.map((animal) => animal.collar.scanIntervalSeconds)),
    scanWindowSeconds: average(animals.map((animal) => animal.collar.scanWindowSeconds)),
    advIntervalSeconds: average(animals.map((animal) => animal.collar.advIntervalSeconds)),
    advertisingBurstDurationSeconds: average(animals.map((animal) => animal.collar.advertisingBurstDurationSeconds))
  };
  const combinedEnvelopeDuty = dutyFromTiming(summary);

  return {
    ...summary,
    combinedEnvelopeDuty,
    saturatedScheduleWarning: combinedEnvelopeDuty > 0.8
  };
}

function dutyFromTiming(timing: Pick<DriveSummary, "scanIntervalSeconds" | "scanWindowSeconds" | "advIntervalSeconds" | "advertisingBurstDurationSeconds">): number {
  return timing.scanWindowSeconds / timing.scanIntervalSeconds +
    timing.advertisingBurstDurationSeconds / timing.advIntervalSeconds;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
