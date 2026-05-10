# Adaptive BLE Policy: Core Implementation and Controls Specification

## Purpose

Implement a motion + peer adaptive BLE policy for the Biocosm/Juxta simulator that can be compared directly against the fixed-rate Juxta baseline.

This specification focuses on the **core policy implementation and UI controls**, not automated parameter search. The fixed-rate BLE capture-rate metric should remain the primary comparison metric and should not be redefined by adaptive policy behavior.

The adaptive policy should answer:

> Can a collar dynamically reduce or increase BLE sampling intensity based on motion and recent peer evidence while preserving or improving system-level capture rate per unit energy?

The adaptive policy should be evaluated against the same unordered, epoch-integrated BLE capture-rate metric defined for fixed-rate mode.

---

## Design principles

### 1. Keep firmware policy and analysis policy separate

The adaptive firmware policy decides:

```text
when a simulated collar scans
when a simulated collar advertises
how aggressive the current BLE schedule should be
```

It should **not** decide whether two animals are truly socially connected.

The capture-rate metric should still compare:

```text
true in-range unordered dyad epochs
vs.
BLE detections in the same epoch
```

Do not modify the capture-rate denominator based on adaptive sampling, inferred contact state, peer-drive state, or prior detections.

---

### 2. Fixed-rate mode is the neutral anchor

The existing Juxta-like fixed-rate settings are the neutral reference point:

```ts
fixedRateAnchor = {
  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,
  advIntervalSeconds: 5,
  advertisingBurstDurationSeconds: 2
};
```

In adaptive mode, define a normalized sampling intensity:

```text
samplingDrive = 0.0  -> lowest BLE sampling intensity / maximum energy saving
samplingDrive = 0.5  -> fixed-rate-equivalent neutral schedule
samplingDrive = 1.0  -> highest BLE sampling intensity / maximum capture effort
```

This is important for interpretability. A user should be able to see when the adaptive policy is operating below, near, or above the fixed-rate baseline.

---

### 3. Adaptive policy should be allowed to downscale and upscale

The adaptive policy should not be “fixed-rate plus extra sampling only.”

It should be able to:

```text
Downscale below fixed-rate when there is little motion and little peer evidence.
Remain near fixed-rate under ordinary/average evidence.
Upscale above fixed-rate after motion or peer detections.
```

This allows the simulator to expose the true tradeoff between capture rate and energy use.

---

### 4. Use local collar evidence only

The adaptive firmware policy should use only evidence that a real collar could know locally.

For each collar:

```text
motionDrive is updated from that collar's IMU/motion observation
peerDrive is updated from peers that this collar detected while scanning
```

Do **not** increase animal A's peerDrive just because animal B detected A, unless explicitly modeling bidirectional communication or post hoc global information. For firmware realism, peerDrive should be observer-local.

---

## Core policy state

Each collar should carry adaptive policy state:

```ts
type AdaptiveBleState = {
  motionDrive: number;        // 0..1, recent accelerometer/motion evidence
  peerDrive: number;          // 0..1, recent locally detected peer evidence
  samplingDrive: number;      // 0..1, combined BLE sampling intensity

  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
  advertisingBurstDurationSeconds: number;

  lastPolicyUpdateTime: number;
};
```

Recommended logs per animal per epoch:

```ts
type AdaptiveBlePolicyLog = {
  time: number;
  epochStartTime: number;
  epochEndTime: number;

  animalId: string;

  motionDetected: boolean;
  motionEventCount?: number;
  localPeerDetectionCount: number;
  hadEmptyScanBurst: boolean;

  motionDrive: number;
  peerDrive: number;
  samplingDrive: number;

  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
  advertisingBurstDurationSeconds: number;

  energyEstimate_uAh?: number;
};
```

These logs are essential for explaining why the adaptive policy changed timing.

---

## Core adaptive update

### Inputs per epoch

For each animal/collar, the policy update needs:

```ts
type AdaptivePolicyInputs = {
  dtSeconds: number;
  motionDetected: boolean;
  motionEventCount?: number;

  // Detections where this collar was the observer during the previous epoch.
  localPeerDetectionsLastEpoch: DetectionEvent[];

  // True if this collar scanned during the previous epoch and found no peers.
  // This should be derived from scan-window logs, not from global truth.
  hadEmptyScanBurstLastEpoch: boolean;
};
```

The current implementation uses previous-epoch detections to update peerDrive before scheduling the next epoch. That is acceptable and should remain explicit.

---

### Motion drive

Motion drive represents recent accelerometer evidence. It should be driven by the simulator's IMU/motion observation layer, not only by path translation.

