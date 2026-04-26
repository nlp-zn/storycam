type ArtifactRef = {
  id: string;
  state: string;
  type: string;
  version: number;
};

export type UploadStoryCamPhotoResponse = {
  ok: true;
  media: {
    byteSize: number;
    id: string;
    kind: "uploaded_photo";
    mimeType: string;
  };
  sessionId: string;
  uploadedPhotoIds: string[];
  uploadedPhotoRefs: Array<{ mediaAssetId: string }>;
};

export type CreateStoryWorldResponse = {
  ok: true;
  artifacts: {
    characterAssets: ArtifactRef[];
    sceneAssets: ArtifactRef[];
    script: ArtifactRef;
  };
  sessionId: string;
  storyWorld: {
    characterAssets: Array<{
      emotionalBaseline: string;
      name: string;
      props: string[];
      relationshipToUserStory: string;
      role: string;
      stableVisualDescription: string;
      wardrobe?: string;
    }>;
    sceneAssets: Array<{
      atmosphere: string;
      keyObjects: string[];
      light: string;
      location: string;
      name: string;
      spatialLogic: string;
      timeOfDay: string;
    }>;
    script: {
      beats: string[];
      logline: string;
      summary: string;
      title: string;
      version: number;
    };
  };
};

export type CreateStoryboardResponse = {
  ok: true;
  artifacts: {
    coreStoryboardGroups: ArtifactRef[];
    storyboardScript: ArtifactRef;
  };
  durationPlan: {
    clipDurationTargets: number[];
    coreGroupTargetCount: 1 | 2 | 3;
    plannedDurationSeconds: number;
  };
  sessionId: string;
  storyboard: {
    coreStoryboardGroups: Array<{
      emotionalTurn: string;
      estimatedClipDurationSeconds: number;
      storyPurpose: string;
      title: string;
      version: number;
    }>;
    storyboardScript: {
      planSummary: string;
      plannedDurationSeconds: number;
      rhythm: string;
      tone: string;
      version: number;
    };
  };
};

export async function uploadStoryCamPhoto(input: { file: File; sessionId?: string }) {
  const formData = new FormData();
  formData.set("file", input.file);

  if (input.sessionId) {
    formData.set("sessionId", input.sessionId);
  }

  const response = await fetch("/api/uploads", {
    body: formData,
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "upload_failed"));
  }

  return (await response.json()) as UploadStoryCamPhotoResponse;
}

export async function createStoryWorld(input: {
  input: string;
  lightweightChoices: string[];
  plannedDurationSeconds?: number;
  sessionId?: string;
  uploadedPhotoIds?: string[];
}) {
  const response = await fetch("/api/story-world", {
    body: JSON.stringify({
      generationMode: "mock",
      input: input.input,
      lightweightChoices: input.lightweightChoices,
      plannedDurationSeconds: input.plannedDurationSeconds ?? 12,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.uploadedPhotoIds?.length ? { uploadedPhotoIds: input.uploadedPhotoIds } : {})
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "story_world_failed"));
  }

  return (await response.json()) as CreateStoryWorldResponse;
}

export async function createStoryboard(input: { confirmedArtifactVersions: Record<string, number>; sessionId: string }) {
  const response = await fetch("/api/storyboard", {
    body: JSON.stringify({
      confirmedArtifactVersions: input.confirmedArtifactVersions,
      sessionId: input.sessionId
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "storyboard_failed"));
  }

  return (await response.json()) as CreateStoryboardResponse;
}

function errorCode(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") {
    return value.error;
  }

  return fallback;
}
