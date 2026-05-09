# Review: JUXTA `main.c` BLE Routine vs Simulator BLE Implementation

**Audience:** developer agent maintaining the Adaptive Social Proximity Logger Simulator  
**Goal:** align the simulator with the real nRF52840 BLE collar routine, avoid artifacts from 60 s simulation epochs, and add realistic energy defaults for nRF52840 operation at max TX power.

---

## Executive summary

The simulator is directionally close to the firmware: both use a serial radio model where a collar is either scanning or advertising, not both. The simulator also already models fine BLE activity inside a 60 s epoch rather than treating the full epoch as one coarse radio sample.

However, there are several important corrections:

1. **The simulator fixed-rate defaults do not match the firmware.**  
   The firmware profile you described is:
   - `operatingMode = 0`
   - advertising interval = **5 s**
   - scanning interval = **20 s**
   - advertising burst = **2.0 s**
   - scan burst = **1.5 s**
   - inactivity doubler = **false** for your typical operating mode

2. **The 60 s epoch is acceptable only if BLE burst scheduling, animal position, motion state, and energy are all evaluated on a sub-epoch timeline.**  
   The current simulator does sub-epoch BLE burst generation, but if animal positions/contact state are only sampled at the epoch endpoint, then 60 s epochs can badly distort fast encounters.

3. **The simulator’s one-detection-per-dyad-per-epoch cap matches the stored minute-level FRAM record better than raw radio behavior.**  
   Your firmware accumulates scan detections into a minute-level unique-peer scan table and stores one RSSI per peer, updating to stronger RSSI. That makes a 60 s collapsed record defensible, but only as a *minute record*, not as a raw BLE event model.

4. **Energy estimation likely overestimates advertising and may overestimate scanning if peak radio currents are multiplied by full burst duration.**  
   For nRF52840 +8 dBm, the TX peak current is high, but the radio is not transmitting for the full 2 s advertising burst. Scanning also uses a 12.5 ms window every 50 ms, so RX is only ~25% of the scan burst unless the energy model intentionally treats `scanCurrentMa` as a burst-averaged current.

---

## Firmware facts to mirror

### Main timing constants

From `main.c`:

```c
#define ADV_BURST_DURATION_MS 2000
#define SCAN_BURST_DURATION_MS 1500
#define ADV_INTERVAL_SECONDS 5
#define SCAN_INTERVAL_SECONDS 20
```

Recommended simulator preset:

```ts
export const juxtaMainCMode0FixedPolicy = {
  id: "juxta-mainc-mode0",
  label: "JUXTA firmware mode 0, fixed 5s adv / 20s scan",

  advIntervalSeconds: 5,
  advBurstDurationSeconds: 2.0,

  scanIntervalSeconds: 20,
  scanWindowSeconds: 1.5,

  inactivityDoublerEnabled: false,
};
```

### Advertising burst details

The firmware starts non-connectable advertising for the burst, with the advertising controller interval set to 100-200 ms:

```c
struct bt_le_adv_param adv_param = {
    .options = 0,
    .interval_min = 160, /* 100ms */
    .interval_max = 320, /* 200ms */
};
```

The simulator currently uses synthetic advertising packets every 0.15 s inside the advertising burst. That is a reasonable approximation of a randomized 100-200 ms controller interval, but it should be explicitly named as an approximation.

Recommended simulator fields:

```ts
advControllerIntervalMinSeconds: 0.100,
advControllerIntervalMaxSeconds: 0.200,
syntheticAdvPacketIntervalSeconds: 0.150,
advBurstDurationSeconds: 2.0,
advConnectable: false,
```

### Scan burst details

The firmware uses passive scanning with duplicate filtering and explicit scan interval/window:

```c
struct bt_le_scan_param scan_param = {
    .type = BT_LE_SCAN_TYPE_PASSIVE,
    .options = BT_LE_SCAN_OPT_FILTER_DUPLICATE,
    .interval = 0x0080, // 50 ms
    .window = 0x0020,   // 12.5 ms
};
```