This distinction matters because microarousals, grooming, repositioning, and other small movements may trigger the real collar's motion threshold without moving the animal through the enclosure.

Update rule:

```ts
motionDrive = motionDrive * exp(-dtSeconds / tauMotionSeconds);

if (motionDetected) {
  motionDrive += motionGain;
}

motionDrive = clamp01(motionDrive);
```

Optional event-count scaling:

```ts
const eventScore = clamp01(motionEventCount / motionEventCountSaturation);
motionDrive += motionGain * eventScore;
```

For the first implementation, a boolean `motionDetected` update is sufficient.

---

### Peer drive

Peer drive represents recent peer evidence from this collar's own scanning.

Update rule:

```ts
peerDrive = peerDrive * exp(-dtSeconds / tauPeerSeconds);

if (localPeerDetectionsLastEpoch.length > 0) {
  peerDrive += peerGain * peerEventScore;
}

if (hadEmptyScanBurstLastEpoch) {
  peerDrive -= peerMissPenalty;
}

peerDrive = clamp01(peerDrive);
```

Recommended peer event score:

```ts
peerEventScore = clamp01(localPeerDetectionsLastEpoch.length / peerDetectionCountSaturation);
```

For the first implementation, use:

```ts
peerEventScore = localPeerDetectionsLastEpoch.length > 0 ? 1 : 0;
```

### Important behavior

Peer drive should not hard-code “animal remains with peer until the next failed scan.” Instead, the firmware policy should use a softer rule:

```text
positive peer detections increase peerDrive
peerDrive decays over time
empty scan bursts can reduce peerDrive faster
```

This creates the desired wax/wane behavior without turning the policy state into a contact classifier.

---

## Combining drives into sampling intensity

Use a bounded additive model:

```ts
samplingDrive = clamp01(
  restDrive
  + motionWeight * motionDrive
  + peerWeight * peerDrive
);
```

Where:

```text
restDrive = low-evidence baseline sampling intensity
motionWeight = how strongly recent motion affects BLE intensity
peerWeight = how strongly recent peer detections affect BLE intensity
```

Default intent:

```text
No motion + no peer evidence -> samplingDrive below 0.5
Moderate evidence -> samplingDrive around 0.5
Strong motion and/or peer evidence -> samplingDrive above 0.5
```

Recommended default starting values:

```ts
adaptivePolicyDefaults = {
  restDrive: 0.25,

  tauMotionSeconds: 180,      // motion effect decays over minutes
  tauPeerSeconds: 900,        // peer effect persists longer than motion

  motionGain: 0.35,
  peerGain: 0.45,
  peerMissPenalty: 0.20,

  motionWeight: 0.45,
  peerWeight: 0.55,

  peerDetectionCountSaturation: 1,
  motionEventCountSaturation: 1
};
```

These are simulation priors, not biological constants. They should be exposed as advanced controls or preset-tunable parameters.

---

## Mapping samplingDrive to BLE timing

### Timing anchors

Define low, neutral, and high intensity timing anchors.

```ts
type AdaptiveBleTimingAnchors = {
  lowIntensity: {
    scanIntervalSeconds: number;
    scanWindowSeconds: number;
    advIntervalSeconds: number;
  };

  neutral: {
    scanIntervalSeconds: number;
    scanWindowSeconds: number;
    advIntervalSeconds: number;
  };

  highIntensity: {
    scanIntervalSeconds: number;
    scanWindowSeconds: number;
    advIntervalSeconds: number;
  };

  advertisingBurstDurationSeconds: number;
};
```

Recommended starting anchors:

```ts
adaptiveTimingAnchors = {
  lowIntensity: {
    scanIntervalSeconds: 60,
    scanWindowSeconds: 0.5,
    advIntervalSeconds: 20
  },

  neutral: {
    scanIntervalSeconds: 20,
    scanWindowSeconds: 1.5,
    advIntervalSeconds: 5
  },

  highIntensity: {
    scanIntervalSeconds: 5,
    scanWindowSeconds: 3.0,
    advIntervalSeconds: 1
  },

  advertisingBurstDurationSeconds: 2
};
```

Keep `neutral` tied to the fixed-rate policy by default. If the fixed-rate baseline changes, the adaptive neutral anchor should update unless the user explicitly unlocks it.

---

### Piecewise mapping

Map `samplingDrive` so that `0.5` exactly equals the fixed-rate neutral schedule.

