import { describe, expect, it, vi } from "vitest";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import { rainyKDramaStoryWorldFixture } from "@/lib/providers/mock/fixtures/storyWorld";
import type { Database, StoryCamArtifactRow, StoryCamSessionRow } from "@/server/db/types";
import { submitStoryWorldAssetImageJobs, type StoryWorldAssetImageInput } from "./storyWorldAssetImageService";
import type { AsyncImageProviderOutput } from "./imageGenerationJobService";
import type { StoryCamDbClient } from "./sessionRepository";

describe("story-world asset image service", () => {
  it("returns per-asset placeholders instead of failing the whole batch when image job metadata is unavailable", async () => {
    const client = new FakeSupabaseClient();
    const provider = asyncImageProvider();

    const result = await submitStoryWorldAssetImageJobs(
      client.asStoryCamDbClient(),
      "user-1",
      {
        assetArtifactIds: ["character-artifact-1", "scene-artifact-1"],
        sessionId: "session-1"
      },
      provider
    );

    expect(result.value.imagesByArtifactId["character-artifact-1"]?.image).toEqual({
      placeholder: true,
      reason: "storage_failed",
      redactedError: "Image job metadata is unavailable.",
      status: "placeholder"
    });
    expect(result.value.imagesByArtifactId["scene-artifact-1"]?.image).toEqual({
      placeholder: true,
      reason: "storage_failed",
      redactedError: "Image job metadata is unavailable.",
      status: "placeholder"
    });
    expect(provider.submitImageTask).not.toHaveBeenCalled();
  });

  it("returns an asset placeholder instead of failing the batch when one stored asset is malformed", async () => {
    const { sceneAssets } = rainyKDramaStoryWorldFixture;
    const { location: _location, ...malformedSceneAsset } = sceneAssets[0];
    const client = new FakeSupabaseClient([
      artifactRow("scene-artifact-1", "scene_asset", malformedSceneAsset as StoryCamArtifactRow["data_json"])
    ]);
    const provider = asyncImageProvider();

    const result = await submitStoryWorldAssetImageJobs(
      client.asStoryCamDbClient(),
      "user-1",
      {
        assetArtifactIds: ["scene-artifact-1"],
        sessionId: "session-1"
      },
      provider
    );

    expect(result.value.imagesByArtifactId["scene-artifact-1"]?.image).toEqual({
      placeholder: true,
      reason: "storage_failed",
      redactedError: "Asset image generation is unavailable for this asset.",
      status: "placeholder"
    });
    expect(provider.submitImageTask).not.toHaveBeenCalled();
  });
});

function asyncImageProvider() {
  return {
    generateImage: vi.fn(),
    providerKind: "image",
    providerName: "inference_sh",
    resolveImageTask: vi.fn(),
    submitImageTask: vi.fn()
  } as unknown as ImageGenerationProvider<StoryWorldAssetImageInput, AsyncImageProviderOutput> & {
    submitImageTask: ReturnType<typeof vi.fn>;
  };
}

class FakeSupabaseClient {
  readonly queries: FakeQuery[] = [];

  constructor(private readonly artifactRows = storyWorldArtifactRows()) {}

  asStoryCamDbClient() {
    return this as unknown as StoryCamDbClient;
  }

  from(table: keyof Database["public"]["Tables"]) {
    const query = new FakeQuery(table, this.artifactRows);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];

  constructor(
    readonly table: keyof Database["public"]["Tables"],
    private readonly artifactRows: StoryCamArtifactRow[]
  ) {}

  select(columns: string) {
    this.calls.push(["select", columns]);
    return this;
  }

  eq(column: string, value: unknown) {
    this.calls.push(["eq", column, value]);
    return this;
  }

  is(column: string, value: unknown) {
    this.calls.push(["is", column, value]);
    return this;
  }

  order(column: string, options: Record<string, unknown>) {
    this.calls.push(["order", column, options]);

    if (this.table === "storycam_artifacts") {
      return Promise.resolve({ data: this.artifactRows, error: null });
    }

    return this;
  }

  limit(value: number) {
    this.calls.push(["limit", value]);
    return this;
  }

  maybeSingle() {
    if (this.table === "storycam_sessions") {
      return Promise.resolve({ data: storyCamSession(), error: null });
    }

    if (this.table === "media_assets") {
      return Promise.resolve({ data: null, error: null });
    }

    if (this.table === "generation_jobs") {
      return Promise.resolve({
        data: null,
        error: {
          code: "42P01",
          message: "relation generation_jobs does not exist"
        }
      });
    }

    return Promise.resolve({ data: null, error: null });
  }
}

function storyCamSession(): StoryCamSessionRow {
  return {
    core_group_target_count: 1,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: null,
    generation_mode: "mock",
    id: "session-1",
    planned_duration_seconds: 12,
    status: "draft",
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1"
  };
}

function storyWorldArtifactRows(): StoryCamArtifactRow[] {
  const { characterAssets, sceneAssets, script } = rainyKDramaStoryWorldFixture;

  return [
    artifactRow("script-artifact-1", "script", script),
    artifactRow("character-artifact-1", "character_asset", characterAssets[0]),
    artifactRow("scene-artifact-1", "scene_asset", sceneAssets[0])
  ];
}

function artifactRow(id: string, type: StoryCamArtifactRow["type"], dataJson: StoryCamArtifactRow["data_json"]): StoryCamArtifactRow {
  return {
    created_at: "2026-04-26T00:00:00.000Z",
    data_json: dataJson,
    deleted_at: null,
    depends_on_json: {},
    id,
    parent_artifact_id: null,
    session_id: "session-1",
    stale_at: null,
    state: "ready",
    type,
    updated_at: "2026-04-26T00:00:00.000Z",
    user_id: "user-1",
    version: 1
  };
}