This maps cleanly to the simulator constants already described:

```ts
scanListenIntervalSeconds: 0.050,
scanListenWindowSeconds: 0.0125,
scanBurstDurationSeconds: 1.5,
scanType: "passive",
scanDuplicateFilter: true,
```

### Serial scan/advertise priority

In the firmware state machine, scan is checked before advertising when both are due:

```c
if (scan_due && ble_state == BLE_STATE_IDLE) {
    // start scan
    return;
}

if (adv_due && ble_state == BLE_STATE_IDLE) {
    // start advertising
    return;
}
```

The simulator currently chooses whichever is due first (`scanDueAt` vs `advDueAt`). That is mostly correct, but tie behavior should be **scan-first** to match firmware.

Recommended change:

```ts
if (scanDueAt <= advDueAt) {
  startScan();
} else {
  startAdvertise();
}
```

### Timing jitter and safety windows

The firmware adds:
- `BLE_MIN_INTER_BURST_DELAY_MS = 100`
- random offset of `0-1000 ms`
- a 3 s minute write safe zone around minute boundaries
- a 200 ms delay before starting scanning after stopping advertising

The simulator overview already includes a 0.1 s inter-burst delay and a simplified minute safe-zone avoider. To better match firmware, add explicit fields:

```ts
interBurstDelaySeconds: 0.100,
randomPostIdleJitterSeconds: { min: 0, max: 1.0 },
minuteWriteSafeZoneSeconds: 3,
scanPreStartRadioStabilizationSeconds: 0.200,
```

The 200 ms scan pre-start delay matters because it consumes part of the schedule and may reduce detection opportunity near scan boundaries.

---

## Specific concern: 60 s epochs

### What is safe

A 60 s simulation step is acceptable **if**:

1. BLE bursts are generated inside the epoch.
2. Scan windows and advertising packet times are represented inside the epoch.
3. Energy is integrated over sub-epoch events.
4. Logs explicitly distinguish:
   - raw BLE packet/detection events
   - scan-window summaries
   - minute-level collapsed FRAM-like records

The current implementation meets part of this: the simulator constructs BLE activity on a sub-epoch timeline from `epochStart` to `epochEnd`, and the 60 s epoch is not itself the radio resolution.

### What is risky

The largest risk is not the BLE schedule itself. It is this pipeline behavior:

```text
move animals once per epoch
compute true contacts at frame time
simulate all BLE detections in the epoch using that frame-time geometry
```

If that is how the code currently behaves, then an animal can move through the detection radius during the minute without the radio model seeing the true within-minute geometry.

This matters for rodents because a 60 s epoch is long relative to:
- short movement bouts
- brief tunnel crossings
- transient nest-entry proximity
- brief social investigation events

### Recommended fix

Keep 60 s as the default *render/logging epoch*, but evaluate animal position and radio contacts at smaller internal time resolution.

Minimum acceptable implementation:

```ts
timeStepSeconds = 60;          // UI/logging/render epoch
physicsStepSeconds = 1;        // animal position and behavior update
radioEventResolution = "event"; // scan/ad packet events query interpolated position
```

For each BLE sub-event:

```ts
const positionA = getAnimalPositionAtTime(animalA, eventTime);
const positionB = getAnimalPositionAtTime(animalB, eventTime);
const distance = distanceMeters(positionA, positionB);
```

If full interpolation is too much work, use a smaller global step for simulation fidelity:

```ts
recommendedTimeStepSecondsForValidation: 1,
recommendedTimeStepSecondsForFastVisualization: 5,
recommendedTimeStepSecondsForLongRuns: 60 only after validation,
```

### Required validation test

Run the same deterministic stationary scenario at:

```text
timeStepSeconds = 60
timeStepSeconds = 10
timeStepSeconds = 1
```

For stationary animals, the following should be nearly invariant:

```text
scan burst count
advertising burst count
scan listen window count
advertising packet count
detection probability
energy estimate
```

Suggested tolerance:

```ts
stationaryEpochInvarianceTolerance = 0.02; // 2%
```

