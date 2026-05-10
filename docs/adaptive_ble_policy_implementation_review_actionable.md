# Adaptive BLE Policy Implementation Review — Actionable Feedback

**Project:** Biocosm / Juxta BLE social-proximity simulator  
**Focus:** Adaptive BLE firmware policy implementation, UI clarity, capture-rate comparability, and energy-model consistency  
**Review target:** `implementation_review_for_supervisor.md`

---

## Executive Summary

The current implementation is directionally correct. The most important architectural choice is already in place: **fixed-rate and adaptive policies both write into the same collar scan/advertise timing fields**, while **BLE capture rate remains policy-independent** and is computed from true in-range dyad epochs versus detections in the same epoch.

That is the correct design for comparing firmware strategies.

Before using adaptive-policy results to choose real firmware settings, make the following changes or verifications:

1. Change the empty-scan penalty from **“any empty scan window”** to **“observer scanned during the epoch and detected no peers.”**
2. Rename `restDrive` to `baselineDrive` or make the UI label very explicit.
3. Confirm BLE capture opportunities use **epoch-integrated within-range detection**, not endpoint-only truth.
4. Confirm energy estimation uses the calibrated Juxta event/duty model, **not envelope duty as radio-on duty**.
5. Add an explicit **fixed-rate neutral marker at `samplingDrive = 0.5`** in the adaptive mini visualization.

---

## 1. Preserve the Core Architecture

### Current implementation

The implementation describes:

- A fixed-rate policy that directly sets collar timing fields.
- An adaptive policy that computes motion, peer, and baseline drive values.
- A shared BLE burst scheduler and detection model.
- A shared capture-rate metric that does not depend on policy internals.

### Assessment

This is correct.

The adaptive policy should only change:

```text
scan interval
scan window
advertise interval
advertise burst duration, if intentionally exposed
```

It should not change the definition of BLE capture rate.

### Required action

No major change needed.

Keep this principle:

```text
Policy changes sampling behavior.
Metrics evaluate the resulting detection behavior.
Policy state itself does not count as detection.
```

---

## 2. Fix the Empty-Scan Peer Penalty

### Current behavior

The implementation review states:

```text
If any previous-epoch scan window for this observer has detectedAnyPeer === false,
apply peerMissPenalty.
```

### Concern

This is probably too aggressive.

If the simulator splits a scan burst into many short listen windows, many individual listen windows will be empty even when the animal is near a peer. Applying a penalty when **any** listen window is empty will suppress `peerDrive` almost constantly.

That would make the adaptive policy too pessimistic and potentially unstable.

### Required change

Apply `peerMissPenalty` only when the observer had a real scan opportunity during the previous epoch and detected no peers during that epoch.

Use this logic:

```ts
const observerScannedLastEpoch =
  scanWindows.some(w => w.observerId === animal.id);

const observerDetectedPeerLastEpoch =
  detections.some(d => d.observerId === animal.id);

if (observerScannedLastEpoch && !observerDetectedPeerLastEpoch) {
  peerDrive = Math.max(0, peerDrive - peerMissPenalty);
}
```

### Do not use

```ts
scanWindows.some(w => w.detectedAnyPeer === false)
```

as the penalty trigger.

### Better future option

Later, add dyad-specific negative evidence:

```text
If A recently believed B was nearby,
and A scanned but did not detect B,
then decrease P(contact_AB).
```

But for the current firmware-policy layer, observer-level negative evidence is sufficient.

---

## 3. Rename `restDrive` to `baselineDrive`

### Current behavior

The adaptive policy computes:

```text
samplingDrive = clamp01(restDrive + motionWeight * motionDrive + peerWeight * peerDrive)
```

### Concern

The name `restDrive` is biologically confusing.

It sounds like the animal being at rest increases sampling, but the parameter is actually the basal/default BLE sampling level before motion or peer detections add to it.

### Required change

Rename internally and in the UI:

```ts
restDrive → baselineDrive
```

or, if avoiding refactors:

```text
UI label: Baseline sampling drive
Internal: restDrive
```

### Suggested help text

```text
Baseline sampling drive is the default BLE sampling intensity when no recent motion
or peer detections are present. A value below 0.5 allows the policy to conserve
energy below the fixed-rate schedule. A value near 0.5 keeps inactive animals
near the fixed-rate schedule.
```

---

## 4. Keep Fixed-Rate as the Neutral Anchor

### Current design

The adaptive timing anchors use:

```text
lowIntensity
neutral
highIntensity
```

with:

```text
samplingDrive = 0.5 → neutral timing
```

The neutral timing matches the Juxta fixed-rate schedule:

```text
scan interval = 20 s
scan window   = 1.5 s
advertise interval = 5 s
advertise burst = 2 s
```

