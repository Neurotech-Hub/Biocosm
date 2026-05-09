# Addendum: Species-Defined Circadian and Activity Presets

**Target reader:** developer agent  
**Project:** Adaptive Social Proximity Logger Simulator  
**Purpose:** replace most manual circadian/biology editing with species presets, while preserving a smaller set of user-facing experimental controls.

---

## Summary Recommendation

Move the simulator toward a **species preset + advanced override** model.

Instead of asking users to manually tune:

- circadian mode
- active/sleep windows
- sleep/rest bout length
- movement bout length
- daily movement budget
- social propensity

the UI should first ask for a **species or species archetype**.

That species preset should define biologically plausible distributions for the animal population. The user should still be able to modify experiment-level variables and optionally override species traits in an advanced panel.

The current implementation already uses triangular distributions (`min`, `mode`, `max`) for traits. Keep that pattern, but move the defaults into species profiles.

---

## Important Biological Framing

For this simulator, the goal is not to reproduce literal sleep physiology. The simulator needs biologically plausible **collar-relevant surface behavior**:

- when animals are likely to move
- when they are likely to remain inactive/resting
- how clustered activity is across the day
- whether activity is nocturnal, diurnal, crepuscular, bimodal, or ultradian
- how much individuals vary
- how sociality/territoriality shapes co-location probability

Therefore, avoid naming every inactive state “sleep.” For free-ranging rodents, many periods are better called:

```ts
"resting" | "inactive" | "in_nest" | "awake_stationary" | "sleeping"
```

For BLE proximity simulation, **motion/rest state** matters more than precise EEG-defined sleep.

---

## Required Refactor

### Current issue

The current model uses `dailyActivityMinutes` to control both:

1. active-window width
2. activity intensity

This is convenient but biologically ambiguous.

### Recommended replacement

Split it into separate species-preset fields:

```ts
type ActivityPattern =
  | "nocturnal_unimodal"
  | "nocturnal_bimodal"
  | "diurnal_unimodal"
  | "diurnal_bimodal"
  | "crepuscular"
  | "ultradian"
  | "cathemeral";

type Triangular = {
  min: number;
  mode: number;
  max: number;
};

type SpeciesPreset = {
  id: string;
  commonName: string;
  scientificName?: string;

  activityPattern: ActivityPattern;

  // clock-time peaks in local Zeitgeber/cage time, 0-24 h
  // for lab animals, assume lights on at 06:00 and lights off at 18:00 unless overridden
  activePeakHours: number[];

  // width of the broad active phase, not movement time
  activeWindowHours: Triangular;

  // expected actual locomotor/motion-positive minutes per 24 h
  dailyMotionMinutes: Triangular;

  // major inactive/rest window; not necessarily literal total sleep
  majorRestWindowHours: Triangular;

  // bout scale parameters
  movementBoutMeanMinutes: Triangular;
  restBoutMeanMinutes: Triangular;

  // optional ultradian rhythm modulation
  ultradianPeriodMinutes?: Triangular;
  ultradianAmplitude?: number; // 0..1

  // individual timing variability
  circadianPhaseOffsetHours: Triangular;

  // spatial/social tendencies
  socialPropensity: Triangular; // attraction/co-location
  territoriality: Triangular;   // avoidance/exclusive ranges

  // seasonal sensitivity; useful for squirrels and wild rodents
  seasonalSensitivity: number; // 0..1

  // source confidence for the preset values, not for the species biology itself
  confidence: "high" | "medium" | "low";

  notes: string;
};
```

---

## Species Preset Table

These are recommended **starting presets** for the simulator, not definitive biological constants.

Values are intentionally broad because behavior varies by strain, sex, age, season, housing, photoperiod, reproductive state, food availability, temperature, predation risk, and enclosure complexity.

### Preset values

