# Spec: Decouple BLE Policy Baseline from Hardware Energy Profile

**Project:** Biocosm  
**Audience:** Developer agent  
**Purpose:** Make Biocosm feel like a general BLE proximity-logger design tool instead of a Juxta-specific simulator, while preserving Juxta as a realistic hardware/energy profile.

---

## 1. Problem

The current simulator uses the Juxta fixed-rate schedule as both:

```text
1. the BLE policy baseline / comparison point
2. the hardware energy/battery reference
```

This couples two concepts that should be independent.

For a general user, Juxta-specific BLE settings may feel arbitrary or overly prescriptive. However, Juxta-specific measured current and battery behavior are still useful as a hardware energy model.

The app should separate:

```text
BLE policy baseline = scan/advertise schedule being tested
Hardware energy profile = how radio activity maps to current/battery use
```

---

## 2. Design Principle

Separate these two layers:

```text
Hardware Energy Profile
  - battery capacity
  - baseline current
  - RX current
  - TX event charge/current
  - scan duty model
  - measured mode currents, if available

BLE Policy Preset
  - scan interval
  - scan burst duration
  - advertise interval
  - advertise burst duration
```

Juxta should remain available as:

```text
Hardware profile: Juxta v5/6
Optional BLE policy preset: Juxta v5/6 social mode
```

But Juxta should not be the default BLE comparison policy unless explicitly selected.

---

## 3. Terminology Updates

Avoid using “Juxta baseline” as the general comparison label.

Replace with:

```text
Comparison BLE baseline
```

or:

```text
Selected BLE baseline
```

Use “Juxta” only when referring to a selected hardware profile or explicit Juxta BLE preset.

### Recommended UI terminology

```text
BLE Policy Baseline
Defines the fixed scan/advertise schedule used as the comparison point and adaptive neutral anchor.
```

```text
Hardware Energy Profile
Defines how simulated BLE and device activity are converted into energy use and battery lifetime.
```

---

## 4. New Default BLE Policy

Use a general, easy-to-understand fixed BLE policy as the default.

Recommended default:

```ts
generalBalancedBlePolicy = {
  id: "general-balanced",
  label: "General balanced",
  scanIntervalSeconds: 30,
  scanWindowSeconds: 2,
  advIntervalSeconds: 30,
  advertisingBurstDurationSeconds: 2
};
```

Interpretation for the user:

```text
Scan every 30 seconds for 2 seconds.
Advertise every 30 seconds for 2 seconds.
```

This is symmetrical and intuitive for users who are not starting from Juxta-specific firmware assumptions.

---

## 5. BLE Policy Presets

Add or refactor policy presets into a clearly defined list.

```ts
export const blePolicyPresets = {
  generalBalanced: {
    id: "general-balanced",
    label: "General balanced",
    description: "Symmetric, easy-to-understand default: scan and advertise every 30 s for 2 s.",
    scanIntervalSeconds: 30,
    scanWindowSeconds: 2,
    advIntervalSeconds: 30,
    advertisingBurstDurationSeconds: 2
  },

  generalLowPower: {
    id: "general-low-power",
    label: "General low-power",
    description: "Sparse sampling for longer deployments where short contacts may be missed.",
    scanIntervalSeconds: 60,
    scanWindowSeconds: 1,
    advIntervalSeconds: 60,
    advertisingBurstDurationSeconds: 1
  },

  generalHighCapture: {
    id: "general-high-capture",
    label: "General high-capture",
    description: "More aggressive scan and advertise schedule for higher capture at higher energy cost.",
    scanIntervalSeconds: 10,
    scanWindowSeconds: 3,
    advIntervalSeconds: 10,
    advertisingBurstDurationSeconds: 3
  },

  juxtaV56Social: {
    id: "juxta-v56-social",
    label: "Juxta v5/6 social mode",
    description: "Juxta-style social-mode schedule used for hardware-specific comparison.",
    scanIntervalSeconds: 20,
    scanWindowSeconds: 1.5,
    advIntervalSeconds: 5,
    advertisingBurstDurationSeconds: 2
  }
};
```

Default selected BLE policy:

