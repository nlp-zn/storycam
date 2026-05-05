export type StoryDensity = "single_moment" | "simple" | "normal" | "dense";
export type DurationPreset = "short" | "medium" | "full";

export type DurationPlanInput = {
  coreGroupTargetCount?: 1 | 2 | 3;
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
  coreGroupTargetCount: _explicitCoreGroupTargetCount,
  plannedDurationSeconds: _plannedDurationSeconds,
  durationPreset: _durationPreset,
  storyDensity: _storyDensity = "normal"
}: DurationPlanInput): DurationPlan {
  return {
    plannedDurationSeconds: 15,
    coreGroupTargetCount: 1,
    clipDurationTargets: [15]
  };
}

export function getDefaultCoreGroupCount(_plannedDurationSeconds: number, _durationPreset?: DurationPreset): 1 | 2 | 3 {
  return 1;
}
