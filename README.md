# Adaptive Social Proximity Logger Simulator

Browser-based simulator for testing BLE-based social proximity logging strategies in small animals. The current implementation is Phase 1: a deterministic, reviewable vertical slice that separates true animal behavior from radio detection, firmware sampling, logs, and analysis.

## Current Progress

- React + TypeScript + Vite app scaffolded.
- Seeded simulation core with deterministic random number generation.
- Rectangular enclosure with generated path/tunnel graph.
- Animals receive fixed traits and move along graph edges in bout-based states.
- Fixed-rate BLE firmware policy with scan/advertise timing.
- RSSI/noise radio model with detection probability.
- Logs for animal state, true dyads, BLE detections, scan windows, and collar states.
- Canvas visualization with true proximity and observed BLE detection overlays.
- Controls for seed, animal count, playback speed, detection/social radius, and fixed BLE timing.
- Metrics panel for basic true-vs-observed review.
- Unit tests for determinism, movement bounds, scan-window logging, detection gating, and metrics.

The source specification remains the main product reference:

- `adaptive_social_proximity_logger_simulator_spec.md`

## Run Locally

```sh
npm install
npm run dev
```

Then open the local Vite URL printed by the dev server.

## Verify

```sh
npm test
npm run build
```

Known local environment note: this repo uses Vite 5, `@vitejs/plugin-react` 4, and Vitest 1 because the machine used for Phase 1 was running Node 20.10. Newer Vite/Vitest releases may require a newer Node 20 patch or Node 22+.

## Project Structure

- `src/simulation/types.ts` contains spec-aligned simulation contracts.
- `src/simulation/random.ts` contains the seeded RNG.
- `src/simulation/world.ts` builds the path graph, traits, animals, and movement decisions.
- `src/simulation/engine.ts` advances the simulation and writes logs.
- `src/simulation/radio.ts` computes true dyads and observed BLE detections.
- `src/simulation/policies/fixedRate.ts` implements the Phase 1 fixed BLE policy.
- `src/simulation/analysis.ts` computes the current metrics.
- `src/components/CanvasVisualizer.tsx` renders the enclosure, graph, animals, true proximity, and observed detections.
- `src/components/ControlsPanel.tsx` and `src/components/MetricsPanel.tsx` provide the review UI.

## Tips For Future Agents

- Keep the spec's separation intact: world truth, radio model, firmware policy, observed logs, and analysis should remain distinct modules.
- Use seeded randomness for anything simulation-affecting. Do not add `Math.random()` to the simulation path.
- Preserve scan-window logs even when no detections occur. Negative evidence is required for later effort normalization.
- Prefer adding new firmware policies as separate modules under `src/simulation/policies/` instead of mixing policy logic into the world or radio model.
- If adding adaptive policies, start with the bounded exponential motion/peer drive model from the spec and compare it against the existing fixed-rate policy.
- Run `npm test` and `npm run build` after substantive simulator or UI changes.
