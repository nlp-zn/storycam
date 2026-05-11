type ArtifactRef = {
  id: string;
  state: string;
  type: string;
  version: number;
};

export type ScenePanel = {
  description: string;
  keyObjects: string[];
  purpose: string;
  shotType: "establishing" | "wide" | "medium" | "detail" | "lighting" | "overhead" | "transition";
  title: string;
};

export type StoryboardImageState =
  | {
      mediaId: string;
      mimeType: string;
      placeholder: false;
      signedUrl: string;
      signedUrlExpiresIn: number;
      status: "ready";
    }
  | {
      jobId: string;
      mediaId?: undefined;
      mimeType?: undefined;
      placeholder: true;
      signedUrl?: undefined;
      signedUrlExpiresIn?: undefined;
      status: "generating";
    }
  | {
      mediaId?: undefined;
      mimeType?: undefined;
      placeholder: true;
      reason?: StoryboardImagePlaceholderReason;
      signedUrl?: undefined;
      signedUrlExpiresIn?: undefined;
      status: "placeholder";
    };

export type StoryboardImagePlaceholderReason =
  | "provider_failed"
  | "reference_images_unsupported"
  | "storage_failed"
  | "waiting_for_asset_images";

export type AuthStatusResponse =
  | {
      authenticated: true;
      user: {
        email?: string;
        id: string;
      };
    }
  | {
      authenticated: false;
      user: null;
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
  assetImagesByArtifactId?: Record<
    string,
    {
      id: string;
      mimeType: string;
      signedUrl: string;
      signedUrlExpiresIn: number;
    }
  >;
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
      scenePanels: ScenePanel[];
      spatialLogic: string;
      timeOfDay: string;
    }>;
    script: {
      beats: string[];
      logline: string;
      summary: string;
      title: string;
      version: number;
      visualStyle?: string;
    };
  };
};

export type CreateStoryboardResponse = {
  ok: true;
  artifacts: {
    coreStoryboardGroups: ArtifactRef[];
    expandedStoryboardCards?: Array<ArtifactRef & { parentArtifactId: string | null }>;
    storyboardScript: ArtifactRef;
    storyboardScripts: ArtifactRef[];
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
      expandedStoryboardImages: StoryboardImageState[];
      representativeImage: StoryboardImageState;
      scriptArtifact: ArtifactRef;
      storyPurpose: string;
      title: string;
      version: number;
    }>;
    storyboardScript: {
      frames?: StoryboardFrame[];
      planSummary: string;
      plannedDurationSeconds: number;
      rhythm: string;
      tone: string;
      version: number;
    };
    storyboardScripts?: Array<{
      frames: StoryboardFrame[];
      mainImagePrompt?: string;
      planSummary: string;
      plannedDurationSeconds: number;
      rhythm: string;
      tone: string;
      version: number;
    }>;
  };
};

export type StoryboardFrame = {
  beatType: string;
  cameraAngle: string;
  canvasPosition: string;
  durationSeconds: number;
  frameNumber: number;
  imagePrompt: string;
  narrativePurpose: string;
  scene: string;
  shotSize: string;
  sound: string;
  technicalNotes: string;
  timeRange: string;
  title: string;
  visualContent: string;
};

export type ExpandStoryboardGroupResponse = {
  ok: true;
  expansionCards: Array<{
    beatType: string;
    canvasPosition?: string;
    description: string;
    frameNumber?: number;
    guidance: string;
    image: StoryboardImageState;
    imagePrompt?: string;
    sortOrder: number;
    title: string;
    version: number;
  }>;
  expandedStoryboardImages: StoryboardImageState[];
  expandedStoryboardCards: Array<ArtifactRef & { parentArtifactId: string | null }>;
  sessionId: string;
};

export type RegenerateStoryboardFrameImageResponse = {
  frameNumber: number;
  image: StoryboardImageState;
  ok: true;
  sessionId: string;
};

export type GenerateClipJobResponse = {
  confirmationSummary: string;
  jobId: string;
  ok: true;
  outputArtifactId?: string;
  providerErrorCategory?: string;
  providerHttpStatus?: number;
  providerName?: string;
  redactedError?: string;
  status: GenerationJobStatus;
};

export type GenerationJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancel_requested" | "canceled" | "expired";

