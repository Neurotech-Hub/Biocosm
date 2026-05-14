/** Legacy routine-level BLE timing (Juxta-style references, hardware bench line). */
export const FIXED_SCAN_BURST_SECONDS = 3 as const;
export const FIXED_ADVERTISING_BURST_SECONDS = 0.5 as const;

/**
 * Simplified catalog baselines + focused sweep use 2 s advertising bursts
 * ([docs/biocosm_baseline_simplification_5p5mah_sweep_spec.md]).
 */
export const BASELINE_CATALOG_ADVERTISING_BURST_SECONDS = 2 as const;

/** Focused fixed sweep grid ([docs/biocosm_baseline_simplification_5p5mah_sweep_spec.md] §6). */
export const FOCUSED_SWEEP_FIXED_ADVERTISING_BURST_SECONDS = 2 as const;
