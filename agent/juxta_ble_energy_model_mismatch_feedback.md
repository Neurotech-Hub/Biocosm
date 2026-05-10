# Juxta BLE Energy Model Mismatch Review

## Purpose

The simulator currently estimates approximately **103 mAh over 24 hours** for the Juxta BLE social-mode settings:

- Advertising interval: **5 s**
- Scan interval: **20 s**
- Advertising burst duration: **2 s**
- Scan burst duration: **1.5 s**
- Inactivity interval doubling: typically **false** for the user's current comparison
- Hardware: **nRF52840**, maximum TX power

This is far above the Juxta v5/6 datasheet and empirical expectations. The simulator energy model should be revised before using it to compare fixed-rate and adaptive BLE policies.

---

## Executive summary

The simulator is likely charging the device as if a BLE advertising burst is **continuous TX current for the full 2 s advertising envelope** and/or as if a scan burst is **continuous RX current for the full 1.5 s scan envelope**.

That is not how the real firmware/hardware behaves.

In the real device:

- A 2 s advertising burst is an **advertising opportunity envelope**, not 2 s of continuous RF transmit.
- BLE advertising consists of short advertising events separated by the configured advertising event interval.
- A 1.5 s scan burst is also not necessarily continuous RX. The firmware uses short listen windows within the burst.
- The real scan duty inside the scan burst is approximately `12.5 ms / 50 ms = 25%`.

The simulator should use burst envelopes for **detection opportunity**, but should use RF event/window durations for **energy accounting**.

---

## Datasheet sanity check

The Juxta datasheet lists the following measured/estimated average currents:

| Device state | Average current | Estimated lifetime |
|---|---:|---:|
| Shelf mode | 19.49 µA | >40 days |
| BLE connectable advertising | 927.26 µA | 1.35 days |
| BLE connected | 294.19 µA | 4.25 days |
| Social Mode, Adv=5 s, Scan=20 s | 233.09 µA | 6.34 days |
| Social Mode, Adv=10 s, Scan=40 s | 155.57 µA | 10.4 days |
| Electric Mode, Fs=10 kHz every 5 s | 2667.82 µA | 11.25 h |
| Electric Mode, Fs=100 kHz every 5 s | 6336.42 µA | 4.73 h |

The current simulator estimate:

```text
103 mAh / 24 h = 4.29 mA average
```

Datasheet social mode at Adv=5 s, Scan=20 s:

```text
233.09 µA = 0.23309 mA
0.23309 mA × 24 h = 5.59 mAh/day
```

Therefore:

```text
103 mAh/day / 5.59 mAh/day ≈ 18.4× too high
```

Even if the datasheet row was collected with inactivity interval doubling enabled, it still shows that **103 mAh/day is not in the plausible range** for this hardware and BLE routine.

---

## Why the simulator is probably overestimating

### 1. Advertising burst envelope is being treated like continuous TX

Firmware-level constant:

```c
#define ADV_BURST_DURATION_MS 2000
#define ADV_INTERVAL_SECONDS 5
```

The simulator also uses a fixed 2 s advertising burst duration. That is fine for detection opportunity, but not for energy.

Incorrect energy interpretation:

```text
advertising energy = 2 s × TX current
```

At Adv=5 s, this implies:

```text
2 s / 5 s = 40% TX duty
```

At nRF52840 maximum TX power, that would imply multiple mA average current from advertising alone, which is inconsistent with the measured device current.

Correct interpretation:

```text
2 s advertising burst = envelope during which BLE advertising events occur
```

Advertising events are short. The simulator should estimate:

```text
adv_events_per_burst = adv_burst_duration / advertising_event_interval
adv_energy = adv_events_per_burst × charge_per_advertising_event
```

Not:

```text
adv_energy = adv_burst_duration × TX_current
```

---

### 2. Scan burst envelope is being treated like continuous RX

Firmware scan parameters from `main.c` are consistent with:

```text
scan interval = 50 ms
scan window   = 12.5 ms
```

So within the scan burst:

```text
12.5 ms / 50 ms = 25% RX listen duty
```

The scan burst itself is:

```c
#define SCAN_BURST_DURATION_MS 1500
#define SCAN_INTERVAL_SECONDS 20
```

So wall-clock RX duty is approximately:

```text
1.5 s / 20 s × 0.25 = 0.01875 = 1.875%
```

If RX current is approximately 6.4 mA, the expected scan contribution is roughly:

```text
6.4 mA × 0.01875 = 0.120 mA = 120 µA
```

That is already a plausible major component of the measured 233 µA average.

If the simulator instead charges:

```text
1.5 s / 20 s × 6.4 mA = 480 µA
```

