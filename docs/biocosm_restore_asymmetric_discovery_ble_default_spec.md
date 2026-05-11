# Spec Update: Restore an Asymmetric Discovery BLE Default and Expand Sweep Coverage

**Project:** Biocosm  
**Audience:** Developer agent  
**Purpose:** Correct the recent baseline/preset direction after simulation showed that the proposed symmetric “general balanced” BLE preset performs substantially worse than the prior asymmetric discovery schedule.

---

## 1. User Observation / Motivation

The user observed:

> “Wow these presets are significantly worse than our previous Juxta baseline. It appears our sweep doesn't even cover those settings? Our best capture is now around 37% at 7.16 mAh, which is almost half the capture of the original Juxta baseline and more energy.”

This is an important signal. The goal of decoupling BLE policy presets from hardware energy profiles is still correct, but the specific default BLE preset and sweep coverage need to be revised.

The issue is not the separation of concepts. The issue is that the new **symmetric** default BLE policy is a poor discovery strategy under the simulator’s BLE model.

---

## 2. Keep the Conceptual Separation

Continue separating:

```text
BLE policy baseline = scan/advertise schedule used for comparison and adaptive neutral anchor
Hardware energy profile = how radio activity maps to current/battery use
```

This remains correct.

Juxta should continue to exist as:

```text
Hardware energy profile: Juxta v5/6
Optional BLE policy preset: Juxta v5/6 social mode
```

But the app should not force Juxta branding as the default comparison baseline.

However, the **default BLE policy should be discovery-effective**, not merely visually intuitive.

---

## 3. What Went Wrong

The proposed “General balanced” BLE default was:

```ts
{
  scanIntervalSeconds: 30,
  scanWindowSeconds: 2,
  advIntervalSeconds: 30,
  advertisingBurstDurationSeconds: 2
}
```

This is symmetric and easy to understand:

```text
scan every 30 s
advertise every 30 s
```

But BLE proximity discovery depends strongly on temporal overlap between:

```text
observer scan windows
peer advertising events
```

If all collars advertise only every 30 s, then scan bursts have fewer opportunities to overlap with peer advertisements. This can substantially reduce capture rate.

By contrast, the prior Juxta-like schedule was asymmetric:

```ts
{
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 5,
  advertisingBurstDurationSeconds: 2
}
```

This makes peers advertise more frequently, giving scanning collars many more opportunities to detect them during short scan bursts.

The simulation result therefore makes sense:

```text
Symmetric scan/advertise timing can be intuitive but inefficient.
Frequent advertising + periodic scanning is often better for proximity discovery.
```

---

## 4. Key Design Lesson

The simulator should teach users that a “balanced-looking” BLE schedule is not necessarily a good proximity schedule.

For contact discovery:

```text
advertising often matters more than users may expect
```

because a collar only detects peers while scanning, and the peer must advertise during that scan opportunity.

A useful default should therefore be asymmetric:

```text
moderate scan interval
short scan window
frequent advertise interval
short advertise burst
```

This is not just a Juxta-specific result; it is a general BLE discovery principle under burst-based scan/advertise scheduling.

---

## 5. Revised Default BLE Preset

Replace the symmetric default with a general asymmetric discovery preset.

### New default

```ts
generalDiscoveryBlePolicy = {
  id: "general-discovery",
  label: "General discovery",
  description: "Recommended general-purpose proximity-logger schedule: periodic scan with more frequent advertising for better discovery.",
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 5,
  advertisingBurstDurationSeconds: 2
};
```

### Default selected BLE policy

```ts
defaultBlePolicyPresetId = "general-discovery";
```

This schedule may match the prior Juxta-like schedule numerically, but the label should be general:

```text
General discovery
```

not:

```text
Juxta baseline
```

This preserves generality while using a better default.

---

## 6. Revised BLE Policy Presets

Use these presets:

