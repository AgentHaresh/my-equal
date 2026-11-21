"use client";

import { useEffect, useState } from "react";
import type { MemoryResults, Check } from "@/lib/memory-eval";

// The memory benchmark on the scoreboard page: is what Equal remembers right?
// Every miss is listed, with what Equal kept or answered instead.

const KINDS: Record<Check["kind"], string> = { recall: "Kept the fact", date: "Right day", noise: "Left small talk out", answer: "Answered from memory", honesty: "Declined instead of guessing" };

function Tile({ title, right, total, hint }: { title: string; right: number; total: number; hint: string }) {
  const perfect = right === total;
  return (
    <div className="glass rounded-3xl p-5">
      <div className="text-sm text-white/80">{title}</div>
      <div className="mt-1 font-display text-5xl text-equal-lime">
        {right}
        <span className="text-2xl text-white/60"> / {total}</span>
      </div>
      <div className={`mt-1 text-xs ${perfect ? "text-white/60" : "text-amber-200"}`}>{perfect ? hint : `${total - right} missed, listed below`}</div>
    </div>
  );
}

export default function MemoryBenchmark() {
  const [r, setR] = useState<MemoryResults | { error: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/memory-eval")
      .then((res) => res.json())
      .then((d) => {
        if (live) setR(d);
      })
      .catch(() => {
        if (live) setR({ error: "Could not load the memory benchmark." });
      });
    return () => {
      live = false;
    };
  }, []);

  if (!r) return null;
  const misses = "error" in r ? [] : r.checks.filter((c) => !c.ok);

  return (
    <section className="space-y-4 border-t border-white/15 pt-8">
      <header>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">Memory benchmark</div>
        <h2 className="mt-1 font-display text-3xl text-equal-lime sm:text-4xl">Is what it remembers right?</h2>
        {"error" in r ? (
          <p className="mt-2 text-white/80">{r.error}</p>
        ) : (
          <p className="mt-2 max-w-3xl text-white/90">
            {r.cases} scripted chats in English and Telugu-English are read by the same code the app uses, with the real model ({r.model}), {r.modelCalls} model calls in all. Then the facts it kept, their dates, and its answers are checked against what a person would expect.
          </p>
        )}
      </header>
      {!("error" in r) && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Tile title="Facts kept" right={r.recall.right} total={r.recall.total} hint="of those expected" />
            <Tile title="Right day" right={r.dates.right} total={r.dates.total} hint="relative dates resolved" />
            <Tile title="Small talk left out" right={r.noise.clean} total={r.noise.total} hint="nothing kept that should not be" />
            <Tile title="Answered from memory" right={r.answers.right} total={r.answers.total} hint="correct answers" />
            <Tile title="Declined to guess" right={r.honesty.right} total={r.honesty.total} hint="when the chat did not say" />
          </div>
          <div className="glass rounded-3xl p-5 text-sm">
            <div className="font-semibold">{misses.length ? `${misses.length} missed` : "Nothing missed in this run"}</div>
            {misses.map((c, i) => (
              <div key={i} className="mt-2 border-l-2 border-amber-300 pl-3">
                <div className="text-white/90">
                  <span className="text-amber-200">{KINDS[c.kind]}</span> · {c.what} <span className="text-white/50">({c.caseId})</span>
                </div>
                <div className="text-xs text-white/65">{c.detail}</div>
              </div>
            ))}
            <p className="mt-3 text-xs text-white/60">
              Read this honestly: it is a small set written by the builder, in the style of LongMemEval, and it runs against a live model, so numbers can move a little between runs. Ran {new Date(r.ranAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              {r.note ? `. ${r.note}` : "."} The chats are in <code>web/eval/memory-cases.json</code>.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
