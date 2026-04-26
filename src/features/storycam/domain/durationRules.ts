export type StoryDensity = "single_moment" | "simple" | "normal" | "dense";
export type DurationPreset = "short" | "medium" | "full";

export type DurationPlanInput = {
  plannedDurationSeconds: number;
  durationPreset?: DurationPreset;
  storyDensity?: StoryDensity;
};

export type DurationPlan = {
  plannedDurationSeconds: number;
  coreGroupTargetCount: 1 | 2 | 3;
  clipDurationTargets: number[];
};

export function createDurationPlan({
  plannedDurationSeconds,
  durationPreset,
  storyDensity = "normal"
}: DurationPlanInput): DurationPlan {
  const normalizedDuration = clampDuration(plannedDurationSeconds);
  const defaultGroupCount = getDefaultCoreGroupCount(normalizedDuration, durationPreset);
  const coreGroupTargetCount = applyDensityDownshift(defaultGroupCount, storyDensity);

  return {
    plannedDurationSeconds: normalizedDuration,
    coreGroupTargetCount,
    clipDurationTargets: splitDuration(normalizedDuration, coreGroupTargetCount)
  };
}

export function getDefaultCoreGroupCount(plannedDurationSeconds: number, durationPreset?: DurationPreset): 1 | 2 | 3 {
  if (durationPreset === "short") {
    return 1;
  }

  if (durationPreset === "medium") {
    return 2;
  }

  if (durationPreset === "full") {
    return 3;
  }

  const duration = clampDuration(plannedDurationSeconds);

  if (duration >= 12) {
    return 3;
  }

  if (duration >= 10) {
    return 2;
  }

  return 1;
}

function applyDensityDownshift(defaultGroupCount: 1 | 2 | 3, storyDensity: StoryDensity): 1 | 2 | 3 {
  if (storyDensity === "single_moment") {
    return 1;
  }

  if (storyDensity === "simple" && defaultGroupCount > 1) {
    return (defaultGroupCount - 1) as 1 | 2;
  }

  return defaultGroupCount;
}

function splitDuration(plannedDurationSeconds: number, groupCount: 1 | 2 | 3) {
  const rawDuration = plannedDurationSeconds / groupCount;
  const roundedDuration = Math.round(rawDuration * 10) / 10;

  return Array.from({ length: groupCount }, () => roundedDuration);
}

function clampDuration(plannedDurationSeconds: number) {
  if (!Number.isFinite(plannedDurationSeconds)) {
    return 8;
  }

  return Math.min(15, Math.max(8, Math.round(plannedDurationSeconds)));
}
