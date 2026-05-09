import { DEFAULT_SPECIES_PRESET_ID, SPECIES_PRESETS } from "./speciesPresets";
import type { AdvancedSpeciesOverrides, SpeciesModifierConfig, SpeciesPreset } from "./speciesTypes";
import type { TraitDistribution } from "./types";

export const defaultSpeciesModifiers: SpeciesModifierConfig = {
  activityLevelMultiplier: 1,
  socialityMultiplier: 1,
  territorialityMultiplier: 1,
  variabilityMultiplier: 1,
  boutLengthMultiplier: 1
};

export function resolveSpeciesPreset(
  speciesPresetId: string = DEFAULT_SPECIES_PRESET_ID,
  modifiers: SpeciesModifierConfig = defaultSpeciesModifiers,
  overrides?: AdvancedSpeciesOverrides
): SpeciesPreset {
  const preset = SPECIES_PRESETS[speciesPresetId as keyof typeof SPECIES_PRESETS] ?? SPECIES_PRESETS[DEFAULT_SPECIES_PRESET_ID];
  const withOverrides = {
    ...preset,
    ...overrides
  };

  return {
    ...withOverrides,
    activeWindowHours: scaleSpread(withOverrides.activeWindowHours, modifiers.variabilityMultiplier),
    dailyMotionMinutes: scaleDistribution(
      scaleSpread(withOverrides.dailyMotionMinutes, modifiers.variabilityMultiplier),
      modifiers.activityLevelMultiplier
    ),
    majorRestWindowHours: scaleSpread(withOverrides.majorRestWindowHours, modifiers.variabilityMultiplier),
    movementBoutMeanMinutes: scaleDistribution(
      scaleSpread(withOverrides.movementBoutMeanMinutes, modifiers.variabilityMultiplier),
      modifiers.boutLengthMultiplier
    ),
    restBoutMeanMinutes: scaleDistribution(
      scaleSpread(withOverrides.restBoutMeanMinutes, modifiers.variabilityMultiplier),
      modifiers.boutLengthMultiplier
    ),
    stationaryAwakeBoutMeanMinutes: withOverrides.stationaryAwakeBoutMeanMinutes
      ? scaleDistribution(
          scaleSpread(withOverrides.stationaryAwakeBoutMeanMinutes, modifiers.variabilityMultiplier),
          modifiers.boutLengthMultiplier
        )
      : undefined,
    circadianPhaseOffsetHours: scaleSpread(withOverrides.circadianPhaseOffsetHours, modifiers.variabilityMultiplier),
    socialPropensity: clampDistribution(
      scaleDistribution(scaleSpread(withOverrides.socialPropensity, modifiers.variabilityMultiplier), modifiers.socialityMultiplier),
      0,
      1
    ),
    territoriality: clampDistribution(
      scaleDistribution(
        scaleSpread(withOverrides.territoriality, modifiers.variabilityMultiplier),
        modifiers.territorialityMultiplier
      ),
      0,
      1
    ),
    groupSynchrony: withOverrides.groupSynchrony
      ? clampDistribution(scaleSpread(withOverrides.groupSynchrony, modifiers.variabilityMultiplier), 0, 1)
      : undefined
  };
}

export function scaleDistribution(distribution: TraitDistribution, multiplier: number): TraitDistribution {
  return {
    min: distribution.min * multiplier,
    mode: distribution.mode * multiplier,
    max: distribution.max * multiplier
  };
}

function scaleSpread(distribution: TraitDistribution, multiplier: number): TraitDistribution {
  const center = distribution.mode;
  return {
    min: center + (distribution.min - center) * multiplier,
    mode: center,
    max: center + (distribution.max - center) * multiplier
  };
}

function clampDistribution(distribution: TraitDistribution, min: number, max: number): TraitDistribution {
  const clamped = {
    min: clamp(distribution.min, min, max),
    mode: clamp(distribution.mode, min, max),
    max: clamp(distribution.max, min, max)
  };
  return {
    min: Math.min(clamped.min, clamped.mode, clamped.max),
    mode: clamped.mode,
    max: Math.max(clamped.min, clamped.mode, clamped.max)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

