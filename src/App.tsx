import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { AssumptionsPanel } from "./components/AssumptionsPanel";
import { CanvasVisualizer } from "./components/CanvasVisualizer";
import { ControlsPanel } from "./components/ControlsPanel";
import { LegendPanel } from "./components/LegendPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { RawDataPanel } from "./components/RawDataPanel";
import { SweepControlsPanel } from "./components/SweepControlsPanel";
import { SweepReportPanel } from "./components/SweepReportPanel";
import { TimeSeriesPanel } from "./components/TimeSeriesPanel";
import { TimelinePanel } from "./components/TimelinePanel";
import { WorkspaceLoadModal } from "./components/WorkspaceLoadModal";
import { computeMetrics } from "./simulation/analysis";
import { defaultSimulationConfig } from "./simulation/config";
import { mergeLogs, stepSimulation } from "./simulation/engine";
import {
  buildSweepTrials,
  defaultSweepGridVariant,
  finalizeSweepBundle,
  firmwarePolicyFromSweepSummary,
  runSweepTrialsChunked,
  type SweepBundleWithCandidates,
  type SweepGridVariant
} from "./simulation/sweep/adaptiveBleSweep";
import type { SweepPolicySummary } from "./simulation/sweep/sweepCandidates";
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
import {
  buildWorkspaceFile,
  downloadWorkspaceJson,
  parseWorkspaceFileText,
  readTextFromFile,
  serializeWorkspaceFile,
  workspaceFilename,
  type WorkspaceLoadParams,
  type WorkspaceTab
} from "./workspace/workspaceFile";

export type SimulationBuild = {
  timeline: SimulationState[];
  logs: SimulationLogs;
  timeSeries: TimeSeriesPoint[];
  adaptiveBleTimeSeries: ReturnType<typeof buildAdaptiveBleTimeSeries>;
  fixedBleTimeSeries: ReturnType<typeof buildFixedBleTimeSeries>;
  animalStripEvents: AnimalStripEvent[];
  animalIdsStripOrder: string[];
  metrics: SimulationMetrics;
};

/** Single-step snapshot so the first paint is cheap; full timeline is filled by `createTimelineAsync`. */
function createPlaceholderBuild(initial: SimulationState): SimulationBuild {
  const timelineLocal = [initial];
  return {
    timeline: timelineLocal,
    logs: initial.logs,
    timeSeries: buildTimeSeries(timelineLocal),
    adaptiveBleTimeSeries: buildAdaptiveBleTimeSeries(timelineLocal),
    fixedBleTimeSeries: buildFixedBleTimeSeries(timelineLocal),
    animalStripEvents: buildAnimalStripEvents(initial.logs),
    animalIdsStripOrder: sortedAnimalIdsFromLogs(initial.logs),
    metrics: computeMetrics(initial, initial.logs)
  };
}

