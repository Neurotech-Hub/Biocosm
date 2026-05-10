import type { ActivityPattern, AdvancedSpeciesOverrides, SpeciesModifierConfig } from "./speciesTypes";

export type AnimalState = "sleeping" | "awake_stationary" | "moving" | "social_pause";

export type PathNodeType = "junction" | "nest" | "feeder" | "shelter" | "resource";

export type PathNode = {
  id: string;
  x: number;
  y: number;
  type: PathNodeType;
};

export type PathEdge = {
  id: string;
  from: string;
  to: string;
  length: number;
};

export type PathGraph = {
  nodes: PathNode[];
  edges: PathEdge[];
};

export type AnimalTraits = {
  id: string;
  speciesPresetId: string;
  activityPattern: ActivityPattern;
  activePeakHours: number[];
  activeWindowHours: number;
  dailyMotionMinutes: number;
  majorRestWindowHours: number;
  circadianPhaseOffsetHours: number;
  groupSynchrony: number;
  lightPhaseStartHour?: number;
  lightPhaseEndHour?: number;
  movementSpeedMetersPerMinute: number;
  dailyActivityMinutes: number;
  majorSleepPeriodHours: number;
  sleepBoutMeanMinutes: number;
  movementBoutMeanMinutes: number;
  restBoutMeanMinutes: number;
  stationaryAwakeBoutMeanMinutes: number;
  socialPropensity: number;
  territoriality: number;
  seasonalSensitivity: number;
  sleepArchitecture?: "monophasic" | "polyphasic" | "ultradian";
  sleepCenterHour?: number;
  ultradianPeriodMinutes?: number;
  ultradianAmplitude?: number;
};

export type AnimalPosition = {
  mode: "node" | "edge";
  nodeId?: string;
  edgeId?: string;
  fromNodeId: string;
  toNodeId: string;
  progress: number;
  x: number;
  y: number;
};

export type BehaviorSegment = {
  startTimeSeconds: number;
  endTimeSeconds: number;
  state: AnimalState;
};

export type CollarState = {
  animalId: string;
  valid: boolean;
  invalidReason?: "battery_depleted" | "lost" | "manual_censor";
  batteryMahRemaining: number;
  scanActive: boolean;
  advActive: boolean;
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
  /** Duration of each advertising burst (seconds). */
  advertisingBurstDurationSeconds: number;
  scanPhaseOffsetSeconds: number;
  advPhaseOffsetSeconds: number;
  motionDrive: number;
  peerDrive: number;
  samplingDrive: number;
  lastScanTime: number;
  lastAdvTime: number;
  lastPeerDetectionTime?: number;
};

export type Animal = {
  id: string;
  traits: AnimalTraits;
  state: AnimalState;
  position: AnimalPosition;
  collar: CollarState;
  boutRemainingSeconds: number;
  recentNodeIds: string[];
  behaviorSchedule: BehaviorSegment[];
};

export type EnclosureConfig = {
  mode: "rectangle";
  width: number;
  height: number;
  boundaryBehavior: "reflect" | "constrain" | "wrap";
};

export type BehaviorConfig = {
  circadianMode: "nocturnal" | "diurnal";
  socialPauseProbability: number;
  socialBoutMeanMinutes: number;
};

export type TraitDistribution = {
  min: number;
  mode: number;
  max: number;
};

export type BiologyConfig = {
  circadianPhaseOffsetHours: TraitDistribution;
  dailyActivityMinutes: TraitDistribution;
  majorSleepPeriodHours: TraitDistribution;
  sleepBoutMeanMinutes: TraitDistribution;
  movementBoutMeanMinutes: TraitDistribution;
  socialPropensity: TraitDistribution;
};

export type MotionSensorConfig = {
  thresholdMetersPerStep: number;
  noiseSdMeters: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
};

export type RadioConfig = {
  detectionRadiusMeters: number;
  /** Sampling interval for epoch-integrated BLE opportunity checks (seconds). */
  opportunitySampleStepSeconds: number;
  socialRadiusMeters: number;
  rssiAtOneMeter: number;
  pathLossExponent: number;
  rssiNoiseSd: number;
  rssiThreshold: number;
  rssiSlope: number;
};

