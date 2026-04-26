import { describe, expect, it } from "vitest";
import { createDurationPlan, getDefaultCoreGroupCount } from "./durationRules";

describe("duration rules", () => {
  it("defaults 8-12 second short plans to one core group", () => {
    expect(getDefaultCoreGroupCount(8, "short")).toBe(1);
    expect(getDefaultCoreGroupCount(12, "short")).toBe(1);
  });

  it("defaults 10-14 second medium plans to two core groups", () => {
    expect(getDefaultCoreGroupCount(10, "medium")).toBe(2);
    expect(getDefaultCoreGroupCount(14, "medium")).toBe(2);
  });

  it("defaults 12-15 second full plans to three core groups", () => {
    expect(getDefaultCoreGroupCount(12, "full")).toBe(3);
    expect(getDefaultCoreGroupCount(15, "full")).toBe(3);
  });

  it("infers a deterministic group count when only seconds are provided", () => {
    expect(getDefaultCoreGroupCount(9)).toBe(1);
    expect(getDefaultCoreGroupCount(11)).toBe(2);
    expect(getDefaultCoreGroupCount(12)).toBe(3);
  });

  it("returns clip duration targets for the selected group count", () => {
    expect(createDurationPlan({ plannedDurationSeconds: 9 })).toEqual({
      plannedDurationSeconds: 9,
      coreGroupTargetCount: 1,
      clipDurationTargets: [9]
    });

    expect(createDurationPlan({ plannedDurationSeconds: 14, durationPreset: "medium" })).toEqual({
      plannedDurationSeconds: 14,
      coreGroupTargetCount: 2,
      clipDurationTargets: [7, 7]
    });
  });

  it("supports story-density downshift without exceeding three groups", () => {
    expect(createDurationPlan({ plannedDurationSeconds: 15, storyDensity: "simple" })).toMatchObject({
      coreGroupTargetCount: 2,
      clipDurationTargets: [7.5, 7.5]
    });

    expect(createDurationPlan({ plannedDurationSeconds: 15, storyDensity: "single_moment" })).toMatchObject({
      coreGroupTargetCount: 1,
      clipDurationTargets: [15]
    });

    expect(createDurationPlan({ plannedDurationSeconds: 15, storyDensity: "dense" })).toMatchObject({
      coreGroupTargetCount: 3
    });
  });

  it("keeps planned duration within the Phase 1 bounds", () => {
    expect(createDurationPlan({ plannedDurationSeconds: 3 }).plannedDurationSeconds).toBe(8);
    expect(createDurationPlan({ plannedDurationSeconds: 30 }).plannedDurationSeconds).toBe(15);
    expect(createDurationPlan({ plannedDurationSeconds: Number.NaN }).plannedDurationSeconds).toBe(8);
  });
});