```ts
function mapAdaptiveTiming(drive: number, anchors: AdaptiveBleTimingAnchors) {
  const d = clamp01(drive);

  if (d <= 0.5) {
    const p = d / 0.5;
    return {
      scanIntervalSeconds: logInterp(anchors.lowIntensity.scanIntervalSeconds, anchors.neutral.scanIntervalSeconds, p),
      scanWindowSeconds: linearInterp(anchors.lowIntensity.scanWindowSeconds, anchors.neutral.scanWindowSeconds, p),
      advIntervalSeconds: logInterp(anchors.lowIntensity.advIntervalSeconds, anchors.neutral.advIntervalSeconds, p),
      advertisingBurstDurationSeconds: anchors.advertisingBurstDurationSeconds
    };
  }

  const p = (d - 0.5) / 0.5;
  return {
    scanIntervalSeconds: logInterp(anchors.neutral.scanIntervalSeconds, anchors.highIntensity.scanIntervalSeconds, p),
    scanWindowSeconds: linearInterp(anchors.neutral.scanWindowSeconds, anchors.highIntensity.scanWindowSeconds, p),
    advIntervalSeconds: logInterp(anchors.neutral.advIntervalSeconds, anchors.highIntensity.advIntervalSeconds, p),
    advertisingBurstDurationSeconds: anchors.advertisingBurstDurationSeconds
  };
}
```

Use log interpolation for intervals because interval changes are multiplicative in duty-cycle/energy terms. Use linear interpolation for scan window duration.

```ts
function logInterp(a: number, b: number, p: number): number {
  return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * clamp01(p));
}

function linearInterp(a: number, b: number, p: number): number {
  return a + (b - a) * clamp01(p);
}
```

---

## Scheduling constraints

Before writing mapped timing values onto the collar, apply sanity constraints.

Recommended constraints:

```ts
scanIntervalSeconds >= 1
advIntervalSeconds >= 0.25
scanWindowSeconds >= 0.05
scanWindowSeconds <= scanIntervalSeconds
advertisingBurstDurationSeconds >= 0.1
advertisingBurstDurationSeconds <= max(advIntervalSeconds, advertisingBurstDurationSeconds)
```

Because the simulator uses a serial scan/advertise burst scheduler, the policy should also warn if a high-intensity configuration is physically saturated.

Add a derived warning if expected burst occupancy becomes too high:

```ts
scanEnvelopeDuty = scanWindowSeconds / scanIntervalSeconds;
advEnvelopeDuty = advertisingBurstDurationSeconds / advIntervalSeconds;
combinedEnvelopeDuty = scanEnvelopeDuty + advEnvelopeDuty;
```

If `combinedEnvelopeDuty > 0.8`, show a UI warning:

```text
This adaptive setting approaches continuous radio scheduling. Serial scan/advertise arbitration may dominate behavior.
```

This is a simulator warning, not necessarily a hard error.

---

## Interaction with capture-rate metric

The adaptive policy should be compared using the same primary metric as fixed-rate mode:

```text
unordered epoch-integrated BLE capture rate
```

Do not change the capture-rate denominator based on adaptive policy state.

Do not count “peerDrive is high” as a capture.

Do not count “inferred contact probability is high” as a BLE hit.

A BLE hit still requires a simulated BLE detection event in the same epoch as a true in-range dyad opportunity.

---

## Optional inferred-contact layer

The app may later include an inferred-contact probability model, but it should be a separate analysis layer.

If implemented, it should be clearly labeled as:

```text
inferred contact probability
```

not:

```text
BLE capture rate
```

Recommended interpretation:

```text
positive BLE detection -> contact probability rises
failed scan after prior contact -> contact probability falls
no scan opportunity -> uncertainty decays gradually
```

This can be useful for visualization, especially during sleep-like periods where animals may remain near each other while motion-driven sampling decreases. However, it should not be required for the first adaptive policy implementation.

---

## UI controls

### Basic controls

The basic UI should avoid exposing every coefficient initially. Recommended controls:

#### Policy enable

```text
Policy: Fixed-rate | Motion + peer adaptive
```

#### Adaptive range preset

```text
Adaptive range: Conservative | Balanced | Aggressive
```

This can adjust the low/high anchors around the fixed-rate neutral point.

Example presets:

```ts
conservative = {
  lowScanInterval: 40,
  highScanInterval: 10,
  lowAdvInterval: 10,
  highAdvInterval: 2,
  lowScanWindow: 1.0,
  highScanWindow: 2.0
};

balanced = {
  lowScanInterval: 60,
  highScanInterval: 5,
  lowAdvInterval: 20,
  highAdvInterval: 1,
  lowScanWindow: 0.5,
  highScanWindow: 3.0
};

aggressive = {
  lowScanInterval: 90,
  highScanInterval: 2,
  lowAdvInterval: 30,
  highAdvInterval: 0.5,
  lowScanWindow: 0.25,
  highScanWindow: 4.0
};
```

