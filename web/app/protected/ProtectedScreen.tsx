"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/snapshot";

/** A protected family member's phone: one thread from an unknown number, with Equal's warnings. */
export default function ProtectedScreen() {
  const [id] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("c") ?? "unknown-nanna" : "unknown-nanna"));
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const u = new URLSearchParams(window.location.search).get("u") ?? "";
      const res = await fetch(`/api/state?protected=${encodeURIComponent(id)}&u=${encodeURIComponent(u)}`);
      setSnap(await res.json());
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

  const count = snap?.messages?.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [count]);

  if (!snap) return <div className="flex h-screen items-center justify-center text-white/80">Loading…</div>;
  const contact = snap.contacts?.[0];
  if (!contact) return <div className="flex h-screen items-center justify-center px-6 text-center text-white/80">Nothing here.</div>;
  const flagged = snap.messages.some((m) => m.scam);

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col text-white">
      <header className="border-b border-white/20 px-5 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-equal-lime">{contact.owner}&apos;s phone · protected by Equal</div>
        <div className="mt-1 flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${flagged ? "bg-rose-500 text-white" : "bg-white/25"}`}>?</span>
          <div>
            <div className="font-semibold">{contact.name}</div>
            <div className="text-xs text-white/75">Not in contacts</div>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {snap.messages.length === 0 && <div className="pt-10 text-center text-sm text-white/70">No messages yet.</div>}
        {snap.messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.from === "them" ? "items-start" : "items-end"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] ${m.from === "them" ? "bg-white text-equal-ink" : "bg-equal-card"}`}>
              {m.text}
            </div>
            {m.scam && (
              <div className="mt-1.5 w-full rounded-2xl bg-rose-600 px-4 py-3 shadow-lg">
                <div className="text-base font-bold">This looks like a scam</div>
                <div className="mt-1 text-sm">{m.scam.reason}</div>
                <div className="mt-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">{m.scam.advice}</div>
                <div className="mt-2 text-xs text-white/85">Equal has told your family.</div>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
