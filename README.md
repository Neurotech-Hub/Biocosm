# Adaptive Social Proximity Logger Simulator

Browser-based simulator for testing BLE-based social proximity logging strategies in small animals. The current implementation includes the Phase 1 deterministic baseline plus Phase 2 adaptive firmware review tools, while keeping true animal behavior, radio detection, firmware sampling, logs, and analysis separated.

## Current Progress

- React + TypeScript + Vite app scaffolded.
- Seeded simulation core with deterministic random number generation.
- Rectangular enclosure with generated path/tunnel graph.
- Animals receive seed-deterministic traits from configurable biology distributions; movement is treated as a binary behavioral state with an internal fixed step speed.
- Fixed-rate and motion-plus-peer adaptive BLE firmware policies with serial scan/advertise burst timing.
- BLE detections require scan-listen and advertising-packet overlap inside each 60s review step, with per-collar offsets and deterministic jitter.
- Simple energy budget model estimates mAh use and LiPo voltage from steady draw plus scan/advertising burst current.
- Seeded motion sensor observations with threshold/noise/false-positive/false-negative behavior.
- RSSI/noise radio model with detection probability.
- Logs for animal state, true dyads, BLE detections, scan windows, and collar states.
- Canvas visualization with exaggerated small-enclosure scaling, readable large-enclosure scaling, and interval-summary scan/advertising indicators.
- Time-of-day panel with deterministic timeline scrubbing.
- Time-series review panel with light/dark phase, normalized moving-animal fraction, and energy use over the built simulation.
- Controls are grouped into Simulation/Biocosm, Device/BLE, and Animal/Biology sections with focused rodent-oriented trait distributions.
- Simulation settings are staged until `Build Simulation` is clicked, avoiding expensive timeline rebuilds during slider changes.
- Canvas frames remain 60s review summaries, while BLE scan/advertising/detection timing runs at 1s internal resolution.
- Metrics panel prioritizes BLE capture rate for true in-range dyad intervals, plus energy budget, scan effort, and adaptive policy feedback.
- Raw per-animal data review at the selected timeline step includes scan-window and advertising-packet counts.
- Assumptions panel explaining the active policy and observation model.
- Unit tests for determinism, configurable trait generation, movement bounds, serial BLE timing, detection overlap gating, energy use, motion sensing, adaptive drive behavior, world scale effects, time-series helpers, and metrics.

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
- `src/simulation/motionSensor.ts` converts movement into seeded collar-visible motion observations.
- `src/simulation/radio.ts` computes true dyads and observed BLE detections.
- `src/simulation/policies/fixedRate.ts` implements the Phase 1 fixed BLE policy.
- `src/simulation/policies/adaptive.ts` implements motion-plus-peer adaptive BLE drive and timing.
- `src/simulation/analysis.ts` computes the current metrics.
- `src/components/CanvasVisualizer.tsx` renders the enclosure, graph, animals, true proximity, and observed detections.
- `src/components/ControlsPanel.tsx`, `src/components/MetricsPanel.tsx`, `src/components/RawDataPanel.tsx`, and `src/components/AssumptionsPanel.tsx` provide the review UI.

## Tips For Future Agents

- Keep the spec's separation intact: world truth, radio model, firmware policy, observed logs, and analysis should remain distinct modules.
- Use seeded randomness for anything simulation-affecting. Do not add `Math.random()` to the simulation path.
- Preserve scan-window logs even when no detections occur. Negative evidence is required for later effort normalization.
- Prefer adding new firmware policies as separate modules under `src/simulation/policies/` instead of mixing policy logic into the world or radio model.
- If adding adaptive policies, start with the bounded exponential motion/peer drive model from the spec and compare it against the existing fixed-rate policy.
- Run `npm test` and `npm run build` after substantive simulator or UI changes.