/** Matches firmware inter-burst behavior (JUXTA main.c). */
export type BleSchedulingConfig = {
  interBurstDelaySeconds: number;
  randomPostIdleJitterMinSeconds: number;
  randomPostIdleJitterMaxSeconds: number;
  /** Half-width of minute-boundary deferrals (seconds from minute start/end to avoid). */
  minuteWriteSafeZoneSeconds: number;
  /** Delay after an advertise burst before a scan may start (radio settle time). */
  scanPreStartRadioStabilizationSeconds: number;
};

export type EnergyModel = "component" | "empiricalAverage";

export type EnergyConfig = {
  batteryCapacityMah: number;
  startingVoltage: number;
  /** Non-BLE platform draw: sleep MCU, RTC, sensors idle, logging (µA). */
  baselineCurrentMicroAmps: number;
  /** Assumed TX power for labeling / RSSI priors; path loss is separate. */
  txPowerDbm: number;
  /** Nordic-style RX @ 1M PHY — scan energy uses listen-window seconds × this (mA). */
  rxCurrentMa1MPhy: number;
  /** Spacing of synthetic advertising events; must match detection + energy accounting. */
  advertisingEventIntervalSeconds: number;
  /** Calibrated charge per advertising event (µC); converted to mAh via µC / 3_600_000. */
  advEventChargeMicroCoulombs: number;
  energyModel: EnergyModel;
  /**
   * Bench / datasheet total average current for Juxta social mode (5 s adv / 20 s scan), µA.
   * Used for empiricalAverage model and >3× warnings vs component estimates.
   */
  measuredSocial5s20sTotalMicroAmps: number;
  /**
   * Multiplies scan + advertising component mAh only (baseline unchanged). Optional preset tuning so event schedules
   * match datasheet long-run averages when burst-level counts undercount duty.
   */
  componentBleActivityScale?: number;
};

export type FixedPolicyConfig = {
  id: string;
  type: "fixed";
  name: string;
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
  /** On-air advertising burst length (firmware ADV_BURST_DURATION_MS / 1000). Default 2 s if omitted. */
  advertisingBurstDurationSeconds?: number;
};

export type AdaptiveBleTiming = {
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
};

export type AdaptiveBleTimingAnchors = {
  lowIntensity: AdaptiveBleTiming;
  neutral: AdaptiveBleTiming;
  highIntensity: AdaptiveBleTiming;
  advertisingBurstDurationSeconds: number;
};

export type MotionPeerAdaptivePolicyConfig = {
  id: string;
  type: "motion_peer_adaptive";
  name: string;
  timingAnchors: AdaptiveBleTimingAnchors;
  baselineDrive: number;
  tauMotionSeconds: number;
  tauPeerSeconds: number;
  motionGain: number;
  peerGain: number;
  peerMissPenalty: number;
  motionWeight: number;
  peerWeight: number;
  peerDetectionCountSaturation: number;
  motionEventCountSaturation: number;
  allowEnergySavingDownscale: boolean;
};

export type FirmwarePolicyConfig = FixedPolicyConfig | MotionPeerAdaptivePolicyConfig;

export type SimulationConfig = {
  seed: string;
  speciesPresetId: string;
  speciesModifiers: SpeciesModifierConfig;
  advancedSpeciesOverrides?: AdvancedSpeciesOverrides;
  startTimeSeconds: number;
  simulationLengthSeconds: number;
  timeStepSeconds: number;
  radioStepSeconds: number;
  animalCount: number;
  pathNodeCount: number;
  enclosure: EnclosureConfig;
  behavior: BehaviorConfig;
  biology: BiologyConfig;
  motionSensor: MotionSensorConfig;
  radio: RadioConfig;
  energy: EnergyConfig;
  bleScheduling: BleSchedulingConfig;
  activePolicy: FirmwarePolicyConfig;
};

export type AnimalObservation = {
  time: number;
  animalId: string;
  motionDetected: boolean;
  motionMagnitude: number;
  collarValid: boolean;
};

export type TrueContact = {
  time: number;
  animalA: string;
  animalB: string;
  distance: number;
  withinDetectionRadius: boolean;
  withinSocialRadius: boolean;
};

export type DetectionEvent = {
  time: number;
  observerId: string;
  peerId: string;
  trueDistance: number;
  rssi: number;
  scanPolicyId: string;
};

export type BleBurstEvent = {
  kind: "scan" | "advertise";
  startTime: number;
  endTime: number;
  animalId: string;
  policyId: string;
};

