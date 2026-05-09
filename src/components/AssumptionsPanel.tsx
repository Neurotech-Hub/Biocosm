import type { SimulationConfig } from "../simulation/types";
import { resolveSpeciesPreset } from "../simulation/speciesModifiers";

type AssumptionsPanelProps = {
  config: SimulationConfig;
};

export function AssumptionsPanel({ config }: AssumptionsPanelProps) {
  const speciesPreset = resolveSpeciesPreset(config.speciesPresetId, config.speciesModifiers, config.advancedSpeciesOverrides);
  const policySummary =
    config.activePolicy.type === "fixed"
      ? "Fixed-rate collars scan and advertise on constant schedules, independent of animal behavior."
      : "Adaptive collars increase sampling after motion and recent peer detections, then decay back toward low-power timing.";

  return (
    <section className="panel assumptions-panel">
      <h2>Algorithms And Assumptions</h2>
      <p>
        Biology uses the {speciesPreset.label} preset ({speciesPreset.activityPattern.replaceAll("_", " ")},{" "}
        {speciesPreset.confidence} confidence) as a simulation prior; sampled per-animal traits are exported with raw data.
      </p>
      <p>{policySummary}</p>
      <ul>
        <li>Firmware sees simulated motion and recent detections, not true position or true social contact.</li>
        <li>
          The canvas uses the simulation time step (often 60 s); BLE still uses serial scan/advertising bursts with
          scan-first ties when both are due (<code>scanDueAt &lt;= advDueAt</code>), like firmware that checks scan
          before advertise.
        </li>
        <li>
          Detections require an advertising packet inside a scanner listen window before the RSSI logistic draw; distance
          for each hit uses positions linearly interpolated between the frame start and end.
        </li>
        <li>
          Energy uses RX during scan listen windows and TX during nominal multi-channel advertising packet times, plus
          CPU overhead over burst wall time, on top of steady peripheral draw.
        </li>
        <li>
          Whole-simulation metrics distinguish interval-level BLE capture from firmware-minute-style unique peers per
          clock minute (strongest RSSI kept per peer).
        </li>
        <li>Light/dark phase is shown in the time-series panel rather than changing the enclosure background.</li>
        <li>Changing physical size changes meter distances while the canvas still scales to fit the screen.</li>
        <li>Raw detections are behavior-dependent observations, not unbiased social-contact measurements.</li>
      </ul>
    </section>
  );
}
