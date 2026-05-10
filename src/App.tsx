import { useEffect, useRef, useState } from "react";
import { AssumptionsPanel } from "./components/AssumptionsPanel";
import { AdaptivePolicyMiniPanel } from "./components/AdaptivePolicyMiniPanel";
import { CanvasVisualizer } from "./components/CanvasVisualizer";
import { ControlsPanel } from "./components/ControlsPanel";
import { LegendPanel } from "./components/LegendPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { RawDataPanel } from "./components/RawDataPanel";
import { SweepControlsPanel } from "./components/SweepControlsPanel";
import { SweepReportPanel } from "./components/SweepReportPanel";
import { TimeSeriesPanel } from "./components/TimeSeriesPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { computeMetrics } from "./simulation/analysis";
import { defaultSimulationConfig } from "./simulation/config";
import { mergeLogs, stepSimulation } from "./simulation/engine";
import {
  buildSweepTrials,
  finalizeSweepBundle,
  runSweepTrialsChunked,
  sweepAdaptivePolicyFromGrid,
  type SweepResultBundle
} from "./simulation/sweep/adaptiveBleSweep";
import type { CandidatePick, SweepPolicySummary } from "./simulation/sweep/sweepCandidates";
import {
  buildAdaptiveBleTimeSeries,
  buildAnimalStripEvents,
  buildFixedBleTimeSeries,
  buildTimeSeries,
  sortedAnimalIdsFromLogs,
  type AnimalStripEvent,
  type TimeSeriesPoint
} from "./simulation/timeSeries";
import type { SimulationConfig, SimulationLogs, SimulationMetrics, SimulationState } from "./simulation/types";
import { PLAYBACK_SPEED_MULTIPLIER } from "./playbackConstants";
import { createInitialSimulation } from "./simulation/world";

type SweepBundleWithCandidates = SweepResultBundle & { candidates: CandidatePick[] };

type WorkspaceTab = "simulator" | "sweep";

