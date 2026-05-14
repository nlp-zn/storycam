import { describe, expect, it, vi } from "vitest";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import { rainyKDramaStoryWorldFixture } from "@/lib/providers/mock/fixtures/storyWorld";
import type { Database, MediaAssetRow, StoryCamArtifactRow, StoryCamSessionRow } from "@/server/db/types";
import {
  buildStoryWorldAssetImageProviderInput,
  submitStoryWorldAssetImageJobs,
  type StoryWorldAssetImageInput
} from "./storyWorldAssetImageService";
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

  it("uses provider reference signed URLs for handdrawn travel uploaded photo references", async () => {
    const artifactRows = handdrawnTravelArtifactRows();
    const client = new FakeSupabaseClient(artifactRows, [uploadedPhotoRow()]);

    const input = await buildStoryWorldAssetImageProviderInput(
      client.asStoryCamDbClient(),
      "user-1",
      {
        assetArtifactId: "character-artifact-1",
        assetKind: "character",
        sessionId: "session-1"
      },
      artifactRows[1],
      artifactRows
    );

    expect(input.referenceImages?.[0]).toMatchObject({
      kind: "style_reference",
      mediaId: "storycam-handdrawn-travel-character-style"
    });
    expect(input.referenceImages?.[0]?.signedUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(input.referenceImages?.[1]).toMatchObject({
      kind: "uploaded_photo",
      mediaId: "photo-1",
      signedUrl: "https://storycam.example.supabase.co/storage/v1/object/sign/users/user-1/sessions/session-1/uploads/photo-1.png"
    });
    expect(input.referenceImages).toHaveLength(2);
    expect(client.signedUrlCalls).toEqual([
      {
        bucket: "storycam-uploads",
        expiresIn: 3600,
        path: "users/user-1/sessions/session-1/uploads/photo-1.png"
      }
    ]);
  });

  it("carries the selected session aspect ratio into story-world asset image inputs", async () => {
    const artifactRows = storyWorldArtifactRows();
    const client = new FakeSupabaseClient(artifactRows);

    const input = await buildStoryWorldAssetImageProviderInput(
      client.asStoryCamDbClient(),
      "user-1",
      {
        assetArtifactId: "scene-artifact-1",
        assetKind: "scene",
        sessionId: "session-1"
      },
      artifactRows[2],
      artifactRows,
      "9:16"
    );

    expect(input).toMatchObject({
      assetArtifactId: "scene-artifact-1",
      assetKind: "scene",
      aspectRatio: "9:16"
    });
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
  readonly signedUrlCalls: Array<{ bucket: string; expiresIn: number; path: string }> = [];
  readonly storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string, expiresIn: number) => {
        this.signedUrlCalls.push({ bucket, expiresIn, path });

        return Promise.resolve({
          data: {
            signedUrl: `https://storycam.example.supabase.co/storage/v1/object/sign/${path}`
          },
          error: null
        });
      }
    })
  };

  constructor(
    private readonly artifactRows = storyWorldArtifactRows(),
    private readonly mediaRows: MediaAssetRow[] = []
  ) {}

  asStoryCamDbClient() {
    return this as unknown as StoryCamDbClient;
  }

  from(table: keyof Database["public"]["Tables"]) {
    const query = new FakeQuery(table, this.artifactRows, this.mediaRows);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery {
  readonly calls: unknown[][] = [];

  constructor(
    readonly table: keyof Database["public"]["Tables"],
    private readonly artifactRows: StoryCamArtifactRow[],
    private readonly mediaRows: MediaAssetRow[]
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

  in(column: string, values: unknown[]) {
    this.calls.push(["in", column, values]);
    return this;
  }

  order(column: string, options: Record<string, unknown>) {
    this.calls.push(["order", column, options]);

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

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const data = this.table === "storycam_artifacts" ? this.artifactRows : this.table === "media_assets" ? this.mediaRows : [];

    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

function handdrawnTravelArtifactRows(): StoryCamArtifactRow[] {
  const { characterAssets, sceneAssets, script } = rainyKDramaStoryWorldFixture;

  return [
    artifactRow("script-artifact-1", "script", {
      ...script,
      storyModeId: "handdrawn-travel-vlog"
    }),
    artifactRow("character-artifact-1", "character_asset", {
      ...characterAssets[0],
      referenceMediaIds: ["photo-1"]
    }),
    artifactRow("scene-artifact-1", "scene_asset", sceneAssets[0])
  ];
}

function uploadedPhotoRow(): MediaAssetRow {
  return {
    byte_size: 1234,
    created_at: "2026-04-26T00:00:00.000Z",
    deleted_at: null,
    id: "photo-1",
    kind: "uploaded_photo",
    linked_artifact_id: null,
    mime_type: "image/png",
    session_id: "session-1",
    source: "upload",
    storage_bucket: "storycam-uploads",
    storage_path: "users/user-1/sessions/session-1/uploads/photo-1.png",
    user_id: "user-1"
  };
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
    user_id: "user-1",
    video_aspect_ratio: "16:9"
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
