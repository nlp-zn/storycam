import { describe, expect, it } from "vitest";
import { coreStoryboardGroups, directorChoices, storyAssets, storyModeEntries } from "./shellContent";

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

  it("keeps adjacent story modes visible but marked incomplete", () => {
    expect(storyModeEntries.map((entry) => entry.label)).toEqual(["私人记忆", "宠物小剧场", "小说角色", "情绪短片"]);
    expect(storyModeEntries.slice(1).every((entry) => entry.status === "暂不完整支持")).toBe(true);
  });
});
