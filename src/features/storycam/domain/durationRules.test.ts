import { describe, expect, it } from "vitest";
import { createDurationPlan, getDefaultCoreGroupCount } from "./durationRules";

describe("duration rules", () => {
  it("defaults every preset to one 15 second MVP core group", () => {
    expect(getDefaultCoreGroupCount(15, "short")).toBe(1);
    expect(getDefaultCoreGroupCount(45, "short")).toBe(1);
    expect(getDefaultCoreGroupCount(15, "medium")).toBe(1);
    expect(getDefaultCoreGroupCount(45, "medium")).toBe(1);
    expect(getDefaultCoreGroupCount(15, "full")).toBe(1);
    expect(getDefaultCoreGroupCount(45, "full")).toBe(1);
  });

  it("ignores requested duration when inferring the MVP group count", () => {
    expect(getDefaultCoreGroupCount(15)).toBe(1);
    expect(getDefaultCoreGroupCount(30)).toBe(1);
    expect(getDefaultCoreGroupCount(45)).toBe(1);
  });

  it("normalizes explicit group counts to a single 15 second clip target", () => {
    expect(createDurationPlan({ coreGroupTargetCount: 1, plannedDurationSeconds: 12 })).toEqual({
      plannedDurationSeconds: 15,
      coreGroupTargetCount: 1,
      clipDurationTargets: [15]
    });

    expect(createDurationPlan({ coreGroupTargetCount: 2, plannedDurationSeconds: 12 })).toEqual({
      plannedDurationSeconds: 15,
      coreGroupTargetCount: 1,
      clipDurationTargets: [15]
    });

    expect(createDurationPlan({ coreGroupTargetCount: 3, plannedDurationSeconds: 12 })).toEqual({
      plannedDurationSeconds: 15,
      coreGroupTargetCount: 1,
      clipDurationTargets: [15]
    });
  });

  it("keeps story density inside the single-group MVP lane", () => {
    expect(createDurationPlan({ plannedDurationSeconds: 45, storyDensity: "simple" })).toMatchObject({
      coreGroupTargetCount: 1,
      clipDurationTargets: [15]
    });

    expect(createDurationPlan({ plannedDurationSeconds: 45, storyDensity: "single_moment" })).toMatchObject({
      coreGroupTargetCount: 1,
      clipDurationTargets: [15]
    });

    expect(createDurationPlan({ plannedDurationSeconds: 45, storyDensity: "dense" })).toMatchObject({
      coreGroupTargetCount: 1
    });
  });

  it("keeps planned duration fixed to the 15 second storyboard MVP target", () => {
    expect(createDurationPlan({ plannedDurationSeconds: 3 }).plannedDurationSeconds).toBe(15);
    expect(createDurationPlan({ plannedDurationSeconds: 60 }).plannedDurationSeconds).toBe(15);
    expect(createDurationPlan({ plannedDurationSeconds: Number.NaN }).plannedDurationSeconds).toBe(15);
  });
});