#### Motion influence

```text
Motion influence: Low | Medium | High
```

Maps to `motionGain`, `motionWeight`, and possibly `tauMotionSeconds`.

#### Peer influence

```text
Peer influence: Low | Medium | High
```

Maps to `peerGain`, `peerWeight`, `tauPeerSeconds`, and `peerMissPenalty`.

#### Allow downscaling below fixed-rate

```text
Allow energy-saving downscale: On/Off
```

Default: `On`.

If disabled, clamp:

```ts
samplingDrive = Math.max(0.5, samplingDrive);
```

This creates an “upscale-only” adaptive policy for comparison.

---

### Advanced controls

Advanced controls should expose the actual parameters.

Recommended advanced fields:

```ts
restDrive
motionGain
tauMotionSeconds
motionWeight
peerGain
tauPeerSeconds
peerWeight
peerMissPenalty
lowIntensity.scanIntervalSeconds
lowIntensity.scanWindowSeconds
lowIntensity.advIntervalSeconds
highIntensity.scanIntervalSeconds
highIntensity.scanWindowSeconds
highIntensity.advIntervalSeconds
```

The neutral values should default to the fixed-rate baseline and should be locked unless the user explicitly enables:

```text
Unlock neutral anchor
```

---

## Small sidebar visualization

Add a compact visualization so users can understand what the adaptive policy is doing without opening a full analysis panel.

### Recommended component: Adaptive Policy Mini Panel

Location: sidebar near BLE controls.

Size target: approximately 250-320 px wide and 160-240 px tall.

The panel should support either:

```text
selected animal
```

or:

```text
cohort average
```

Default: cohort average, with an optional selected-animal dropdown.

---

### Visualization layout

#### 1. Sampling drive sparkline

A small line plot over the recent simulation window.

```text
Y-axis: samplingDrive, 0 to 1
X-axis: recent time, e.g. last 6 simulation hours or visible run window
Horizontal reference line at 0.5 = fixed-rate neutral
```

Use simple colored background bands or labels:

```text
0.0 - 0.4: energy saving
0.4 - 0.6: near fixed-rate
0.6 - 1.0: intensified sampling
```

Do not rely only on color; include labels or tooltips.

---

#### 2. Current drive decomposition

Below the sparkline, show a compact stacked or grouped bar:

```text
rest contribution
motion contribution
peer contribution
```

Example labels:

```text
Rest 0.25 | Motion +0.16 | Peer +0.31 -> Drive 0.72
```

This is useful because users need to know whether the policy is adapting because of motion or peer evidence.

---

#### 3. Current BLE schedule chips

Show the current mapped BLE timing values:

```text
Scan every 12 s
Scan window 2.1 s
Advertise every 2.8 s
```

Also show a small comparison label:

```text
1.7× fixed-rate intensity
```

or:

```text
0.6× fixed-rate intensity
```

This can be approximated as:

```ts
relativeIntensity = currentEstimatedRadioDuty / fixedRateEstimatedRadioDuty;
```

If energy estimation is available, show:

```text
Estimated: 4.8 mAh/day
```

but do not make energy the main point of this mini panel.

---

### Optional mini mapping curve

If space allows, include a tiny drive-to-schedule mapping visual.

Recommended design:

```text
A horizontal 0..1 drive bar with markers at:
- current drive
- fixed-rate neutral at 0.5
```

Tooltip on hover:

```text
Drive 0.72 -> scan 9.1 s, window 2.4 s, adv 2.2 s
```

This is more compact than plotting three separate curves.

---

## UI copy / tooltips

Use consistent language:

```text
Sampling drive
A normalized 0-1 value controlling how aggressively the collar scans and advertises. 0.5 matches the fixed-rate baseline.
```

```text
Motion drive
Recent accelerometer evidence. It rises when motion is detected and decays over time.
```

```text
Peer drive
Recent peer evidence from this collar's own scans. It rises after peer detections and decays over time.
```

```text
Allow energy-saving downscale
When enabled, the adaptive policy can sample less often than fixed-rate during quiet periods. When disabled, adaptive mode only increases sampling above the fixed baseline.
```

```text
Fixed-rate neutral anchor
The adaptive schedule at sampling drive 0.5. By default this is the Juxta fixed-rate baseline.
```

