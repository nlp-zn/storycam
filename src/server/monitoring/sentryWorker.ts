import * as Sentry from "@sentry/node";
import { getSentryEnvironment, getSentryRelease } from "@/lib/monitoring/sentryEnvironment";
import { hashLogIdentifier } from "@/lib/privacy/redact";
import type { GenerationJobRow } from "@/server/db/types";
import { scrubSentryEvent } from "./sentryRedaction";

export function initStoryCamWorkerSentry() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    return;
  }

  Sentry.init({
    beforeSend: scrubSentryEvent,
    dsn,
    environment: getSentryEnvironment(),
    release: getSentryRelease(),
    sendDefaultPii: false,
    tracesSampleRate: 0.05
  });
}

export function captureStoryCamWorkerException(error: unknown, job?: GenerationJobRow) {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }

  Sentry.withScope((scope) => {
    if (job) {
      scope.setTags({
        provider_kind: job.provider_kind,
        provider_name: job.provider_name,
        storycam_job_status: job.status,
        storycam_job_type: job.type
      });
      scope.setContext("storycam_job", {
        attempts: job.attempts,
        id: job.id,
        maxAttempts: job.max_attempts,
        sessionIdHash: hashLogIdentifier(job.session_id)
      });
    }

    Sentry.captureException(error);
  });
}