```ts
defaultBlePolicyPresetId = "general-balanced";
```

---

## 6. Hardware Energy Profiles

Create a separate energy profile system.

```ts
export const hardwareEnergyProfiles = {
  juxtaV56: {
    id: "juxta-v56",
    label: "Juxta v5/6",
    description: "nRF52840-based Juxta v5/6 hardware profile using measured or calibrated current assumptions.",
    batteryCapacityMah: 30,

    // Example structure; use existing validated values where available.
    baselineCurrentUa: 0,
    rxCurrentMa: 6.4,
    txCurrentMa: 13.6,

    scanListenIntervalSeconds: 0.05,
    scanListenWindowSeconds: 0.0125,

    advEventIntervalSeconds: 0.15,
    advEventRadioOnTimeMs: 1.0,

    measuredReferenceModes: {
      social_5sAdv_20sScan_avgCurrentUa: 233.09,
      social_10sAdv_40sScan_avgCurrentUa: 155.57,
      connectableAdvertising_avgCurrentUa: 927.26,
      connected_avgCurrentUa: 294.19,
      shelfMode_avgCurrentUa: 19.49
    }
  },

  genericNrf52840: {
    id: "generic-nrf52840",
    label: "Generic nRF52840 BLE wearable",
    description: "Generic nRF52840 BLE energy assumptions; calibrate before interpreting battery life.",
    batteryCapacityMah: 30,
    rxCurrentMa: 6.4,
    txCurrentMa: 13.6,
    scanListenIntervalSeconds: 0.05,
    scanListenWindowSeconds: 0.0125,
    advEventIntervalSeconds: 0.15,
    advEventRadioOnTimeMs: 1.0
  }
};
```

Default selected hardware profile:

```ts
defaultHardwareEnergyProfileId = "juxta-v56";
```

This keeps energy/battery outputs grounded in real hardware while allowing BLE policy defaults to be general.

---

## 7. Sweep Baseline Behavior

### Current behavior to replace

The sweep currently treats the Juxta fixed policy as the universal baseline.

### New behavior

The sweep baseline should be the **selected BLE policy baseline**.

```text
baseline = currently selected BLE policy preset or custom fixed policy
```

Relative metrics should be computed against this selected baseline:

```ts
relativeCapture = policyCapture / selectedBaselineCapture;
relativeEnergy = policyEnergy / selectedBaselineEnergy;
relativeEfficiency = policyEfficiency / selectedBaselineEfficiency;
```

### UI wording

Show this clearly in the sweep report:

```text
Comparison baseline: General balanced
Hardware energy profile: Juxta v5/6
```

or:

```text
Comparison baseline: Juxta v5/6 social mode
Hardware energy profile: Juxta v5/6
```

depending on user selection.

---

## 8. Adaptive Policy Neutral Anchor

### Current behavior to replace

The adaptive neutral anchor is hard-coded to Juxta fixed-rate settings.

### New behavior

Adaptive neutral should inherit from the selected BLE policy baseline.

```text
samplingDrive = 0.5 → selected BLE baseline schedule
```

For example, if the user selects **General balanced**:

```text
samplingDrive = 0.5:
  scan interval = 30 s
  scan window = 2 s
  advertise interval = 30 s
  advertise burst = 2 s
```

If the user selects **Juxta v5/6 social mode**:

```text
samplingDrive = 0.5:
  scan interval = 20 s
  scan window = 1.5 s
  advertise interval = 5 s
  advertise burst = 2 s
```

### Adaptive timing anchors

Generate low/neutral/high anchors from the selected baseline.

Recommended initial transformation:

```ts
function buildAdaptiveAnchorsFromBaseline(baseline: BlePolicyPreset): AdaptiveTimingAnchors {
  return {
    lowIntensity: {
      scanIntervalSeconds: baseline.scanIntervalSeconds * 2,
      scanWindowSeconds: Math.max(0.5, baseline.scanWindowSeconds * 0.5),
      advIntervalSeconds: baseline.advIntervalSeconds * 2
    },

    neutral: {
      scanIntervalSeconds: baseline.scanIntervalSeconds,
      scanWindowSeconds: baseline.scanWindowSeconds,
      advIntervalSeconds: baseline.advIntervalSeconds
    },

    highIntensity: {
      scanIntervalSeconds: Math.max(1, baseline.scanIntervalSeconds / 4),
      scanWindowSeconds: baseline.scanWindowSeconds * 1.5,
      advIntervalSeconds: Math.max(1, baseline.advIntervalSeconds / 4)
    },

    advertisingBurstDurationSeconds: baseline.advertisingBurstDurationSeconds
  };
}
```

