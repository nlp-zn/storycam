import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { installWorkerServerOnlyShim } from "../../scripts/storycam-worker-server-only-shim";

describe("installWorkerServerOnlyShim", () => {
  it("lets the raw Node worker treat Next server-only markers as no-ops", () => {
    const workerRequire = createRequire(import.meta.url);
    const serverOnlyPath = workerRequire.resolve("server-only");

    delete workerRequire.cache[serverOnlyPath];

    expect(() => workerRequire("server-only")).toThrow(/Client Component/);

    installWorkerServerOnlyShim();

    expect(() => workerRequire("server-only")).not.toThrow();
  });
});
