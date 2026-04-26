import { describe, expect, it } from "vitest";
import { coreStoryboardGroups, directorChoices, storyAssets } from "./shellContent";

describe("StoryCam shell content", () => {
  it("keeps the phase 1 core storyboard group limit", () => {
    expect(coreStoryboardGroups.length).toBeGreaterThanOrEqual(1);
    expect(coreStoryboardGroups.length).toBeLessThanOrEqual(3);
  });

  it("starts with the required story world confirmation assets", () => {
    expect(storyAssets.map((asset) => asset.label)).toEqual(["我的剧本", "人物", "地点"]);
  });

  it("offers lightweight director choices instead of professional controls", () => {
    expect(directorChoices).toContain("像私人回忆");
    expect(directorChoices.join(" ")).not.toMatch(/prompt|packet|model|shot/i);
  });
});