If results differ by more than ~2% in stationary scenarios, the 60 s epoch is affecting radio scheduling and should be treated as a bug.

For moving animals, intentionally expect differences unless position interpolation is implemented.

---

## Minute-level record vs raw BLE events

Your firmware does **not** simply emit every raw detection as an independent record. It accumulates detections in a scan table and writes once per minute.

Important firmware behavior:

```text
scan callback -> msg queue
process_scan_events() -> unique peer table
if peer already exists -> keep stronger RSSI
minute boundary -> write device_count + mac_ids + rssi_values
clear scan table
```

Therefore the simulator should support three log layers:

### 1. Raw radio events

Every synthetic advertisement, scan window, and successful hit.

```ts
RawBleDetection = {
  timeSeconds,
  observerId,
  peerId,
  rssi,
  scanWindowStart,
  advPacketTime,
  distanceMeters,
};
```

### 2. Scan-burst summary

One scan burst can detect zero or more unique peers.

```ts
ScanBurstRecord = {
  animalId,
  scanStartSeconds,
  scanEndSeconds,
  detectedPeers: [
    { peerId, strongestRssi, firstSeenSeconds, hitCount }
  ],
};
```

### 3. Firmware-like minute record

This should mimic what the collar actually stores.

```ts
FirmwareMinuteRecord = {
  animalId,
  minuteOfDay,
  motionCount,
  batteryLevel,
  temperature,
  detectedPeers: [
    { peerId, strongestRssi }
  ],
};
```

If the UI says “detected peers per minute,” it should use the firmware-like minute record. If the UI says “radio capture rate,” it should use raw radio events or scan-burst summaries.

---

## Recommended simulator preset for this firmware

```ts
export const juxtaFirmwareBleProfile = {
  id: "juxta-mainc-mode0-fixed",
  label: "JUXTA nRF52840 main.c mode 0",

  radioArchitecture: "single-radio-serial",
  txPowerDbm: 8, // user says max TX power; confirm in project config

  advertising: {
    enabled: true,
    connectable: false,
    intervalSeconds: 5,
    burstDurationSeconds: 2.0,
    controllerIntervalMinSeconds: 0.100,
    controllerIntervalMaxSeconds: 0.200,
    syntheticPacketIntervalSeconds: 0.150,
    channelsModeled: "abstracted",
  },

  scanning: {
    enabled: true,
    type: "passive",
    duplicateFilter: true,
    intervalSeconds: 20,
    burstDurationSeconds: 1.5,
    listenIntervalSeconds: 0.050,
    listenWindowSeconds: 0.0125,
    listenDutyCycle: 0.25,
  },

  scheduling: {
    tieBreaker: "scan-first",
    interBurstDelaySeconds: 0.100,
    randomIdleJitterSeconds: { min: 0, max: 1.0 },
    minuteWriteSafeZoneSeconds: 3,
    scanPreStartRadioStabilizationSeconds: 0.200,
  },

  inactivityDoubler: {
    enabledByDefault: false,
    multiplier: 2,
  },

  logging: {
    firmwareMinuteAggregation: true,
    perMinuteUniquePeers: true,
    perMinuteRssiAggregation: "max-rssi",
    rawRadioEventLog: true,
    scanBurstLog: true,
  },
};
```

---

## TX power note

The uploaded `main.c` does not show an explicit TX power call or Kconfig setting. If max TX power is configured elsewhere, the simulator should default the profile to +8 dBm, but the developer agent should add a visible field:

```ts
txPowerDbm: 8,
txPowerSource: "assumed from hardware/project config; not set explicitly in uploaded main.c",
```

If the project later exposes actual TX power in firmware or metadata, the simulator should log it per run.

---

## Energy estimator feedback

### Do not multiply peak TX current by full advertising burst duration

This is the most important energy-model warning.

In firmware, the collar advertises for a 2 s burst, but the radio is only transmitting during individual advertising events. If the simulator does:

```ts
energy += txPeakCurrentMa * advertisingBurstDurationSeconds
```

