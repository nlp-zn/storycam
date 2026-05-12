export type StoryCamVideoOutputResolution = "480p" | "720p" | "1080p";
export type StoryCamVideoAspectRatio = "16:9" | "9:16";
export type StoryCamVideoModel = "seedance_2_0" | "seedance_2_0_fast";

export const storyCamSeedanceOutputResolution: StoryCamVideoOutputResolution = "720p";
export const storyCamSeedanceOutputResolutionLabel = "720p";
export const defaultStoryCamVideoAspectRatio: StoryCamVideoAspectRatio = "16:9";
export const defaultStoryCamVideoModel: StoryCamVideoModel = "seedance_2_0";
export const storyCamVideoAspectRatios = ["16:9", "9:16"] as const satisfies readonly StoryCamVideoAspectRatio[];
export const storyCamVideoModels = ["seedance_2_0", "seedance_2_0_fast"] as const satisfies readonly StoryCamVideoModel[];

export function storyCamVideoAspectRatioLabel(aspectRatio: StoryCamVideoAspectRatio): string {
  return aspectRatio === "9:16" ? "9:16 竖版" : "16:9 横版";
}

export function storyCamVideoModelLabel(model: StoryCamVideoModel): string {
  return model === "seedance_2_0_fast" ? "Seedance 2.0 Fast" : "Seedance 2.0";
}

export function parseStoryCamVideoAspectRatio(value: unknown): StoryCamVideoAspectRatio | null {
  if (!storyCamVideoAspectRatios.includes(value as StoryCamVideoAspectRatio)) {
    return null;
  }

  return value as StoryCamVideoAspectRatio;
}

export function parseStoryCamVideoModel(value: unknown): StoryCamVideoModel | null {
  if (!storyCamVideoModels.includes(value as StoryCamVideoModel)) {
    return null;
  }

  return value as StoryCamVideoModel;
}