export function App() {
  const activeBuildIdRef = useRef(0);

  const [draftConfig, setDraftConfig] = useState<SimulationConfig>(defaultSimulationConfig);
  const [builtConfig, setBuiltConfig] = useState<SimulationConfig>(defaultSimulationConfig);
  const [build, setBuild] = useState<SimulationBuild>(() =>
    createPlaceholderBuild(createInitialSimulation(defaultSimulationConfig))
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuildDirty, setIsBuildDirty] = useState(false);
  const [buildProgress, setBuildProgress] = useState<BuildProgress>({ isBuilding: true, percent: 0 });
  const [showTrueProximity, setShowTrueProximity] = useState(true);
  const [showObservedDetections, setShowObservedDetections] = useState(true);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("simulator");
  const [sweepMode, setSweepMode] = useState<"fast" | "report">("fast");
  const [sweepGridVariant, setSweepGridVariant] = useState<SweepGridVariant>(() => defaultSweepGridVariant());
  const [reportSeedCount, setReportSeedCount] = useState(3);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepProgress, setSweepProgress] = useState({ completed: 0, total: 0 });
  const [sweepResult, setSweepResult] = useState<SweepBundleWithCandidates | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const sweepAbortRef = useRef<AbortController | null>(null);
  const workspaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const [workspaceFileMessage, setWorkspaceFileMessage] = useState<string | null>(null);
  const [workspaceLoadActive, setWorkspaceLoadActive] = useState(false);
  const [workspaceLoadPendingSweep, setWorkspaceLoadPendingSweep] = useState(false);
  const workspaceLoadShouldSweepRef = useRef(false);
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

  const runBuildSimulation = useCallback(
    (
      configToBuild: SimulationConfig,
      options?: { clearDirtyOnComplete?: boolean; onComplete?: () => void }
    ) => {
      const myId = ++activeBuildIdRef.current;
      const clearDirtyOnComplete = options?.clearDirtyOnComplete !== false;
      const onCompleteCb = options?.onComplete;
      setIsPlaying(false);
      setCurrentStep(0);
      setBuildProgress({ isBuilding: true, percent: 0 });

      window.setTimeout(() => {
        createTimelineAsync(
          createInitialSimulation(configToBuild),
          (percent) => {
            if (activeBuildIdRef.current === myId) {
              setBuildProgress({ isBuilding: true, percent });
            }
          },
          (nextBuild) => {
            if (activeBuildIdRef.current !== myId) {
              return;
            }
            setBuiltConfig(configToBuild);
            setBuild(nextBuild);
            setCurrentStep(0);
            if (clearDirtyOnComplete) {
              setIsBuildDirty(false);
            }
            setBuildProgress({ isBuilding: false, percent: 100 });
            onCompleteCb?.();
          }
        );
      }, 0);
    },
    []
  );

  useEffect(() => {
    runBuildSimulation(defaultSimulationConfig);
  }, [runBuildSimulation]);

  const runSweep = async () => {
    setSweepError(null);
    setSweepResult(null);
    const trials = buildSweepTrials(sweepMode, String(builtConfig.seed), {
      gridVariant: sweepGridVariant,
      reportSeedCount: sweepMode === "report" ? reportSeedCount : undefined,
      simulationConfig: builtConfig
    });
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

  const runSweepForWorkspaceLoad = async (params: WorkspaceLoadParams) => {
    setSweepError(null);
    setSweepResult(null);
    const trials = buildSweepTrials(params.sweepMode, String(params.config.seed), {
      gridVariant: params.sweepGridVariant,
      reportSeedCount: params.sweepMode === "report" ? params.reportSeedCount : undefined,
      simulationConfig: params.config
    });
    setSweepProgress({ completed: 0, total: trials.length });
    setSweepRunning(true);
    const controller = new AbortController();
    sweepAbortRef.current = controller;

    try {
      const rows = await runSweepTrialsChunked(params.config, trials, {
        signal: controller.signal,
        onProgress: (completed, total) => setSweepProgress({ completed, total })
      });
      setSweepResult(finalizeSweepBundle(rows, params.sweepMode));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setSweepError("Sweep cancelled.");
      } else {
        setSweepError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setSweepRunning(false);
      sweepAbortRef.current = null;
      setWorkspaceLoadActive(false);
    }
  };

  const startWorkspaceLoad = (params: WorkspaceLoadParams) => {
    activeBuildIdRef.current += 1;
    sweepAbortRef.current?.abort();
    setSweepRunning(false);
    setSweepError(null);
    setIsPlaying(false);

    setDraftConfig(params.config);
    setBuiltConfig(params.config);
    setIsBuildDirty(false);
    setShowTrueProximity(params.view.showTrueProximity);
    setShowObservedDetections(params.view.showObservedDetections);
    setSweepMode(params.sweepMode);
    setSweepGridVariant(params.sweepGridVariant);
    setReportSeedCount(params.reportSeedCount);
    setSweepResult(null);
    setWorkspaceTab(params.workspaceTab);

    setBuild(createPlaceholderBuild(createInitialSimulation(params.config)));
    setCurrentStep(0);

    workspaceLoadShouldSweepRef.current = params.shouldRunSweep;
    setWorkspaceLoadPendingSweep(params.shouldRunSweep);
    setWorkspaceLoadActive(true);

    runBuildSimulation(params.config, {
      clearDirtyOnComplete: true,
      onComplete: () => {
        if (workspaceLoadShouldSweepRef.current) {
          void runSweepForWorkspaceLoad(params);
        } else {
          setWorkspaceLoadActive(false);
        }
      }
    });
  };

  const cancelWorkspaceLoad = () => {
    activeBuildIdRef.current += 1;
    sweepAbortRef.current?.abort();
    workspaceLoadShouldSweepRef.current = false;
    setWorkspaceLoadPendingSweep(false);
    setWorkspaceLoadActive(false);
    setBuildProgress({ isBuilding: false, percent: 0 });
  };

  const simulateSweepPolicy = (summary: SweepPolicySummary) => {
    if (!summary.params || buildProgress.isBuilding) {
      return;
    }
    const policy = firmwarePolicyFromSweepSummary(summary, builtConfig);
    if (!policy) {
      return;
    }
    const nextConfig = { ...builtConfig, activePolicy: policy };
    setDraftConfig(nextConfig);
    setWorkspaceTab("simulator");
    runBuildSimulation(nextConfig);
  };

  const handleSaveWorkspace = () => {
    try {
      const params: WorkspaceLoadParams = {
        config: draftConfig,
        view: { showTrueProximity, showObservedDetections },
        sweepMode,
        sweepGridVariant,
        reportSeedCount,
        shouldRunSweep: sweepResult != null,
        workspaceTab
      };
      downloadWorkspaceJson(workspaceFilename(draftConfig.seed), serializeWorkspaceFile(buildWorkspaceFile(params)));
      setWorkspaceFileMessage("Workspace saved.");
    } catch (err) {
      setWorkspaceFileMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePickWorkspaceFile = () => {
    workspaceFileInputRef.current?.click();
  };

  const handleWorkspaceFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const text = await readTextFromFile(file);
      const parsed = parseWorkspaceFileText(text);
      if (!parsed.ok) {
        setWorkspaceFileMessage(parsed.error);
        return;
      }
      startWorkspaceLoad(parsed.data);
      const suffix = parsed.warnings.length ? ` ${parsed.warnings.join(" ")}` : "";
      setWorkspaceFileMessage(`Loaded workspace.${suffix}`);
    } catch (err) {
      setWorkspaceFileMessage(err instanceof Error ? err.message : String(err));
    }
  };

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
              Sweep
            </button>
          </nav>

          <div className="app-topnav-file-actions" aria-label="Workspace file">
            <input
              ref={workspaceFileInputRef}
              type="file"
              className="app-workspace-file-input"
              accept=".json,.biocosm.json,application/json"
              aria-hidden
              tabIndex={-1}
              onChange={handleWorkspaceFileChange}
            />
            <div className="app-topnav-workspace-live" aria-live="polite" aria-atomic="true">
              {workspaceFileMessage ?? ""}
            </div>
            <button
              type="button"
              className="secondary-button app-topnav-workspace-button"
              onClick={handleSaveWorkspace}
            >
              Save
            </button>
            <button
              type="button"
              className="secondary-button app-topnav-workspace-button"
              onClick={handlePickWorkspaceFile}
            >
              Load
            </button>
          </div>
        </div>
      </header>

      {workspaceTab === "simulator" ? (
      <section className="workspace">
        <div className="visual-column">
          {buildProgress.isBuilding ? (
            <div className="simulator-visual-building" aria-busy="true">
              <div className="simulator-visual-building-card">
                <p className="simulator-visual-building-title">Building simulation…</p>
                <div
                  className="build-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={buildProgress.percent}
                  aria-label="Simulation build progress"
                >
                  <div className="build-progress-label">
                    <span>Progress</span>
                    <span>{buildProgress.percent}%</span>
                  </div>
                  <div className="build-progress-track" aria-hidden="true">
                    <div className="build-progress-bar" style={{ width: `${buildProgress.percent}%` }} />
                  </div>
                </div>
                <p className="simulator-visual-building-hint">
                  Charts and timeline update when the run finishes. You can still change settings in the sidebar.
                </p>
              </div>
            </div>
          ) : null}
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
          />
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
            sweepGridVariant={sweepGridVariant}
            onSweepGridVariantChange={setSweepGridVariant}
            reportSeedCount={reportSeedCount}
            onReportSeedCountChange={(n) => setReportSeedCount(Math.min(5, Math.max(1, n)))}
            isSweepRunning={sweepRunning}
            sweepProgress={sweepProgress}
            sweepError={sweepError}
            onRunSweep={runSweep}
            onCancelSweep={cancelSweep}
          />
        </div>
      </section>
      )}
      {workspaceLoadActive ? (
        <WorkspaceLoadModal
          buildProgress={buildProgress}
          sweepProgress={sweepProgress}
          sweepRunning={sweepRunning}
          shouldRunSweep={workspaceLoadPendingSweep}
          onCancel={cancelWorkspaceLoad}
        />
      ) : null}
    </main>
  );
}

export type BuildProgress = {
  isBuilding: boolean;
  percent: number;
};

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
