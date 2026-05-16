/** Production scan burst wall time (matches nRF52 `SCAN_BURST_MS` / 1000). */
export const FIXED_SCAN_BURST_SECONDS = 3 as const;

/**
 * Production non-connectable advertise burst wall time (matches nRF52 `ADV_BURST_MS` / 1000).
 * Prior firmware used 500 ms bursts; bench regression coefficients were fit at 0.5 s advertise duty.
 */
export const FIXED_ADVERTISING_BURST_SECONDS = 1 as const;

/** Advertise burst length assumed when fitting `ROUTINE_LINEAR_ENERGY_COEFFICIENTS` from bench tables. */
export const LEGACY_BENCH_ADVERTISE_BURST_SECONDS = 0.5 as const;

/** Catalog BLE presets and adaptive timing anchors use the same on-air advertise burst as firmware. */
export const BASELINE_CATALOG_ADVERTISING_BURST_SECONDS = FIXED_ADVERTISING_BURST_SECONDS;

/** Fixed-rate sweep cells hold this advertise burst duration (intervals are swept separately). */
export const FOCUSED_SWEEP_FIXED_ADVERTISING_BURST_SECONDS = FIXED_ADVERTISING_BURST_SECONDS;