### Assessment

This is correct and important.

### Required action

Make this explicit in the UI and documentation:

```text
samplingDrive < 0.5 = lower sampling intensity than fixed-rate
samplingDrive = 0.5 = fixed-rate equivalent
samplingDrive > 0.5 = higher sampling intensity than fixed-rate
```

### Recommended UI label

```text
0.5 = fixed-rate baseline
```

### Recommended preset behavior

Use three preset styles:

```ts
adaptivePresets = {
  energySaving: {
    baselineDrive: 0.20,
    allowEnergySavingDownscale: true
  },
  balanced: {
    baselineDrive: 0.40,
    allowEnergySavingDownscale: true
  },
  upscaleOnly: {
    baselineDrive: 0.50,
    allowEnergySavingDownscale: false
  }
}
```

The exact values can be tuned, but the conceptual distinction should remain.

---

## 5. Verify Epoch-Integrated Capture Opportunities

### Current requirement

The fixed-rate capture-rate update requires opportunity epochs to be counted when a dyad is within detection radius **at any point during the epoch**, not only at the epoch endpoint.

The intended definition is:

```text
opportunity = both collars valid
              AND distance(A, B) <= detectionRadiusMeters
              at any sampled/interpolated point in the epoch
```

### Concern

The implementation review says capture rate compares true in-range dyad epochs to detections in the same epoch, but it does not prove that `logs.trueDyads` is now epoch-integrated.

### Required verification

Confirm that capture-rate opportunities use:

```ts
withinDetectionRadiusAny === true
```

or equivalent.

They should not use endpoint-only truth:

```ts
withinDetectionRadiusAtEnd === true
```

unless the simulator timestep is much shorter than the social/radio event timescale.

### Acceptance test

Add or confirm this test:

```text
Given a dyad is within range only during the middle of a 60 s epoch,
and outside range at both endpoint positions,
the epoch should still count as a BLE capture opportunity.
```

---

## 6. Keep Capture Rate Unordered for Now

### Current user decision

The primary metric should remain system-level / cohort-level.

A detection in either direction counts as a hit for the unordered pair:

```text
A detects B → hit for A|B
B detects A → hit for A|B
```

### Assessment

This is appropriate for now because the immediate goal is to compare cohort-wide algorithms, not diagnose individual collar behavior.

### Required action

No directed-capture metric is required at this stage.

Keep:

```text
unordered pair capture rate
```

as the primary metric.

---

## 7. Do Not Model Collar Loss Yet

### Current user decision

For now, assume all collars are retrieved and valid unless the simulator already marks a collar invalid.

### Assessment

This is acceptable for the current adaptive-policy review.

### Required action

No new collar-loss model is required for this update.

Leave these out of scope for now:

```text
scanner log recovered
transmitter still alive
clock valid
partial data recovery
lost collar still advertising
```

---

## 8. Alternating Scheduler Is Acceptable

### Current user decision

The hardware may prioritize scan over advertise as a timer-deconfliction safeguard, but the simulator’s serial/alternating method is acceptable for this app.

### Assessment

This is fine for policy comparison as long as the scheduler is deterministic and documented.

### Required action

No change required.

Document that the simulator models a deterministic serial radio schedule rather than exact firmware timer priority.

---

## 9. Energy Model: Do Not Treat Envelope Duty as Radio-On Duty

### Current implementation

The adaptive logs include:

```text
combinedEnvelopeDuty
saturatedScheduleWarning
```

### Assessment

These are useful as scheduling-pressure indicators.

### Concern

They should not be used as the primary energy calculation.

A 2 s advertising burst is not 2 s of continuous TX. Likewise, a 1.5 s scan burst is not 1.5 s of continuous RX, because the internal scanner duty is based on scan window / scan interval.

### Required action

Ensure energy uses the corrected Juxta-style model:

```text
scan energy ≈ scan_burst_duration
              × internal_scan_window / internal_scan_interval
              × RX_current
```

and:

```text
advertising energy ≈ number_of_advertising_events
                     × calibrated_advertising_event_charge
```

or use an empirical Juxta mode-current model.

### Sidebar usage

It is okay for the UI to show:

```text
combined envelope duty
```

but label it as:

```text
schedule pressure
```

not:

```text
radio duty
```

### Suggested UI warning

```text
High schedule pressure means scan/advertise envelopes occupy much of the epoch.
This is not equal to radio-on duty or current draw.
```

---

## 10. Adaptive Mini Visualization

The implementation includes an `AdaptivePolicyMiniPanel`. That is the right place to make the adaptive policy understandable.

### Required content

The sidebar visualization should show:

1. Current sampling drive.
2. A fixed-rate neutral marker at `0.5`.
3. Contributions from baseline, motion, and peer drives.
4. Current mapped scan interval, scan window, and advertise interval.
5. A warning if timing becomes schedule-saturated.

