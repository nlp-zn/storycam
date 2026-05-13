import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./src/server/monitoring/sentryRedaction";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    beforeSend: scrubSentryEvent,
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.02
  });
}
