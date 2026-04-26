import type { RedactedProviderError } from "@/lib/privacy/redact";

export const providerKinds = ["text", "multimodal", "image", "video", "stitch"] as const;

export type ProviderKind = (typeof providerKinds)[number];
export type ProviderName = "ffmpeg" | "mock" | "openrouter" | "seedance_2_0" | string;

export type ProviderIdentity = {
  providerKind: ProviderKind;
  providerName: ProviderName;
  providerRequestId?: string;
};

export type ProviderSuccess<T> = ProviderIdentity & {
  ok: true;
  value: T;
};

export type ProviderFailure = ProviderIdentity &
  RedactedProviderError & {
    ok: false;
  };

export type ProviderResult<T> = ProviderFailure | ProviderSuccess<T>;

export type TextGenerationProvider<Input, Output> = ProviderIdentity & {
  providerKind: "text";
  generate(input: Input): Promise<ProviderResult<Output>>;
};

export type MultimodalGenerationProvider<Input, Output> = ProviderIdentity & {
  providerKind: "multimodal";
  analyze(input: Input): Promise<ProviderResult<Output>>;
};

export type ImageGenerationProvider<Input, Output> = ProviderIdentity & {
  providerKind: "image";
  generateImage(input: Input): Promise<ProviderResult<Output>>;
};

export type VideoGenerationProvider<Input, Output> = ProviderIdentity & {
  providerKind: "video";
  generateClip(input: Input): Promise<ProviderResult<Output>>;
};

export type FinalWorkComposer<Input, Output> = ProviderIdentity & {
  providerKind: "stitch";
  compose(input: Input): Promise<ProviderResult<Output>>;
};
