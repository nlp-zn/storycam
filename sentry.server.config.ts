import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./src/server/monitoring/sentryRedaction";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    beforeSend: scrubSentryEvent,
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.05
  });
}
