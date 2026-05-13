import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/server/auth/requireUser", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/requireUser")>("@/server/auth/requireUser");

  return {
    ...actual,
    requireUser: requireUserMock
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

describe("GET /api/storycam-sessions/current", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("requires authentication", async () => {
    const { UnauthorizedError } = await import("@/server/auth/requireUser");
    const { GET } = await import("@/app/api/storycam-sessions/current/route");

    requireUserMock.mockRejectedValue(new UnauthorizedError());

    const response = await GET();

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "authentication_required"
    });
  });

  it("returns an empty restore result when the user has no generated story", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/current/route");
    const client = new FakeSupabaseClient({
      sessions: [sessionRow({ id: "empty-session", updated_at: "2026-04-28T10:00:00.000Z" })]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      restored: false
    });
  });

  it("skips newer empty drafts and restores the latest generated story world", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/current/route");
    const client = new FakeSupabaseClient({
      artifactsBySession: {
        "story-session": storyWorldArtifacts("story-session")
      },
      sessions: [
        sessionRow({ id: "empty-session", updated_at: "2026-04-28T11:00:00.000Z" }),
        sessionRow({ id: "story-session", updated_at: "2026-04-28T10:00:00.000Z", video_aspect_ratio: "9:16" })
      ]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({
      coreGroupTargetCount: 1,
      currentStep: "story-world",
      ok: true,
      restored: true,
      sessionId: "story-session",
      storyWorldConfirmed: false,
      videoAspectRatio: "9:16",
      storyboard: null,
      storyWorld: {
        artifacts: {
          characterAssets: [{ id: "character-artifact-1", type: "character_asset", version: 1 }],
          sceneAssets: [{ id: "scene-artifact-1", type: "scene_asset", version: 1 }],
          script: { id: "script-artifact-1", type: "script", version: 1 }
        },
        videoAspectRatio: "9:16",
        sessionId: "story-session",
        storyWorld: {
          characterAssets: [expect.objectContaining({ name: "她" })],
          sceneAssets: [expect.objectContaining({ name: "便利店外的玻璃反光" })],
          script: expect.objectContaining({ title: "雨夜未发送" })
        }
      }
    });
    expect(body.storyWorld.storyWorld.script.qualityChecks).toEqual(["剧本已转成可见动作和可听声音。"]);
    expect(body.storyWorld.storyWorld.script).not.toHaveProperty("directorBrief");
    expect(JSON.stringify(body)).not.toContain("shotDensity");
  });

  it("restores storyboard groups and private image signed urls without exposing storage paths", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/current/route");
    const client = new FakeSupabaseClient({
      artifactsBySession: {
        "storyboard-session": [
          ...storyWorldArtifacts("storyboard-session"),
          storyboardScriptArtifact("storyboard-script-artifact-1", "core-artifact-1", "storyboard-session"),
          coreGroupArtifact("core-artifact-1", "storyboard-session"),
          expandedCardArtifact("expanded-card-artifact-1", "core-artifact-1", "storyboard-session")
        ]
      },
      mediaBySession: {
        "storyboard-session": [
          mediaRow({
            id: "asset-media-1",
            linked_artifact_id: "character-artifact-1",
            session_id: "storyboard-session",
            storage_path: "users/user-1/sessions/storyboard-session/generated/private-character.png"
          }),
          mediaRow({
            id: "core-media-1",
            linked_artifact_id: "core-artifact-1",
            session_id: "storyboard-session",
            storage_path: "users/user-1/sessions/storyboard-session/generated/private-core.png"
          }),
          mediaRow({
            id: "expanded-media-1",
            linked_artifact_id: "expanded-card-artifact-1",
            session_id: "storyboard-session",
            storage_path: "users/user-1/sessions/storyboard-session/generated/private-expanded.png"
          })
        ]
      },
      sessions: [
        sessionRow({
          core_group_target_count: 1,
          id: "storyboard-session",
          planned_duration_seconds: 15,
          updated_at: "2026-04-28T10:00:00.000Z"
        })
      ]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      currentStep: "core-storyboard",
      restored: true,
      storyWorldConfirmed: true,
      storyboard: {
        artifacts: {
          coreStoryboardGroups: [{ id: "core-artifact-1", type: "core_storyboard_group", version: 1 }],
          storyboardScript: { id: "storyboard-script-artifact-1", type: "storyboard_script", version: 1 }
        },
        durationPlan: {
          clipDurationTargets: [15],
          coreGroupTargetCount: 1,
          plannedDurationSeconds: 15
        },
        storyboard: {
          coreStoryboardGroups: [
            expect.objectContaining({
              representativeImage: expect.objectContaining({
                mediaId: "core-media-1",
                signedUrl: "signed://storycam-generated/users%2Fuser-1%2Fsessions%2Fstoryboard-session%2Fgenerated%2Fprivate-core.png"
              }),
              expandedStoryboardImages: [
                expect.objectContaining({
                  mediaId: "expanded-media-1"
                })
              ]
            })
          ]
        }
      },
      storyWorld: {
        assetImagesByArtifactId: {
          "character-artifact-1": expect.objectContaining({
            id: "asset-media-1",
            signedUrl: "signed://storycam-generated/users%2Fuser-1%2Fsessions%2Fstoryboard-session%2Fgenerated%2Fprivate-character.png"
          })
        }
      }
    });
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("storage_bucket");
  });

  it("restores running storyboard image jobs without falling back to a resubmittable placeholder", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/current/route");
    const client = new FakeSupabaseClient({
      artifactsBySession: {
        "storyboard-session": [
          ...storyWorldArtifacts("storyboard-session"),
          storyboardScriptArtifact("storyboard-script-artifact-1", "core-artifact-1", "storyboard-session"),
          coreGroupArtifact("core-artifact-1", "storyboard-session")
        ]
      },
      generationJobsBySession: {
        "storyboard-session": [
          generationJobRow({
            id: "storyboard-image-job-1",
            output_artifact_id: "core-artifact-1",
            provider_kind: "image",
            session_id: "storyboard-session",
            status: "running",
            type: "storyboard_image"
          })
        ]
      },
      sessions: [
        sessionRow({
          core_group_target_count: 1,
          id: "storyboard-session",
          planned_duration_seconds: 15,
          updated_at: "2026-04-28T10:00:00.000Z"
        })
      ]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      storyboard: {
        storyboard: {
          coreStoryboardGroups: [
            expect.objectContaining({
              representativeImage: {
                jobId: "storyboard-image-job-1",
                placeholder: true,
                status: "generating"
              }
            })
          ]
        }
      }
    });
  });

  it("restores generated clip and final work progress so later steps stay reachable", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/current/route");
    const client = new FakeSupabaseClient({
      artifactsBySession: {
        "export-session": [
          ...storyWorldArtifacts("export-session"),
          storyboardScriptArtifact("storyboard-script-artifact-1", "core-artifact-1", "export-session"),
          coreGroupArtifact("core-artifact-1", "export-session"),
          generatedClipArtifact("generated-clip-artifact-1", "export-session"),
          finalWorkArtifact("final-work-artifact-1", "export-session")
        ]
      },
      generationJobsBySession: {
        "export-session": [
          generationJobRow({
            id: "clip-job-1",
            output_artifact_id: "generated-clip-artifact-1",
            session_id: "export-session",
            status: "succeeded",
            updated_at: "2026-04-28T09:20:00.000Z"
          })
        ]
      },
      mediaBySession: {
        "export-session": [
          mediaRow({
            id: "clip-media-1",
            kind: "generated_clip",
            mime_type: "video/mp4",
            session_id: "export-session",
            storage_path: "users/user-1/sessions/export-session/generated/clips/clip.mp4"
          }),
          mediaRow({
            id: "final-media-1",
            kind: "final_work",
            mime_type: "video/mp4",
            session_id: "export-session",
            storage_path: "users/user-1/sessions/export-session/generated/final/final.mp4"
          })
        ]
      },
      sessions: [
        sessionRow({
          core_group_target_count: 1,
          id: "export-session",
          planned_duration_seconds: 15,
          updated_at: "2026-04-28T10:00:00.000Z"
        })
      ]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      clipJob: {
        id: "clip-job-1",
        outputArtifactId: "generated-clip-artifact-1",
        outputPreview: {
          durationSeconds: 15,
          signedUrl: "signed://storycam-generated/users%2Fuser-1%2Fsessions%2Fexport-session%2Fgenerated%2Fclips%2Fclip.mp4"
        },
        status: "succeeded"
      },
      currentStep: "export",
      finalWork: {
        finalWork: { id: "final-work-artifact-1", type: "final_work", version: 1 },
        media: { id: "final-media-1", kind: "final_work", mimeType: "video/mp4" },
        preview: {
          durationSeconds: 15,
          signedUrl: "signed://storycam-generated/users%2Fuser-1%2Fsessions%2Fexport-session%2Fgenerated%2Ffinal%2Ffinal.mp4"
        }
      },
      restored: true
    });
  });
});