export function App() {
  const [draftConfig, setDraftConfig] = useState<SimulationConfig>(defaultSimulationConfig);
  const [builtConfig, setBuiltConfig] = useState<SimulationConfig>(defaultSimulationConfig);
  const [build, setBuild] = useState<SimulationBuild>(() => createSimulationBuild(createInitialSimulation(defaultSimulationConfig)));
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuildDirty, setIsBuildDirty] = useState(false);
  const [buildProgress, setBuildProgress] = useState<BuildProgress>({ isBuilding: false, percent: 100 });
  const [showTrueProximity, setShowTrueProximity] = useState(true);
  const [showObservedDetections, setShowObservedDetections] = useState(true);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("simulator");
  const [sweepMode, setSweepMode] = useState<"fast" | "report">("fast");
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepProgress, setSweepProgress] = useState({ completed: 0, total: 0 });
  const [sweepResult, setSweepResult] = useState<SweepBundleWithCandidates | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const sweepAbortRef = useRef<AbortController | null>(null);
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
    }, Math.max(30, 1000 / PLAYBACK_SPEED_MULTIPLIER));

    return () => window.clearInterval(interval);
  }, [isPlaying, totalSteps]);

  const runSweep = async () => {
    setSweepError(null);
    setSweepResult(null);
    const trials = buildSweepTrials(sweepMode, String(builtConfig.seed));
    setSweepProgress({ completed: 0, total: trials.length });
    setSweepRunning(true);
    const controller = new AbortController();
    sweepAbortRef.current = controller;

    try {
      const rows = await runSweepTrialsChunked(builtConfig, trials, {
        signal: controller.signal,
        onProgress: (completed, total) => setSweepProgress({ completed, total })
      });
      setSweepResult(finalizeSweepBundle(rows, sweepMode));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setSweepError("Sweep cancelled.");
      } else {
        setSweepError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setSweepRunning(false);
      sweepAbortRef.current = null;
    }
  };

  const cancelSweep = () => {
    sweepAbortRef.current?.abort();
  };

  const runBuildSimulation = (configToBuild: SimulationConfig) => {
    if (buildProgress.isBuilding) {
      return;
    }
    setIsPlaying(false);
    setCurrentStep(0);
    setBuildProgress({ isBuilding: true, percent: 0 });

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
  };

  const simulateSweepPolicy = (summary: SweepPolicySummary) => {
    if (!summary.params || buildProgress.isBuilding) {
      return;
    }
    const policy = sweepAdaptivePolicyFromGrid(
      summary.params.baselineDrive,
      summary.params.motionWeight,
      summary.params.peerWeight,
      summary.params.tauPeerSeconds
    );
    const nextConfig = { ...builtConfig, activePolicy: policy };
    setDraftConfig(nextConfig);
    setWorkspaceTab("simulator");
    runBuildSimulation(nextConfig);
  };

  const navStatusLabel = buildProgress.isBuilding
    ? `Building ${buildProgress.percent}%`
    : isBuildDirty
      ? "Draft settings — rebuild to apply"
      : "Built";

  return (
    <main className="app-shell">
      <header className="app-topnav">
        <div className="app-topnav-brand">
          <span className="app-topnav-title">Biocosm</span>
          <span className="app-topnav-subtitle">A Realistic Animal Simulator for Wearable Design</span>
        </div>

        <div className="app-topnav-end">
          <nav className="app-topnav-tabs" aria-label="Primary workspace">
            <button
              type="button"
              className={`app-topnav-tab ${workspaceTab === "simulator" ? "app-topnav-tab-active" : ""}`}
              aria-current={workspaceTab === "simulator" ? "page" : undefined}
              onClick={() => setWorkspaceTab("simulator")}
            >
              Simulator
            </button>
            <button
              type="button"
              className={`app-topnav-tab ${workspaceTab === "sweep" ? "app-topnav-tab-active" : ""}`}
              aria-current={workspaceTab === "sweep" ? "page" : undefined}
              onClick={() => setWorkspaceTab("sweep")}
            >
              Sweep report
            </button>
          </nav>

          <div className="app-topnav-meta" title="Last built simulation — sweeps use this world configuration">
            <span className="app-topnav-meta-seed">Seed {builtConfig.seed}</span>
            <span className="app-topnav-meta-status" aria-live="polite">
              {navStatusLabel}
            </span>
          </div>
        </div>
      </header>

      {workspaceTab === "simulator" ? (
      <section className="workspace">
        <div className="visual-column">
          <TimelinePanel
            currentStep={currentStep}
            totalSteps={totalSteps}
            timeSeconds={simulation.time}
            startTimeSeconds={builtConfig.startTimeSeconds}
            timeStepSeconds={builtConfig.timeStepSeconds}
            isPlaying={isPlaying}
            playbackDisabled={buildProgress.isBuilding}
            onStepChange={(step) => {
              setIsPlaying(false);
              setCurrentStep(step);
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
            adaptiveBleSeries={build.adaptiveBleTimeSeries}
            fixedBleSeries={build.fixedBleTimeSeries}
            activePolicyType={builtConfig.activePolicy.type}
            currentStep={currentStep}
            animalStripEvents={build.animalStripEvents}
            animalIds={build.animalIdsStripOrder}
            startTimeSeconds={builtConfig.startTimeSeconds}
          />
          <MetricsPanel
            metrics={build.metrics}
            animalCount={builtConfig.animalCount}
            batteryCapacityMah={builtConfig.energy.batteryCapacityMah}
          />
          <RawDataPanel logs={build.logs} config={builtConfig} metrics={build.metrics} timeline={build.timeline} />
          <AssumptionsPanel config={builtConfig} />
        </div>
        <div className="sidebar-column">
          <ControlsPanel
            config={draftConfig}
            isBuildDirty={isBuildDirty}
            buildProgress={buildProgress}
            showTrueProximity={showTrueProximity}
            showObservedDetections={showObservedDetections}
            onConfigChange={(nextConfig) => {
              setDraftConfig(nextConfig);
              setIsBuildDirty(true);
              setIsPlaying(false);
            }}
            onResetSettingsToDefaults={() => {
              setDraftConfig(structuredClone(defaultSimulationConfig));
              setIsBuildDirty(true);
              setIsPlaying(false);
            }}
            onBuildSimulation={() => runBuildSimulation(draftConfig)}
            onShowTrueProximityChange={setShowTrueProximity}
            onShowObservedDetectionsChange={setShowObservedDetections}
            onOpenSweepReport={() => setWorkspaceTab("sweep")}
          />
          <AdaptivePolicyMiniPanel state={simulation} timeline={timeline} />
        </div>
      </section>
      ) : (
      <section className="workspace workspace-sweep-layout">
        <div className="visual-column">
          <SweepReportPanel
            baseConfig={builtConfig}
            sweepResult={sweepResult}
            simulateDisabled={buildProgress.isBuilding}
            onSimulatePolicy={simulateSweepPolicy}
          />
        </div>
        <div className="sidebar-column">
          <SweepControlsPanel
            builtSimulation={builtConfig}
            isSimulationStale={isBuildDirty}
            sweepMode={sweepMode}
            onSweepModeChange={setSweepMode}
            isSweepRunning={sweepRunning}
            sweepProgress={sweepProgress}
            sweepError={sweepError}
            onRunSweep={runSweep}
            onCancelSweep={cancelSweep}
          />
        </div>
      </section>
      )}
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
  adaptiveBleTimeSeries: ReturnType<typeof buildAdaptiveBleTimeSeries>;
  fixedBleTimeSeries: ReturnType<typeof buildFixedBleTimeSeries>;
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
    adaptiveBleTimeSeries: buildAdaptiveBleTimeSeries(timeline),
    fixedBleTimeSeries: buildFixedBleTimeSeries(timeline),
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
      adaptiveBleTimeSeries: buildAdaptiveBleTimeSeries(timeline),
      fixedBleTimeSeries: buildFixedBleTimeSeries(timeline),
      animalStripEvents: buildAnimalStripEvents(logs),
      animalIdsStripOrder: sortedAnimalIdsFromLogs(logs),
      metrics: computeMetrics(current, logs)
    });
  };

  buildChunk();
}
