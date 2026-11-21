"use client";

import { useEffect, useState } from "react";

type Timing = { samples: number; p50: number | null; p95: number | null; max: number };
type Metrics = {
  uptimeSeconds: number;
  memoryMb: { rss: number; heapUsed: number };
  counters: Record<string, number>;
  timings: Record<string, Timing>;
  model: string;
  openConnections: number;
  totals: { accounts: number; testAccounts: number; messages: number; memories: number };
  context: { promptTokensPerMessageRead: Timing | null; promptTokensPerQuestion: Timing | null; averagePromptTokens: number | null; cachedPromptShare: number | null };
};
type Health = { status: string; checks: Record<string, string>; version: string };

const PURPOSES: Record<string, string> = {
  read_message: "Reading a new message",
  answer_question: "Answering a question",
  learn_relationship: "Working out a relationship",
  set_reminder: "Setting a reminder",
  scam_check: "Checking for a scam",
  screen_call: "Screening a call",
  plan_calls: "Planning provider calls",
  provider_call: "Talking to a provider",
  voice_note: "Describing a voice note",
  draft_message: "Drafting a message",
  other: "Other",
};

const ms = (n: number | null | undefined) => (n == null ? "–" : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
const num = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-IN"));
const since = (s: number) => (s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`);

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">{label}</div>
      <div className={`mt-1 font-display text-3xl ${tone === "bad" ? "text-rose-300" : tone === "good" ? "text-equal-lime" : "text-white"}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-white/60">{note}</div>}
    </div>
  );
}

/** A live view of the app's own measurements. Totals and timings only: nothing anyone wrote. */
export default function Status() {
  const [m, setM] = useState<Metrics | null>(null);
  const [h, setH] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const [hr, mr] = await Promise.all([fetch("/api/health"), fetch("/api/metrics")]);
        if (stop) return;
        setH(await hr.json());
        if (mr.status === 401) return setError("Sign in to My Equal first, then open this page again.");
        setM(await mr.json());
        setError(null);
      } catch {
        if (!stop) setError("Could not reach the server.");
      }
    };
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 5000);
    return () => {
      stop = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const calls = m?.counters["model.calls"] ?? 0;
  const errors = m?.counters["model.errors"] ?? 0;
  const purposes = m ? Object.keys(m.timings).filter((k) => k.startsWith("model.ms.")).map((k) => k.slice("model.ms.".length)) : [];
  const blocked = m ? Object.entries(m.counters).filter(([k]) => k.startsWith("ratelimit.blocked.")) : [];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-5 py-8 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="hero-text font-display text-4xl">System status</h1>
          <p className="mt-1 text-sm text-white/60">Measured by the running app, refreshed every five seconds. Counts and timings only; nothing anyone wrote is here.</p>
        </div>
        {h && (
          <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${h.status === "ok" ? "bg-equal-lime text-equal-ink" : "bg-rose-500 text-white"}`}>
            {h.status === "ok" ? "All systems working" : "Degraded"}
          </span>
        )}
      </div>

      {error && <div className="mt-6 rounded-2xl bg-rose-600 px-4 py-3 text-sm">{error}</div>}

      {m && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Up for" value={since(m.uptimeSeconds)} note={`since the last restart · ${m.memoryMb.rss} MB memory`} />
            <Tile label="Apps connected now" value={num(m.openConnections)} note="live lines held open" />
            <Tile label="Accounts" value={num(m.totals.accounts)} note={`${num(m.totals.messages)} messages · ${num(m.totals.memories)} facts kept`} />
            <Tile label="Saves to disk" value={num(m.counters["store.saves"] ?? 0)} note={`typically ${ms(m.timings["store.save_ms"]?.p50)}, slowest ${ms(m.timings["store.save_ms"]?.max)}`} />
          </section>

          <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-equal-lime">The assistant ({m.model})</h2>
          <section className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Model calls" value={num(calls)} note={`${num(errors)} failed`} tone={errors ? "bad" : "good"} />
            <Tile label="Typical call" value={ms(m.timings["model.ms"]?.p50)} note={`95 in 100 finish within ${ms(m.timings["model.ms"]?.p95)}`} />
            <Tile label="Context per call" value={m.context.averagePromptTokens == null ? "–" : `${num(m.context.averagePromptTokens)} tokens`} note="what the model is given, on average" />
            <Tile label="Tokens used" value={num((m.counters["model.tokens.prompt"] ?? 0) + (m.counters["model.tokens.completion"] ?? 0))} note={`${num(m.counters["model.tokens.prompt"] ?? 0)} in · ${num(m.counters["model.tokens.completion"] ?? 0)} out${m.context.cachedPromptShare ? ` · ${Math.round(m.context.cachedPromptShare * 100)}% of input cached` : ""}`} />
          </section>

          <div className="glass mt-3 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.14em] text-white/55">
                <tr>
                  <th className="px-4 py-3 font-semibold">What the model was asked to do</th>
                  <th className="px-4 py-3 text-right font-semibold">Calls</th>
                  <th className="px-4 py-3 text-right font-semibold">Typical</th>
                  <th className="px-4 py-3 text-right font-semibold">Slowest</th>
                  <th className="px-4 py-3 text-right font-semibold">Context given</th>
                </tr>
              </thead>
              <tbody>
                {purposes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-white/60">
                      No model calls since the last restart. Send a message in the app and they appear here.
                    </td>
                  </tr>
                )}
                {purposes.map((p) => (
                  <tr key={p} className="border-t border-white/10">
                    <td className="px-4 py-2.5">{PURPOSES[p] ?? p}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(m.counters[`model.calls.${p}`])}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{ms(m.timings[`model.ms.${p}`]?.p50)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{ms(m.timings[`model.ms.${p}`]?.max)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{m.timings[`model.prompt_tokens.${p}`]?.p50 == null ? "–" : `${num(m.timings[`model.prompt_tokens.${p}`].p50)} tokens`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-white/55">
            &ldquo;Context given&rdquo; is the size of what the model reads for one call. It stays about the same however long a chat gets, because the model is given the last 12 messages and at most 40 ranked facts, never the whole history.
          </p>

          <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-equal-lime">Activity and protection</h2>
          <section className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Messages sent" value={num(m.counters["messages.sent"] ?? 0)} note="since the last restart" />
            <Tile label="Notifications sent" value={num(m.counters["push.sent"] ?? 0)} />
            <Tile label="Sent later" value={num(m.counters["scheduled.sent"] ?? 0)} note="scheduled messages delivered" />
            <Tile label="Requests refused" value={num(blocked.reduce((n, [, v]) => n + v, 0))} note={blocked.length ? blocked.map(([k, v]) => `${k.slice("ratelimit.blocked.".length)} ${v}`).join(" · ") : "by the rate limits"} />
          </section>
        </>
      )}

      <p className="mt-8 text-xs text-white/45">
        Health check for monitors: <code>/api/health</code>. These numbers as JSON: <code>/api/metrics</code>. They live in memory and reset when the server restarts.
      </p>
    </main>
  );
}
