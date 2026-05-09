# Circadian Behavior Model Specification

This document describes the current circadian model used by the Adaptive Social Proximity Logger Simulator. It is intended for biological review and highlights the code locations, parameters, and assumptions that currently shape animal activity.

## Associated Code

- `src/simulation/types.ts`
  - `BehaviorConfig`: circadian mode and social behavior config.
  - `BiologyConfig`: per-animal trait distributions.
  - `AnimalTraits`: sampled traits stored on each animal.
- `src/simulation/config.ts`
  - `defaultSimulationConfig.behavior`: default circadian mode.
  - `defaultSimulationConfig.biology`: default biological trait distributions.
- `src/simulation/world.ts`
  - `createTraits()`: samples individual biological traits from triangular distributions.
  - `chooseBehaviorState()`: chooses `moving`, `awake_stationary`, or `sleeping`.
  - `windowDrive()`: cosine-shaped circadian activity/sleep window.
  - `initialBoutRemainingSeconds()`: initializes state-specific bout duration.
- `src/simulation/engine.ts`
  - `updateAnimalPositions()`: decrements bout timers and calls `chooseBehaviorState()` when a bout ends.
  - `boutLengthSeconds()`: assigns new bout lengths after state transitions.
  - `movementSpeedMetersPerMinute`: fixed internal movement speed for moving animals.
- `src/simulation/timeSeries.ts`
  - `buildTimeSeries()`: plots movement as the fraction of animals with `behavioralState === "moving"`.
  - `isLightPhase()`: defines light phase as 0600-1800.
- `src/components/ControlsPanel.tsx`
  - UI exposes circadian mode, daily activity minutes, sleep bout minutes, movement bout minutes, and social propensity.

## Current Behavior States

Each animal has one behavioral state at each simulation step:

| State | Meaning | Movement |
| --- | --- | --- |
| `moving` | Animal is actively traversing the path graph. | Yes |
| `awake_stationary` | Animal is awake but not moving. | No |
| `sleeping` | Animal is inactive/asleep. | No |
| `social_pause` | Defined in the type system but not currently selected by the circadian state model. | No direct use |

The movement time-series plot uses a normalized movement fraction:

```text
movementFraction = number of animals in state "moving" / animalCount
```

This makes `1.0` mean all animals are moving and `0.0` mean no animals are moving.

## Parameters Used

### Behavior Parameters

| Parameter | Type | Default | Current role |
| --- | --- | --- | --- |
| `behavior.circadianMode` | `"nocturnal" \| "diurnal"` | `"nocturnal"` | Sets active and sleep phase centers. |
| `behavior.socialPauseProbability` | number | `0.25` | Present in config but not currently used by the circadian state chooser. |
| `behavior.socialBoutMeanMinutes` | number | `4` | Present in config but not currently used by the circadian state chooser. |

For `circadianMode`:

| Mode | Active center | Sleep center |
| --- | --- | --- |
| `nocturnal` | 0000 | 1200 |
| `diurnal` | 1200 | 0000 |

### Biological Trait Distributions

Traits are sampled once per animal at build time using triangular distributions: `min`, `mode`, and `max`.

| Trait | Default distribution | Current role |
| --- | --- | --- |
| `circadianPhaseOffsetHours` | `-2, 0, 2` hours | Shifts the animal's internal clock before evaluating circadian drive. |
| `dailyActivityMinutes` | `180, 420, 720` min/day | Sets active-window width and activity intensity. |
| `majorSleepPeriodHours` | `6, 9, 12` hours | Sets consolidated sleep-window width. |
| `sleepBoutMeanMinutes` | `20, 60, 180` minutes | Sets duration of sleeping bouts after state transitions. |
| `movementBoutMeanMinutes` | `3, 12, 35` minutes | Sets duration of moving bouts after state transitions. |
| `socialPropensity` | `0.1, 0.45, 0.95` | Used for path choice toward nearby peers, not circadian state selection. |

UI currently exposes:

- `circadianMode`
- `dailyActivityMinutes`
- `sleepBoutMeanMinutes`
- `movementBoutMeanMinutes`
- `socialPropensity`

UI does not currently expose:

- `circadianPhaseOffsetHours`
- `majorSleepPeriodHours`

## Trait Sampling

`createTraits()` samples each trait independently from the configured triangular distribution.

```text
sampledTrait = triangular(min, mode, max)
```

Assumptions:

- Animals are heterogeneous because each receives its own sampled traits.
- Trait distributions are independent; there is no covariance between activity duration, sleep duration, movement bout length, or social propensity.
- Traits are fixed for the entire built simulation.

## Circadian State Selection

Behavior state is re-sampled only when the animal's current bout expires.

The model computes local circadian hour:

```text
localHour = (absoluteTimeHours + circadianPhaseOffsetHours) mod 24
```

It then computes:

