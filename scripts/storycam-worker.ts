import { initStoryCamWorkerSentry } from "../src/server/monitoring/sentryWorker";
import { runStoryCamWorker } from "../src/server/storycam/generationWorker";

initStoryCamWorkerSentry();

const controller = new AbortController();

process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

void runStoryCamWorker({ signal: controller.signal }).catch((error) => {
  console.error(error instanceof Error ? error.message : "StoryCam worker crashed.");
  process.exit(1);
});
