import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSessionMock = vi.hoisted(() => vi.fn(async () => new Response(null, { status: 204 })));

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: updateSessionMock
}));

import { proxy } from "./proxy";

describe("StoryCam proxy", () => {
  beforeEach(() => {
    updateSessionMock.mockClear();
  });

  it("rejects unsafe cross-origin API requests before refreshing the session", async () => {
    const response = await proxy(
      request("https://storycam.example.com/api/final-work", {
        headers: { origin: "https://evil.example" },
        method: "POST"
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "origin_not_allowed",
      redactionApplied: true
    });
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("refreshes the session for same-origin unsafe API requests", async () => {
    const response = await proxy(
      request("https://storycam.example.com/api/final-work", {
        headers: { origin: "https://storycam.example.com" },
        method: "POST"
      })
    );

    expect(response.status).toBe(204);
    expect(updateSessionMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the origin guard scoped to API routes", async () => {
    const response = await proxy(
      request("https://storycam.example.com/storycam", {
        headers: { origin: "https://evil.example" },
        method: "POST"
      })
    );

    expect(response.status).toBe(204);
    expect(updateSessionMock).toHaveBeenCalledTimes(1);
  });
});

function request(url: string, init?: RequestInit) {
  return new Request(url, init) as NextRequest;
}
