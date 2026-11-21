"use client";

import { useEffect, useState } from "react";
import type { Results, Outcome } from "@/lib/evaluate";

function Tile({ title, right, total, hint }: { title: string; right: number; total: number; hint: string }) {
  const pct = total ? Math.round((right / total) * 100) : 0;
  return (
    <div className="rounded-3xl border border-white/20 bg-equal-card/80 p-5 shadow-xl shadow-blue-950/20">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">{title}</div>
      <div className="mt-1 font-display text-5xl text-equal-lime">
        {right}/{total}
      </div>
      <div className="mt-1 text-sm text-white/85">
        {pct}% · {hint}
      </div>
    </div>
  );
}

function Misses({ title, list }: { title: string; list: Outcome[] }) {
  const wrong = list.filter((o) => !o.ok);
  return (
    <section className="rounded-3xl bg-white p-5 text-equal-ink shadow-xl shadow-blue-950/20">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-equal-sky">{title}</h2>
      {wrong.length === 0 && <p className="mt-2 text-sm">None in this run.</p>}
      <ul className="mt-2 space-y-3">
        {wrong.map((o, i) => (
          <li key={i} className="border-l-4 border-rose-500 pl-3 text-sm">
            <div className="font-medium">&ldquo;{o.text}&rdquo;</div>
            <div className="text-equal-ink/70">
              Should have been <b>{o.expect}</b>, was <b>{o.got}</b>. {o.detail}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Scoreboard() {
  const [r, setR] = useState<Results | { error: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/scoreboard")
      .then((res) => res.json())
      .then((d) => {
        if (live) setR(d);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!r) return <div className="flex min-h-screen items-center justify-center text-white/80">Loading…</div>;
  if ("error" in r) return <div className="flex min-h-screen items-center justify-center px-6 text-center text-white/80">{r.error}</div>;

  const total = r.gate.outcomes.length + r.scam.outcomes.length;
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 text-white">
      <header>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">My Equal · scoreboard</div>
        <h1 className="mt-1 font-display text-4xl text-equal-lime sm:text-5xl">Does it know when to speak?</h1>
        <p className="mt-2 max-w-2xl text-white/90">
          {total} hand-written messages in English, Hindi and Telugu, run through the same code the app uses. Written before any of them were tried.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile title="Offered help when it should" right={r.gate.speakRight} total={r.gate.speakTotal} hint="real, practical needs" />
        <Tile title="Stayed quiet when it should" right={r.gate.quietRight} total={r.gate.quietTotal} hint="venting, grief, small talk" />
        <Tile title="Scams caught" right={r.scam.caught} total={r.scam.scamTotal} hint="from unknown numbers" />
        <Tile title="Genuine messages left alone" right={r.scam.leftAlone} total={r.scam.genuineTotal} hint="no false alarm" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Misses title="Where it got the moment wrong" list={r.gate.outcomes} />
        <Misses title="Where the scam check was wrong" list={r.scam.outcomes} />
      </div>

      <footer className="rounded-3xl border border-white/20 bg-equal-card/60 p-4 text-sm text-white/85">
        <div>
          Run on {new Date(r.ranAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} with <b>{r.model}</b>.
        </div>
        <div className="mt-1">
          <b>
            {r.unseen.right} of {r.unseen.total}
          </b>{" "}
          correct on messages never used while building the app. The other {total - r.unseen.total} were also used during development.
        </div>
        {r.note && <div className="mt-1">{r.note}</div>}
        <div className="mt-1 text-white/65">
          A small test set shows the direction, not a guarantee. Every miss is listed above. The test messages are in the repository at web/eval/cases.json.
        </div>
      </footer>
    </div>
  );
}