### Recommended compact layout

#### A. Sampling drive bar

```text
0.0 ───────── 0.5 ───────── 1.0
low           fixed          high
```

Overlay current value:

```text
samplingDrive = 0.67
```

Use labels:

```text
below fixed-rate
fixed-rate equivalent
above fixed-rate
```

#### B. Contribution stack

```text
baseline  ████
motion    ██
peer      ███
total     █████████
```

#### C. Schedule chips

```text
Scan every:      12 s
Scan window:     2.1 s
Advertise every: 3.2 s
```

#### D. Relative intensity label

```text
1.6× fixed-rate schedule intensity
```

or:

```text
0.7× fixed-rate schedule intensity
```

This does not need to be exact energy. It can be a normalized schedule-intensity indicator.

---

## 11. Controls to Expose

### Basic controls

Expose these in the main UI:

```text
Adaptive preset
Allow energy-saving downscale
Motion influence
Peer influence
Motion decay
Peer decay
```

### Advanced controls

Hide these under an advanced disclosure:

```text
baselineDrive
motionGain
peerGain
motionWeight
peerWeight
tauMotionSeconds
tauPeerSeconds
peerMissPenalty
motionSaturation
peerSaturation
lowIntensity scan interval
lowIntensity scan window
lowIntensity advertise interval
highIntensity scan interval
highIntensity scan window
highIntensity advertise interval
```

### Keep neutral locked by default

Neutral timing should remain locked to the fixed-rate Juxta baseline unless the user explicitly unlocks it.

```text
scan interval = 20 s
scan window = 1.5 s
advertise interval = 5 s
advertise burst = 2 s
```

---

## 12. Recommended Acceptance Tests

### 12.1 Neutral anchor test

Given:

```text
samplingDrive = 0.5
```

Then mapped timing should equal:

```text
scan interval = 20 s
scan window = 1.5 s
advertise interval = 5 s
```

within numerical tolerance.

### 12.2 Downscale disabled test

Given:

```text
allowEnergySavingDownscale = false
raw samplingDrive < 0.5
```

Then:

```text
effective samplingDrive = 0.5
```

### 12.3 Downscale enabled test

Given:

```text
allowEnergySavingDownscale = true
raw samplingDrive < 0.5
```

Then:

```text
effective samplingDrive < 0.5
```

and timing should map between low intensity and neutral.

### 12.4 Empty-scan penalty test

Given:

```text
observer scanned last epoch
observer had zero detections last epoch
```

Then:

```text
peerDrive decreases by peerMissPenalty
```

Given:

```text
observer scanned last epoch
observer had at least one detection last epoch
```

Then:

```text
peerMissPenalty is not applied
```

Given:

```text
observer did not scan last epoch
```

Then:

```text
peerMissPenalty is not applied
```

### 12.5 Observer-local peer drive test

Given:

```text
A detects B
```

Then:

```text
A peerDrive increases
B peerDrive does not increase solely from being detected
```

This should remain true because the real collar only knows what it observed while scanning.

### 12.6 Capture-rate independence test

Given identical true positions and identical detection events, capture rate should be the same regardless of whether the active policy was fixed or adaptive.

Adaptive-policy logs should not affect capture-rate computation.

### 12.7 Energy model test

Given a 2 s advertising burst, the energy estimator should not compute:

```text
2 s × TX_current
```

as if the transmitter were continuously active.

Given a 1.5 s scan burst with 12.5 ms / 50 ms scan duty, the scan energy should include the 25% internal scan duty.

---

## 13. Implementation Priority

### Must fix before relying on adaptive comparisons

1. Empty-scan penalty semantics.
2. Baseline/rest-drive naming clarity.
3. Epoch-integrated capture opportunity verification.
4. Energy model verification against corrected Juxta event/duty model.
5. Sidebar neutral marker at `samplingDrive = 0.5`.

### Nice to have

1. Dyad-specific inferred contact probability.
2. Directed capture metrics.
3. Collar-loss recovery model.
4. More detailed BLE channel/PDU model.
5. Per-animal and cohort-level adaptive-policy Pareto analysis.

---

## Final Recommendation

Approve the broad implementation, but require the above targeted fixes before interpreting adaptive results.

The most likely failure modes are:

```text
false suppression of peerDrive from overly aggressive empty-scan penalties
overestimated adaptive energy from treating BLE envelopes as continuous radio current
misleading capture rate if opportunity epochs are endpoint-only
unclear UI if users cannot see where fixed-rate sits inside the adaptive range
```

Once those are addressed, the adaptive policy implementation should be suitable for controlled comparison against the fixed-rate Juxta baseline.
