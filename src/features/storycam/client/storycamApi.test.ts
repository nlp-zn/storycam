import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoryCamRestoreCache, getAuthStatus, listRecentStoryCamProjects, restoreStoryCamSession } from "./storycamApi";

describe("storycamApi browser cache privacy", () => {
  let storedItems: Array<[string, string]>;
  let removedKeys: string[];
  let storage: Map<string, string>;

  beforeEach(() => {
    storedItems = [];
    removedKeys = [];
    storage = new Map();

    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
        get length() {
          return storage.size;
        },
        removeItem: vi.fn((key: string) => {
          removedKeys.push(key);
          storage.delete(key);
        }),
        setItem: vi.fn((key: string, value: string) => {
          storedItems.push([key, value]);
          storage.set(key, value);
        })
      }
    });
  });

  afterEach(() => {
    clearStoryCamRestoreCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not persist restored signed media URLs in sessionStorage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          currentStep: "storyboard",
          ok: true,
          restored: true,
          sessionId: "session-1",
          storyWorld: {
            assetImagesByArtifactId: {
              "asset-1": {
                id: "media-1",
                mimeType: "image/png",
                signedUrl: "https://signed.example/story-world.png?token=secret",
                signedUrlExpiresIn: 300
              }
            }
          }
        })
      )
    );

    await restoreStoryCamSession("session-1");

    expect(storedItems).toEqual([
      [
        "storycam:restore:v1:current-session-id",
        JSON.stringify({
          sessionId: "session-1",
          userId: "unknown"
        })
      ]
    ]);
    expect(JSON.stringify(storedItems)).not.toContain("https://signed.example");
    expect(JSON.stringify(storedItems)).not.toContain("token=secret");
  });

  it("does not persist recent-project thumbnail signed URLs in sessionStorage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          projects: [
            {
              coreGroupTargetCount: 1,
              currentStep: "storyboard",
              sessionId: "session-1",
              summary: "A quiet memory.",
              thumbnail: {
                id: "media-1",
                mimeType: "image/png",
                signedUrl: "https://signed.example/thumb.png?token=secret",
                signedUrlExpiresIn: 300
              },
              title: "Memory",
              updatedAt: "2026-06-05T00:00:00.000Z",
              videoAspectRatio: "16:9"
            }
          ]
        })
      )
    );

    await listRecentStoryCamProjects();

    expect(storedItems).toEqual([]);
    expect(removedKeys).toEqual([]);
  });

  it("purges legacy persisted restore payloads without removing the current restore target", async () => {
    storage.set(
      "storycam:restore:v1:session:session-1",
      JSON.stringify({
        expiresAtMs: Date.now() + 60_000,
        value: {
          ok: true,
          restored: true,
          storyWorld: {
            assetImagesByArtifactId: {
              "asset-1": {
                signedUrl: "https://signed.example/legacy.png?token=secret"
              }
            }
          }
        }
      })
    );
    storage.set(
      "storycam:restore:v1:current-session-id",
      JSON.stringify({
        sessionId: "session-1",
        userId: "user-1"
      })
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          authenticated: true,
          user: {
            email: "user@example.test",
            id: "user-1"
          }
        })
      )
    );

    await getAuthStatus();

    expect(removedKeys).toContain("storycam:restore:v1:session:session-1");
    expect(storage.has("storycam:restore:v1:session:session-1")).toBe(false);
    expect(storage.has("storycam:restore:v1:current-session-id")).toBe(true);
    expect(JSON.stringify(Array.from(storage.values()))).not.toContain("https://signed.example");
    expect(JSON.stringify(Array.from(storage.values()))).not.toContain("token=secret");
  });
});
