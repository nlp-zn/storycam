import { createRequire } from "node:module";

let installed = false;

export function installWorkerServerOnlyShim() {
  if (installed) {
    return;
  }

  const workerRequire = createRequire(import.meta.url);
  const serverOnlyPath = workerRequire.resolve("server-only");

  workerRequire.cache[serverOnlyPath] = {
    children: [],
    exports: {},
    filename: serverOnlyPath,
    id: serverOnlyPath,
    isPreloading: false,
    loaded: true,
    parent: null,
    path: serverOnlyPath,
    paths: []
  } as unknown as NodeJS.Module;

  installed = true;
}