```text
activeCenterHour = 0 for nocturnal, 12 for diurnal
sleepCenterHour = 12 for nocturnal, 0 for diurnal
activeWindowHours = clamp(dailyActivityMinutes / 60, 1, 16)
activeDrive = windowDrive(localHour, activeCenterHour, activeWindowHours)
sleepDrive = windowDrive(localHour, sleepCenterHour, majorSleepPeriodHours)
activityIntensity = clamp(dailyActivityMinutes / 720, 0.2, 1)
```

The state weights are:

```text
moving weight = 0.02 + activeDrive * activityIntensity * 2.2
awake_stationary weight = 0.12 + activeDrive * 0.55
sleeping weight = 0.08 + sleepDrive * 3 + (1 - activeDrive) * 0.8
```

The next state is selected by weighted random choice from these three weights.

## Circadian Window Shape

`windowDrive()` is a cosine-shaped window centered on active or sleep time:

```text
halfWindow = max(0.5, windowHours / 2)
distance = circular distance between localHour and centerHour

if distance >= halfWindow:
  drive = 0
else:
  drive = 0.5 + 0.5 * cos(pi * distance / halfWindow)
```

Implications:

- Drive peaks at `1.0` at the center of the active/sleep window.
- Drive tapers smoothly to `0.0` at the window boundary.
- Outside the active window, moving is still possible through the baseline moving weight of `0.02`.
- Outside the sleep window, sleeping is still possible through baseline sleep terms.

## Bout Dynamics

State is not re-sampled every frame. Each animal remains in its current state until `boutRemainingSeconds` reaches zero.

When a bout ends:

1. `chooseBehaviorState()` chooses the next state from circadian weights.
2. `boutLengthSeconds()` assigns a new bout duration.

Bout duration rules:

```text
moving:
  max(60, triangular(60, movementBoutMeanMinutes * 60, movementBoutMeanMinutes * 180))

sleeping:
  max(120, triangular(120, sleepBoutMeanMinutes * 60, sleepBoutMeanMinutes * 180))

awake_stationary:
  uniform random from 2 to 10 minutes
```

Initial animal states are also chosen from the circadian model at `config.startTimeSeconds`, rather than being hard-coded. Initial bout durations are shorter bounded ranges so the simulation does not inherit arbitrary startup behavior for too long.

## Movement Mechanics

When an animal is in `moving` state:

- It selects or continues a path-graph edge.
- It advances at fixed internal speed:

```text
movementSpeedMetersPerMinute = 1.2
```

Movement speed is not user-facing. The UI treats movement as a binary behavioral state, and the plot reports the fraction of animals moving rather than total distance.

## Light/Dark Display

The time-series chart separately shades light and dark:

```text
lightPhase = hour >= 6 and hour < 18
darkPhase = otherwise
```

Important distinction:

- Light/dark shading is currently fixed to 0600-1800.
- Circadian activity is centered by mode: nocturnal at 0000 and diurnal at 1200.
- The model does not currently use photoperiod length, dawn/dusk ramps, latitude, season, or entrainment dynamics.

## Current Biological Assumptions

- Nocturnal activity peaks around midnight; diurnal activity peaks around noon.
- Animals have a single dominant daily active window and a single dominant sleep window.
- Individual circadian phase offsets are static after sampling.
- Daily activity duration controls both active-window width and activity intensity.
- Sleep duration controls the consolidated sleep-window width, not total daily sleep minutes directly.
- Movement probability is stochastic, not deterministic, even during peak active periods.
- Some off-phase movement remains possible through baseline weights.
- Animals do not adapt circadian behavior from social context, energy state, detection history, environmental disturbance, feeding, nesting, temperature, sex, reproductive state, or age.
- There is no explicit crepuscular model.
- There is no ultradian rhythm model beyond stochastic bout lengths.
- There is no species-specific calibration.

## Known Limitations / Review Targets

Potential enhancement areas for biological review:

- Whether nocturnal/diurnal activity should be represented by cosine windows, empirical activity kernels, or species-specific distributions.
- Whether rodents should use crepuscular peaks rather than a single midnight-centered nocturnal peak.
- Whether `dailyActivityMinutes` should determine active-window width, probability of movement within the window, or both.
- Whether `majorSleepPeriodHours` should represent consolidated sleep, total sleep, or inactive/resting period.
- Whether sleep and movement bout distributions should be exponential, log-normal, Weibull, or species-specific rather than triangular.
- Whether phase offsets should vary by species, animal, social group, season, or light cycle.
- Whether light/dark phase should directly entrain or modulate the activity curve.
- Whether social propensity should alter circadian state transitions or only spatial path choice.
- Whether the model should include warm-up / burn-in windows before presenting a 24-hour view.
- Whether initial state should be sampled from a steady-state distribution rather than the current instantaneous circadian weights.

## Current Verification

The current test suite includes regressions for:

- Deterministic trait sampling.
- Dark-phase movement being substantially higher than light-phase movement for nocturnal animals.
- Initial nocturnal animals at midday having low movement.
- Normalized movement fraction remaining within `0..1`.

