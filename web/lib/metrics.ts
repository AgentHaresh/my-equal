/**
 * Measurements of the running app, kept in memory and served at /api/metrics.
 *
 * Two kinds: counters (how many times something happened) and timings (how long something took,
 * kept as the most recent samples so percentiles can be read). The one that matters most here is
 * the model call: every call records its purpose, duration, token counts and outcome, so the cost
 * and speed of the assistant are numbers, not guesses.
 *
 * In memory means they reset on restart and describe one process. Exporting the same numbers to
 * a metrics service is a change to this file only.
 */

const SAMPLES = 500; // timings kept per name
const startedAt = Date.now();

type Store = { counters: Map<string, number>; timings: Map<string, number[]> };
const holder = globalThis as unknown as { __equalMetrics?: Store };
const store = () => (holder.__equalMetrics ??= { counters: new Map(), timings: new Map() });

export function count(name: string, by = 1) {
  store().counters.set(name, (store().counters.get(name) ?? 0) + by);
}

export function timing(name: string, ms: number) {
  const list = store().timings.get(name) ?? [];
  list.push(ms);
  if (list.length > SAMPLES) list.shift();
  store().timings.set(name, list);
}

/** The value below which `p` percent of the samples fall. */
export function percentile(samples: number[], p: number): number | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export type ModelCall = { purpose: string; ms: number; ok: boolean; model: string; promptTokens?: number; completionTokens?: number; cachedTokens?: number };

/** Record one call to the model. */
export function modelCall(c: ModelCall) {
  count("model.calls");
  count(`model.calls.${c.purpose}`);
  if (!c.ok) count("model.errors");
  timing("model.ms", c.ms);
  timing(`model.ms.${c.purpose}`, c.ms);
  if (c.promptTokens) count("model.tokens.prompt", c.promptTokens);
  if (c.completionTokens) count("model.tokens.completion", c.completionTokens);
  if (c.cachedTokens) count("model.tokens.cached", c.cachedTokens);
  if (c.promptTokens) timing(`model.prompt_tokens.${c.purpose}`, c.promptTokens);
}

/** Everything measured so far, as plain numbers. No names, no message text. */
export function report() {
  const s = store();
  const counters = Object.fromEntries([...s.counters.entries()].sort());
  const timings = Object.fromEntries(
    [...s.timings.entries()].sort().map(([name, list]) => [name, { samples: list.length, p50: percentile(list, 50), p95: percentile(list, 95), max: Math.max(...list) }])
  );
  const memory = process.memoryUsage();
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    memoryMb: { rss: Math.round(memory.rss / 1048576), heapUsed: Math.round(memory.heapUsed / 1048576) },
    counters,
    timings,
  };
}