---

## Important edge cases

### 1. Long sleep near peer

Expected behavior:

```text
motionDrive decays low
peerDrive remains elevated if repeated peer detections continue
samplingDrive may remain near or above fixed-rate
if detections stop, peerDrive gradually decays or drops after empty scans
```

This is desired. It lets the policy maintain sampling during likely social proximity even without motion.

---

### 2. Isolated inactive animal

Expected behavior:

```text
motionDrive decays low
peerDrive decays low
samplingDrive approaches restDrive
BLE timing moves toward low-intensity / energy-saving schedule
```

---

### 3. Active isolated animal

Expected behavior:

```text
motionDrive increases
peerDrive remains low
samplingDrive may rise toward neutral or high depending on motion influence
```

This tests whether motion alone is enough to justify increased sampling.

---

### 4. Social but still animals

Expected behavior:

```text
motionDrive may be low
peerDrive should remain high if detections continue
samplingDrive can remain elevated despite low motion
```

This is the main reason peerDrive is needed.

---

### 5. High-density cohort

Expected behavior:

```text
peerDrive may saturate for many animals
samplingDrive may remain high
energy may rise substantially
```

This should be visible in the sidebar and metrics. Do not hide this; it is an important simulator outcome.

---

## Acceptance tests

### 1. Neutral anchor exactness

Given:

```text
samplingDrive = 0.5
```

The mapped timing should equal:

```text
scan interval = 20 s
scan window = 1.5 s
adv interval = 5 s
```

within floating-point tolerance.

---

### 2. Low drive downscales

Given:

```text
samplingDrive < 0.5
```

The mapped timing should have:

```text
scan interval > 20 s
scan window < 1.5 s
adv interval > 5 s
```

unless downscaling is disabled.

---

### 3. High drive upscales

Given:

```text
samplingDrive > 0.5
```

The mapped timing should have:

```text
scan interval < 20 s
scan window > 1.5 s
adv interval < 5 s
```

---

### 4. Motion event increases motion drive

Given a collar with no peer detections:

```text
motionDetected = true
```

Then:

```text
motionDrive increases
samplingDrive increases
```

relative to the same state without motion.

---

### 5. Peer detection increases only observer-local peerDrive

Given detection event:

```text
observerId = A
peerId = B
```

Then:

```text
A.peerDrive increases
B.peerDrive does not increase from this event alone
```

unless bidirectional policy coupling is explicitly enabled.

---

### 6. Empty scan can reduce peer drive

Given:

```text
peerDrive > 0
hadEmptyScanBurstLastEpoch = true
```

Then:

```text
peerDrive decreases more than decay alone
```

if `peerMissPenalty > 0`.

---

### 7. Capture-rate metric unchanged

Switching from fixed-rate to adaptive policy should not change how BLE capture rate is computed.

The policy should only change detection events through altered scan/advertise timing.

---

### 8. Sidebar visualization reflects policy state

When `samplingDrive` changes, the mini panel should update:

```text
sampling drive sparkline
motion/peer decomposition
current scan interval
current scan window
current advertise interval
```

---

## Out of scope for this implementation

Do not implement these as part of the core adaptive policy update:

```text
automatic parameter sweep / optimization
Pareto frontier computation
research-grade inferred contact probability model
directed capture-rate metrics
complex collar-loss modeling
bidirectional policy communication between collars
species-specific adaptive BLE presets
```

These can be added later after the core adaptive policy is transparent and stable.

---

## Implementation priority

1. Add neutral-anchored adaptive timing anchors.
2. Implement `samplingDrive` with rest, motion, and peer contributions.
3. Map `samplingDrive` to scan/advertise timing with exact fixed-rate behavior at 0.5.
4. Ensure peerDrive uses observer-local detections only.
5. Add logs for motionDrive, peerDrive, samplingDrive, and mapped BLE timings.
6. Add basic UI controls and advanced parameter controls.
7. Add the small sidebar visualization.
8. Add acceptance tests.

---

## Final expected behavior

Adaptive BLE mode should behave like a bounded controller around the fixed-rate baseline:

```text
quiet/no peers     -> lower-than-fixed sampling, lower energy
ordinary evidence  -> fixed-rate-like sampling
motion/peer events -> higher-than-fixed sampling, higher capture effort
```

The user should be able to see, in a compact sidebar, exactly why the policy is currently sampling aggressively or conservatively.

The capture-rate metric should remain directly comparable to fixed-rate mode, allowing later automated exploration of the capture-rate vs energy tradeoff.
