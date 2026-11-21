/**
 * A small sliding-window rate limiter, kept in memory.
 *
 * It protects the things that cost money or can be abused: looking people up by number or
 * email, asking the model questions, sending invitations. One process, so one map; with more
 * than one server this would move to a shared store such as Redis, behind the same function.
 */

import { count } from "./metrics";

type Window = number[];
const holder = globalThis as unknown as { __equalLimits?: Map<string, Window> };
const windows = () => (holder.__equalLimits ??= new Map<string, Window>());

export type Limit = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

/**
 * Count one use of `action` by `who`. Allows at most `max` uses in any `perSeconds` window.
 * `who` is a user id, or a network address for requests made before sign-in.
 */
export function allow(action: string, who: string, max: number, perSeconds: number, now = Date.now()): Limit {
  const key = `${action}:${who}`;
  const since = now - perSeconds * 1000;
  const recent = (windows().get(key) ?? []).filter((t) => t > since);
  if (recent.length >= max) {
    windows().set(key, recent);
    count(`ratelimit.blocked.${action}`);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + perSeconds * 1000 - now) / 1000)) };
  }
  recent.push(now);
  windows().set(key, recent);
  // Keep the map from growing without bound: drop keys that have gone quiet.
  if (windows().size > 20000) for (const [k, v] of windows()) if (!v.length || v[v.length - 1] < now - 3600000) windows().delete(k);
  return { ok: true, remaining: max - recent.length };
}

/** The standard answer when a limit is hit. */
export function tooMany(limit: { retryAfterSeconds: number }, what = "Too many requests") {
  return Response.json({ error: `${what}. Try again in ${limit.retryAfterSeconds < 90 ? `${limit.retryAfterSeconds} seconds` : `${Math.ceil(limit.retryAfterSeconds / 60)} minutes`}.` }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
}

/** The caller's network address, as the proxy in front of the app reports it. */
export function clientAddress(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}