Clamp values with existing scheduler constraints.

Optional advanced control: allow users to unlock and manually edit adaptive anchors. Default behavior should be inherited from the baseline.

---

## 9. Fixed-Rate Sweep Grid

The fixed-rate sweep should no longer be described as “Juxta alternatives.”

Use:

```text
Fixed BLE schedule sweep
```

Preferred long-term approach: generate grid around selected baseline.

```ts
scanIntervals = unique([
  baseline.scanIntervalSeconds / 2,
  baseline.scanIntervalSeconds,
  baseline.scanIntervalSeconds * 2
]);

advIntervals = unique([
  baseline.advIntervalSeconds / 2,
  baseline.advIntervalSeconds,
  baseline.advIntervalSeconds * 2
]);

scanWindows = unique([
  baseline.scanWindowSeconds * 0.5,
  baseline.scanWindowSeconds,
  baseline.scanWindowSeconds * 1.5
]);
```

For **General balanced** this becomes:

```text
scan interval: 15, 30, 60
advertise interval: 15, 30, 60
scan window: 1, 2, 3
```

For **Juxta v5/6 social mode** this becomes:

```text
scan interval: 10, 20, 40
advertise interval: 2.5, 5, 10
scan window: 0.75, 1.5, 2.25
```

Round or clamp for UI-friendliness.

---

## 10. Sweep Candidate Labels

Update sweep policy IDs and labels so they are not Juxta-specific unless they are the Juxta preset.

Baseline row:

```ts
policyId = `sweep-baseline-${selectedBlePolicyPresetId}`;
kind = "baseline_fixed";
label = `Baseline: ${selectedBlePolicyPreset.label}`;
```

Examples:

```text
sweep-baseline-general-balanced
sweep-baseline-juxta-v56-social
```

Other fixed rows:

```ts
policyId = `sweep-fixed-s${scan}-a${adv}-w${window}`;
kind = "fixed_sweep";
```

Adaptive rows should remain comparable but use baseline-derived neutral anchors.

---

## 11. Report UI Updates

Always show these two fields prominently:

```text
Comparison BLE baseline: [selected policy preset]
Hardware energy profile: [selected hardware profile]
```

Replace:

```text
Juxta baseline
```

with:

```text
Selected baseline
```

or:

```text
Comparison baseline
```

Except when the selected baseline is actually Juxta.

Recommendation cards:

```text
Best fixed schedule vs selected baseline
Best adaptive schedule vs selected baseline
Energy-saving adaptive candidate
Balanced adaptive candidate
High-capture candidate
```

Plot labels:

```text
Baseline: General balanced
```

or:

```text
Baseline: Juxta v5/6 social mode
```

---

## 12. Optimizer Updates

The surrogate optimizer should also use the selected BLE baseline and selected hardware profile.

Relative metrics should use:

```text
selected baseline capture
selected baseline energy
selected baseline efficiency
```

not Juxta-specific baseline values.

UI wording:

```text
Optimizer trained against sweep results using:
  Comparison BLE baseline: General balanced
  Hardware energy profile: Juxta v5/6
```

---

## 13. Data Model Changes

Add or confirm separate fields in config:

```ts
type SimulationConfig = {
  blePolicyPresetId: string;
  hardwareEnergyProfileId: string;

  activePolicy: FirmwarePolicyConfig;
  energyProfile: HardwareEnergyProfile;
};
```

or equivalent.

If `activePolicy` already contains policy values directly, still track:

```ts
comparisonBaselinePolicy: FixedPolicyConfig;
comparisonBaselineLabel: string;
hardwareEnergyProfile: HardwareEnergyProfile;
```

The important point is that the baseline schedule and energy profile are independently selectable.

