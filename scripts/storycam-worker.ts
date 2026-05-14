import { installWorkerServerOnlyShim } from "./storycam-worker-server-only-shim";

installWorkerServerOnlyShim();

const controller = new AbortController();

process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

void import("../src/server/monitoring/sentryWorker")
  .then(({ initStoryCamWorkerSentry }) => {
    initStoryCamWorkerSentry();
    return import("../src/server/storycam/generationWorker");
  })
  .then(({ runStoryCamWorker }) => runStoryCamWorker({ signal: controller.signal }))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "StoryCam worker crashed.");
    process.exit(1);
  });
