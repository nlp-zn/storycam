import type { ArtifactType, ClipPromptPacket, VersionedArtifact } from "./artifacts";

export class StaleArtifactError extends Error {
  constructor(message = "Artifact is stale and must be regenerated before continuing.") {
    super(message);
    this.name = "StaleArtifactError";
  }
}

const directDownstreamTypes: Record<ArtifactType, readonly ArtifactType[]> = {
  input: [
    "script",
    "character_asset",
    "scene_asset",
    "storyboard_script",
    "core_storyboard_group",
    "expanded_storyboard_card",
    "clip_prompt_packet",
    "generated_clip",
    "stitch_suggestion",
    "final_work",
    "quality_check"
  ],
  script: [
    "storyboard_script",
    "core_storyboard_group",
    "expanded_storyboard_card",
    "clip_prompt_packet",
    "generated_clip",
    "stitch_suggestion",
    "final_work",
    "quality_check"
  ],
  character_asset: [
    "storyboard_script",
    "core_storyboard_group",
    "expanded_storyboard_card",
    "clip_prompt_packet",
    "generated_clip",
    "stitch_suggestion",
    "final_work",
    "quality_check"
  ],
  scene_asset: [
    "storyboard_script",
    "core_storyboard_group",
    "expanded_storyboard_card",
    "clip_prompt_packet",
    "generated_clip",
    "stitch_suggestion",
    "final_work",
    "quality_check"
  ],
  storyboard_script: [
    "core_storyboard_group",
    "expanded_storyboard_card",
    "clip_prompt_packet",
    "generated_clip",
    "stitch_suggestion",
    "final_work",
    "quality_check"
  ],
  core_storyboard_group: [
    "expanded_storyboard_card",
    "clip_prompt_packet",
    "generated_clip",
    "stitch_suggestion",
    "final_work",
    "quality_check"
  ],
  expanded_storyboard_card: ["clip_prompt_packet", "generated_clip", "stitch_suggestion", "final_work", "quality_check"],
  clip_prompt_packet: ["generated_clip", "stitch_suggestion", "final_work", "quality_check"],
  generated_clip: ["stitch_suggestion", "final_work", "quality_check"],
  stitch_suggestion: ["final_work", "quality_check"],
  final_work: ["quality_check"],
  quality_check: []
};

export function getDownstreamArtifactTypes(artifactType: ArtifactType): ArtifactType[] {
  const seen = new Set<ArtifactType>();
  const queue = [...directDownstreamTypes[artifactType]];

  while (queue.length > 0) {
    const nextType = queue.shift();

    if (!nextType || seen.has(nextType)) {
      continue;
    }

    seen.add(nextType);
    queue.push(...directDownstreamTypes[nextType]);
  }

  return [...seen];
}

export function markDownstreamArtifactsStale(
  artifacts: readonly VersionedArtifact[],
  editedArtifact: Pick<VersionedArtifact, "id" | "sessionId" | "type">
): VersionedArtifact[] {
  const downstreamTypes = new Set(getDownstreamArtifactTypes(editedArtifact.type));
  const staleArtifactIds = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;

    for (const artifact of artifacts) {
      if (artifact.sessionId !== editedArtifact.sessionId || artifact.id === editedArtifact.id) {
        continue;
      }

      const isTypeDownstream = downstreamTypes.has(artifact.type);
      const dependsOnEditedArtifact = Boolean(artifact.dependsOn?.[editedArtifact.id]);
      const dependsOnStaleArtifact = Object.keys(artifact.dependsOn ?? {}).some((artifactId) =>
        staleArtifactIds.has(artifactId)
      );

      if ((isTypeDownstream || dependsOnEditedArtifact || dependsOnStaleArtifact) && !staleArtifactIds.has(artifact.id)) {
        staleArtifactIds.add(artifact.id);
        changed = true;
      }
    }
  }

  return artifacts.map((artifact) => {
    if (!staleArtifactIds.has(artifact.id)) {
      return artifact;
    }

    return {
      ...artifact,
      state: "stale"
    };
  });
}

export function canGenerateClipFromPacket(packet: Pick<ClipPromptPacket, "state">) {
  return packet.state === "ready";
}

export function assertCanGenerateClipFromPacket(packet: Pick<ClipPromptPacket, "state">) {
  if (!canGenerateClipFromPacket(packet)) {
    throw new StaleArtifactError();
  }
}