```ts
export const blePolicyPresets = {
  generalDiscovery: {
    id: "general-discovery",
    label: "General discovery",
    description: "Recommended starting point for proximity logging: frequent advertising with periodic short scan bursts.",
    scanIntervalSeconds: 20,
    scanWindowSeconds: 1.5,
    advIntervalSeconds: 5,
    advertisingBurstDurationSeconds: 2
  },

  generalLowPower: {
    id: "general-low-power",
    label: "General low-power",
    description: "Lower-energy asymmetric schedule that preserves more frequent advertising while reducing scan effort.",
    scanIntervalSeconds: 40,
    scanWindowSeconds: 1.0,
    advIntervalSeconds: 10,
    advertisingBurstDurationSeconds: 2
  },

  generalHighCapture: {
    id: "general-high-capture",
    label: "General high-capture",
    description: "Aggressive discovery schedule for higher capture rate at higher energy cost.",
    scanIntervalSeconds: 10,
    scanWindowSeconds: 2.5,
    advIntervalSeconds: 2.5,
    advertisingBurstDurationSeconds: 2
  },

  symmetricExample: {
    id: "symmetric-example",
    label: "Symmetric example",
    description: "Educational comparison: scan and advertise at the same interval. Often intuitive but not necessarily efficient for BLE discovery.",
    scanIntervalSeconds: 30,
    scanWindowSeconds: 2,
    advIntervalSeconds: 30,
    advertisingBurstDurationSeconds: 2
  },

  juxtaV56Social: {
    id: "juxta-v56-social",
    label: "Juxta v5/6 social mode",
    description: "Juxta-specific name for the original social-mode schedule. Numerically equivalent to General discovery unless changed later.",
    scanIntervalSeconds: 20,
    scanWindowSeconds: 1.5,
    advIntervalSeconds: 5,
    advertisingBurstDurationSeconds: 2
  }
};
```

The `symmetricExample` preset should not be the default. It is useful as a teaching / comparison preset.

---

## 7. Hardware Energy Profile Remains Independent

Keep the default hardware profile as Juxta v5/6 if desired:

```ts
defaultHardwareEnergyProfileId = "juxta-v56";
```

The default app state should therefore be:

```text
BLE policy baseline: General discovery
Hardware energy profile: Juxta v5/6
```

This preserves realistic energy/battery calculations while keeping the BLE schedule framed generically.

---

## 8. Sweep Coverage Problem

The current sweep may not include the original high-performing asymmetric schedule.

If the fixed sweep is generated only around the symmetric `General balanced` baseline, e.g.:

```text
scan intervals: 15, 30, 60
advertise intervals: 15, 30, 60
scan windows: 1, 2, 3
```

then it does not include:

```text
scan interval = 20
scan window = 1.5
advertise interval = 5
advertise burst = 2
```

That means the sweep excludes the known effective region.

This is unacceptable because the sweep is supposed to guide users toward better settings, not accidentally omit good asymmetric schedules.

---

## 9. Revised Fixed Sweep Grid

The fixed-rate sweep should explicitly cover asymmetric discovery schedules.

### Recommended quick fixed grid

```ts
SWEEP_QUICK_FIXED_SCAN_INTERVALS = [10, 20, 30, 40, 60];

SWEEP_QUICK_FIXED_ADV_INTERVALS = [2.5, 5, 10, 15, 30];

SWEEP_QUICK_FIXED_SCAN_WINDOWS = [1.0, 1.5, 2.0, 3.0];

SWEEP_FIXED_BURST_SECONDS = 2;
```

This grid includes:

```text
scan 20 s
window 1.5 s
advertise 5 s
burst 2 s
```

It also covers low-power and high-capture asymmetric variants.

Total fixed policies:

```text
5 × 5 × 4 = 100 fixed policies per seed
```

If this is too many for fast interactive sweeps, use the reduced quick grid below.

### Reduced quick fixed grid

```ts
SWEEP_QUICK_FIXED_SCAN_INTERVALS = [10, 20, 40];

SWEEP_QUICK_FIXED_ADV_INTERVALS = [5, 10, 30];

SWEEP_QUICK_FIXED_SCAN_WINDOWS = [1.0, 1.5, 2.5];

SWEEP_FIXED_BURST_SECONDS = 2;
```

Total:

```text
3 × 3 × 3 = 27 fixed policies per seed
```

This reduced grid still includes the known high-performing schedule:

```text
scan 20 / window 1.5 / advertise 5 / burst 2
```

### Requirement

Regardless of grid generation strategy, always ensure this policy is included:

```ts
referenceDiscoveryPolicy = {
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 5,
  advertisingBurstDurationSeconds: 2
};
```

The app may label it:

```text
General discovery reference
```

or, when the Juxta preset is selected:

```text
Juxta v5/6 social reference
```

---

## 10. Adaptive Neutral Anchor

The adaptive neutral anchor should now default to **General discovery**.

Thus:

```text
samplingDrive = 0.5
```

should map to:

```text
scan interval = 20 s
scan window = 1.5 s
advertise interval = 5 s
advertise burst = 2 s
```

unless the user selects another BLE policy baseline.

