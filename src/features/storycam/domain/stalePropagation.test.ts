import { describe, expect, it } from "vitest";
import type { ArtifactType, VersionedArtifact } from "./artifacts";
import {
  assertCanGenerateClipFromPacket,
  canGenerateClipFromPacket,
  getDownstreamArtifactTypes,
  markDownstreamArtifactsStale,
  StaleArtifactError
} from "./stalePropagation";

const now = "2026-04-26T03:00:00.000Z";

function artifact(
  id: string,
  type: ArtifactType,
  options: Partial<Pick<VersionedArtifact, "sessionId" | "state" | "dependsOn">> = {}
): VersionedArtifact {
  return {
    id,
    type,
    sessionId: options.sessionId ?? "session-1",
    state: options.state ?? "ready",
    version: 1,
    data: {},
    createdAt: now,
    updatedAt: now,
    ...(options.dependsOn ? { dependsOn: options.dependsOn } : {})
  };
}

describe("stale propagation", () => {
  it("knows the downstream types for story assets", () => {
    expect(getDownstreamArtifactTypes("script")).toEqual(
      expect.arrayContaining([
        "storyboard_script",
        "core_storyboard_group",
        "expanded_storyboard_card",
        "clip_prompt_packet",
        "generated_clip",
        "final_work"
      ])
    );
  });

  it("marks storyboard, expansion, packets, clips, and final work stale after script edits", () => {
    const artifacts = [
      artifact("script-1", "script"),
      artifact("character-1", "character_asset"),
      artifact("storyboard-1", "storyboard_script", { dependsOn: { "script-1": 1 } }),
      artifact("core-1", "core_storyboard_group", { dependsOn: { "storyboard-1": 1 } }),
      artifact("expanded-1", "expanded_storyboard_card", { dependsOn: { "core-1": 1 } }),
      artifact("packet-1", "clip_prompt_packet", { dependsOn: { "expanded-1": 1 } }),
      artifact("clip-1", "generated_clip", { dependsOn: { "packet-1": 1 } }),
      artifact("final-1", "final_work", { dependsOn: { "clip-1": 1 } })
    ];

    const result = markDownstreamArtifactsStale(artifacts, artifacts[0]);

    expect(stateById(result)).toMatchObject({
      "script-1": "ready",
      "character-1": "ready",
      "storyboard-1": "stale",
      "core-1": "stale",
      "expanded-1": "stale",
      "packet-1": "stale",
      "clip-1": "stale",
      "final-1": "stale"
    });
  });

  it("marks downstream generation stale after character or scene asset edits", () => {
    const artifacts = [
      artifact("character-1", "character_asset"),
      artifact("scene-1", "scene_asset"),
      artifact("core-1", "core_storyboard_group", { dependsOn: { "character-1": 1, "scene-1": 1 } }),
      artifact("packet-1", "clip_prompt_packet", { dependsOn: { "core-1": 1 } }),
      artifact("final-1", "final_work", { dependsOn: { "packet-1": 1 } })
    ];

    expect(stateById(markDownstreamArtifactsStale(artifacts, artifacts[0]))).toMatchObject({
      "scene-1": "ready",
      "core-1": "stale",
      "packet-1": "stale",
      "final-1": "stale"
    });

    expect(stateById(markDownstreamArtifactsStale(artifacts, artifacts[1]))).toMatchObject({
      "character-1": "ready",
      "core-1": "stale",
      "packet-1": "stale",
      "final-1": "stale"
    });
  });

  it("does not stale artifacts in another session", () => {
    const artifacts = [
      artifact("script-1", "script"),
      artifact("packet-1", "clip_prompt_packet"),
      artifact("packet-2", "clip_prompt_packet", { sessionId: "session-2" })
    ];

    expect(stateById(markDownstreamArtifactsStale(artifacts, artifacts[0]))).toEqual({
      "script-1": "ready",
      "packet-1": "stale",
      "packet-2": "ready"
    });
  });

  it("blocks stale clip prompt packets from generating video jobs", () => {
    expect(canGenerateClipFromPacket({ state: "ready" })).toBe(true);
    expect(canGenerateClipFromPacket({ state: "stale" })).toBe(false);
    expect(() => assertCanGenerateClipFromPacket({ state: "stale" })).toThrow(StaleArtifactError);
  });
});

function stateById(artifacts: readonly VersionedArtifact[]) {
  return Object.fromEntries(artifacts.map((item) => [item.id, item.state]));
}
