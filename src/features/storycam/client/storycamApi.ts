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
  visibleCharacterAssetIds?: string[];
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
    visibleCharacterAssetIds?: string[];
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

type RestoreSessionCacheEntry = {
  expiresAtMs: number;
  mediaExpiresAtById?: Record<string, number>;
  promise: Promise<RestoreStoryCamSessionResponse>;
  userId?: string;
  value?: RestoreStoryCamSessionResponse;
};

type StoredRestoreSessionCacheEntry = {
  expiresAtMs: number;
  mediaExpiresAtById: Record<string, number>;
  userId: string;
  value: RestoreStoryCamSessionResponse;
};

type RestoredStoryCamSession = Extract<RestoreStoryCamSessionResponse, { restored: true }>;

type RestoreSessionMedia = {
  id: string;
  signedUrl: string;
  signedUrlExpiresIn: number;
};

type RestoreSessionMediaById = Map<string, { expiresAtMs: number; media: RestoreSessionMedia }>;

type CacheableRestoreMedia = {
  id?: string;
  mediaId?: string;
  signedUrl?: string;
  signedUrlExpiresIn?: number;
};

type RestoreStoryCamSessionOptions = {
  forceNetwork?: boolean;
  markCurrent?: boolean;
  persist?: boolean;
  stabilizeMediaUrls?: boolean;
};

const restoreSessionCache = new Map<string, RestoreSessionCacheEntry>();
const restoreSessionCacheTtlMs = 60_000;
const restoreSessionCacheSafetyWindowMs = 30_000;
const restoreSessionCacheVersion = "v1";
const restoreSessionCurrentKey = `storycam:restore:${restoreSessionCacheVersion}:current-session-id`;
let restoreSessionUserId: string | null = null;

export async function getAuthStatus() {
  const response = await fetch("/api/auth/me", { cache: "no-store" });

  if (response.status === 401) {
    return (await response.json()) as AuthStatusResponse;
  }

  if (!response.ok) {
    throw new Error("auth_status_failed");
  }

  const authStatus = (await response.json()) as AuthStatusResponse;

  if (!authStatus.authenticated) {
    clearRestoreSessionCache();
    restoreSessionUserId = null;
    return authStatus;
  }

  if (restoreSessionUserId && restoreSessionUserId !== authStatus.user.id) {
    clearRestoreSessionCache();
  }

  restoreSessionUserId = authStatus.user.id;

  return authStatus;
}

export async function restoreCurrentStoryCamSession() {
  const authStatus = await getAuthStatus();

  if (!authStatus.authenticated) {
    return { ok: true, restored: false } satisfies RestoreStoryCamSessionResponse;
  }

  const currentSessionId = readCurrentRestoredSessionId(authStatus.user.id);

  if (currentSessionId) {
    try {
      return await restoreStoryCamSessionValue(currentSessionId, {
        forceNetwork: true,
        markCurrent: true,
        persist: true
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "not_found") {
        throw error;
      }

      deleteCurrentRestoredSessionId(currentSessionId, authStatus.user.id);
    }
  }

  const response = await fetch("/api/storycam-sessions/current", { cache: "no-store" });

  if (response.status === 401) {
    clearRestoreSessionCache();
    return { ok: true, restored: false } satisfies RestoreStoryCamSessionResponse;
  }

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "session_restore_failed"));
  }

  const restored = (await response.json()) as RestoreStoryCamSessionResponse;

  if (restored.restored) {
    const cachedEntry = readRestoreSessionValue(restored.sessionId);
    const stabilized = stabilizeRestoreSessionMediaUrls(restored, cachedEntry?.value, cachedEntry?.mediaExpiresAtById);
    writeRestoreSessionValue(restored.sessionId, stabilized, {
      markCurrent: true,
      persist: true
    });
    return stabilized;
  }

  return restored;
}