| Species preset | Pattern | Active peaks | Active window h | Motion min/day | Major rest h | Move bout min | Rest bout min | Social | Territorial | Confidence |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Lab mouse | nocturnal_bimodal | 20, 02 | 8, 11, 14 | 120, 240, 420 | 8, 10, 13 | 2, 6, 15 | 10, 35, 90 | 0.35, 0.60, 0.90 | 0.10, 0.25, 0.55 | medium |
| Wild/house mouse | nocturnal_bimodal | 20, 03 | 8, 12, 15 | 180, 360, 600 | 8, 11, 14 | 3, 10, 25 | 15, 50, 150 | 0.20, 0.45, 0.80 | 0.20, 0.45, 0.75 | medium |
| Lab rat | nocturnal_unimodal | 22, 02 | 9, 12, 15 | 180, 360, 600 | 8, 10, 13 | 4, 12, 30 | 15, 45, 120 | 0.55, 0.75, 0.95 | 0.05, 0.20, 0.45 | medium |
| Deer mouse | nocturnal_bimodal | 19, 05 | 7, 11, 14 | 180, 360, 540 | 8, 11, 14 | 3, 10, 25 | 10, 40, 120 | 0.20, 0.45, 0.75 | 0.25, 0.50, 0.80 | low-medium |
| White-footed mouse | nocturnal_bimodal | 20, 03 | 7, 11, 14 | 160, 320, 520 | 8, 11, 14 | 3, 10, 25 | 10, 40, 120 | 0.20, 0.45, 0.75 | 0.25, 0.50, 0.80 | low-medium |
| Prairie vole | crepuscular + ultradian | 06, 18 | 6, 10, 16 | 180, 420, 720 | 4, 7, 10 | 3, 10, 30 | 20, 60, 180 | 0.60, 0.85, 0.98 | 0.05, 0.20, 0.50 | medium |
| Meadow vole | ultradian | 06, 18 | 8, 14, 20 | 240, 480, 780 | 3, 6, 10 | 3, 12, 35 | 20, 75, 180 | 0.25, 0.50, 0.80 | 0.20, 0.45, 0.75 | medium |
| Bank vole | ultradian / weakly circadian | 06, 18 | 8, 14, 20 | 240, 480, 780 | 3, 6, 10 | 3, 12, 35 | 20, 75, 180 | 0.25, 0.50, 0.80 | 0.20, 0.45, 0.75 | medium |
| Red squirrel | diurnal_bimodal | 09, 16 | 6, 9, 13 | 180, 360, 600 | 10, 13, 16 | 5, 20, 60 | 20, 90, 240 | 0.05, 0.15, 0.35 | 0.60, 0.85, 0.98 | medium |
| Fox squirrel | diurnal_bimodal | 08, 17 | 6, 9, 13 | 180, 360, 600 | 10, 13, 16 | 5, 20, 60 | 20, 90, 240 | 0.05, 0.20, 0.45 | 0.45, 0.70, 0.95 | medium |
| Eastern gray squirrel | diurnal_bimodal | 08, 16 | 6, 9, 13 | 180, 360, 600 | 10, 13, 16 | 5, 20, 60 | 20, 90, 240 | 0.10, 0.25, 0.50 | 0.35, 0.60, 0.90 | medium |
| Ground squirrel archetype | diurnal_unimodal | 12 | 5, 8, 12 | 120, 300, 540 | 10, 14, 18 | 5, 20, 60 | 30, 120, 300 | 0.05, 0.20, 0.45 | 0.40, 0.70, 0.95 | low-medium |

### Notes on table interpretation

- `activePeakHours` are local clock hours under the current light schedule.
- For lab simulations, default to **lights on 06:00 / lights off 18:00**.
- For field/free-ranging simulations, optionally compute peaks relative to sunrise/sunset.
- `dailyMotionMinutes` means simulated collar-motion-positive time, not total wake time.
- `majorRestWindowHours` means the dominant low-activity window, not total EEG sleep.
- Voles should not be forced into a single circadian active window; they often need ultradian modulation.
- Tree squirrels should be seasonal and daylight-sensitive.
- Prairie voles should support crepuscular peaks plus ultradian bouts.
- Squirrels should have high territoriality and lower default social attraction than lab rats or prairie voles.

