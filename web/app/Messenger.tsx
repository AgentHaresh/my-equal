"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/snapshot";
import JobCard from "./JobCard";

type Props = { role: "me" | "them"; contactId?: string };
type Suggestion = Snapshot["suggestions"][number];

const DAY = 86400000;

function ago(iso: string, now: number) {
  const ms = now - new Date(iso).getTime();
  if (ms < 60000) return "now";
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  if (ms < DAY) return `${Math.floor(ms / 3600000)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

function clock(iso: string, now: number) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date(now).toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

async function call(url: string, method: string, body?: unknown): Promise<Snapshot> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

/** The four-dot mark and wordmark, drawn in text so no logo file is needed. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid grid-cols-2 gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[7px] w-[7px] rounded-full bg-equal-lime" />
        ))}
      </span>
      <span className="text-xl font-semibold lowercase tracking-tight text-white">equal</span>
    </span>
  );
}

const label = "text-[10px] font-semibold uppercase tracking-[0.18em]";

export default function Messenger({ role, contactId }: Props) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState(
    () => contactId ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("c") : null) ?? "ravi"
  );
  const [now, setNow] = useState(0); // refreshed with every poll, so rendering never reads the clock itself
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return; // don't overwrite a send that is in flight
    try {
      setSnap(await call(role === "them" ? `/api/state?friend=${encodeURIComponent(selected)}` : "/api/state", "GET"));
      setNow(Date.now());
    } catch {
      /* server restarting; the next poll will recover */
    }
  }, [role, selected]);

  useEffect(() => {
    const first = setTimeout(refresh, 0); // first load, then poll
    const t = setInterval(refresh, 1500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  const contact = snap?.contacts.find((c) => c.id === selected);
  const thread = snap?.messages.filter((m) => m.contactId === selected) ?? [];
  const threadLength = thread.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadLength, selected]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    busy.current = true;
    setDraft("");
    // Show the message at once; Equal's reading of it arrives with the server's reply.
    const pending = { id: `pending-${Date.now()}`, contactId: selected, from: role, text, at: new Date().toISOString() };
    setSnap((s) => (s ? { ...s, messages: [...s.messages, pending] } : s));
    try {
      const next = await call("/api/messages", "POST", { contactId: selected, from: role, text });
      setSnap(next);
      setNotice(next.error && role === "me" ? `Message sent. Equal could not read it: ${next.error}` : null);
    } catch {
      setNotice("Could not send. Check the server is running.");
      setDraft(text);
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  async function answer(s: Suggestion, action: "accept" | "dismiss") {
    setSnap(await call("/api/suggestions", "POST", { id: s.id, action }));
    if (action === "accept" && s.type !== "intent") setSelected(s.contactId);
  }

  async function bookProvider(jobId: string, callId: string) {
    setSnap(await call("/api/jobs", "POST", { jobId, callId }));
  }

  async function importChat(file: File) {
    if (!myName.trim()) return setNotice("Type your name as it appears in the export first.");
    setNotice("Reading the chat…");
    const next = (await call("/api/import", "POST", { text: await file.text(), myName })) as Snapshot & {
      imported?: number;
      contactId?: string;
    };
    if (next.contacts) setSnap(next);
    if (next.contactId) setSelected(next.contactId);
    setNotice(next.imported ? `Imported ${next.imported} messages.${next.error ? ` Equal could not read them: ${next.error}` : ""}` : next.error);
  }

  if (!snap) return <div className="flex h-screen items-center justify-center text-white/80">Loading…</div>;

  const offers = snap.suggestions.filter((s) => s.status === "new");
  const inlineOffer = offers.find((s) => s.type === "intent" && s.contactId === selected);
  const quiet = new Map(snap.gateLog.filter((g) => !g.spoke).map((g) => [g.messageId, g.reason]));
  const memories = snap.memories.filter((m) => m.contactId === selected && m.status === "open");
  const isMe = role === "me";
  const panel = "rounded-3xl border border-white/20 bg-equal-card/80 shadow-xl shadow-blue-950/20 backdrop-blur";

  return (
    <div className="flex h-screen w-full flex-col gap-3 p-3 text-white sm:p-4">
      <header className="flex items-center justify-between px-2">
        <Wordmark />
        <span className={`${label} rounded-full bg-equal-lime px-3 py-1 text-equal-ink`}>Builders 2026</span>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        {isMe && (
          <aside className={`${panel} flex w-64 shrink-0 flex-col overflow-hidden`}>
            <div className="px-5 pb-2 pt-4 font-display text-2xl text-equal-lime">Chats</div>
            <ul className="flex-1 overflow-y-auto px-2 pb-2">
              {snap.contacts.map((c) => {
                const last = snap.messages.filter((m) => m.contactId === c.id && m.from !== "butler").at(-1);
                const drifting = c.close && now - new Date(c.lastContactAt).getTime() > 14 * DAY;
                const active = c.id === selected;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${active ? "bg-white/20" : "hover:bg-white/10"}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-equal-lime font-semibold text-equal-ink">
                        {c.name[0]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{c.name}</span>
                          <span className={`shrink-0 text-xs ${drifting ? "font-semibold text-equal-lime" : "text-white/60"}`}>
                            {ago(c.lastContactAt, now)}
                          </span>
                        </span>
                        <span className="block truncate text-sm text-white/70">{last?.text ?? c.relation}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white text-equal-ink shadow-xl shadow-blue-950/20">
          <header className="flex items-center justify-between border-b border-blue-100 px-5 py-3">
            <div>
              <div className="font-semibold">{isMe ? contact?.name : `You are ${contact?.name}`}</div>
              <div className="text-xs text-equal-ink/60">{isMe ? contact?.relation : "Your side of the chat. Equal is not visible here."}</div>
            </div>
            {isMe && contact && (
              <a href={`/friend?c=${contact.id}`} target="_blank" className="text-xs font-medium text-equal-sky underline">
                Open {contact.name}&apos;s side
              </a>
            )}
          </header>

          <div className="flex-1 space-y-2 overflow-y-auto bg-blue-50/60 px-5 py-4">
            {thread.map((m) => {
              if (m.from === "butler")
                return (
                  <div key={m.id} className="flex justify-center">
                    <div className="max-w-[85%] rounded-2xl bg-equal-lime px-3.5 py-2 text-center text-sm text-equal-ink shadow-sm">
                      <span className="font-semibold">Equal · only you see this.</span> {m.text}
                    </div>
                  </div>
                );
              const mine = m.from === role;
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] shadow-sm ${mine ? "bg-equal-sky text-white" : "bg-white"}`}>
                    {m.text}
                    <span className={`ml-2 text-[10px] ${mine ? "text-white/70" : "text-equal-ink/40"}`}>{clock(m.at, now)}</span>
                  </div>
                  {isMe && quiet.has(m.id) && (
                    <div className="mt-0.5 max-w-[75%] text-[11px] italic text-equal-ink/50">Equal stayed quiet: {quiet.get(m.id)}</div>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {isMe && inlineOffer && (
            <div className="mx-4 mb-2 mt-2 flex items-center gap-3 rounded-2xl bg-equal-lime px-4 py-2.5 text-equal-ink shadow-sm">
              <span className="text-sm">
                <span className="font-semibold">Equal · only you see this.</span> {inlineOffer.title}
              </span>
              <span className="ml-auto flex shrink-0 gap-2">
                <button onClick={() => answer(inlineOffer, "accept")} className="rounded-full bg-equal-ink px-4 py-1.5 text-sm font-semibold text-white hover:bg-equal-deep">
                  Yes, please
                </button>
                <button onClick={() => answer(inlineOffer, "dismiss")} className="rounded-full px-3 py-1.5 text-sm font-medium hover:bg-black/10">
                  Not now
                </button>
              </span>
            </div>
          )}

          {notice && <div className="mx-4 mb-2 rounded-xl bg-blue-100 px-3 py-2 text-xs text-equal-ink">{notice}</div>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t border-blue-100 px-4 py-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${isMe ? contact?.name ?? "" : "back"}`}
              className="flex-1 rounded-full border border-blue-200 bg-white px-4 py-2 outline-none placeholder:text-equal-ink/40 focus:border-equal-sky"
            />
            <button disabled={sending || !draft.trim()} className="rounded-full bg-equal-sky px-5 py-2 font-semibold text-white disabled:opacity-40">
              {sending ? "…" : "Send"}
            </button>
          </form>
        </main>

        {isMe && (
          <aside className={`${panel} flex w-[22rem] shrink-0 flex-col gap-5 overflow-y-auto p-4`}>
            <div className="flex items-center justify-between">
              <div className="font-display text-2xl text-equal-lime">Your Equal</div>
              <span
                title={snap.butler}
                className={`${label} rounded-full px-2.5 py-1 ${snap.butler === "online" ? "bg-equal-lime text-equal-ink" : "bg-rose-500 text-white"}`}
              >
                {snap.butler === "online" ? "listening" : "offline"}
              </span>
            </div>
            {snap.butler !== "online" && <p className="-mt-3 text-xs text-rose-200">{snap.butler}</p>}

            <section className="space-y-2">
              <h2 className={`${label} text-white/70`}>For you</h2>
              {offers.length === 0 && snap.jobs.length === 0 && <p className="text-sm text-white/70">Nothing needs you right now.</p>}
              {offers.map((s) => (
                <div key={s.id} className="rounded-2xl border border-white/20 bg-white/10 p-3">
                  <div className={`${label} text-equal-lime`}>
                    {s.type === "intent" ? "Can help now" : s.type === "keep_close" ? "Stay close" : "Follow up"}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{s.title}</div>
                  <div className="text-sm text-white/80">{s.detail}</div>
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={() => answer(s, "accept")} className="rounded-full bg-equal-lime px-3.5 py-1 text-sm font-semibold text-equal-ink hover:brightness-95">
                      {s.type === "intent" ? "Yes, please" : "Open chat"}
                    </button>
                    <button onClick={() => answer(s, "dismiss")} className="rounded-full px-3 py-1 text-sm text-white/80 hover:bg-white/10">
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
              {[...snap.jobs].reverse().map((j) => (
                <JobCard key={j.id} job={j} onBook={bookProvider} />
              ))}
            </section>

            <section className="space-y-2">
              <h2 className={`${label} text-white/70`}>What I remember about {contact?.name}</h2>
              {memories.length === 0 && <p className="text-sm text-white/70">Nothing yet.</p>}
              {memories.map((m) => (
                <div key={m.id} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm">
                  {m.fact}
                  <span className="ml-2 text-xs text-white/60">
                    {m.when ? new Date(m.when).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : m.kind}
                    {m.sample ? " · sample" : ""}
                  </span>
                </div>
              ))}
            </section>

            <section className="mt-auto space-y-2 border-t border-white/20 pt-4">
              <h2 className={`${label} text-white/70`}>Bring in a WhatsApp chat</h2>
              <input
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                placeholder="Your name in the export"
                className="w-full rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-sm outline-none placeholder:text-white/50 focus:border-equal-lime"
              />
              <input
                type="file"
                accept=".txt"
                onChange={(e) => e.target.files?.[0] && importChat(e.target.files[0])}
                className="w-full text-xs text-white/70 file:mr-2 file:rounded-full file:border-0 file:bg-white/20 file:px-3 file:py-1.5 file:text-white"
              />
              <button
                onClick={async () => {
                  setSnap(await call("/api/state", "DELETE"));
                  setNotice("Reset to sample data.");
                }}
                className="text-xs text-white/60 underline"
              >
                Reset to sample data
              </button>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
