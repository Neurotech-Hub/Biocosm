import type { TraitDistribution } from "./types";

export type ActivityPattern =
  | "nocturnal_unimodal"
  | "nocturnal_bimodal"
  | "diurnal"
  | "diurnal_unimodal"
  | "diurnal_bimodal"
  | "crepuscular"
  | "ultradian"
  | "cathemeral";

export type PresetConfidence = "high" | "medium" | "low" | "low-medium";

export type SpeciesPreset = {
  id: string;
  label: string;
  commonName: string;
  scientificName?: string;
  activityPattern: ActivityPattern;
  circadianMode: "nocturnal" | "diurnal" | "cathemeral";
  sleepArchitecture?: "monophasic" | "polyphasic" | "ultradian";
  activePeakHours: number[];
  sleepCenterHour?: number;
  activeWindowHours: TraitDistribution;
  dailyMotionMinutes: TraitDistribution;
  majorRestWindowHours: TraitDistribution;
  movementBoutMeanMinutes: TraitDistribution;
  restBoutMeanMinutes: TraitDistribution;
  stationaryAwakeBoutMeanMinutes?: TraitDistribution;
  movementSpeedMetersPerMinute?: TraitDistribution;
  ultradianPeriodMinutes?: TraitDistribution;
  ultradianAmplitude?: number;
  circadianPhaseOffsetHours: TraitDistribution;
  socialPropensity: TraitDistribution;
  territoriality: TraitDistribution;
  groupSynchrony?: TraitDistribution;
  seasonalSensitivity: number;
  lightPhaseStartHour?: number;
  lightPhaseEndHour?: number;
  confidence: PresetConfidence;
  notes: string;
};

export type SpeciesModifierConfig = {
  activityLevelMultiplier: number;
  socialityMultiplier: number;
  territorialityMultiplier: number;
  variabilityMultiplier: number;
  boutLengthMultiplier: number;
};

export type AdvancedSpeciesOverrides = Partial<
  Pick<
    SpeciesPreset,
    | "activePeakHours"
    | "activeWindowHours"
    | "dailyMotionMinutes"
    | "majorRestWindowHours"
    | "movementBoutMeanMinutes"
    | "restBoutMeanMinutes"
    | "stationaryAwakeBoutMeanMinutes"
    | "movementSpeedMetersPerMinute"
    | "ultradianPeriodMinutes"
    | "ultradianAmplitude"
    | "circadianPhaseOffsetHours"
    | "socialPropensity"
    | "territoriality"
    | "groupSynchrony"
  >
>;

