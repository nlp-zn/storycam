import type { CreateStoryWorldResponse } from "./storycamApi";
import type { CreateStoryboardResponse, ExpandStoryboardGroupResponse } from "./storycamApi";

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

export function confirmedArtifactVersionsForClip(
  storyboard: CreateStoryboardResponse,
  coreGroupIndex: number,
  expansion?: ExpandStoryboardGroupResponse | null
) {
  const coreGroup = storyboard.artifacts.coreStoryboardGroups[coreGroupIndex];

  if (!coreGroup) {
    return {};
  }

  return {
    [coreGroup.id]: coreGroup.version,
    ...Object.fromEntries(
      (expansion?.expandedStoryboardCards ?? [])
        .filter((card) => card.parentArtifactId === coreGroup.id)
        .map((card) => [card.id, card.version])
    )
  };
}
