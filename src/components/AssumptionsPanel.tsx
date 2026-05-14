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
      <details className="assumptions-details">
        <summary className="assumptions-details-summary">
          <span className="assumptions-details-chevron" aria-hidden />
          <span className="assumptions-details-title">Algorithms and assumptions</span>
        </summary>
        <div className="assumptions-details-body">
          <p>{policySummary}</p>
          <ul>
            <li>
              Animal behavior is generated from per-animal stochastic schedules with states for sleeping, awake stationary,
              moving, and social pause; movement follows the path graph while preserving configured circadian and activity
              budgets.
            </li>
            <li>
              Firmware policies observe simulated accelerometer motion and prior BLE detections only. They do not observe
              true position, true dyad distance, or true social-contact state.
            </li>
            <li>
              BLE events are simulated as serial scan and advertise bursts. If scan and advertise are both due, scan is
              scheduled first (<code>scanDueAt &lt;= advDueAt</code>), with configured inter-burst timing and safe-zone
              delays.
            </li>
            <li>
              A detection requires a peer advertising event to fall inside an observer scan listen window. Distance at the
              packet time is linearly interpolated between epoch start and end, then filtered by detection radius and an
              RSSI-based logistic detection probability.
            </li>
            <li>
              BLE capture rate is computed over unordered dyad epochs: an opportunity exists when both collars are valid
              and the pair is within detection radius at any sampled point in the epoch; a hit requires at least one
              matching detection during that same epoch.
            </li>
            <li>
              Firmware-minute records collapse raw detections into observer/minute rows with unique peers and strongest
              RSSI retained per peer. These rollups are export-oriented and separate from the interval-level capture
              metric.
            </li>
            <li>
              Energy uses a routine-level linear bench fit: mean current is intercept + scan-duty and advertise-duty terms.
              Burst durations follow the active BLE policy (default catalog baselines use short scan windows and 2 s advertise
              bursts). Legacy bench copy may still cite 3 s / 0.5 s routines. Hardware assumes <strong>+8 dBm</strong> TX for
              RSSI priors.
            </li>
            <li>
              Raw BLE detections are behavior- and schedule-dependent observations; they should not be interpreted as
              unbiased samples of true social contact.
            </li>
          </ul>
        </div>
      </details>
    </section>
  );
}
