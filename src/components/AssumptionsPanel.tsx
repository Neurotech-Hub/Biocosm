import type { SimulationConfig } from "../simulation/types";

type AssumptionsPanelProps = {
  config: SimulationConfig;
};

export function AssumptionsPanel({ config }: AssumptionsPanelProps) {
  const policySummary =
    config.activePolicy.type === "fixed"
      ? "Fixed-rate collars scan and advertise on constant schedules, independent of animal behavior."
      : "Adaptive collars increase sampling after motion and recent peer detections, then decay back toward low-power timing.";

  return (
    <section className="panel assumptions-panel">
      <h2>Algorithms And Assumptions</h2>
      <p>{policySummary}</p>
      <ul>
        <li>Firmware sees simulated motion and recent detections, not true position or true social contact.</li>
        <li>
          The canvas reviews 60s frames, but BLE uses serial scan/advertising bursts with scan priority when both are
          due, matching the firmware state-machine shape.
        </li>
        <li>Detections require an advertising packet to land inside a scanner listen window before RSSI probability is applied.</li>
        <li>Energy budget estimates combine steady peripheral draw with scan and advertising burst current assumptions.</li>
        <li>Light/dark phase is shown in the time-series panel rather than changing the enclosure background.</li>
        <li>Changing physical size changes meter distances while the canvas still scales to fit the screen.</li>
        <li>Raw detections are behavior-dependent observations, not unbiased social-contact measurements.</li>
      </ul>
    </section>
  );
}
