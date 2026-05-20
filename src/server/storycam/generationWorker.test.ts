import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageGenerationProvider } from "@/lib/providers/types";
import type { Database, GenerationJobRow } from "@/server/db/types";
import { installWorkerServerOnlyShim } from "../../../scripts/storycam-worker-server-only-shim";

describe("processStoryCamWorkerJob", () => {
  it("keeps the worker alive when marking a failed job also fails", async () => {
    installWorkerServerOnlyShim();
    const { processStoryCamWorkerJob } = await import("./generationWorker");
    const client = new FakeSupabaseClient({
      markFailedError: { code: "database_error" }
    });
    const logger = new FakeLogger();
    const job = generationJob({
      outputArtifactId: "expanded-card-1",
      providerRequestId: "provider-task-1",
      status: "running",
      type: "expanded_storyboard_image"
    });

    await expect(
      processStoryCamWorkerJob(
        {
          client: client.asSupabaseClient(),
          config: {
            generation: {
              finalWorkProvider: "mock",
              imageProvider: "mock",
              mode: "mock",
              multimodalProvider: "mock",
              textProvider: "mock",
              videoProvider: "mock"
            },
            media: {
              providerReferenceSignedUrlTtlSeconds: 3600
            },
            supabase: {
              anonKey: "anon",
              serviceRoleKey: "service",
              url: "https://storycam.example.supabase.co"
            }
          },
          imageProviders: {
            storyboard: throwingImageProvider()
          },
          logger,
          runAfterDelayMs: 10_000,
          videoProviders: {},
          workerId: "worker-1"
        },
        job
      )
    ).resolves.toBeUndefined();

    expect(client.generationJobUpdates).toContainEqual(expect.objectContaining({ status: "failed" }));
    expect(logger.errors.map((entry) => entry.message)).toEqual([
      "StoryCam worker job failed.",
      "StoryCam worker could not mark failed job."
    ]);
  });
});

class FakeLogger {
  readonly errors: Array<{ detail: unknown; message: string }> = [];

  error(message: string, detail?: unknown) {
    this.errors.push({ detail, message });
  }

  info() {}

  warn() {}
}

class FakeSupabaseClient {
  readonly generationJobUpdates: Array<Record<string, unknown>> = [];
  readonly queries: FakeQuery[] = [];

  constructor(private readonly options: { markFailedError?: { code?: string } } = {}) {}

  asSupabaseClient() {
    return this as unknown as SupabaseClient<Database>;
  }

  from(table: string) {
    const query = new FakeQuery(this, table);
    this.queries.push(query);
    return query;
  }

  listRows() {
    return [];
  }

  updateGenerationJob(value: Record<string, unknown>) {
    this.generationJobUpdates.push(value);

    return {
      data: null,
      error: this.options.markFailedError ?? null
    };
  }
}

class FakeQuery {
  private updated: Record<string, unknown> | null = null;

  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly table: string
  ) {}

  eq() {
    return this;
  }

  in() {
    return this;
  }

  is() {
    return this;
  }

  limit() {
    return this;
  }

  maybeSingle() {
    if (this.table === "generation_jobs" && this.updated) {
      return Promise.resolve(this.client.updateGenerationJob(this.updated));
    }

    return Promise.resolve({
      data: null,
      error: null
    });
  }

  order() {
    return Promise.resolve({
      data: this.client.listRows(),
      error: null
    });
  }

  select() {
    return this;
  }

  update(value: Record<string, unknown>) {
    this.updated = value;
    return this;
  }
}

function throwingImageProvider(): ImageGenerationProvider<unknown, never> & {
  resolveImageTask(taskId: string): Promise<never>;
  submitImageTask(input: unknown): Promise<never>;
} {
  return {
    providerKind: "image",
    providerName: "inference_sh",
    async generateImage() {
      throw new Error("unused");
    },
    async resolveImageTask() {
      throw new Error("provider failed");
    },
    async submitImageTask() {
      throw new Error("unused");
    }
  };
}

function generationJob(
  overrides: {
    outputArtifactId?: string | null;
    providerRequestId?: string | null;
    status?: GenerationJobRow["status"];
    type?: GenerationJobRow["type"];
  } = {}
): GenerationJobRow {
  return {
    attempts: 1,
    created_at: "2026-05-20T00:00:00.000Z",
    ended_at: null,
    error_code: null,
    generation_mode: "real",
    id: "job-1",
    idempotency_key_hash: "hash-1",
    input_artifact_versions_json: {},
    locked_at: "2026-05-20T00:00:00.000Z",
    locked_by: "worker-1",
    max_attempts: 1,
    output_artifact_id: overrides.outputArtifactId ?? null,
    premiere_ticket_id: null,
    provider_error_category: null,
    provider_http_status: null,
    provider_kind: "image",
    provider_name: "inference_sh",
    provider_request_id: overrides.providerRequestId ?? null,
    redacted_error: null,
    run_after: "2026-05-20T00:00:00.000Z",
    session_id: "session-1",
    started_at: "2026-05-20T00:00:00.000Z",
    status: overrides.status ?? "running",
    tombstoned_at: null,
    type: overrides.type ?? "expanded_storyboard_image",
    updated_at: "2026-05-20T00:00:00.000Z",
    user_id: "user-1"
  };
}
