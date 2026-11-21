"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type View = {
  status: "waiting" | "active" | "done";
  transcript: { from: "butler" | "provider"; text: string; at: string }[];
  outcome: "pending" | "chosen" | "not_chosen";
  error: string | null;
};

export default function CallScreen() {
  const [id] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("id") ?? "" : ""));
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (busy.current || !id) return;
    try {
      const res = await fetch(`/api/calls?id=${encodeURIComponent(id)}`);
      setView(await res.json());
    } catch {
      /* retry on the next poll */
    }
  }, [id]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 1500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  const lines = view?.transcript?.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending || !view) return;
    setSending(true);
    busy.current = true;
    setDraft("");
    setView({ ...view, transcript: [...view.transcript, { from: "provider", text, at: new Date().toISOString() }] });
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, text }),
      });
      setView(await res.json());
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  if (!view) return <div className="flex h-screen items-center justify-center text-white/80">Connecting…</div>;
  if (!view.transcript)
    return (
      <div className="flex h-screen items-center justify-center px-6 text-center text-white/80">
        {view.error ?? "This call link is not valid."}
      </div>
    );

  const over = view.status === "done";
  return (
    <div className="mx-auto flex h-screen max-w-md flex-col text-white">
      <header className="border-b border-white/20 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-equal-lime text-xl font-bold lowercase text-equal-ink">e</span>
          <div>
            <div className="font-display text-xl text-equal-lime">Equal</div>
            <div className="text-xs text-white/75">AI assistant · calling on behalf of a customer</div>
          </div>
          <span className={`ml-auto shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${over ? "bg-white/20 text-white/80" : "bg-equal-lime font-semibold text-equal-ink"}`}>
            {over ? "ended" : "on call"}
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {view.transcript.map((t, i) => (
          <div key={i} className={`flex ${t.from === "provider" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] ${t.from === "provider" ? "bg-white text-equal-ink" : "border border-white/20 bg-equal-card"}`}>
              {t.text}
            </div>
          </div>
        ))}
        {sending && <div className="text-sm text-white/70">Equal is replying…</div>}
        {view.error && <div className="rounded-lg bg-rose-900/60 px-3 py-2 text-xs">Equal could not reply: {view.error}</div>}
        <div ref={endRef} />
      </div>

      {view.outcome === "chosen" && (
        <div className="m-4 rounded-2xl bg-equal-lime px-4 py-4 text-center text-equal-ink">
          <div className="text-lg font-semibold">Confirmed</div>
          <div className="text-sm">The customer chose you. Please go ahead.</div>
        </div>
      )}
      {view.outcome === "not_chosen" && (
        <div className="m-4 rounded-2xl border border-white/20 bg-equal-card px-4 py-4 text-center text-sm">
          The customer went with another option this time. Thank you for your time.
        </div>
      )}
      {view.outcome === "pending" && over && (
        <div className="m-4 rounded-2xl border border-white/20 bg-equal-card px-4 py-4 text-center text-sm text-white/85">
          Thank you. The customer is deciding. This page will update.
        </div>
      )}

      {!over && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2 border-t border-white/20 px-4 py-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your reply"
            autoFocus
            className="flex-1 rounded-full bg-white px-4 py-2.5 text-equal-ink outline-none placeholder:text-equal-ink/40 focus:ring-2 focus:ring-equal-lime"
          />
          <button disabled={sending || !draft.trim()} className="rounded-full bg-equal-lime px-5 py-2.5 font-semibold text-equal-ink disabled:opacity-40">
            Send
          </button>
        </form>
      )}
    </div>
  );
}
