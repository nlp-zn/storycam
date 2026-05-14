import { describe, expect, it } from "vitest";
import { coreStoryboardGroups, directorChoices, discoveryEntries, discoveryLayoutPresets, storyAssets, storyModeEntries } from "./shellContent";

describe("StoryCam shell content", () => {
  it("keeps the phase 1 core storyboard group limit", () => {
    expect(coreStoryboardGroups.length).toBeGreaterThanOrEqual(1);
    expect(coreStoryboardGroups.length).toBeLessThanOrEqual(3);
  });

  it("starts with the required story world confirmation assets", () => {
    expect(storyAssets.map((asset) => asset.label)).toEqual(["我的剧本", "人物", "地点"]);
  });

  it("offers lightweight director choices instead of professional controls", () => {
    expect(directorChoices).toEqual(["留白多一点", "像旧照片", "雨夜韩剧感", "靠小动作推进"]);
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
    ).not.toMatch(/prompt|packet|model|shot|少说话|加旁白/i);
    expect(new Set(storyModeEntries.flatMap((entry) => entry.directorChoices)).size).toBe(
      storyModeEntries.reduce((count, entry) => count + entry.directorChoices.length, 0)
    );
  });

  it("keeps playable story mode templates visible in a stable order", () => {
    expect(storyModeEntries.map((entry) => entry.label)).toEqual(["私人记忆", "宠物小剧场", "小说角色", "情绪短片", "手绘旅行 VLOG"]);
    expect(storyModeEntries.map((entry) => entry.id)).toEqual([
      "personal-memory",
      "pet-theater",
      "novel-character",
      "emotion-short",
      "handdrawn-travel-vlog"
    ]);
    expect(storyModeEntries.every((entry) => entry.sampleIdea.length > 0)).toBe(true);
    expect(storyModeEntries.every((entry) => entry.directorChoices.length === 4)).toBe(true);
    expect(storyModeEntries.map((entry) => `${entry.label} ${entry.text} ${entry.sampleIdea}`).join(" ")).not.toMatch(
      /prompt|packet|model|shot/i
    );
  });

  it("marks handdrawn travel VLOG as a photo and destination driven portrait mode", () => {
    const travelMode = storyModeEntries.find((entry) => entry.id === "handdrawn-travel-vlog");

    expect(travelMode).toMatchObject({
      defaultChoices: ["手绘角色感"],
      preferredAspectRatio: "9:16",
      requiresPhoto: true,
      requiresTravelDestination: true
    });
    expect(travelMode?.directorChoices).toEqual(["手绘角色感", "真实旅行地", "轻剧情 VLOG", "自然走拍"]);
  });

  it("prepares discovery presets for horizontal and vertical video slots", () => {
    const samples = discoveryEntries.filter((entry) => entry.kind === "sample");
    const placeholders = discoveryEntries.filter((entry) => entry.kind === "placeholder");

    expect(samples).toHaveLength(8);
    expect(placeholders.length).toBeGreaterThanOrEqual(1);
    expect(discoveryEntries.some((entry) => entry.format === "landscape")).toBe(true);
    expect(discoveryEntries.some((entry) => entry.format === "portrait")).toBe(true);
    expect(samples.every((entry) => entry.duration === "00:15")).toBe(true);
    expect(samples.map((entry) => entry.id)).toEqual([
      "sample-03",
      "sample-02",
      "sample-08",
      "sample-05",
      "sample-01",
      "sample-07",
      "sample-04",
      "sample-06"
    ]);
    expect(discoveryLayoutPresets).toHaveLength(2);
    expect(discoveryLayoutPresets.every((preset) => preset.length === discoveryEntries.length)).toBe(true);
    expect(
      discoveryLayoutPresets.every((preset) => preset.every((entryId) => discoveryEntries.some((entry) => entry.id === entryId)))
    ).toBe(true);
    expect(JSON.stringify(discoveryEntries)).not.toContain("storycam-generated");
  });
});