describe("GET /api/storycam-sessions/recent", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("returns an empty recent project list when there are no restorable sessions", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/recent/route");
    const client = new FakeSupabaseClient({
      sessions: [sessionRow({ id: "empty-session", updated_at: "2026-04-28T11:00:00.000Z" })]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-sessions/recent"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      projects: []
    });
  });

  it("skips empty drafts and returns recent project summaries with private thumbnails", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/recent/route");
    const client = new FakeSupabaseClient({
      artifactsBySession: {
        "story-session": storyWorldArtifacts("story-session"),
        "storyboard-session": [
          ...storyWorldArtifacts("storyboard-session"),
          storyboardScriptArtifact("storyboard-script-artifact-1", "core-artifact-1", "storyboard-session"),
          coreGroupArtifact("core-artifact-1", "storyboard-session")
        ]
      },
      mediaBySession: {
        "story-session": [
          mediaRow({
            id: "asset-media-1",
            linked_artifact_id: "character-artifact-1",
            session_id: "story-session",
            storage_path: "users/user-1/sessions/story-session/generated/private-character.png"
          })
        ],
        "storyboard-session": [
          mediaRow({
            id: "core-media-1",
            linked_artifact_id: "core-artifact-1",
            session_id: "storyboard-session",
            storage_path: "users/user-1/sessions/storyboard-session/generated/private-core.png"
          })
        ]
      },
      sessions: [
        sessionRow({ id: "empty-session", updated_at: "2026-04-28T12:00:00.000Z" }),
        sessionRow({ core_group_target_count: 2, id: "storyboard-session", updated_at: "2026-04-28T11:00:00.000Z", video_aspect_ratio: "9:16" }),
        sessionRow({ id: "story-session", updated_at: "2026-04-28T10:00:00.000Z" })
      ]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-sessions/recent?limit=5"));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      projects: [
        {
          coreGroupTargetCount: 2,
          currentStep: "core-storyboard",
          sessionId: "storyboard-session",
          summary: "冷白灯、雨水和玻璃反光让两个人短暂同框。",
          thumbnail: expect.objectContaining({
            id: "core-media-1",
            signedUrl: "signed://storycam-generated/users%2Fuser-1%2Fsessions%2Fstoryboard-session%2Fgenerated%2Fprivate-core.png"
          }),
          title: "雨夜未发送",
          updatedAt: "2026-04-28T11:00:00.000Z",
          videoAspectRatio: "9:16"
        },
        {
          currentStep: "story-world",
          sessionId: "story-session",
          thumbnail: expect.objectContaining({
            id: "asset-media-1"
          }),
          title: "雨夜未发送"
        }
      ]
    });
    expect(serialized).not.toContain("storage_path");
    expect(serialized).not.toContain("storage_bucket");
  });

  it("looks past many newer empty drafts when building recent project summaries", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/recent/route");
    const emptySessions = Array.from({ length: 12 }, (_, index) =>
      sessionRow({
        id: `empty-session-${index + 1}`,
        updated_at: `2026-04-28T12:${String(index).padStart(2, "0")}:00.000Z`
      })
    );
    const client = new FakeSupabaseClient({
      artifactsBySession: {
        "story-session": storyWorldArtifacts("story-session")
      },
      sessions: [
        ...emptySessions,
        sessionRow({ id: "story-session", updated_at: "2026-04-28T10:00:00.000Z" })
      ]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-sessions/recent?limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      projects: [
        {
          currentStep: "story-world",
          sessionId: "story-session",
          title: "雨夜未发送"
        }
      ]
    });
  });

  it("skips corrupt historical projects instead of failing the whole recent list", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/recent/route");
    const client = new FakeSupabaseClient({
      artifactsBySession: {
        "corrupt-session": corruptStoryWorldArtifacts("corrupt-session"),
        "story-session": storyWorldArtifacts("story-session")
      },
      sessions: [
        sessionRow({ id: "corrupt-session", updated_at: "2026-04-28T11:00:00.000Z" }),
        sessionRow({ id: "story-session", updated_at: "2026-04-28T10:00:00.000Z" })
      ]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-sessions/recent?limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      projects: [
        {
          currentStep: "story-world",
          sessionId: "story-session",
          title: "雨夜未发送"
        }
      ]
    });
  });

  it("caps recent project summaries at twenty so the drawer can scroll without over-fetching", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/recent/route");
    const sessions = Array.from({ length: 25 }, (_, index) => {
      const sessionId = `story-session-${index + 1}`;

      return sessionRow({
        id: sessionId,
        updated_at: `2026-04-28T10:${String(59 - index).padStart(2, "0")}:00.000Z`
      });
    });
    const client = new FakeSupabaseClient({
      artifactsBySession: Object.fromEntries(
        sessions.map((session) => {
          const sessionId = (session as { id: string }).id;

          return [sessionId, storyWorldArtifacts(sessionId)];
        })
      ),
      sessions
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-sessions/recent?limit=99"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects).toHaveLength(20);
    expect(body.projects[0]).toMatchObject({ sessionId: "story-session-1" });
    expect(body.projects[19]).toMatchObject({ sessionId: "story-session-20" });
  });
});

