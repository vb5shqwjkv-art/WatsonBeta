/**
 * Minimal structured logger.
 *
 * Kept dependency-free so it can be used from both the pure `core` layer and
 * server routes. Swap the transport (console) for a real sink later without
 * touching call sites.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const activeLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (levelOrder[level] < levelOrder[activeLevel]) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(context: LogFields): Logger;
}

function makeLogger(base: LogFields): Logger {
  return {
    debug: (m, f) => emit("debug", m, { ...base, ...f }),
    info: (m, f) => emit("info", m, { ...base, ...f }),
    warn: (m, f) => emit("warn", m, { ...base, ...f }),
    error: (m, f) => emit("error", m, { ...base, ...f }),
    child: (context) => makeLogger({ ...base, ...context }),
  };
}

export const logger: Logger = makeLogger({});
