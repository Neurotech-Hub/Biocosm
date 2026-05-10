import { useEffect, useState } from "react";
import { AssumptionsPanel } from "./components/AssumptionsPanel";
import { CanvasVisualizer } from "./components/CanvasVisualizer";
import { ControlsPanel } from "./components/ControlsPanel";
import { LegendPanel } from "./components/LegendPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { RawDataPanel } from "./components/RawDataPanel";
import { TimeSeriesPanel } from "./components/TimeSeriesPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { computeMetrics } from "./simulation/analysis";
import { defaultSimulationConfig } from "./simulation/config";
import { mergeLogs, stepSimulation } from "./simulation/engine";
import {
  buildAnimalStripEvents,
  buildTimeSeries,
  sortedAnimalIdsFromLogs,
  type AnimalStripEvent,
  type TimeSeriesPoint
} from "./simulation/timeSeries";
import type { SimulationConfig, SimulationLogs, SimulationMetrics, SimulationState } from "./simulation/types";
import { createInitialSimulation } from "./simulation/world";

export function App() {
  const [draftConfig, setDraftConfig] = useState<SimulationConfig>(defaultSimulationConfig);
  const [builtConfig, setBuiltConfig] = useState<SimulationConfig>(defaultSimulationConfig);
  const [build, setBuild] = useState<SimulationBuild>(() => createSimulationBuild(createInitialSimulation(defaultSimulationConfig)));
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuildDirty, setIsBuildDirty] = useState(false);
  const [buildProgress, setBuildProgress] = useState<BuildProgress>({ isBuilding: false, percent: 100 });
  const [speed, setSpeed] = useState(10);
  const [showTrueProximity, setShowTrueProximity] = useState(true);
  const [showObservedDetections, setShowObservedDetections] = useState(true);
  const timeline = build.timeline;
  const simulation = timeline[currentStep] ?? timeline[0];
  const totalSteps = Math.max(0, timeline.length - 1);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setCurrentStep((step) => {
        if (step >= totalSteps) {
          setIsPlaying(false);
          return step;
        }
        return step + 1;
      });
    }, Math.max(30, 1000 / speed));

    return () => window.clearInterval(interval);
  }, [isPlaying, speed, totalSteps]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Adaptive Social Proximity Logger Simulator</h1>
          <p>Phase 1: deterministic world truth, fixed-rate BLE observations, and live true-vs-observed review.</p>
        </div>
        <div className="header-pill">
          {buildProgress.isBuilding
            ? `Building ${buildProgress.percent}%`
            : `Built seed: ${builtConfig.seed}${isBuildDirty ? " (settings changed)" : ""}`}
        </div>
      </header>

      <section className="workspace">
        <div className="visual-column">
          <TimelinePanel
            currentStep={currentStep}
            totalSteps={totalSteps}
            timeSeconds={simulation.time}
            startTimeSeconds={builtConfig.startTimeSeconds}
            timeStepSeconds={builtConfig.timeStepSeconds}
            onStepChange={(step) => {
              setIsPlaying(false);
              setCurrentStep(step);
            }}
          />
          <CanvasVisualizer
            state={simulation}
            showTrueProximity={showTrueProximity}
            showObservedDetections={showObservedDetections}
          />
          <LegendPanel />
          <TimeSeriesPanel
            points={build.timeSeries}
            energy={build.logs.energy}
            currentStep={currentStep}
            animalStripEvents={build.animalStripEvents}
            animalIds={build.animalIdsStripOrder}
            startTimeSeconds={builtConfig.startTimeSeconds}
          />
          <MetricsPanel metrics={build.metrics} animalCount={builtConfig.animalCount} />
          <RawDataPanel logs={build.logs} config={builtConfig} timeline={build.timeline} />
          <AssumptionsPanel config={builtConfig} />
        </div>
        <ControlsPanel
          config={draftConfig}
          isBuildDirty={isBuildDirty}
          buildProgress={buildProgress}
          isPlaying={isPlaying}
          speed={speed}
          showTrueProximity={showTrueProximity}
          showObservedDetections={showObservedDetections}
          onConfigChange={(nextConfig) => {
            setDraftConfig(nextConfig);
            setIsBuildDirty(true);
            setIsPlaying(false);
          }}
          onBuildSimulation={() => {
            if (buildProgress.isBuilding) {
              return;
            }

            setIsPlaying(false);
            setBuildProgress({ isBuilding: true, percent: 0 });
            const configToBuild = draftConfig;

            window.setTimeout(() => {
              createTimelineAsync(
                createInitialSimulation(configToBuild),
                (percent) => setBuildProgress({ isBuilding: true, percent }),
                (nextBuild) => {
                  setBuiltConfig(configToBuild);
                  setBuild(nextBuild);
                  setCurrentStep(0);
                  setIsBuildDirty(false);
                  setBuildProgress({ isBuilding: false, percent: 100 });
                }
              );
            }, 0);
          }}
          onPlayPause={() => {
            if (!buildProgress.isBuilding) {
              setIsPlaying((playing) => !playing);
            }
          }}
          onReset={() => {
            setIsPlaying(false);
            setCurrentStep(0);
          }}
          onStep={() => {
            setIsPlaying(false);
            setCurrentStep((step) => Math.min(totalSteps, step + 1));
          }}
          onSpeedChange={setSpeed}
          onShowTrueProximityChange={setShowTrueProximity}
          onShowObservedDetectionsChange={setShowObservedDetections}
        />
      </section>
    </main>
  );
}