describe("GET /api/storycam-sessions/[id]/restore", () => {
  beforeEach(() => {
    vi.resetModules();
    requireUserMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
  });

  it("restores a selected project by session id", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/[id]/restore/route");
    const client = new FakeSupabaseClient({
      artifactsBySession: {
        "story-session": storyWorldArtifacts("story-session")
      },
      sessions: [sessionRow({ id: "story-session", updated_at: "2026-04-28T10:00:00.000Z" })]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-sessions/story-session/restore"), {
      params: { id: "story-session" }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      currentStep: "story-world",
      restored: true,
      sessionId: "story-session",
      storyWorld: {
        storyWorld: {
          script: expect.objectContaining({ title: "雨夜未发送" })
        }
      }
    });
  });

  it("returns not_found for a selected session that does not belong to the user or is not restorable", async () => {
    const { GET } = await import("@/app/api/storycam-sessions/[id]/restore/route");
    const client = new FakeSupabaseClient({
      sessions: [sessionRow({ id: "empty-session", updated_at: "2026-04-28T10:00:00.000Z" })]
    });

    requireUserMock.mockResolvedValue({ id: "user-1" });
    createSupabaseAdminClientMock.mockReturnValue(client.asSupabaseClient());

    const response = await GET(new Request("https://storycam.test/api/storycam-sessions/missing/restore"), {
      params: { id: "missing" }
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "not_found",
      redactedError: "StoryCam project was not found.",
      redactionApplied: true
    });
  });
});

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    core_group_target_count: 1,
    created_at: "2026-04-28T09:00:00.000Z",
    deleted_at: null,
    generation_mode: "mock",
    id: "session-1",
    planned_duration_seconds: 15,
    status: "draft",
    updated_at: "2026-04-28T09:00:00.000Z",
    user_id: "user-1",
    video_aspect_ratio: "16:9",
    ...overrides
  };
}