---

## Recommended TypeScript Presets

```ts
export const SPECIES_PRESETS: Record<string, SpeciesPreset> = {
  lab_mouse: {
    id: "lab_mouse",
    commonName: "Laboratory mouse",
    scientificName: "Mus musculus",
    activityPattern: "nocturnal_bimodal",
    activePeakHours: [20, 2],
    activeWindowHours: { min: 8, mode: 11, max: 14 },
    dailyMotionMinutes: { min: 120, mode: 240, max: 420 },
    majorRestWindowHours: { min: 8, mode: 10, max: 13 },
    movementBoutMeanMinutes: { min: 2, mode: 6, max: 15 },
    restBoutMeanMinutes: { min: 10, mode: 35, max: 90 },
    circadianPhaseOffsetHours: { min: -1.5, mode: 0, max: 1.5 },
    socialPropensity: { min: 0.35, mode: 0.6, max: 0.9 },
    territoriality: { min: 0.1, mode: 0.25, max: 0.55 },
    seasonalSensitivity: 0.05,
    confidence: "medium",
    notes: "Nocturnal, polyphasic, strain- and housing-dependent. Use motion-positive minutes, not wake minutes."
  },

  lab_rat: {
    id: "lab_rat",
    commonName: "Laboratory rat",
    scientificName: "Rattus norvegicus",
    activityPattern: "nocturnal_unimodal",
    activePeakHours: [22, 2],
    activeWindowHours: { min: 9, mode: 12, max: 15 },
    dailyMotionMinutes: { min: 180, mode: 360, max: 600 },
    majorRestWindowHours: { min: 8, mode: 10, max: 13 },
    movementBoutMeanMinutes: { min: 4, mode: 12, max: 30 },
    restBoutMeanMinutes: { min: 15, mode: 45, max: 120 },
    circadianPhaseOffsetHours: { min: -1.5, mode: 0, max: 1.5 },
    socialPropensity: { min: 0.55, mode: 0.75, max: 0.95 },
    territoriality: { min: 0.05, mode: 0.2, max: 0.45 },
    seasonalSensitivity: 0.05,
    confidence: "medium",
    notes: "Nocturnal and social; still polyphasic with rest in both light and dark phases."
  },

  prairie_vole: {
    id: "prairie_vole",
    commonName: "Prairie vole",
    scientificName: "Microtus ochrogaster",
    activityPattern: "crepuscular",
    activePeakHours: [6, 18],
    activeWindowHours: { min: 6, mode: 10, max: 16 },
    dailyMotionMinutes: { min: 180, mode: 420, max: 720 },
    majorRestWindowHours: { min: 4, mode: 7, max: 10 },
    movementBoutMeanMinutes: { min: 3, mode: 10, max: 30 },
    restBoutMeanMinutes: { min: 20, mode: 60, max: 180 },
    ultradianPeriodMinutes: { min: 90, mode: 180, max: 360 },
    ultradianAmplitude: 0.45,
    circadianPhaseOffsetHours: { min: -2, mode: 0, max: 2 },
    socialPropensity: { min: 0.6, mode: 0.85, max: 0.98 },
    territoriality: { min: 0.05, mode: 0.2, max: 0.5 },
    seasonalSensitivity: 0.4,
    confidence: "medium",
    notes: "Use crepuscular peaks plus strong ultradian modulation. Social propensity should be high but still variable."
  },

  meadow_vole: {
    id: "meadow_vole",
    commonName: "Meadow vole",
    scientificName: "Microtus pennsylvanicus",
    activityPattern: "ultradian",
    activePeakHours: [6, 18],
    activeWindowHours: { min: 8, mode: 14, max: 20 },
    dailyMotionMinutes: { min: 240, mode: 480, max: 780 },
    majorRestWindowHours: { min: 3, mode: 6, max: 10 },
    movementBoutMeanMinutes: { min: 3, mode: 12, max: 35 },
    restBoutMeanMinutes: { min: 20, mode: 75, max: 180 },
    ultradianPeriodMinutes: { min: 60, mode: 180, max: 360 },
    ultradianAmplitude: 0.6,
    circadianPhaseOffsetHours: { min: -3, mode: 0, max: 3 },
    socialPropensity: { min: 0.25, mode: 0.5, max: 0.8 },
    territoriality: { min: 0.2, mode: 0.45, max: 0.75 },
    seasonalSensitivity: 0.6,
    confidence: "medium",
    notes: "Vole activity can be strongly ultradian and context-dependent. Avoid a strict nocturnal/diurnal assumption."
  },

  red_squirrel: {
    id: "red_squirrel",
    commonName: "Red squirrel",
    scientificName: "Tamiasciurus hudsonicus or Sciurus vulgaris depending region",
    activityPattern: "diurnal_bimodal",
    activePeakHours: [9, 16],
    activeWindowHours: { min: 6, mode: 9, max: 13 },
    dailyMotionMinutes: { min: 180, mode: 360, max: 600 },
    majorRestWindowHours: { min: 10, mode: 13, max: 16 },
    movementBoutMeanMinutes: { min: 5, mode: 20, max: 60 },
    restBoutMeanMinutes: { min: 20, mode: 90, max: 240 },
    circadianPhaseOffsetHours: { min: -1, mode: 0, max: 1 },
    socialPropensity: { min: 0.05, mode: 0.15, max: 0.35 },
    territoriality: { min: 0.6, mode: 0.85, max: 0.98 },
    seasonalSensitivity: 0.8,
    confidence: "medium",
    notes: "Diurnal, territorial, weather- and season-sensitive. Summer often has morning/afternoon activity; winter may collapse toward midday."
  },

  fox_squirrel: {
    id: "fox_squirrel",
    commonName: "Fox squirrel",
    scientificName: "Sciurus niger",
    activityPattern: "diurnal_bimodal",
    activePeakHours: [8, 17],
    activeWindowHours: { min: 6, mode: 9, max: 13 },
    dailyMotionMinutes: { min: 180, mode: 360, max: 600 },
    majorRestWindowHours: { min: 10, mode: 13, max: 16 },
    movementBoutMeanMinutes: { min: 5, mode: 20, max: 60 },
    restBoutMeanMinutes: { min: 20, mode: 90, max: 240 },
    circadianPhaseOffsetHours: { min: -1.5, mode: 0, max: 1.5 },
    socialPropensity: { min: 0.05, mode: 0.2, max: 0.45 },
    territoriality: { min: 0.45, mode: 0.7, max: 0.95 },
    seasonalSensitivity: 0.8,
    confidence: "medium",
    notes: "Diurnal; often bimodal morning/evening with seasonal shifts."
  }
};
```