If the user selects `symmetric-example`, then the neutral anchor can become symmetric, but the UI should make clear that this is an educational or custom choice rather than the recommended default.

---

## 11. Adaptive Anchor Generation Around General Discovery

For `general-discovery`, recommended adaptive anchors are:

```ts
lowIntensity: {
  scanIntervalSeconds: 40,
  scanWindowSeconds: 0.75,
  advIntervalSeconds: 10
},

neutral: {
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 5
},

highIntensity: {
  scanIntervalSeconds: 5,
  scanWindowSeconds: 3.0,
  advIntervalSeconds: 1.5
},

advertisingBurstDurationSeconds: 2
```

This preserves the same concept:

```text
low = energy saving
neutral = recommended general discovery
high = aggressive discovery
```

The high-intensity advertise interval should be allowed to go below 5 s because frequent advertisements appear important for high capture.

---

## 12. UI Copy Updates

### Baseline selector help text

Use:

```text
BLE Policy Baseline
This defines the fixed scan/advertise schedule used as the comparison point and the adaptive policy’s neutral setting. For proximity logging, frequent advertising with periodic scanning often performs better than symmetric scan/advertise timing.
```

### General discovery preset description

```text
Recommended starting point. Uses frequent advertising and periodic short scan bursts to improve discovery while limiting scan energy.
```

### Symmetric example description

```text
Educational comparison. Symmetric scan/advertise timing is intuitive, but may underperform because scanners have fewer peer-advertisement opportunities.
```

### Sweep warning if current baseline is symmetric

If user selects `symmetric-example`, show a small warning:

```text
Symmetric BLE schedules are easy to understand but may reduce discovery. Consider comparing against General discovery.
```

---

## 13. Report / Export Updates

Reports should explicitly state:

```text
Comparison BLE baseline: General discovery
Hardware energy profile: Juxta v5/6
```

The report should include a note:

```text
The default BLE policy is asymmetric because scan/advertise overlap drives proximity capture. Frequent advertising gives scanning collars more opportunities to detect nearby peers.
```

If `symmetric-example` is selected, report should state:

```text
The selected baseline is symmetric and may not represent an efficient discovery schedule.
```

---

## 14. Tests to Add

### Test 1: Default BLE baseline is General discovery

Expected:

```text
defaultBlePolicyPresetId = general-discovery
```

with:

```text
scan interval = 20
scan window = 1.5
advertise interval = 5
advertise burst = 2
```

### Test 2: Symmetric example is not default

Expected:

```text
symmetric-example exists
defaultBlePolicyPresetId !== symmetric-example
```

### Test 3: Fixed sweep includes reference discovery policy

For both quick and full sweep configurations, assert that the trial list includes:

```text
scan interval = 20
scan window = 1.5
advertise interval = 5
advertise burst = 2
```

### Test 4: Adaptive neutral equals General discovery by default

At:

```text
samplingDrive = 0.5
```

adaptive timing should equal:

```text
scan 20
window 1.5
advertise 5
burst 2
```

### Test 5: General discovery and Juxta v5/6 social are both available

Expected presets:

```text
general-discovery
juxta-v56-social
```

Both may currently share the same numeric schedule, but labels and purposes differ.

### Test 6: Reports avoid “Juxta baseline” unless Juxta preset selected

If selected BLE baseline is `general-discovery`, report should not use:

```text
Juxta baseline
```

It should use:

```text
General discovery
```

or:

```text
Selected baseline
```

---

## 15. Implementation Priority

1. Change default BLE preset from symmetric to `general-discovery`.
2. Add or update BLE presets as listed above.
3. Ensure fixed sweep includes the original high-performing asymmetric schedule.
4. Update adaptive neutral anchor to use `general-discovery` by default.
5. Update UI copy explaining why asymmetric BLE can outperform symmetric BLE.
6. Update reports/exports to distinguish BLE baseline from hardware energy profile.
7. Add tests ensuring sweep coverage includes the discovery reference policy.

---

## 16. Final Recommendation

The separation between BLE policy baseline and hardware energy profile should remain.

But the default BLE baseline should not be symmetric.

Use:

```text
Default BLE policy baseline: General discovery
  scan every 20 s for 1.5 s
  advertise every 5 s for 2 s

Default hardware energy profile: Juxta v5/6
```

This makes the app general in language and architecture while retaining a high-performing, BLE-appropriate discovery schedule as the starting point.

The symmetric policy should remain available as an educational comparison, but the app should not guide users toward it by default.