export type GenerationJobSummary = {
  attempts: number;
  id: string;
  outputArtifactId?: string;
  outputPreview?: {
    durationSeconds: number;
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
  providerErrorCategory?: string;
  providerHttpStatus?: number;
  providerKind: string;
  providerName: string;
  redactedError?: string;
  sessionId: string;
  status: GenerationJobStatus;
  type: string;
};

export type GenerationJobResponse = {
  image?: StoryboardImageState;
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
  preview?: {
    durationSeconds?: number;
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
};

export type GenerateStoryWorldAssetImageResponse = {
  assetArtifactId: string;
  assetKind: "character" | "scene";
  image: StoryboardImageState;
  media?: {
    id: string;
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  };
  ok: true;
};

export type GenerateStoryWorldAssetImagesResponse = {
  imagesByArtifactId: Record<
    string,
    {
      assetArtifactId: string;
      assetKind: "character" | "scene";
      image: StoryboardImageState;
      media?: GenerateStoryWorldAssetImageResponse["media"];
    }
  >;
  ok: true;
};

export type RestoreStoryCamSessionResponse =
  | {
      ok: true;
      restored: false;
    }
  | {
      clipJob?: GenerationJobSummary;
      coreGroupTargetCount: 1 | 2 | 3;
      currentStep: "clip-generation" | "clip-review" | "core-storyboard" | "export" | "story-world";
      finalWork?: FinalWorkResponse;
      ok: true;
      restored: true;
      sessionId: string;
      storyboard: CreateStoryboardResponse | null;
      storyWorld: CreateStoryWorldResponse;
      storyWorldConfirmed: boolean;
    };

export type RecentStoryCamProject = {
  coreGroupTargetCount: 1 | 2 | 3;
  currentStep: "clip-generation" | "clip-review" | "core-storyboard" | "export" | "story-world";
  sessionId: string;
  summary: string;
  thumbnail: {
    id: string;
    mimeType: string;
    signedUrl: string;
    signedUrlExpiresIn: number;
  } | null;
  title: string;
  updatedAt: string;
};

export type RecentStoryCamProjectsResponse = {
  ok: true;
  projects: RecentStoryCamProject[];
};

export async function getAuthStatus() {
  const response = await fetch("/api/auth/me");

  if (response.status === 401) {
    return (await response.json()) as AuthStatusResponse;
  }

  if (!response.ok) {
    throw new Error("auth_status_failed");
  }

  return (await response.json()) as AuthStatusResponse;
}

export async function restoreCurrentStoryCamSession() {
  const response = await fetch("/api/storycam-sessions/current");

  if (response.status === 401) {
    return { ok: true, restored: false } satisfies RestoreStoryCamSessionResponse;
  }

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "session_restore_failed"));
  }

  return (await response.json()) as RestoreStoryCamSessionResponse;
}

export async function listRecentStoryCamProjects(limit = 5) {
  const response = await fetch(`/api/storycam-sessions/recent?limit=${encodeURIComponent(String(limit))}`);

  if (response.status === 401) {
    return { ok: true, projects: [] } satisfies RecentStoryCamProjectsResponse;
  }

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "recent_projects_failed"));
  }

  return (await response.json()) as RecentStoryCamProjectsResponse;
}

export async function restoreStoryCamSession(sessionId: string) {
  const response = await fetch(`/api/storycam-sessions/${encodeURIComponent(sessionId)}/restore`);

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), response.status === 404 ? "not_found" : "session_restore_failed"));
  }

  return (await response.json()) as RestoreStoryCamSessionResponse;
}

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

export async function createStoryboard(input: {
  confirmedArtifactVersions: Record<string, number>;
  coreGroupTargetCount?: 1 | 2 | 3;
  deferRepresentativeImages?: boolean;
  sessionId: string;
}) {
  const response = await fetch("/api/storyboard", {
    body: JSON.stringify({
      confirmedArtifactVersions: input.confirmedArtifactVersions,
      ...(input.coreGroupTargetCount ? { coreGroupTargetCount: input.coreGroupTargetCount } : {}),
      ...(input.deferRepresentativeImages ? { deferRepresentativeImages: true } : {}),
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

export async function generateStoryWorldAssetImage(input: {
  assetArtifactId: string;
  assetKind: "character" | "scene";
  sessionId: string;
}) {
  const response = await fetch("/api/story-world/assets/generate-image", {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "asset_image_failed"));
  }

  return (await response.json()) as GenerateStoryWorldAssetImageResponse;
}

export async function generateStoryWorldAssetImages(input: {
  assetArtifactIds?: string[];
  sessionId: string;
}) {
  const response = await fetch("/api/story-world/assets/generate-images", {
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "asset_image_failed"));
  }

  return (await response.json()) as GenerateStoryWorldAssetImagesResponse;
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

export async function regenerateStoryboardFrameImage(input: {
  coreStoryboardGroupId: string;
  frameNumber: number;
  sessionId: string;
}) {
  const response = await fetch(
    `/api/storyboard-groups/${input.coreStoryboardGroupId}/frames/${input.frameNumber}/regenerate-image`,
    {
      body: JSON.stringify({
        sessionId: input.sessionId
      }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    }
  );

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "storyboard_frame_image_failed"));
  }

  return (await response.json()) as RegenerateStoryboardFrameImageResponse;
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
