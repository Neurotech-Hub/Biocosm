/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set `"true"` to use the full balanced sweep grid (90 adaptive policies per seed). */
  readonly VITE_SWEEP_FULL_GRID?: string;
}