then advertising energy will be severely overestimated.

Use either event-level energy:

```ts
advEnergy_mAs =
  txPeakCurrentMa *
  advEventCount *
  channelsPerAdvEvent *
  txPacketDurationSeconds;
```

or define the current as a burst-averaged value:

```ts
advEnergy_mAs =
  advertisingBurstAverageCurrentMa *
  advertisingBurstDurationSeconds;
```

But do not mix these two meanings.

### Scanning energy should use listen windows or burst-averaged scan current

The scan burst is 1.5 s, but the scan window is only 12.5 ms every 50 ms.

So RX-on time per scan burst is approximately:

```text
1.5 s * 0.25 = 0.375 s
```

If the simulator uses:

```ts
energy += rxCurrentMa * scanBurstDurationSeconds
```

then scan energy is about 4x too high.

Preferred:

```ts
scanEnergy_mAs =
  rxCurrentMa *
  scanListenWindowSeconds *
  scanListenWindowCount;
```

Simpler acceptable approximation:

```ts
scanBurstAverageCurrentMa =
  rxCurrentMa * scanListenDutyCycle + cpuOverheadDuringScanMa;
```

---

## Recommended nRF52840 +8 dBm energy defaults

Use these as conservative defaults for a 3 V, DC/DC-regulated nRF52840. Values should remain user-editable.

```ts
export const nrf52840Plus8DbmEnergyDefaults = {
  label: "nRF52840, BLE 1M, +8 dBm, DC/DC @ 3 V",

  txPowerDbm: 8,

  // Nordic product-spec nominal radio currents
  txPeakCurrentMaAtPlus8Dbm: 16.4,
  txPeakCurrentMaAt0Dbm: 6.4,
  rxCurrentMa1MPhy: 6.26,

  // Conservative assembled-collar defaults, not bare-silicon guarantees
  baselineSystemCurrentMa: 0.050,
  cpuActiveOverheadDuringBleMa: 1.0,

  // Firmware scan parameters
  scanListenDutyCycle: 0.25,
  scanListenIntervalSeconds: 0.050,
  scanListenWindowSeconds: 0.0125,

  // Advertising approximation
  advChannelsPerEvent: 3,
  advSyntheticEventIntervalSeconds: 0.150,

  // Use a range until measured on a PPK2/scope
  txPacketDurationSecondsPerChannel: {
    low: 0.0008,
    nominal: 0.0015,
    high: 0.0030,
  },

  // Optional overheads for future refinement
  hfxoStartupEnergyMicroCoulombs: null,
  framWriteCurrentMa: null,
  framWriteDurationMsPerMinute: null,
  lis2dhCurrentMa: null,
};
```

### Suggested default energy calculation

```ts
function computeBleEnergyForEpoch(events, params) {
  const idle_mAs =
    params.baselineSystemCurrentMa * events.epochDurationSeconds;

  const scan_mAs =
    params.rxCurrentMa1MPhy *
    sum(events.scanListenWindows.map(w => w.durationSeconds));

  const adv_mAs =
    params.txPeakCurrentMaAtPlus8Dbm *
    events.advPacketCount *
    params.advChannelsPerEvent *
    params.txPacketDurationSecondsPerChannel.nominal;

  const cpu_mAs =
    params.cpuActiveOverheadDuringBleMa *
    sum(events.bleActiveIntervals.map(x => x.durationSeconds));

  return idle_mAs + scan_mAs + adv_mAs + cpu_mAs;
}
```

### Rough intuition for your default profile

With your fixed firmware settings:

```text
scan: 1.5 s burst every 20 s, 25% RX listen duty
advertise: 2.0 s burst every 5 s, ~150 ms adv event spacing
```

Approximate scan RX contribution:

```text
6.26 mA * 0.375 s / 20 s ≈ 0.117 mA average
```

Advertising depends heavily on assumed per-channel packet duration. Using a nominal 1.5 ms per channel:

```text
2 s burst / 0.15 s ≈ 13 adv events per burst
13 events * 3 channels * 1.5 ms ≈ 58.5 ms TX-on per burst
16.4 mA * 58.5 ms / 5 s ≈ 0.192 mA average
```

This means the BLE radio alone may be on the order of a few hundred µA average before CPU, sensor, FRAM, sleep leakage, and battery-measurement overhead. That is very different from multiplying 16.4 mA by the full 2 s advertising burst.

---

## Recommended tests for developer agent

### Test 1: Firmware timing preset

Given:

```ts
advIntervalSeconds = 5;
advBurstDurationSeconds = 2;
scanIntervalSeconds = 20;
scanWindowSeconds = 1.5;
timeStepSeconds = 60;
inactivityDoubler = false;
```

Assert the simulator schedules approximately:

```text
~12 advertising opportunities per minute before conflicts/safe-zone deferrals
~3 scan opportunities per minute before conflicts/safe-zone deferrals
```

Because scan has priority, events due at the same timestamp should start with scan.

### Test 2: Epoch invariance

For stationary animals at fixed distance inside detection radius, compare:

```text
timeStepSeconds = 60
timeStepSeconds = 10
timeStepSeconds = 1
```

Metrics should match within ~2%:

```text
scan window count
adv packet count
detected dyad probability
energy estimate
```

### Test 3: Contact crossing

Simulate two animals that are within radius for only 10 s inside a 60 s epoch.

Expected result:

- If event-level/interpolated positions exist, BLE detections can occur only during that 10 s true-contact interval.
- If only epoch-end positions are used, the test should fail and flag that 60 s epochs are too coarse for moving-animal proximity.

### Test 4: Minute record equivalence

Run the raw BLE event log through a firmware-like minute reducer:

```text
unique peers per minute
max RSSI per peer
motion count
battery
temperature
```

The UI should be able to switch between:
- raw radio events
- scan burst summaries
- firmware-like minute records

### Test 5: Energy sanity

For the default firmware profile, verify:

- TX peak current is not multiplied by the entire 2 s advertising burst.
- RX current is not multiplied by the entire 1.5 s scan burst unless using a burst-averaged current.
- Energy changes appropriately when TX power changes from 0 dBm to +8 dBm.
- Energy changes appropriately when scan window changes from 12.5 ms to 50 ms.

---

## Priority recommendations

### High priority

1. Add a `juxta-mainc-mode0` BLE profile matching the real firmware.
2. Add scan-first tie behavior when scan and adv are due together.
3. Ensure energy uses scan listen windows and advertising packet duration, not full burst duration with peak current.
4. Add epoch-invariance tests for 60 s vs 10 s vs 1 s.
5. Add firmware-like minute aggregation as a distinct output layer.

### Medium priority

1. Add 200 ms scan pre-start stabilization delay.
2. Add exact 0-1000 ms firmware-like random idle jitter.
3. Add minute safe-zone tests because 60 s epochs align exactly with minute boundaries.
4. Track duplicate filtering as a mode in scan burst summaries.
5. Expose TX power as a user-visible energy/radio parameter.

### Low priority

1. Add explicit three-channel advertising/scanning model.
2. Add connection/gateway advertising mode.
3. Add CRC, collision, and packet-error models beyond RSSI logistic probability.
4. Add board-level current calibration from PPK2 measurements.

---

## References and source notes

- Uploaded firmware: `main.c`
- Uploaded simulator overview: `ble_scan_advertise_implementation_overview.md`
- Nordic nRF52840 product-spec/current-consumption reference values: use latest Nordic product specification or Online Power Profiler calibration where available. Conservative nominal values used here: **TX +8 dBm = 16.4 mA**, **TX 0 dBm = 6.4 mA**, **RX 1 Mbps = 6.26 mA**, **System ON with RTC/full RAM lower-bound ≈ 3.16 µA**.
- Treat the energy defaults as **starting priors**. Final values should be calibrated from measured current waveforms on the assembled collar, ideally separating sleep, scan, advertising, minute write, and gateway/connectable modes.
