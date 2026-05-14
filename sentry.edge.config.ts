import * as Sentry from "@sentry/nextjs";
import { getSentryEnvironment, getSentryRelease } from "./src/lib/monitoring/sentryEnvironment";
import { scrubSentryEvent } from "./src/server/monitoring/sentryRedaction";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    beforeSend: scrubSentryEvent,
    dsn,
    environment: getSentryEnvironment(),
    release: getSentryRelease(),
    sendDefaultPii: false,
    tracesSampleRate: 0.02
  });
}
