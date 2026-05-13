import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./src/server/monitoring/sentryRedaction";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    beforeSend: scrubSentryEvent,
    dsn,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.05
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