export type BuildProgress = {
  isBuilding: boolean;
  percent: number;
};

type SimulationBuild = {
  timeline: SimulationState[];
  logs: SimulationLogs;
  timeSeries: TimeSeriesPoint[];
  animalStripEvents: AnimalStripEvent[];
  animalIdsStripOrder: string[];
  metrics: SimulationMetrics;
};

function createSimulationBuild(initialState: SimulationState): SimulationBuild {
  const timeline = [initialState];
  let logs = initialState.logs;
  const totalSteps = Math.floor(initialState.config.simulationLengthSeconds / initialState.config.timeStepSeconds);
  let current = initialState;

  for (let step = 0; step < totalSteps; step += 1) {
    current = stepSimulation(current);
    logs = mergeLogs(logs, current.logs);
    timeline.push(current);
  }

  return {
    timeline,
    logs,
    timeSeries: buildTimeSeries(timeline),
    animalStripEvents: buildAnimalStripEvents(logs),
    animalIdsStripOrder: sortedAnimalIdsFromLogs(logs),
    metrics: computeMetrics(current, logs)
  };
}

function createTimelineAsync(
  initialState: SimulationState,
  onProgress: (percent: number) => void,
  onComplete: (build: SimulationBuild) => void
): void {
  const timeline = [initialState];
  let logs = initialState.logs;
  const totalSteps = Math.floor(initialState.config.simulationLengthSeconds / initialState.config.timeStepSeconds);
  const chunkSize = Math.max(10, Math.ceil(totalSteps / 60));
  let current = initialState;
  let step = 0;

  const buildChunk = () => {
    const chunkEnd = Math.min(totalSteps, step + chunkSize);
    for (; step < chunkEnd; step += 1) {
      current = stepSimulation(current);
      logs = mergeLogs(logs, current.logs);
      timeline.push(current);
    }

    onProgress(totalSteps > 0 ? Math.min(99, Math.round((step / totalSteps) * 100)) : 100);

    if (step < totalSteps) {
      window.setTimeout(buildChunk, 0);
      return;
    }

    onComplete({
      timeline,
      logs,
      timeSeries: buildTimeSeries(timeline),
      animalStripEvents: buildAnimalStripEvents(logs),
      animalIdsStripOrder: sortedAnimalIdsFromLogs(logs),
      metrics: computeMetrics(current, logs)
    });
  };

  buildChunk();
}