The full implementation should include all rows from the table, not only the subset above.

---

## Which Settings Should Be Species-Tied?

These should be set by the selected species preset by default.

| Setting | Species-tied? | User exposed? | Notes |
|---|---:|---:|---|
| `activityPattern` | Yes | Basic dropdown only via species | Advanced override allowed |
| `activePeakHours` | Yes | Advanced | For field mode, allow sunrise/sunset-relative peaks |
| `activeWindowHours` | Yes | Advanced | Do not expose in basic UI |
| `dailyMotionMinutes` | Yes | Advanced | Rename away from `dailyActivityMinutes` |
| `majorRestWindowHours` | Yes | Advanced | Better than user editing `majorSleepPeriodHours` |
| `movementBoutMeanMinutes` | Yes | Advanced | Species default, override for sensitivity tests |
| `restBoutMeanMinutes` | Yes | Advanced | Use “rest” not “sleep” in UI unless EEG-relevant |
| `ultradianPeriodMinutes` | Yes for voles | Advanced | Not all species need this field |
| `ultradianAmplitude` | Yes for voles | Advanced | Keep hidden unless species uses ultradian model |
| `circadianPhaseOffsetHours` | Yes | Advanced | User may widen/narrow variation |
| `socialPropensity` | Partly | Basic as cohort-level modifier | Species gives baseline; user can scale |
| `territoriality` | Yes | Basic as cohort-level modifier for field species | Especially important for squirrels |
| `seasonalSensitivity` | Yes | Not direct | Used internally when season/daylength enabled |

