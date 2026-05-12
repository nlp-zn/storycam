import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryCamConfig } from "@/server/config";
import { createConfiguredStoryboardImageProvider } from "./storyboardImageProviderFactory";

const createInferenceShImageProviderMock = vi.hoisted(() =>
  vi.fn((options: Record<string, unknown>) => ({
    ...options,
    providerKind: "image",
    providerName: "inference_sh"
  }))
);

vi.mock("@/lib/providers/inferenceSh/imageProvider", () => ({
  createInferenceShImageProvider: createInferenceShImageProviderMock
}));

describe("storyboard image provider factory", () => {
  beforeEach(() => {
    createInferenceShImageProviderMock.mockClear();
  });

  it("configures Inference.sh storyboard images with reference image support", () => {
    const provider = createConfiguredStoryboardImageProvider(inferenceShConfig());

    expect(provider?.providerName).toBe("inference_sh");
    expect(provider?.supportsReferenceImages).toBe(true);
    expect(createInferenceShImageProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        app: "openai/gpt-image-2",
        supportsReferenceImages: true
      })
    );
  });

  it("passes StoryCam asset reference signed URLs as the gpt-image images input", () => {
    createConfiguredStoryboardImageProvider(inferenceShConfig());
    const options = createInferenceShImageProviderMock.mock.calls[0]?.[0] as
      | {
          buildPrompt(input: ReturnType<typeof storyboardInput>): unknown;
        }
      | undefined;

    expect(options?.buildPrompt(storyboardInput())).toMatchObject({
      height: 864,
      images: ["https://storycam.example/character.png", "https://storycam.example/scene.png"],
      prompt: expect.stringContaining("Use the attached StoryCam asset reference images"),
      quality: "high",
      width: 1536
    });
  });

  it("uses portrait dimensions and prompt language for 9:16 storyboard images", () => {
    createConfiguredStoryboardImageProvider(inferenceShConfig());
    const options = createInferenceShImageProviderMock.mock.calls[0]?.[0] as
      | {
          buildPrompt(input: ReturnType<typeof storyboardInput>): { height: number; prompt: string; width: number };
        }
      | undefined;
    const prompt = options?.buildPrompt(storyboardInput({ aspectRatio: "9:16" }));

    expect(prompt).toMatchObject({
      height: 1536,
      width: 864
    });
    expect(prompt?.prompt).toContain("9:16 portrait vertical composition");
    expect(prompt?.prompt).toContain("vertical 9:16 frame");
  });

  it("locks storyboard image prompts to the frame's visible character assets", () => {
    createConfiguredStoryboardImageProvider(inferenceShConfig());
    const options = createInferenceShImageProviderMock.mock.calls[0]?.[0] as
      | {
          buildPrompt(input: ReturnType<typeof storyboardInput>): { prompt: string };
        }
      | undefined;
    const prompt = options?.buildPrompt(storyboardInput()).prompt ?? "";

    expect(prompt).toContain("Visible character assets for this frame: character-1");
    expect(prompt).toContain("Only render the visible character assets listed for this frame");
    expect(prompt).toContain("Do not add unlisted people, humans, pets, faces, silhouettes, backs, hands, or body parts");
  });
});

function inferenceShConfig(): StoryCamConfig {
  return {
    generation: {
      finalWorkProvider: "mock",
      imageProvider: "inference_sh",
      mode: "real",
      multimodalProvider: "mock",
      textProvider: "mock",
      videoProvider: "mock"
    },
    inferenceSh: {
      apiKey: "inference-key",
      imageApp: "openai/gpt-image-2"
    },
    media: {
      providerReferenceSignedUrlTtlSeconds: 3600
    },
    supabase: {
      anonKey: "anon-key",
      serviceRoleKey: "service-role-key",
      url: "https://storycam.example.supabase.co"
    }
  };
}

function storyboardInput(overrides: Partial<{ aspectRatio: "16:9" | "9:16" }> = {}) {
  return {
    aspectRatio: overrides.aspectRatio ?? "16:9",
    characterAssetIds: ["character-1"],
    coreGroupId: "core-1",
    emotionalTurn: "想说出口",
    estimatedClipDurationSeconds: 15,
    frame: {
      frameNumber: 1,
      imagePrompt: "Stylized comic storyboard frame, dog waits near the door.",
      title: "安静等待",
      visibleCharacterAssetIds: ["character-1"],
      visualContent: "小狗看向门口。"
    },
    mainImagePrompt: "雨夜便利店门口的主分镜",
    referenceImages: [
      {
        assetArtifactId: "character-1",
        kind: "character" as const,
        mediaId: "media-character",
        mimeType: "image/png",
        signedUrl: "https://storycam.example/character.png",
        signedUrlExpiresIn: 3600
      },
      {
        assetArtifactId: "scene-1",
        kind: "scene" as const,
        mediaId: "media-scene",
        mimeType: "image/png",
        signedUrl: "https://storycam.example/scene.png",
        signedUrlExpiresIn: 3600
      }
    ],
    sceneAssetId: "scene-1",
    sessionId: "session-1",
    storyPurpose: "建立雨夜未发送短信的私人情绪",
    title: "未发送的短信"
  };
}
