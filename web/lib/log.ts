/**
 * Structured logging: one JSON object per line on standard output, which is what a log
 * collector (CloudWatch, Loki, Datadog) ingests without extra parsing. On the server it is read
 * with `journalctl -u butler -o cat`.
 *
 * Rule: never log what people wrote. Events carry ids, counts, durations and outcomes, not
 * message text, names, phone numbers or keys.
 */

type Level = "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

const quiet = process.env.LOG_LEVEL === "silent";

function emit(level: Level, event: string, fields: Fields = {}) {
  if (quiet) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};

/** A short, safe description of an error: its message, cut short, with nothing that looks like a key. */
export function errorText(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text.replace(/(sk-|Bearer\s+)[A-Za-z0-9_\-]{8,}/g, "$1[redacted]").slice(0, 300);
}