---

## 14. Backward Compatibility

Existing saved configs that do not specify a BLE baseline should migrate to:

```ts
blePolicyPresetId = "general-balanced";
hardwareEnergyProfileId = "juxta-v56";
```

If a saved config appears to be Juxta-specific, optionally infer:

```ts
blePolicyPresetId = "juxta-v56-social";
```

only if the schedule exactly matches:

```text
scan interval = 20
scan window = 1.5
advertise interval = 5
advertise burst = 2
```

Otherwise, load as a custom fixed policy.

---

## 15. Acceptance Criteria

### 15.1 Separation

The user can independently select:

```text
BLE Policy Baseline
Hardware Energy Profile
```

Changing the BLE baseline changes scan/advertise comparison schedules but does not change hardware current assumptions.

Changing the hardware profile changes battery/energy estimates but does not change BLE scan/advertise schedules.

### 15.2 Default

The default BLE baseline is:

```text
General balanced
scan every 30 s for 2 s
advertise every 30 s for 2 s
```

The default hardware profile may remain:

```text
Juxta v5/6
```

### 15.3 Adaptive neutral

For any selected BLE baseline:

```text
samplingDrive = 0.5
```

maps to the selected baseline’s scan interval, scan window, advertise interval, and advertise burst duration.

### 15.4 Sweep baseline

Sweep relative metrics are computed against the selected BLE baseline row, not a hard-coded Juxta row.

### 15.5 UI language

The UI should not say “Juxta baseline” unless the selected BLE baseline is Juxta.

Use:

```text
Selected baseline
Comparison baseline
BLE policy baseline
```

### 15.6 Reports and exports

Reports and exports include:

```text
selectedBlePolicyPresetId
selectedBlePolicyPresetLabel
hardwareEnergyProfileId
hardwareEnergyProfileLabel
baseline scan interval
baseline scan window
baseline advertise interval
baseline advertise burst
```

---

## 16. Suggested Implementation Order

1. Add BLE policy preset definitions.
2. Add hardware energy profile definitions if not already separated.
3. Set default BLE policy preset to `general-balanced`.
4. Keep default hardware energy profile as `juxta-v56`.
5. Update adaptive neutral anchor generation to derive from selected BLE baseline.
6. Update sweep baseline row to use selected BLE baseline.
7. Update relative metrics to reference selected baseline.
8. Update UI labels and report text.
9. Update optimizer relative metrics and labels.
10. Add migration/backward compatibility handling.
11. Add acceptance tests.

---

## 17. Tests to Add

### Test 1: BLE baseline does not change energy profile

Given:

```text
hardware profile = Juxta v5/6
BLE baseline = General balanced
```

Changing the BLE baseline to Juxta should not change the selected hardware energy profile.

### Test 2: Energy profile does not change BLE schedule

Given:

```text
BLE baseline = General balanced
```

Changing hardware profile should not alter:

```text
scan interval
scan window
advertise interval
advertise burst
```

### Test 3: Adaptive neutral follows selected baseline

Given selected baseline:

```text
scan interval = 30
scan window = 2
advertise interval = 30
advertise burst = 2
```

Then adaptive timing at `samplingDrive = 0.5` should match those values.

### Test 4: Sweep baseline row uses selected baseline

Given selected baseline:

```text
general-balanced
```

The baseline row should have:

```text
policyId = sweep-baseline-general-balanced
kind = baseline_fixed
```

and use the general-balanced schedule.

### Test 5: Relative metrics use selected baseline

Given a sweep with selected baseline `general-balanced`, all relative metrics should be computed against that row, not against Juxta.

### Test 6: Juxta preset remains available

Selecting:

```text
Juxta v5/6 social mode
```

should reproduce:

```text
scan interval = 20
scan window = 1.5
advertise interval = 5
advertise burst = 2
```

---

## 18. Final Recommendation

Make Biocosm general by default:

```text
Default BLE baseline: General balanced
Default hardware energy profile: Juxta v5/6
```

This preserves realistic energy estimates while avoiding the impression that the simulator is only a Juxta-specific tool.

Juxta should remain a first-class preset, but not the default BLE policy comparison point.
