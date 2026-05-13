# Sweep Grid Update: Focus Adaptive BLE on Frequent Advertising + Adaptive Scan Effort

**Audience:** Developer agent  
**Project:** Biocosm  
**Purpose:** Modify the current smoke-test sweep to better explore the policy family that appears to outperform the prior baseline.

---

## Summary

The smoke-test grid needs to shift toward the region that is now clearly performing best:

```text
frequent advertising
adaptive scan effort
```

Right now, the fixed grid explores frequent advertising reasonably well, but the adaptive grid still assumes low intensity means backing off both scan and advertising. That likely misses the best adaptive family.

The next sweep should test this hypothesis:

> The most efficient adaptive BLE policies downscale listening more than advertising.

Detection requires scan/advertise overlap. Reducing advertising too much appears to hurt capture disproportionately, while reducing scan effort saves energy because RX/listening is relatively expensive.

---

## Current Sweep Settings

```text
Policies per seed
70 (smoke-test grid for this baseline)

Simulation seeds
42

Total trials
70
```

### Current adaptive grid

```text
baselineDrive: 0.12, 0.45
motionWeight: 0.22, 0.5
peerWeight: 0.35, 0.85
tauPeerSeconds: 120, 600
```

### Current fixed grid

```text
scan intervals: 5, 20, 80 s
advertise intervals: 1.25, 5, 20 s
scan windows: 0.5, 1.5, 3 s
```

### Current adaptive timing anchors

```text
Low:     40 s scan / 0.75 s window / 10 s advertise
Neutral: 20 s scan / 1.5 s window / 5 s advertise
High:    5 s scan / 3 s window / 1.5 s advertise
Burst:   2 s
```

### Current held adaptive constants

```text
tauMotionSeconds: 120
motionGain: 0.35
peerGain: 0.5
peerMissPenalty: 0.25
allowEnergySavingDownscale: true
```

---

## Required Change 1: Modify Adaptive Timing Anchors

Current adaptive anchors reduce advertising at low intensity. Change low intensity so that advertising remains frequent while scan effort is reduced.

### Replace current anchors

```text
Low:     40 s scan / 0.75 s window / 10 s advertise
Neutral: 20 s scan / 1.5 s window / 5 s advertise
High:    5 s scan / 3 s window / 1.5 s advertise
```

### With these anchors

```text
Low:     60 s scan / 0.75 s window / 5 s advertise
Neutral: 20 s scan / 1.5 s window / 5 s advertise
High:    5 s scan / 3 s window / 1.5 s advertise
Burst:   2 s
```

### Rationale

The strongest-performing policies seem to preserve frequent advertising while economizing RX/listening. A device only detects a peer when:

```text
observer is scanning
AND
peer advertises during the scan opportunity
```

If advertising becomes sparse, scan bursts often have nothing to catch. Keeping advertising at 5 seconds even during low-intensity states preserves discovery opportunity while reducing scan-related energy.

---

## Required Change 2: Update Adaptive Parameter Grid

### Replace current adaptive grid

```text
baselineDrive: 0.12, 0.45
motionWeight: 0.22, 0.5
peerWeight: 0.35, 0.85
tauPeerSeconds: 120, 600
```

### With this grid

```text
baselineDrive: 0.15, 0.25, 0.35
motionWeight: 0.25, 0.45
peerWeight: 0.35, 0.55, 0.85
tauPeerSeconds: 300, 900
```

### Trial count

```text
3 baselineDrive
× 2 motionWeight
× 3 peerWeight
× 2 tauPeerSeconds
= 36 adaptive policies
```

### Rationale

This tests the new candidate family more directly:

```text
low-to-moderate baseline drive
balanced motion/peer weighting
longer peer persistence
frequent low-intensity advertising
adaptive scan effort
```

The previous `tauPeerSeconds = 120` case may be too short for sustained social proximity, co-resting, or nesting-like behavior. For this smoke test, prioritize:

```text
300 s = moderate peer persistence
900 s = long peer persistence
```

Shorter peer decay can be revisited in a later expanded sweep.

---

## Required Change 3: Update Held Adaptive Constants

### Replace current held constants

```text
tauMotionSeconds: 120
motionGain: 0.35
peerGain: 0.5
peerMissPenalty: 0.25
allowEnergySavingDownscale: true
```

### With these held constants

```text
tauMotionSeconds: 180
motionGain: 0.35
peerGain: 0.45
peerMissPenalty: 0.2
allowEnergySavingDownscale: true
```

### Rationale