then scan energy alone is inflated about **4×**.

---

### 3. The 60 s simulation epoch is probably not the root problem, but it is a failure risk

A 60 s simulation epoch is acceptable if BLE is modeled on a sub-epoch event timeline.

However, the simulator must not compute energy from booleans like:

```ts
scanActive = true
advActive = true
```

as if those states lasted the entire 60 s epoch.

With Adv=5 s and Scan=20 s, essentially every 60 s epoch contains at least one advertising burst and at least one scan burst. If the energy model charges the full epoch whenever `scanActive` or `advActive` is true, the estimate will explode.

Required behavior:

```text
energy = sum(actual scan listen time, advertising event charge, baseline current)
```

Not:

```text
energy = epoch duration × active-state current
```

Regression test:

- Run the same 24 h fixed-policy simulation with `timeStepSeconds = 1`, `10`, `30`, and `60`.
- Estimated mAh/day should change by less than 1–2%.
- If the 60 s result differs strongly, the epoch aggregation is wrong.

---

## Recommended energy model

Use separate concepts for **detection opportunity** and **energy accounting**.

### Detection model can still use burst envelopes

```ts
advBurstDurationSeconds = 2.0;
scanBurstDurationSeconds = 1.5;
```

These are useful for deciding when packets and scan windows may overlap.

### Energy model should use RF-active time or calibrated event charge

#### Baseline

Use a baseline current for MCU sleep/wake overhead, RTC/timekeeping, accelerometer interrupt mode, magnet sensor, FRAM idle overhead, minute logging overhead, and firmware housekeeping.

Recommended initial value:

```ts
baselineCurrent_uA: 78
```

This value is backfit from the two datasheet social-mode rows and should be treated as a Juxta v5/6 preset, not a general nRF52840 constant.

#### Scanning

```ts
scanDutyInsideBurst = scanListenWindowSeconds / scanListenIntervalSeconds;
rxListenSeconds = sum(scanBurstDurationSeconds × scanDutyInsideBurst);
scan_mAh = rxCurrent_mA × rxListenSeconds / 3600;
```

Recommended defaults:

```ts
rxCurrent_mA: 6.4,
scanListenIntervalSeconds: 0.050,
scanListenWindowSeconds: 0.0125,
scanBurstDurationSeconds: 1.5
```

#### Advertising

Prefer a calibrated advertising-event charge instead of treating advertising burst duration as TX time.

```ts
advEvents = ceil(advBurstDurationSeconds / advertisingEventIntervalSeconds);
adv_uC = advEvents × advEventCharge_uC;
adv_mAh = adv_uC / 3_600_000;
```

Recommended defaults:

```ts
txCurrentMaxPower_mA: 13.6,
advertisingEventIntervalSeconds: 0.150,
advBurstDurationSeconds: 2.0,
advEventRadioOnTime_ms: 1.0,
advEventCharge_uC: 13.0
```

`advEventCharge_uC ≈ 13 µC` corresponds to roughly 1 ms of 13 mA-class active radio/CPU cost per advertising event. This is a practical calibration knob, not a claim about exact over-the-air duration.

---

## Suggested Juxta v5/6 energy preset

```ts
export const juxtaV56EnergyPreset = {
  label: "Juxta v5/6 nRF52840 Social Mode",

  // Empirical anchor points from datasheet
  measuredSocial5s20sCurrent_uA: 233.09,
  measuredSocial10s40sCurrent_uA: 155.57,
  measuredConnectableAdvertisingCurrent_uA: 927.26,
  measuredConnectedCurrent_uA: 294.19,
  measuredShelfModeCurrent_uA: 19.49,

  // Component/event model defaults
  baselineCurrent_uA: 78,
  rxCurrent_mA: 6.4,
  txCurrentMaxPower_mA: 13.6,

  advBurstDurationSeconds: 2.0,
  advertisingEventIntervalSeconds: 0.150,
  advEventCharge_uC: 13.0,

  scanBurstDurationSeconds: 1.5,
  scanListenIntervalSeconds: 0.050,
  scanListenWindowSeconds: 0.0125,

  // Optional overheads, initially set low and calibrate later
  bleStartStopOverhead_uC: 0,
  framMinuteWriteCharge_uC: 0,
  cpuWakeOverhead_uC: 0,

  // Hardware-proximity default from datasheet
  detectionRadiusMeters: 0.05
};
```

---

## Expected sanity-check outputs

Using the above model:

### Adv=5 s, Scan=20 s

Approximate current components:

```text
baseline ≈ 78 µA
scan     ≈ 120 µA
adv      ≈ 35 µA
total    ≈ 233 µA
```

