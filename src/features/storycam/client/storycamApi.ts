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

export type ExpandStoryboardGroupResponse = {
  ok: true;
  expansionCards: Array<{
    beatType: string;
    description: string;
    guidance: string;
    sortOrder: number;
    title: string;
    version: number;
  }>;
  expandedStoryboardCards: Array<ArtifactRef & { parentArtifactId: string | null }>;
  sessionId: string;
};

export type GenerateClipJobResponse = {
  confirmationSummary: string;
  jobId: string;
  ok: true;
  status: GenerationJobStatus;
};

export type GenerationJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancel_requested" | "canceled" | "expired";

export type GenerationJobSummary = {
  attempts: number;
  id: string;
  outputArtifactId?: string;
  providerKind: string;
  providerName: string;
  redactedError?: string;
  sessionId: string;
  status: GenerationJobStatus;
  type: string;
};

export type GenerationJobResponse = {
  job: GenerationJobSummary;
  ok: true;
};

export type CancelGenerationJobResponse = {
  jobId: string;
  ok: true;
  status: "cancel_requested" | "canceled";
};

export type DeleteStoryCamSessionResponse = {
  bucketsTouched: string[];
  ok: true;
  removedObjectCount: number;
  sessionId: string;
  skippedObjectCount: number;
};

export type StitchSuggestionResponse = {
  ok: true;
  stitchSuggestion: ArtifactRef;
};

export type FinalWorkResponse = {
  finalWork: ArtifactRef;
  media: {
    byteSize: number;
    id: string;
    kind: "final_work";
    mimeType: string;
  };
  ok: true;
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

export async function expandStoryboardGroup(input: { coreStoryboardGroupId: string; sessionId: string; targetCount?: number }) {
  const response = await fetch(`/api/storyboard-groups/${input.coreStoryboardGroupId}/expand`, {
    body: JSON.stringify({
      sessionId: input.sessionId,
      ...(input.targetCount ? { targetCount: input.targetCount } : {})
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "expansion_failed"));
  }

  return (await response.json()) as ExpandStoryboardGroupResponse;
}

export async function generateClipJob(input: {
  confirmedArtifactVersions: Record<string, number>;
  coreStoryboardGroupId: string;
  idempotencyKey: string;
  sessionId: string;
}) {
  const response = await fetch(`/api/storyboard-groups/${input.coreStoryboardGroupId}/generate-clip`, {
    body: JSON.stringify({
      confirmedArtifactVersions: input.confirmedArtifactVersions,
      coreStoryboardGroupId: input.coreStoryboardGroupId,
      generationMode: "mock",
      idempotencyKey: input.idempotencyKey,
      providerSendConfirmed: true,
      sessionId: input.sessionId
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "generation_job_failed"));
  }

  return (await response.json()) as GenerateClipJobResponse;
}

export async function getGenerationJob(jobId: string) {
  const response = await fetch(`/api/generation-jobs/${jobId}`);

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "generation_job_failed"));
  }

  return (await response.json()) as GenerationJobResponse;
}

export async function cancelGenerationJob(jobId: string) {
  const response = await fetch(`/api/generation-jobs/${jobId}/cancel`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "generation_job_failed"));
  }

  return (await response.json()) as CancelGenerationJobResponse;
}

export async function deleteStoryCamSession(sessionId: string) {
  const response = await fetch(`/api/storycam-sessions/${sessionId}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "session_deletion_failed"));
  }

  return (await response.json()) as DeleteStoryCamSessionResponse;
}

export async function createStitchSuggestion(input: { generatedClipArtifactIds: string[]; sessionId: string }) {
  const response = await fetch("/api/stitch-suggestion", {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "stitch_suggestion_failed"));
  }

  return (await response.json()) as StitchSuggestionResponse;
}

export async function createFinalWork(input: { idempotencyKey: string; sessionId: string; stitchSuggestionArtifactId: string }) {
  const response = await fetch("/api/final-work", {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "final_work_failed"));
  }

  return (await response.json()) as FinalWorkResponse;
}

function errorCode(value: unknown, fallback: string) {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") {
    return value.error;
  }

  return fallback;
}