function artifactRow(id: string, type: string, sessionId: string, dataJson: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-04-28T09:01:00.000Z",
    data_json: dataJson,
    deleted_at: null,
    depends_on_json: {},
    id,
    parent_artifact_id: null,
    session_id: sessionId,
    stale_at: null,
    state: "ready",
    type,
    updated_at: "2026-04-28T09:01:00.000Z",
    user_id: "user-1",
    version: 1,
    ...overrides
  };
}

function storyWorldArtifacts(sessionId: string) {
  return [
    artifactRow("script-artifact-1", "script", sessionId, {
      beats: ["她站在屋檐下看着未发送短信。"],
      directorBrief: {
        dialogueStrategy: "少台词，以动作和停顿表达。",
        microRhythm: "0-3秒建立雨夜等待，3-8秒推进删短信动作，8-12秒用门铃触发反应，12-15秒留在玻璃倒影。",
        shotDensity: "慢进入，门铃后轻微加速，最后停住。",
        shotSizeFocus: "中景到近景，再回到空镜。",
        soundStrategy: "雨声持续，门铃作为转折，低声配乐托底。",
        tone: "雨夜、私人、克制",
        transitionStrategy: "用声音先行和动作反应连接。",
        userFacingSummary: "这一段会先安静等待，再让门铃把情绪推到玻璃倒影里。",
        visualMotifs: ["雨声", "玻璃倒影", "未发送短信"]
      },
      id: "script-story",
      logline: "她在雨夜便利店门口，把一条没有发出的告白短信删了又写。",
      qualityChecks: ["剧本已转成可见动作和可听声音。"],
      sessionId,
      state: "ready",
      summary: "冷白灯、雨水和玻璃反光让两个人短暂同框。",
      title: "雨夜未发送",
      version: 1
    }),
    artifactRow("character-artifact-1", "character_asset", sessionId, {
      consistencyNotes: ["手机始终握在右手"],
      emotionalBaseline: "克制、犹豫。",
      id: "character-story",
      name: "她",
      props: ["手机"],
      referenceMediaIds: [],
      relationshipToUserStory: "承载暗恋记忆。",
      role: "暗恋者",
      sessionId,
      stableVisualDescription: "二十多岁的普通女生，浅色风衣。",
      state: "ready",
      version: 1,
      wardrobe: "浅色风衣。"
    }),
    artifactRow("scene-artifact-1", "scene_asset", sessionId, {
      atmosphere: "潮湿、安静。",
      id: "scene-story",
      keyObjects: ["玻璃门"],
      light: "冷白便利店灯。",
      location: "雨夜街角便利店门口",
      name: "便利店外的玻璃反光",
      referenceMediaIds: [],
      sessionId,
      spatialLogic: "玻璃门让两人的倒影短暂重叠。",
      state: "ready",
      timeOfDay: "night",
      version: 1
    })
  ];
}

