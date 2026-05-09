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
  circadianPhaseOffsetHours: number;
  dailyActivityMinutes: number;
  majorSleepPeriodHours: number;
  sleepBoutMeanMinutes: number;
  movementBoutMeanMinutes: number;
  socialPropensity: number;
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
  socialRadiusMeters: number;
  rssiAtOneMeter: number;
  pathLossExponent: number;
  rssiNoiseSd: number;
  rssiThreshold: number;
  rssiSlope: number;
};

export type EnergyConfig = {
  batteryCapacityMah: number;
  startingVoltage: number;
  steadyCurrentMa: number;
  scanCurrentMa: number;
  advertisingCurrentMa: number;
};

export type FixedPolicyConfig = {
  id: string;
  type: "fixed";
  name: string;
  scanIntervalSeconds: number;
  scanWindowSeconds: number;
  advIntervalSeconds: number;
};

export type MotionPeerAdaptivePolicyConfig = {
  id: string;
  type: "motion_peer_adaptive";
  name: string;
  scanIntervalMinSeconds: number;
  scanIntervalMaxSeconds: number;
  scanWindowMinSeconds: number;
  scanWindowMaxSeconds: number;
  advIntervalMinSeconds: number;
  advIntervalMaxSeconds: number;
  tauMotionSeconds: number;
  tauPeerSeconds: number;
  motionGain: number;
  peerGain: number;
  motionWeight: number;
  peerWeight: number;
};

export type FirmwarePolicyConfig = FixedPolicyConfig | MotionPeerAdaptivePolicyConfig;

export type SimulationConfig = {
  seed: string;
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
  bothCollarsValid: boolean;
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

export type SimulationLogs = {
  animalStates: AnimalStateLog[];
  trueDyads: TrueDyadLog[];
  detections: DetectionEvent[];
  bleBursts: BleBurstEvent[];
  scanWindows: ScanWindowLog[];
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

export type SimulationMetrics = {
  trueContactSteps: number;
  observedDetections: number;
  scanWindows: number;
  negativeScanWindows: number;
  uniqueObservedDyads: number;
  recallEstimate: number;
  bleCaptureRate: number;
  bleCaptureHits: number;
  bleCaptureOpportunities: number;
  scanningAnimals: number;
  advertisingAnimals: number;
  meanSamplingDrive: number;
  meanScanIntervalSeconds: number;
  energyUsedMah: number;
  batteryRemainingPercent: number;
  estimatedVoltage: number;
  capturePerMah: number;
};