---

## Which Settings Should Stay User-Facing?

These are experiment/design variables and should remain visible.

### Basic UI

| Setting | Why user-facing |
|---|---|
| Species preset | Primary biological model selector |
| Number of animals | Experimental design |
| Enclosure shape | Rectangular vs circular ecology/geometry |
| Enclosure size | Experimental design |
| Number / density of paths | Semi-natural enclosure structure |
| Simulation length | Experimental design |
| Simulation step length | Computational/temporal resolution |
| BLE detection radius | Hardware/radio assumption |
| BLE algorithm/policy | Main experimental comparison |
| Collar dropout/loss rate | Important robustness variable |
| Random seed | Reproducibility |
| Photoperiod schedule | Lab/field protocol variable |
| Season/daylength mode | Important for squirrels/wild rodents |
| Cohort variability slider | Lets user widen/narrow species distributions globally |
| Sociality modifier | Allows testing social-contact assumptions |
| Activity level modifier | Allows sensitivity testing without editing species internals |

### Advanced UI

Expose these only under “Advanced species overrides”:

| Setting | Recommended UI |
|---|---|
| Active peaks | Time pickers / sunrise-relative controls |
| Active window distribution | min/mode/max numeric fields |
| Daily motion distribution | min/mode/max numeric fields |
| Rest-window distribution | min/mode/max numeric fields |
| Movement bout distribution | min/mode/max numeric fields |
| Rest bout distribution | min/mode/max numeric fields |
| Phase offset distribution | min/mode/max numeric fields |
| Ultradian period/amplitude | only if species supports it |
| Social propensity distribution | min/mode/max numeric fields |
| Territoriality distribution | min/mode/max numeric fields |

---

## Recommended Basic UI Flow

```text
1. Select species
2. Select enclosure type: rectangle / circle
3. Set enclosure size and path complexity
4. Set number of animals
5. Set photoperiod / field daylength
6. Set BLE detection radius and firmware policy
7. Set simulation duration and timestep
8. Run simulation
```

Then show a compact preset summary:

```text
Species: Prairie vole
Pattern: crepuscular + ultradian
Active peaks: dawn/dusk
Daily motion: moderate-high
Sociality: high
Territoriality: low-moderate
Seasonal sensitivity: moderate
```

Avoid overwhelming the user with 30 raw biology sliders.

---

## Add a Global Modifier Layer

Do not require users to edit species distributions for common “what if” tests.

Instead, add global multipliers:

```ts
type SpeciesModifierConfig = {
  activityLevelMultiplier: number;   // default 1.0
  socialityMultiplier: number;       // default 1.0
  territorialityMultiplier: number;  // default 1.0
  variabilityMultiplier: number;     // default 1.0
  boutLengthMultiplier: number;      // default 1.0
};
```

Example:

- species preset says lab mouse daily motion mode = 240 min/day
- user sets `activityLevelMultiplier = 1.5`
- effective mode becomes 360 min/day

This lets the user explore sensitivity without destroying the biological preset.

---

## Add a Preset Confidence Badge

Each preset should display a confidence badge:

```text
High: well-supported for this simulation purpose
Medium: good general support but many context dependencies
Low: plausible archetype, needs calibration
```

Do not imply the exact numbers are ground truth.

Example UI copy:

```text
These values are approximate simulation priors. They are intended to produce biologically plausible activity structure, not exact species ethograms.
```

---

## Recommended Behavior Engine Change

The behavior engine should combine multiple drive terms:

```ts
activityDrive =
  circadianKernel(t, speciesPreset)
  + ultradianKernel(t, animalTraits)
  + socialContextDrive(t)
  + environmentalModifiers(t)
  + stochasticNoise;
```

Then convert that to state transitions:

```ts
P(moving) = f(activityDrive, dailyMotionBudget, currentBoutState)
P(resting) = f(restDrive, currentBoutState)
P(awake_stationary) = residual or explicit state
```

For voles:

```ts
activityDrive = weakCircadianDrive + strongUltradianDrive + dawnDuskModulation
```

For squirrels:

```ts
activityDrive = daylightDrive + seasonalTemperatureProxy + morningAfternoonPeaks
```

For lab mice/rats:

```ts
activityDrive = darkPhaseDrive + polyphasicBoutNoise
```

---

## Implementation Notes

### 1. Keep species presets separate from simulation config

Recommended files:

```text
src/simulation/speciesPresets.ts
src/simulation/speciesTypes.ts
src/simulation/speciesModifiers.ts
```

Do not bury these values inside `defaultSimulationConfig`.

### 2. Make presets serializable

Simulation configs should store:

```ts
speciesPresetId: "prairie_vole";
speciesModifiers: { ... };
advancedSpeciesOverrides?: Partial<SpeciesPreset>;
```

This keeps saved simulations portable.

### 3. Preserve the sampled animal traits

After the simulation starts, store the sampled traits per animal.

```ts
animal.traits = {
  speciesPresetId,
  sampledDailyMotionMinutes,
  sampledMovementBoutMeanMinutes,
  sampledRestBoutMeanMinutes,
  sampledCircadianPhaseOffsetHours,
  sampledSocialPropensity,
  sampledTerritoriality
}
```

The analysis/export must include these traits so differences between animals are interpretable.

### 4. Do not resample traits during a run

Species presets define population-level distributions. Individual traits are sampled once per animal at initialization and remain fixed during that run.

### 5. Add deterministic test fixtures

For each preset, test that:

- nocturnal presets produce more movement in dark phase
- diurnal presets produce more movement in light phase
- bimodal presets produce two peaks
- vole presets retain activity bouts across the full day
- squirrel presets suppress nighttime movement
- modifier multipliers shift movement/sociality in the expected direction
- exported config can reproduce the run with the same seed

---

## Species-Specific Modeling Notes

### Lab mice and rats

Use nocturnal activity, but do not model them as one long active block. They are polyphasic. They can rest during the dark phase and move during the light phase.

For simulation purposes:

- dark phase should increase movement probability
- light phase should increase rest probability
- bout dynamics should create many transitions
- social housing should affect co-location but should not erase individual activity rhythms

### Voles

Do not force voles into simple nocturnal or diurnal bins.

Use:

- ultradian activity rhythm
- optional dawn/dusk enhancement
- weak or context-dependent circadian dominance
- strong sensitivity to food/energy, season, photoperiod, and social context

Prairie voles should have a higher default sociality than meadow/bank vole archetypes.

### Tree squirrels

Use diurnal activity and daylight dependence.

For red, fox, and gray squirrels:

- activity is mostly daylight
- warmer seasons often show morning and afternoon peaks
- winter can shift toward a single midday peak
- territoriality should be high, especially for red squirrels
- social proximity should often reflect shared resource/nest contexts rather than stable group cohesion

### Ground squirrels

Use a diurnal archetype with strong seasonal/daylight control.

Many ground squirrel species are highly seasonal, and some have hibernation/torpor biology. Do not implement hibernation unless the user explicitly enables it.

---

## Suggested Preset Dropdown Labels