function corruptStoryWorldArtifacts(sessionId: string) {
  const [scriptRow, ...assetRows] = storyWorldArtifacts(sessionId);

  return [
    {
      ...scriptRow,
      data_json: {
        ...scriptRow.data_json,
        summary: ""
      }
    },
    ...assetRows
  ];
}

function coreGroupArtifact(id: string, sessionId: string) {
  return artifactRow(
    id,
    "core_storyboard_group",
    sessionId,
    {
      characterAssetIds: ["character-story"],
      emotionalTurn: "想说出口",
      estimatedClipDurationSeconds: 15,
      expandedCardIds: [],
      id: "core-group-1",
      sceneAssetId: "scene-story",
      sessionId,
      state: "ready",
      storyPurpose: "建立她和未发送短信之间的私人情绪。",
      title: "未发送短信",
      version: 1
    },
    {
      created_at: "2026-04-28T09:05:00.000Z",
      depends_on_json: {
        "character-artifact-1": 1,
        "scene-artifact-1": 1,
        "script-artifact-1": 1
      }
    }
  );
}

function storyboardScriptArtifact(id: string, parentArtifactId: string, sessionId: string) {
  return artifactRow(
    id,
    "storyboard_script",
    sessionId,
    {
      id: "storyboard-script-1",
      mainImagePrompt: "A rainy convenience-store storyboard frame.",
      planSummary: "用一个克制雨夜时刻讲完一次没有说出口的暗恋。",
      plannedDurationSeconds: 15,
      rhythm: "慢进入，短暂停顿，安静离开",
      sessionId,
      state: "ready",
      tone: "韩剧雨夜，私人回忆",
      version: 1
    },
    {
      created_at: "2026-04-28T09:06:00.000Z",
      parent_artifact_id: parentArtifactId
    }
  );
}

function expandedCardArtifact(id: string, parentArtifactId: string, sessionId: string) {
  return artifactRow(
    id,
    "expanded_storyboard_card",
    sessionId,
    {
      beatType: "action",
      coreGroupId: "core-group-1",
      description: "她低头删掉短信。",
      guidance: "手部小动作。",
      id: "expanded-card-1",
      sessionId,
      sortOrder: 0,
      state: "ready",
      title: "删掉短信",
      version: 1
    },
    {
      created_at: "2026-04-28T09:07:00.000Z",
      parent_artifact_id: parentArtifactId
    }
  );
}

function generatedClipArtifact(id: string, sessionId: string) {
  return artifactRow(id, "generated_clip", sessionId, {
    clipPromptPacketId: "clip-packet-1",
    coreGroupId: "core-group-1",
    durationSeconds: 15,
    id: "generated-clip-1",
    jobId: "clip-job-1",
    mediaAssetId: "clip-media-1",
    providerName: "mock",
    reviewState: "pending",
    sessionId,
    state: "ready",
    version: 1
  });
}