export async function listRecentStoryCamProjects(limit = 5, options: { signal?: AbortSignal } = {}) {
  const response = await fetch(`/api/storycam-sessions/recent?limit=${encodeURIComponent(String(limit))}`, {
    cache: "no-store",
    signal: options.signal
  });

  if (response.status === 401) {
    return { ok: true, projects: [] } satisfies RecentStoryCamProjectsResponse;
  }

  if (!response.ok) {
    throw new Error(errorCode(await response.json(), "recent_projects_failed"));
  }

  return (await response.json()) as RecentStoryCamProjectsResponse;
}

export async function restoreStoryCamSession(sessionId: string) {
  return restoreStoryCamSessionValue(sessionId, {
    markCurrent: true,
    persist: true
  });
}

export async function refreshStoryCamSessionRestore(sessionId: string) {
  return restoreStoryCamSessionValue(sessionId, {
    forceNetwork: true,
    markCurrent: true,
    persist: true,
    stabilizeMediaUrls: false
  });
}

async function restoreStoryCamSessionValue(
  sessionId: string,
  options: RestoreStoryCamSessionOptions = {}
) {
  const markCurrent = options.markCurrent ?? true;
  const persist = options.persist ?? true;
  const cached = restoreSessionCache.get(sessionId);
  const nowMs = Date.now();

  if (!options.forceNetwork && cached && cached.expiresAtMs > nowMs && cacheUserMatches(cached.userId)) {
    if (markCurrent) {
      writeCurrentRestoredSessionId(sessionId);
    }

    if (persist && cached.value) {
      writeStoredRestoreSessionValue(sessionId, {
        expiresAtMs: cached.expiresAtMs,
        mediaExpiresAtById: cached.mediaExpiresAtById ?? {},
        userId: currentRestoreSessionUserId(),
        value: cached.value
      });
    }

    return cached.promise;
  }

  const stored = persist && !options.forceNetwork ? readRestoreSessionValue(sessionId, nowMs) : null;

  if (stored) {
    const promise = Promise.resolve(stored.value);

    restoreSessionCache.set(sessionId, {
      expiresAtMs: stored.expiresAtMs,
      mediaExpiresAtById: stored.mediaExpiresAtById,
      promise,
      userId: stored.userId,
      value: stored.value
    });

    if (markCurrent) {
      writeCurrentRestoredSessionId(sessionId);
    }

    return promise;
  }

  const cachedEntry = readRestoreSessionValue(sessionId);
  const cachedValue = cachedEntry?.value ?? (cacheUserMatches(cached?.userId) ? cached?.value : undefined);
  const mediaExpiresAtById =
    cachedEntry?.mediaExpiresAtById ?? (cacheUserMatches(cached?.userId) ? cached?.mediaExpiresAtById : undefined);
  const promise = fetchRestoredStoryCamSession(sessionId)
    .then((restored) => {
      const stabilized =
        options.stabilizeMediaUrls === false
          ? restored
          : stabilizeRestoreSessionMediaUrls(restored, cachedValue, mediaExpiresAtById);
      writeRestoreSessionValue(sessionId, stabilized, { markCurrent, persist });
      return stabilized;
    })
    .catch((error) => {
      deleteRestoreSessionValue(sessionId);
      throw error;
    });

  restoreSessionCache.set(sessionId, {
    expiresAtMs: nowMs + restoreSessionCacheTtlMs,
    promise,
    userId: currentRestoreSessionUserId()
  });

  return promise;
}

export function prefetchStoryCamSessionRestore(sessionId: string) {
  void restoreStoryCamSessionValue(sessionId, {
    markCurrent: false,
    persist: false
  }).catch(() => {
    // Prefetch is opportunistic; the click path will surface restore failures.
  });
}

export function clearStoryCamRestoreCache() {
  clearRestoreSessionCache();
  restoreSessionUserId = null;
}

async function fetchRestoredStoryCamSession(sessionId: string) {
  const response = await fetch(`/api/storycam-sessions/${encodeURIComponent(sessionId)}/restore`, {
    cache: "no-store"
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearRestoreSessionCache();
    }

    throw new Error(errorCode(await response.json(), response.status === 404 ? "not_found" : "session_restore_failed"));
  }

  return (await response.json()) as RestoreStoryCamSessionResponse;
}

