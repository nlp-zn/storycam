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
    expect(storyModeEntries[0].directorChoices).toEqual(directorChoices);
    expect(
      storyModeEntries.every((entry) => {
        const choiceSet = new Set<string>(entry.directorChoices);

        return entry.defaultChoices.every((choice) => choiceSet.has(choice));
      })
    ).toBe(true);
    expect(
      storyModeEntries
        .flatMap((entry) => [...entry.directorChoices, ...entry.defaultChoices])
        .join(" ")
    ).not.toMatch(/prompt|packet|model|shot/i);
  });

  it("keeps playable story mode templates visible in a stable order", () => {
    expect(storyModeEntries.map((entry) => entry.label)).toEqual(["私人记忆", "宠物小剧场", "小说角色", "情绪短片"]);
    expect(storyModeEntries.map((entry) => entry.id)).toEqual(["personal-memory", "pet-theater", "novel-character", "emotion-short"]);
    expect(storyModeEntries.every((entry) => entry.sampleIdea.length > 0)).toBe(true);
    expect(storyModeEntries.every((entry) => entry.directorChoices.length === 4)).toBe(true);
    expect(storyModeEntries.map((entry) => `${entry.label} ${entry.text} ${entry.sampleIdea}`).join(" ")).not.toMatch(
      /prompt|packet|model|shot/i
    );
  });
});
