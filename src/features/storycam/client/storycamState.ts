import type { CreateStoryWorldResponse } from "./storycamApi";

export type StoryboardStatus = "idle" | "generating" | "ready" | "stale" | "error";

export function confirmedArtifactVersionsFromStoryWorld(response: CreateStoryWorldResponse) {
  return {
    [response.artifacts.script.id]: response.artifacts.script.version,
    ...Object.fromEntries(response.artifacts.characterAssets.map((asset) => [asset.id, asset.version])),
    ...Object.fromEntries(response.artifacts.sceneAssets.map((asset) => [asset.id, asset.version]))
  };
}

export function staleStoryboardAfterStoryWorldEdit(status: StoryboardStatus): StoryboardStatus {
  return status === "ready" || status === "error" ? "stale" : status;
}