function writeRestoreSessionValue(
  sessionId: string,
  restored: RestoreStoryCamSessionResponse,
  options: { markCurrent?: boolean; persist?: boolean } = {}
) {
  const mediaExpiresAtById = restoreSessionMediaExpiresAtById(restored);
  const expiresAtMs = restoreSessionExpiresAt(restored, mediaExpiresAtById);
  const promise = Promise.resolve(restored);
  const userId = currentRestoreSessionUserId();

  restoreSessionCache.set(sessionId, {
    expiresAtMs,
    mediaExpiresAtById,
    promise,
    userId,
    value: restored
  });

  if (options.persist !== false) {
    writeStoredRestoreSessionValue(sessionId, {
      expiresAtMs,
      mediaExpiresAtById,
      userId,
      value: restored
    });
  }

  if (options.markCurrent !== false && restored.restored) {
    writeCurrentRestoredSessionId(sessionId);
  }
}

function readRestoreSessionValue(sessionId: string, nowMs = Date.now()) {
  const cached = restoreSessionCache.get(sessionId);

  if (cached?.value && cached.expiresAtMs > nowMs && cacheUserMatches(cached.userId)) {
    return {
      expiresAtMs: cached.expiresAtMs,
      mediaExpiresAtById: cached.mediaExpiresAtById ?? {},
      userId: cached.userId ?? currentRestoreSessionUserId(),
      value: cached.value
    };
  }

  const stored = readStoredRestoreSessionValue(sessionId);

  if (!stored) {
    return null;
  }

  if (stored.expiresAtMs <= nowMs) {
    deleteRestoreSessionValue(sessionId);
    return null;
  }

  return stored;
}