function finalWorkArtifact(id: string, sessionId: string) {
  return artifactRow(id, "final_work", sessionId, {
    durationSeconds: 15,
    generatedClipIds: ["generated-clip-1"],
    id: "final-work-1",
    mediaAssetId: "final-media-1",
    previewStatus: "ready",
    sessionId,
    state: "ready",
    version: 1
  });
}

function generationJobRow(overrides: Record<string, unknown> = {}) {
  return {
    attempts: 0,
    created_at: "2026-04-28T09:15:00.000Z",
    ended_at: null,
    error_code: null,
    generation_mode: "mock",
    id: "clip-job-1",
    idempotency_key_hash: "job-hash",
    input_artifact_versions_json: {},
    max_attempts: 1,
    output_artifact_id: null,
    provider_error_category: null,
    provider_http_status: null,
    provider_kind: "video",
    provider_name: "mock",
    provider_request_id: null,
    redacted_error: null,
    session_id: "session-1",
    started_at: null,
    status: "queued",
    tombstoned_at: null,
    type: "video_clip",
    updated_at: "2026-04-28T09:15:00.000Z",
    user_id: "user-1",
    ...overrides
  };
}

function mediaRow(overrides: Record<string, unknown>) {
  return {
    byte_size: 123,
    created_at: "2026-04-28T09:08:00.000Z",
    deleted_at: null,
    id: "media-1",
    kind: "thumbnail",
    linked_artifact_id: null,
    mime_type: "image/png",
    session_id: "session-1",
    source: "provider",
    storage_bucket: "storycam-generated",
    storage_path: "users/user-1/sessions/session-1/generated/private.png",
    user_id: "user-1",
    ...overrides
  };
}

type FakeSupabaseClientOptions = {
  artifactsBySession?: Record<string, unknown[]>;
  generationJobsBySession?: Record<string, unknown[]>;
  mediaBySession?: Record<string, unknown[]>;
  sessions?: unknown[];
};

class FakeSupabaseClient {
  readonly storage = {
    from: (bucket: string) => ({
      createSignedUrl: (path: string) =>
        Promise.resolve({
          data: { signedUrl: `signed://${bucket}/${encodeURIComponent(path)}` },
          error: null
        })
    })
  };

  constructor(private readonly options: FakeSupabaseClientOptions = {}) {}

  asSupabaseClient() {
    return this;
  }

  from(table: string) {
    return new FakeQuery(table, this.options);
  }
}

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  private limitCount: number | null = null;

  constructor(
    private readonly table: string,
    private readonly options: FakeSupabaseClientOptions
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order() {
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: this.rows()[0] ?? null,
      error: null
    });
  }

  then(resolve: (value: { data: unknown[]; error: null }) => void, reject?: (reason: unknown) => void) {
    return Promise.resolve({ data: this.rows(), error: null }).then(resolve, reject);
  }

  private rows() {
    if (this.table === "storycam_sessions") {
      const rows = this.options.sessions ?? [];
      const filtered = rows.filter((row) =>
        this.filters.every(([column, value]) => {
          if (column === "id") {
            return (row as { id?: unknown }).id === value;
          }

          if (column === "user_id") {
            return (row as { user_id?: unknown }).user_id === value;
          }

          if (column === "deleted_at") {
            return (row as { deleted_at?: unknown }).deleted_at === value;
          }

          return true;
        })
      );

      return filtered.slice(0, this.limitCount ?? undefined);
    }

    if (this.table === "storycam_artifacts") {
      const sessionId = this.filters.find(([column]) => column === "session_id")?.[1] as string | undefined;
      return sessionId ? (this.options.artifactsBySession?.[sessionId] ?? []) : [];
    }

    if (this.table === "media_assets") {
      const sessionId = this.filters.find(([column]) => column === "session_id")?.[1] as string | undefined;
      return sessionId ? (this.options.mediaBySession?.[sessionId] ?? []) : [];
    }

    if (this.table === "generation_jobs") {
      const sessionId = this.filters.find(([column]) => column === "session_id")?.[1] as string | undefined;
      return sessionId ? (this.options.generationJobsBySession?.[sessionId] ?? []) : [];
    }

    return [];
  }
}
