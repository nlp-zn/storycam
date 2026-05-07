import { redactProviderError } from "@/lib/privacy/redact";
import type { ProviderFailure, ProviderIdentity, ProviderSuccess } from "./types";

export function providerSuccess<T>(identity: ProviderIdentity, value: T): ProviderSuccess<T> {
  return {
    ...identity,
    ok: true,
    value
  };
}

export function providerFailure(
  identity: ProviderIdentity,
  error: unknown,
  options: { errorCode?: string; providerErrorCategory?: string; providerHttpStatus?: number; retryable?: boolean } = {}
): ProviderFailure {
  return {
    ...identity,
    ...redactProviderError(error, options),
    ok: false
  };
}

export function isProviderFailure<T>(result: ProviderFailure | ProviderSuccess<T>): result is ProviderFailure {
  return !result.ok;
}