Daily capacity:

```text
0.233 mA × 24 h ≈ 5.6 mAh/day
```

### Adv=10 s, Scan=40 s

Approximate current components:

```text
baseline ≈ 78 µA
scan     ≈ 60 µA
adv      ≈ 17.5 µA
total    ≈ 155.5 µA
```

Daily capacity:

```text
0.1555 mA × 24 h ≈ 3.73 mAh/day
```

These align with the datasheet values and should be used as regression targets.

---

## Important caveat about inactivity doubling

The datasheet notes that Social Mode uses a dynamic advertise/scan protocol where intervals are doubled when motion is absent for more than 1 minute.

The user’s current comparison often uses:

```text
inactivity interval doubling = false
```

Therefore, the datasheet rows may not exactly represent the no-doubler mode under continuous motion.

However, this caveat does **not** explain a 103 mAh/day prediction. The model is still off by roughly an order of magnitude. After fixing the event/window accounting, perform a new empirical calibration with inactivity doubling disabled.

Recommended calibration protocol:

1. Run one device for 24 h with Adv=5 s, Scan=20 s, inactivity doubler disabled.
2. Run one device for 24 h with Adv=10 s, Scan=40 s, inactivity doubler disabled.
3. Run one device in shelf mode for 24 h.
4. Use those three values to refit:
   - baseline current
   - scan contribution
   - advertising event charge

---

## Detection radius warning

The Juxta datasheet indicates BLE proximity sensitivity around **50 mm**, with approximate RSSI examples:

```text
-70 dB at <10 mm
-80 dB at 25 mm
-90 dB at 50 mm
```

If the simulator default detection radius is around 1.2 m, that may not affect fixed-policy energy directly, but it can strongly affect adaptive policies.

Specifically, an oversized detection radius can create many artificial peer detections, which can keep the adaptive policy in a high-sampling state and inflate energy.

Recommended Juxta preset:

```ts
detectionRadiusMeters: 0.05,
socialRadiusMeters: 0.05
```

Allow the user to override this for hypothetical radio/range experiments.

---

## Implementation tasks for the developer agent

### P0 — Fix advertising energy

Do not multiply advertising burst duration by TX current.

Replace:

```ts
advEnergy = advBurstSeconds * txCurrent;
```

With:

```ts
advEvents = ceil(advBurstSeconds / advertisingEventIntervalSeconds);
advEnergy = advEvents * advEventCharge_uC;
```

### P0 — Fix scan energy

Do not multiply scan burst duration by RX current unless scan duty is 100%.

Use:

```ts
rxListenSeconds = scanBurstSeconds * (scanListenWindowSeconds / scanListenIntervalSeconds);
scanEnergy = rxCurrent_mA * rxListenSeconds;
```

### P0 — Ensure 60 s epochs do not inflate energy

Energy must be based on generated burst/listen/packet events inside the epoch, not full-epoch activity flags.

Required tests:

```text
24 h simulation, fixed policy, Adv=5 s, Scan=20 s
Run at dt = 1, 10, 30, 60 s
All estimates should be nearly identical
```

### P1 — Add empirical Juxta preset

Add a hardware preset that directly exposes measured average current options:

```ts
mode: "empiricalAverageCurrent"
avgCurrent_uA = 233.09 for Adv=5 s / Scan=20 s
avgCurrent_uA = 155.57 for Adv=10 s / Scan=40 s
```

This gives users a ground-truth sanity check even while the component model is improved.

### P1 — Add estimator warning

If the simulator predicts more than 3× the measured Juxta preset for matching settings, show a warning:

```text
Energy estimate exceeds Juxta measured preset by >3×. Check whether burst envelopes are being charged as continuous radio-on time.
```

### P2 — Add calibration export/import

Allow a user to enter measured current for two or more BLE configurations and fit the energy model parameters.

Minimum calibration fields:

```ts
baselineCurrent_uA
advEventCharge_uC
scanRxCurrent_mA or scanEfficiencyFactor
```

---

## Bottom line

The simulator’s **103 mAh/day** estimate is not plausible for the Juxta v5/6 hardware under the stated settings.

The main conceptual correction is:

```text
BLE burst duration is a detection-opportunity envelope, not continuous radio-on time.
```

Use:

```text
advertising event charge
scan listen-window duty
baseline current
```

instead of:

```text
advertising burst seconds × TX current
scan burst seconds × RX current
```

After this correction, the simulator should predict approximately **5–8 mAh/day** for the user's current Adv=5 s / Scan=20 s social-mode settings, depending on whether inactivity interval doubling is enabled and how often the animal is inactive.