```text
Laboratory mouse (Mus musculus)
Laboratory rat (Rattus norvegicus)
Wild/house mouse (Mus musculus)
Deer mouse (Peromyscus maniculatus)
White-footed mouse (Peromyscus leucopus)
Prairie vole (Microtus ochrogaster)
Meadow vole (Microtus pennsylvanicus)
Bank vole (Myodes glareolus)
Red squirrel (regional species/archetype)
Fox squirrel (Sciurus niger)
Eastern gray squirrel (Sciurus carolinensis)
Ground squirrel archetype
Custom species
```

For “red squirrel,” either expose region:

```text
American red squirrel (Tamiasciurus hudsonicus)
Eurasian red squirrel (Sciurus vulgaris)
```

or label it as:

```text
Red squirrel archetype
```

because “red squirrel” differs by region.

---

## References / Source Notes

These sources support the qualitative preset structure. Exact numerical values in the presets remain simulation priors and should be calibrated when empirical data are available.

1. Current project circadian spec: `circadian_model_spec.md`.
2. Lab and wild mouse sleep/wake comparison: Wang et al., 2020, *Scientific Reports*, “A comparative study of sleep and diurnal patterns in house mouse and spiny mouse.”  
   https://www.nature.com/articles/s41598-020-67859-w
3. Mouse rest/activity bouts: Pernold et al., 2023, “Bouts of rest and physical activity in C57BL/6J mice.”  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC10292717/
4. Rat sleep-wake polyphasic structure: Stephenson et al., 2013, “Statistical Properties of Sleep-Wake Behavior in the Rat.”  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC3738048/
5. Rat sleep pattern analysis: Simasko and Mukherjee, 2009, “Novel Analysis of Sleep Patterns in Rats Separates Periods of Vigilance Cycling from Long-Duration Wake Events.”  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC2617706/
6. Prairie vole ultradian activity/rest: Lewis et al., 2016, “Male prairie voles display cardiovascular dipping associated with an ultradian activity cycle.”  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC4753128/
7. Vole ultradian/circadian activity: van Rosmalen et al., 2021, “Negative Energy Balance Enhances Ultradian Rhythmicity in Spring Voles.”  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC8276337/
8. Activity pattern principles and vole ultradian coupling to light: Hazlerigg and Tyler, 2019, *PLOS Biology*, “Activity patterns in mammals: Circadian dominance challenged.”  
   https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3000360
9. Prairie vole crepuscular/ultradian description: Bueno-Junior et al., 2023, *Royal Society Open Science*, “Early-life sleep disruption impairs subtle social behaviours in prairie voles.”  
   https://royalsocietypublishing.org/doi/10.1098/rsos.230700
10. Fox squirrel diurnal/bimodal/seasonal activity: Wassmer and Refinetti, 2019, *Frontiers in Ecology and Evolution*, “Individual Daily and Seasonal Activity Patterns in Fox Squirrels.”  
    https://www.frontiersin.org/articles/10.3389/fevo.2019.00179/full
11. Red squirrel behavior summary: University of Arizona Mt. Graham Red Squirrel project.  
    https://conservation.arizona.edu/content/behavior.html
12. Eastern gray squirrel seasonal/diurnal activity: Thompson, 1977, “Diurnal and seasonal activity of the grey squirrel.”  
    https://ui.adsabs.harvard.edu/abs/1977CaJZ...55.1185T/abstract
13. Deer mouse nocturnal/bimodal feeding pattern: Jaeger, 1982, “Feeding Pattern in Peromyscus maniculatus.”  
    https://pubmed.ncbi.nlm.nih.gov/7079329/
14. White-footed mouse / Peromyscus general nocturnality: Peromyscus leucopus overview.  
    https://www.sciencedirect.com/topics/immunology-and-microbiology/peromyscus-leucopus

---

## Bottom Line for Implementation

The user should generally select:

```text
species + environment + BLE policy
```

not manually tune every biological parameter.

Species presets should own the biological priors. User-facing controls should own the experimental context, hardware assumptions, and global sensitivity modifiers.
