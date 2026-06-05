import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoryCamRestoreCache, listRecentStoryCamProjects, restoreStoryCamSession } from "./storycamApi";

describe("storycamApi browser cache privacy", () => {
  let storedItems: Array<[string, string]>;
  let removedKeys: string[];

  beforeEach(() => {
    storedItems = [];
    removedKeys = [];

    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: vi.fn(() => null),
        key: vi.fn(() => null),
        get length() {
          return 0;
        },
        removeItem: vi.fn((key: string) => {
          removedKeys.push(key);
        }),
        setItem: vi.fn((key: string, value: string) => {
          storedItems.push([key, value]);
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
});
