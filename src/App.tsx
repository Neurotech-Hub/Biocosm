import { useEffect, useMemo, useState } from "react";
import { CanvasVisualizer } from "./components/CanvasVisualizer";
import { ControlsPanel } from "./components/ControlsPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { defaultSimulationConfig } from "./simulation/config";
import { stepSimulation } from "./simulation/engine";
import type { SimulationConfig } from "./simulation/types";
import { createInitialSimulation } from "./simulation/world";

export function App() {
  const [config, setConfig] = useState<SimulationConfig>(defaultSimulationConfig);
  const initialState = useMemo(() => createInitialSimulation(config), [config]);
  const [simulation, setSimulation] = useState(initialState);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [showTrueProximity, setShowTrueProximity] = useState(true);
  const [showObservedDetections, setShowObservedDetections] = useState(true);

  useEffect(() => {
    setSimulation(initialState);
    setIsPlaying(false);
  }, [initialState]);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setSimulation((current) => {
        if (current.time >= current.config.simulationLengthSeconds) {
          setIsPlaying(false);
          return current;
        }
        return stepSimulation(current);
      });
    }, Math.max(30, 1000 / speed));

    return () => window.clearInterval(interval);
  }, [isPlaying, speed]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Adaptive Social Proximity Logger Simulator</h1>
          <p>Phase 1: deterministic world truth, fixed-rate BLE observations, and live true-vs-observed review.</p>
        </div>
        <div className="header-pill">Seed: {config.seed}</div>
      </header>

      <section className="workspace">
        <div className="visual-column">
          <CanvasVisualizer
            state={simulation}
            showTrueProximity={showTrueProximity}
            showObservedDetections={showObservedDetections}
          />
          <MetricsPanel state={simulation} />
        </div>
        <ControlsPanel
          config={config}
          isPlaying={isPlaying}
          speed={speed}
          showTrueProximity={showTrueProximity}
          showObservedDetections={showObservedDetections}
          onConfigChange={setConfig}
          onPlayPause={() => setIsPlaying((playing) => !playing)}
          onReset={() => setSimulation(createInitialSimulation(config))}
          onStep={() => setSimulation((current) => stepSimulation(current))}
          onSpeedChange={setSpeed}
          onShowTrueProximityChange={setShowTrueProximity}
          onShowObservedDetectionsChange={setShowObservedDetections}
        />
      </section>
    </main>
  );
}