export type ScanWindowLog = {
  startTime: number;
  endTime: number;
  observerId: string;
  scanPolicyId: string;
  detectedPeerIds: string[];
  detectedAnyPeer: boolean;
};

export type ScanWindowEvent = {
  startTime: number;
  endTime: number;
  observerId: string;
  scanPolicyId: string;
};

export type AdvertisingEvent = {
  time: number;
  animalId: string;
};

export type EnergyLog = {
  time: number;
  steadyMah: number;
  scanMah: number;
  advertisingMah: number;
  totalMah: number;
  cumulativeMah: number;
  remainingMah: number;
  remainingPercent: number;
  estimatedVoltage: number;
};

export type AnimalStateLog = {
  time: number;
  animalId: string;
  x: number;
  y: number;
  nodeId?: string;
  edgeId?: string;
  behavioralState: AnimalState;
  trueSpeed: number;
  motionDetected: boolean;
  sleeping: boolean;
};

export type TrueDyadLog = TrueContact & {
  epochStartTime: number;
  epochEndTime: number;
  bothCollarsValid: boolean;
  withinDetectionRadiusAtEnd: boolean;
  withinDetectionRadiusAny: boolean;
  inRangeSeconds: number;
  minDistanceMeters: number;
  endDistanceMeters: number;
};

export type CollarStateLog = {
  time: number;
  animalId: string;
  collarValid: boolean;
  invalidReason?: string;
  batteryMahRemaining: number;
  scanActive: boolean;
  advActive: boolean;
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
  motionDrive: number;
  peerDrive: number;
  samplingDrive: number;
};

export type AdaptiveBlePolicyLog = {
  time: number;
  epochStartTime: number;
  epochEndTime: number;
  animalId: string;
  motionDetected: boolean;
  motionEventCount?: number;
  localPeerDetectionCount: number;
  observerScannedWithoutPeer: boolean;
  baselineContribution: number;
  motionContribution: number;
  peerContribution: number;
  motionDrive: number;
  peerDrive: number;
  samplingDrive: number;
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
  advertisingBurstDurationSeconds: number;
  combinedEnvelopeDuty: number;
  saturatedScheduleWarning: boolean;
  energyEstimate_uAh?: number;
};

export type SimulationLogs = {
  animalStates: AnimalStateLog[];
  trueDyads: TrueDyadLog[];
  detections: DetectionEvent[];
  bleBursts: BleBurstEvent[];
  scanWindows: ScanWindowLog[];
  adaptiveBlePolicy: AdaptiveBlePolicyLog[];
  collarStates: CollarStateLog[];
  energy: EnergyLog[];
};

export type SimulationState = {
  time: number;
  config: SimulationConfig;
  pathGraph: PathGraph;
  animals: Animal[];
  trueContacts: TrueContact[];
  detections: DetectionEvent[];
  bleBursts: BleBurstEvent[];
  scanWindows: ScanWindowLog[];
  advertisingEvents: AdvertisingEvent[];
  energy: EnergyLog;
  logs: SimulationLogs;
  rngState: number;
};

/** Collapsed like firmware: unique peers per observer per absolute-time minute, max RSSI kept. */
export type FirmwareMinuteRecord = {
  minuteBucketStartSeconds: number;
  observerId: string;
  detectedPeers: { peerId: string; strongestRssi: number }[];
};

export type SimulationMetrics = {
  trueContactSteps: number;
  observedDetections: number;
  scanWindows: number;
  negativeScanWindows: number;
  uniqueObservedDyads: number;
  rawDetectionDensity: number;
  bleCaptureRate: number;
  bleCaptureHits: number;
  bleCaptureOpportunities: number;
  firmwareMinuteRecords: FirmwareMinuteRecord[];
  firmwareMinuteObserverSlots: number;
  scanningAnimals: number;
  advertisingAnimals: number;
  meanSamplingDrive: number;
  meanScanIntervalSeconds: number;
  energyUsedMah: number;
  /** Time-averaged current draw (µA) from cumulative mAh — one representative collar. */
  meanEnergyCurrentMicroAmpsPerCollar: number;
  batteryRemainingPercent: number;
  estimatedVoltage: number;
  capturePerMah: number;
  /** Shown when component model with Juxta 5s/20s policy predicts ≫ datasheet reference. */
  energyModelWarning?: string;
};