The current promising workspace uses a softer, more persistent adaptation style:

```text
baselineDrive = 0.25
tauMotionSeconds = 180
tauPeerSeconds = 900
motionGain = 0.35
peerGain = 0.45
peerMissPenalty = 0.2
motionWeight = 0.45
peerWeight = 0.55
```

Lowering the peer miss penalty slightly should avoid collapsing peer drive too quickly during sparse scan periods. This matters because the new low-intensity policy scans less often, so absence of detection should not be over-interpreted.

---

## Fixed Grid Recommendation

Current fixed grid:

```text
scan intervals: 5, 20, 80 s
advertise intervals: 1.25, 5, 20 s
scan windows: 0.5, 1.5, 3 s
```

Keep this for now.

It usefully compares aggressive/frequent-advertising fixed policies against adaptive policies.

### Optional addition

If runtime allows, add:

```text
scan interval: 10 s
```

So fixed scan intervals become:

```text
5, 10, 20, 80 s
```

If the goal is to keep the smoke test small, leave the fixed grid unchanged.

---

## Expected Trial Count

With fixed grid unchanged:

```text
Fixed policies:
3 scan × 3 advertise × 3 window = 27 fixed policies
```

Adaptive grid:

```text
3 baselineDrive × 2 motionWeight × 3 peerWeight × 2 tauPeer = 36 adaptive policies
```

Expected total without additional special cases:

```text
27 fixed + 36 adaptive = 63 policies per seed
```

If inactivity-doubled fixed variants or baseline variants are still included, total will be larger, but the adaptive side will become much more informative.

---

## Implementation Notes

### Adaptive anchor object

Update the adaptive sweep timing anchors to:

```ts
const ADAPTIVE_SWEEP_TIMING_ANCHORS = {
  lowIntensity: {
    scanIntervalSeconds: 60,
    scanWindowSeconds: 0.75,
    advIntervalSeconds: 5
  },

  neutral: {
    scanIntervalSeconds: 20,
    scanWindowSeconds: 1.5,
    advIntervalSeconds: 5
  },

  highIntensity: {
    scanIntervalSeconds: 5,
    scanWindowSeconds: 3,
    advIntervalSeconds: 1.5
  },

  advertisingBurstDurationSeconds: 2
};
```

### Adaptive quick grid

Update quick adaptive constants to:

```ts
const SWEEP_QUICK_BASELINE_DRIVES = [0.15, 0.25, 0.35];
const SWEEP_QUICK_MOTION_WEIGHTS = [0.25, 0.45];
const SWEEP_QUICK_PEER_WEIGHTS = [0.35, 0.55, 0.85];
const SWEEP_QUICK_TAU_PEER_SECONDS = [300, 900];
```

### Held constants

Update held adaptive constants to:

```ts
const SWEEP_HELD_ADAPTIVE = {
  tauMotionSeconds: 180,
  motionGain: 0.35,
  peerGain: 0.45,
  peerMissPenalty: 0.2,
  allowEnergySavingDownscale: true,
  peerDetectionCountSaturation: 1,
  motionEventCountSaturation: 1
};
```

---

## Acceptance Criteria

### 1. Low-intensity adaptive keeps frequent advertising

At low intensity, adaptive timing should be:

```text
scan interval = 60 s
scan window = 0.75 s
advertise interval = 5 s
advertising burst = 2 s
```

### 2. Neutral remains the general discovery baseline

At neutral intensity:

```text
scan interval = 20 s
scan window = 1.5 s
advertise interval = 5 s
advertising burst = 2 s
```

### 3. Adaptive grid includes promising candidate

The sweep should include a policy close to:

```text
baselineDrive = 0.25
motionWeight = 0.45
peerWeight = 0.55
tauPeerSeconds = 900
tauMotionSeconds = 180
motionGain = 0.35
peerGain = 0.45
peerMissPenalty = 0.2
```

### 4. Report labels communicate the hypothesis

The sweep report or assumptions panel should state:

```text
This sweep tests whether efficient adaptive BLE policies can preserve frequent advertising while downscaling scan effort.
```

### 5. Fixed grid remains available for comparison

Fixed sweep policies should remain in the report so we can determine whether adaptive control actually improves over simple fixed schedules.

---

## Final Direction

Do not treat adaptive low intensity as:

```text
scan less and advertise less
```

Instead, test adaptive low intensity as:

```text
scan less but keep advertising frequent
```

This better matches the empirical signal from the current simulation data and gives the adaptive policy a fair chance to outperform fixed schedules.
