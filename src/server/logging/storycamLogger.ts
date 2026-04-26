import { hasForbiddenLogValue, redactForLog } from "@/lib/privacy/redact";

export type StoryCamLogLevel = "error" | "info" | "warn";

export type StoryCamLogEntry = {
  event: string;
  fields: unknown;
  level: StoryCamLogLevel;
  redactionApplied: true;
};

export type StoryCamLogSink = (entry: StoryCamLogEntry) => void;

export type StoryCamLogger = {
  error(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
};

export function createStoryCamLogger(sink: StoryCamLogSink = consoleLogSink): StoryCamLogger {
  return {
    error(event, fields = {}) {
      writeLog(sink, "error", event, fields);
    },
    info(event, fields = {}) {
      writeLog(sink, "info", event, fields);
    },
    warn(event, fields = {}) {
      writeLog(sink, "warn", event, fields);
    }
  };
}

export const storyCamLogger = createStoryCamLogger();

function writeLog(sink: StoryCamLogSink, level: StoryCamLogLevel, event: string, fields: Record<string, unknown>) {
  const entry = {
    event,
    fields: redactForLog(fields),
    level,
    redactionApplied: true
  } satisfies StoryCamLogEntry;

  if (hasForbiddenLogValue(entry)) {
    sink({
      event,
      fields: { redactionFailure: true },
      level: "error",
      redactionApplied: true
    });
    return;
  }

  sink(entry);
}

function consoleLogSink(entry: StoryCamLogEntry) {
  const method = entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.info;

  method("StoryCam", entry);
}
