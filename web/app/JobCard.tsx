"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Snapshot } from "@/lib/snapshot";

type Job = Snapshot["jobs"][number];
type Call = Job["calls"][number];

function Code({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 132 }).then((d) => {
      if (live) setSrc(d);
    });
    return () => {
      live = false;
    };
  }, [url]);
  if (!src) return <div className="h-[66px] w-[66px] shrink-0 rounded bg-stone-100" />;
  // A data URL, so the image optimiser has nothing to do here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Scan to take this call" className="h-[66px] w-[66px] shrink-0 rounded" />;
}

function quoteLine(c: Call) {
  const q = c.quote;
  if (!q) return "No details yet";
  if (q.available === false) return "Cannot help";
  const parts = [];
  if (q.price_inr != null) parts.push(`₹${q.price_inr}`);
  if (q.eta_minutes != null) parts.push(`${q.eta_minutes} min`);
  return parts.join(" · ") || "No price given";
}

export default function JobCard({ job, onBook, onRemove }: { job: Job; onBook: (jobId: string, callId: string) => void; onRemove?: (jobId: string) => void }) {
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const booked = job.status === "booked";
  const anyQuote = job.calls.some((c) => c.status === "done" && c.quote);

  return (
    <div className="rounded-2xl bg-white p-3 text-equal-ink shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-equal-sky">
          {booked ? "Booked" : job.status === "ready" ? "Options ready" : "Calling around"}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={() => {
              if (booked || window.confirm(job.status === "calling" ? "Stop calling around and remove this?" : "Remove this?")) onRemove(job.id);
            }}
            aria-label="Remove this"
            title="Remove"
            className="-mr-1 -mt-1 rounded-full px-2 py-0.5 text-xs font-semibold text-equal-ink/50 hover:bg-blue-50 hover:text-equal-ink"
          >
            {booked ? "Clear ✕" : job.status === "calling" ? "Stop ✕" : "Remove ✕"}
          </button>
        )}
      </div>
      <div className="mt-0.5 text-sm text-equal-ink/80">{job.need}</div>

      <div className="mt-2 space-y-2">
        {job.calls.map((c) => {
          const url = `${origin}/call?id=${c.id}`;
          const recommended = job.recommendation?.callId === c.id;
          const chosen = job.bookedCallId === c.id;
          const tone = chosen ? "border-equal-sky bg-blue-50" : recommended && !booked ? "border-equal-lime bg-equal-lime/25" : "border-blue-100";
          return (
            <div key={c.id} className={`rounded-lg border p-2 ${tone}`}>
              <div className="flex items-center gap-2">
                {c.status === "waiting" && !booked && <Code url={url} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c.label}</span>
                    {recommended && !booked && <span className="rounded bg-equal-lime px-1.5 text-[10px] font-bold text-equal-ink">PICK</span>}
                    {chosen && <span className="rounded bg-equal-sky px-1.5 text-[10px] font-semibold text-white">BOOKED</span>}
                  </div>
                  {c.status === "waiting" && !booked && (
                    <div className="text-xs text-stone-500">
                      Waiting to be answered.{" "}
                      <a href={url} target="_blank" className="text-equal-sky underline">
                        Open call
                      </a>
                    </div>
                  )}
                  {c.status === "active" && <div className="text-xs font-medium text-equal-sky">On the call now…</div>}
                  {c.status === "done" && (
                    <div className="text-xs text-stone-600">
                      <span className="font-medium text-stone-800">{quoteLine(c)}</span>
                      {c.quote?.price_note ? ` · ${c.quote.price_note}` : ""}
                      {c.quote?.notes ? ` · ${c.quote.notes}` : ""}
                    </div>
                  )}
                </div>
                {c.status === "done" && c.quote && c.quote.available !== false && !booked && (
                  <button
                    onClick={() => onBook(job.id, c.id)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${recommended ? "bg-equal-ink text-white" : "border border-blue-200 text-equal-ink"}`}
                  >
                    Book
                  </button>
                )}
              </div>
              {c.transcript.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-stone-400">What was said ({c.transcript.length} lines)</summary>
                  <div className="mt-1 space-y-0.5 text-xs text-stone-600">
                    {c.transcript.map((t, i) => (
                      <div key={i}>
                        <span className="font-medium">{t.from === "butler" ? "Equal" : c.label}:</span> {t.text}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {!booked && job.recommendation && (
        <div className="mt-2 text-xs text-stone-700">
          <span className="font-semibold">My pick:</span> {job.calls.find((c) => c.id === job.recommendation?.callId)?.label}. {job.recommendation.reason}
        </div>
      )}
      {!booked && !anyQuote && (
        <div className="mt-2 text-xs text-stone-500">I will compare as soon as they answer. Nothing is booked until you say so.</div>
      )}
    </div>
  );
}