function deleteRestoreSessionValue(sessionId: string) {
  restoreSessionCache.delete(sessionId);
  try {
    window.sessionStorage.removeItem(restoreSessionStorageKey(sessionId));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function clearRestoreSessionCache() {
  restoreSessionCache.clear();

  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index)).filter(
      (key): key is string => typeof key === "string" && key.startsWith(`storycam:restore:${restoreSessionCacheVersion}:`)
    );

    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function readStoredRestoreSessionValue(sessionId: string): StoredRestoreSessionCacheEntry | null {
  try {
    const raw = window.sessionStorage.getItem(restoreSessionStorageKey(sessionId));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredRestoreSessionCacheEntry;

    if (
      !parsed ||
      typeof parsed.expiresAtMs !== "number" ||
      !isRestoreSessionMediaExpiryMap(parsed.mediaExpiresAtById) ||
      typeof parsed.userId !== "string" ||
      !cacheUserMatches(parsed.userId) ||
      !isRestoreStoryCamSessionResponse(parsed.value)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeStoredRestoreSessionValue(sessionId: string, entry: StoredRestoreSessionCacheEntry) {
  try {
    window.sessionStorage.setItem(restoreSessionStorageKey(sessionId), JSON.stringify(entry));
  } catch {
    // Storage can be unavailable or full; memory cache still covers this page session.
  }
}

function readCurrentRestoredSessionId(userId: string) {
  try {
    const raw = window.sessionStorage.getItem(restoreSessionCurrentKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { sessionId?: unknown; userId?: unknown };

    if (parsed.userId !== userId || typeof parsed.sessionId !== "string") {
      return null;
    }

    return parsed.sessionId;
  } catch {
    return null;
  }
}

function writeCurrentRestoredSessionId(sessionId: string) {
  try {
    window.sessionStorage.setItem(
      restoreSessionCurrentKey,
      JSON.stringify({
        sessionId,
        userId: currentRestoreSessionUserId()
      })
    );
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function deleteCurrentRestoredSessionId(sessionId: string, userId: string) {
  try {
    const raw = window.sessionStorage.getItem(restoreSessionCurrentKey);

    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as { sessionId?: unknown; userId?: unknown };

    if (parsed.sessionId === sessionId && parsed.userId === userId) {
      window.sessionStorage.removeItem(restoreSessionCurrentKey);
    }
  } catch {
    try {
      window.sessionStorage.removeItem(restoreSessionCurrentKey);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }
}

function restoreSessionStorageKey(sessionId: string) {
  return `storycam:restore:${restoreSessionCacheVersion}:session:${sessionId}`;
}

function restoreSessionMediaExpiresAtById(restored: RestoreStoryCamSessionResponse, nowMs = Date.now()) {
  if (!restored.restored) {
    return {};
  }

  return Object.fromEntries(
    collectRestoreSessionMedia(restored).map((media) => [media.id, nowMs + media.signedUrlExpiresIn * 1000])
  );
}

function restoreSessionExpiresAt(
  restored: RestoreStoryCamSessionResponse,
  mediaExpiresAtById: Record<string, number>,
  nowMs = Date.now()
) {
  if (!restored.restored) {
    return nowMs + restoreSessionCacheTtlMs;
  }

  const mediaExpiresAtMs = Object.values(mediaExpiresAtById).map((expiresAtMs) => expiresAtMs - restoreSessionCacheSafetyWindowMs);

  return mediaExpiresAtMs.length > 0 ? Math.min(...mediaExpiresAtMs) : nowMs + restoreSessionCacheTtlMs;
}

function isRestoreSessionMediaExpiryMap(value: unknown): value is Record<string, number> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Object.values(value as Record<string, unknown>).every((expiresAtMs) => typeof expiresAtMs === "number")
  );
}

function currentRestoreSessionUserId() {
  return restoreSessionUserId ?? "unknown";
}

function cacheUserMatches(userId: string | undefined) {
  return Boolean(restoreSessionUserId && userId === restoreSessionUserId);
}

function stabilizeRestoreSessionMediaUrls(
  restored: RestoreStoryCamSessionResponse,
  cached: RestoreStoryCamSessionResponse | undefined,
  mediaExpiresAtById: Record<string, number> | undefined
): RestoreStoryCamSessionResponse {
  if (!restored.restored || !cached?.restored) {
    return restored;
  }

  const nowMs = Date.now();
  const cachedById = new Map(
    collectRestoreSessionMedia(cached)
      .map((media) => {
        const expiresAtMs = mediaExpiresAtById?.[media.id] ?? nowMs + media.signedUrlExpiresIn * 1000;

        return [media.id, { expiresAtMs, media }] as const;
      })
      .filter(([, cachedMedia]) => cachedMedia.expiresAtMs > nowMs + restoreSessionCacheSafetyWindowMs)
  );

  if (cachedById.size === 0) {
    return restored;
  }

  const stabilized: RestoredStoryCamSession = {
    ...restored,
    storyboard: restored.storyboard ? stabilizeRestoreStoryboard(restored.storyboard, cachedById) : null,
    storyWorld: stabilizeRestoreStoryWorld(restored.storyWorld, cachedById)
  };

  if (restored.clipJob) {
    stabilized.clipJob = stabilizeRestoreClipJob(restored.clipJob, cachedById);
  }

  if (restored.finalWork) {
    stabilized.finalWork = stabilizeRestoreFinalWork(restored.finalWork, cachedById);
  }

  return stabilized;
}

function stabilizeRestoreStoryWorld(
  storyWorld: CreateStoryWorldResponse,
  cachedById: RestoreSessionMediaById
): CreateStoryWorldResponse {
  return {
    ...storyWorld,
    assetImagesByArtifactId: Object.fromEntries(
      Object.entries(storyWorld.assetImagesByArtifactId ?? {}).map(([artifactId, media]) => [
        artifactId,
        applyCachedRestoreMedia(media, cachedById)
      ])
    )
  };
}

function stabilizeRestoreStoryboard(
  storyboard: CreateStoryboardResponse,
  cachedById: RestoreSessionMediaById
): CreateStoryboardResponse {
  return {
    ...storyboard,
    storyboard: {
      ...storyboard.storyboard,
      coreStoryboardGroups: storyboard.storyboard.coreStoryboardGroups.map((group) => ({
        ...group,
        expandedStoryboardImages: group.expandedStoryboardImages.map((image) => stabilizeRestoreStoryboardImage(image, cachedById)),
        representativeImage: stabilizeRestoreStoryboardImage(group.representativeImage, cachedById)
      }))
    }
  };
}

function stabilizeRestoreStoryboardImage(image: StoryboardImageState, cachedById: RestoreSessionMediaById): StoryboardImageState {
  if (image.status !== "ready") {
    return image;
  }

  return applyCachedRestoreMedia(image, cachedById);
}

function stabilizeRestoreClipJob(clipJob: GenerationJobSummary, cachedById: RestoreSessionMediaById): GenerationJobSummary {
  if (!clipJob.outputPreview || !clipJob.outputArtifactId) {
    return clipJob;
  }

  return {
    ...clipJob,
    outputPreview: applyCachedRestoreMedia(
      {
        ...clipJob.outputPreview,
        id: clipJob.outputArtifactId
      },
      cachedById
    )
  };
}

function stabilizeRestoreFinalWork(finalWork: FinalWorkResponse, cachedById: RestoreSessionMediaById): FinalWorkResponse {
  if (!finalWork.preview) {
    return finalWork;
  }

  return {
    ...finalWork,
    preview: applyCachedRestoreMedia(
      {
        ...finalWork.preview,
        id: finalWork.media.id
      },
      cachedById
    )
  };
}

function applyCachedRestoreMedia<T extends CacheableRestoreMedia>(media: T, cachedById: RestoreSessionMediaById): T {
  const mediaId = media.id ?? media.mediaId;
  const cachedMedia = mediaId ? cachedById.get(mediaId) : undefined;

  if (!cachedMedia || typeof media.signedUrl !== "string" || typeof media.signedUrlExpiresIn !== "number") {
    return media;
  }

  const signedUrlExpiresIn = Math.max(1, Math.floor((cachedMedia.expiresAtMs - Date.now()) / 1000));

  return {
    ...media,
    signedUrl: cachedMedia.media.signedUrl,
    signedUrlExpiresIn
  } as T;
}

function collectRestoreSessionMedia(restored: RestoreStoryCamSessionResponse): RestoreSessionMedia[] {
  if (!restored.restored) {
    return [];
  }

  const media: RestoreSessionMedia[] = [];

  Object.values(restored.storyWorld.assetImagesByArtifactId ?? {}).forEach((item) => media.push(item));

  restored.storyboard?.storyboard.coreStoryboardGroups.forEach((group) => {
    if (group.representativeImage.status === "ready") {
      media.push({
        id: group.representativeImage.mediaId,
        signedUrl: group.representativeImage.signedUrl,
        signedUrlExpiresIn: group.representativeImage.signedUrlExpiresIn
      });
    }

    group.expandedStoryboardImages.forEach((image) => {
      if (image.status === "ready") {
        media.push({
          id: image.mediaId,
          signedUrl: image.signedUrl,
          signedUrlExpiresIn: image.signedUrlExpiresIn
        });
      }
    });
  });

  if (restored.clipJob?.outputPreview && restored.clipJob.outputArtifactId) {
    media.push({
      id: restored.clipJob.outputArtifactId,
      signedUrl: restored.clipJob.outputPreview.signedUrl,
      signedUrlExpiresIn: restored.clipJob.outputPreview.signedUrlExpiresIn
    });
  }

  if (restored.finalWork?.preview) {
    media.push({
      id: restored.finalWork.media.id,
      signedUrl: restored.finalWork.preview.signedUrl,
      signedUrlExpiresIn: restored.finalWork.preview.signedUrlExpiresIn
    });
  }

  return media;
}

function isRestoreStoryCamSessionResponse(value: unknown): value is RestoreStoryCamSessionResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { ok?: unknown; restored?: unknown };
  return candidate.ok === true && typeof candidate.restored === "boolean";
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
