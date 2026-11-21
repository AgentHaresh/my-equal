"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/snapshot";
import type { Answer } from "@/lib/ask";
import { RELATIONS } from "@/lib/relations";
import JobCard from "./JobCard";
import SignIn from "./SignIn";

type Props = { role: "me" | "them" };
type Suggestion = Snapshot["suggestions"][number];
type Contact = Snapshot["contacts"][number];
type Pane = "chats" | "chat" | "equal";

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

const param = (name: string) => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(name) : null);

/** The four-dot mark and wordmark, drawn in text so no logo file is needed. */
function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid grid-cols-2 gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[7px] w-[7px] rounded-full bg-equal-lime" />
        ))}
      </span>
      <span className="text-xl font-semibold lowercase tracking-tight text-white">my equal</span>
    </span>
  );
}

function Avatar({ name, picture, tone }: { name: string; picture?: string; tone?: string }) {
  if (picture)
    // A small profile photo served by Google; the image optimiser adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold ${tone ?? "bg-equal-lime text-equal-ink"}`}>{name[0]?.toUpperCase()}</span>
  );
}

const label = "text-[10px] font-semibold uppercase tracking-[0.18em]";

export default function Messenger({ role }: Props) {
  const isMe = role === "me";
  const [owner] = useState(() => param("u") ?? ""); // on the link-opened "other side", whose account the chat belongs to
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [auth, setAuth] = useState<{ checked: boolean; clientId: string; signedIn: boolean }>({ checked: !isMe, clientId: "", signedIn: !isMe });
  const [selected, setSelected] = useState(() => param("c") ?? "");
  const [pane, setPane] = useState<Pane>(isMe ? "chats" : "chat");
  const [now, setNow] = useState(0); // refreshed with every poll, so rendering never reads the clock itself
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [reply, setReply] = useState<(Answer & { question: string }) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [recording, setRecording] = useState(false);
  const mic = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const api = useCallback(
    async (url: string, method: string, body?: unknown): Promise<Snapshot & { contactId?: string; imported?: number }> => {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401 && isMe) setAuth((a) => ({ ...a, signedIn: false }));
      return res.json();
    },
    [isMe]
  );

  const checkAuth = useCallback(async () => {
    const a = await fetch("/api/auth").then((r) => r.json());
    setAuth({ checked: true, clientId: a.clientId ?? "", signedIn: Boolean(a.user) });
    if (a.user?.name) setMyName((n) => n || a.user.name);
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return; // don't overwrite a send that is in flight
    try {
      const next = await api(isMe ? "/api/state" : `/api/state?friend=${encodeURIComponent(selected)}&u=${encodeURIComponent(owner)}`, "GET");
      if (next.contacts) {
        setSnap(next);
        setNow(Date.now());
      }
    } catch {
      /* server restarting; the next poll will recover */
    }
  }, [api, isMe, selected, owner]);

  useEffect(() => {
    if (!isMe) return;
    const t = setTimeout(checkAuth, 0);
    return () => clearTimeout(t);
  }, [isMe, checkAuth]);

  useEffect(() => {
    if (!auth.signedIn) return;
    const first = setTimeout(refresh, 0); // first load, then poll
    const t = setInterval(refresh, 1500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh, auth.signedIn]);

  const current = selected || snap?.contacts[0]?.id || "";
  const contact = snap?.contacts.find((c) => c.id === current);
  const thread = snap?.messages.filter((m) => m.contactId === current) ?? [];
  const threadLength = thread.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadLength, current, pane]);

  function open(id: string) {
    setSelected(id);
    setPane("chat");
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending || !current) return;
    setSending(true);
    busy.current = true;
    setDraft("");
    // Show the message at once; Equal's reading of it arrives with the server's reply.
    const pending = { id: `pending-${Date.now()}`, contactId: current, from: role, text, at: new Date().toISOString() };
    setSnap((s) => (s ? { ...s, messages: [...s.messages, pending] } : s));
    try {
      const next = await api("/api/messages", "POST", { contactId: current, from: role, text, u: owner });
      if (next.contacts) setSnap(next);
      setNotice(next.error && isMe ? `Message sent. Equal could not read it: ${next.error}` : null);
    } catch {
      setNotice("Could not send. Check your connection.");
      setDraft(text);
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  async function answer(s: Suggestion, action: "accept" | "dismiss") {
    const next = await api("/api/suggestions", "POST", { id: s.id, action });
    if (next.contacts) setSnap(next);
    if (action === "accept" && (s.type === "keep_close" || s.type === "follow_up")) open(s.contactId);
  }

  async function bookProvider(jobId: string, callId: string) {
    const next = await api("/api/jobs", "POST", { jobId, callId });
    if (next.contacts) setSnap(next);
  }

  async function startChat(userId: string) {
    const next = await api("/api/chats", "POST", { userId });
    if (next.contacts) setSnap(next);
    if (next.contactId) open(next.contactId);
  }

  async function importChat(file: File) {
    if (!myName.trim()) return setNotice("Enter your name as it appears in the export first.");
    setNotice("Reading the chat…");
    const next = await api("/api/import", "POST", { text: await file.text(), myName });
    if (next.contacts) setSnap(next);
    if (next.contactId) open(next.contactId);
    setNotice(next.imported ? `Imported ${next.imported} messages.${next.error ? ` Equal could not read them: ${next.error}` : ""}` : next.error);
  }

  async function askQuestion() {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      setReply({ ...(await res.json()), question: q });
      setQuestion("");
    } finally {
      setAsking(false);
    }
  }

  /** Voice note: tap to start, tap again to send. It is transcribed and then treated like a typed message. */
  async function toggleVoice() {
    if (recording) return recorder.current?.stop();
    if (!current) return;
    try {
      if (!mic.current) mic.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setNotice("The microphone is blocked. Allow it in your browser to send voice notes.");
    }
    chunks.current = [];
    const rec = new MediaRecorder(mic.current);
    const to = current;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = async () => {
      setRecording(false);
      setSending(true);
      busy.current = true;
      setNotice("Sending your voice note…");
      try {
        const type = (rec.mimeType || "audio/webm").split(";")[0];
        const form = new FormData();
        form.append("contactId", to);
        form.append("audio", new Blob(chunks.current, { type }), `note.${type.split("/")[1] ?? "webm"}`);
        const res = await fetch("/api/voicenote", { method: "POST", body: form });
        const next = await res.json();
        if (next.contacts) setSnap(next);
        setNotice(next.contacts ? (next.error ? `Voice note sent. Equal could not read it: ${next.error}` : null) : next.error ?? "Could not send the voice note.");
      } catch {
        setNotice("Could not send the voice note. Check your connection.");
      } finally {
        busy.current = false;
        setSending(false);
      }
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    setNotice("Recording… tap the red button to send.");
  }

  /** Put a draft in the message box, written the way I write. I still edit and send it myself. */
  async function draftFor(s: Suggestion) {
    open(s.contactId);
    setNotice("Drafting something you could say…");
    const res = await fetch("/api/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: s.contactId, about: s.detail }) });
    const d = await res.json();
    if (d.draft) setDraft(d.draft);
    setNotice(d.draft ? "A draft is in the box. Edit it and send it yourself." : d.error ?? "Could not write a draft.");
  }

  async function forget(id: string) {
    const next = await api("/api/memories", "POST", { id });
    if (next.contacts) setSnap(next);
  }

  /** Shrink a photo in the browser before sending it, so uploads are quick on a phone. */
  async function shrink(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
  }

  async function addPhoto(file: File) {
    setNotice("Reading the photo…");
    try {
      const form = new FormData();
      form.append("image", await shrink(file), "photo.jpg");
      const res = await fetch("/api/photo", { method: "POST", body: form });
      const next = await res.json();
      if (next.contacts) setSnap(next);
      if (next.photo?.error) return setNotice(next.photo.error);
      if (next.contactId) open(next.contactId);
      setNotice(`Saved "${next.photo.title}". ${next.photo.added} thing${next.photo.added === 1 ? "" : "s"} to remember.`);
    } catch {
      setNotice("Could not read that photo. Please try again.");
    }
  }

  async function describe(contactId: string, change: { relation?: string; close?: boolean }) {
    const next = await api("/api/contacts", "POST", { contactId, ...change });
    if (next.contacts) setSnap(next);
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    setSnap(null);
    setAuth((a) => ({ ...a, signedIn: false }));
  }

  if (!auth.checked) return <div className="flex h-screen items-center justify-center text-white/80">Loading…</div>;
  if (!auth.signedIn) return <SignIn clientId={auth.clientId} onDone={checkAuth} />;
  if (!snap) return <div className="flex h-screen items-center justify-center text-white/80">Loading…</div>;
  if (!isMe && !contact) return <div className="flex h-screen items-center justify-center px-6 text-center text-white/80">This link is not valid.</div>;

  const me = snap.me;
  const offers = snap.suggestions.filter((s) => s.status === "new");
  const reminders = offers.filter((s) => s.type === "reminder");
  const others = offers.filter((s) => s.type !== "reminder");
  const inlineOffer = offers.find((s) => s.type === "intent" && s.contactId === current);
  const quiet = new Map(snap.gateLog.filter((g) => !g.spoke).map((g) => [g.messageId, g.reason]));
  const memories = snap.memories.filter((m) => m.contactId === current && m.status === "open");
  const known = new Set(snap.contacts.map((c) => c.userId).filter(Boolean));
  const strangers = snap.people.filter((p) => !known.has(p.id));
  const panel = "rounded-3xl border border-white/20 bg-equal-card/80 shadow-xl shadow-blue-950/20 backdrop-blur";
  const show = (p: Pane) => (pane === p ? "flex" : "hidden");
  const side = (c: Contact) => `/friend?u=${me?.id ?? ""}&c=${c.id}`;

  return (
    <div className="flex h-dvh w-full flex-col gap-3 p-3 text-white sm:p-4">
      <header className="flex items-center justify-between px-2">
        <Wordmark />
        {isMe && me ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="hidden text-white/85 sm:inline">{me.name}</span>
            <button onClick={signOut} className="rounded-full border border-white/30 px-3 py-1 text-xs text-white/85 hover:bg-white/10">
              Sign out
            </button>
          </span>
        ) : (
          <span className={`${label} rounded-full bg-equal-lime px-3 py-1 text-equal-ink`}>Builders 2026</span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        {isMe && (
          <aside className={`${panel} ${show("chats")} w-full shrink-0 flex-col overflow-hidden md:flex md:w-72`}>
            <div className="px-5 pb-2 pt-4 font-display text-2xl text-equal-lime">Chats</div>
            <ul className="flex-1 overflow-y-auto px-2 pb-2">
              {snap.contacts.map((c) => {
                const last = snap.messages.filter((m) => m.contactId === c.id && m.from !== "butler").at(-1);
                const drifting = c.close && now - new Date(c.lastContactAt).getTime() > 14 * DAY;
                const active = c.id === current;
                const flagged = snap.messages.some((m) => m.contactId === c.id && m.scam);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => open(c.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${active ? "bg-white/20" : "hover:bg-white/10"}`}
                    >
                      <Avatar
                        name={c.unknown ? "?" : c.name}
                        picture={c.picture}
                        tone={flagged ? "bg-rose-500 text-white" : c.unknown ? "bg-white/25 text-white" : undefined}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">
                            {c.name}
                            {c.sample && <span className="ml-1.5 rounded bg-white/15 px-1 text-[9px] font-normal uppercase tracking-wider text-white/70">sample</span>}
                          </span>
                          <span className={`shrink-0 text-xs ${drifting ? "font-semibold text-equal-lime" : "text-white/60"}`}>{ago(c.lastContactAt, now)}</span>
                        </span>
                        <span className={`block truncate text-sm ${flagged ? "font-semibold text-rose-200" : "text-white/70"}`}>
                          {flagged ? "Looks like a scam" : last?.text ?? c.relation}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {strangers.length > 0 && (
                <li className="mt-3 px-3">
                  <div className={`${label} mb-1 text-white/60`}>People here</div>
                </li>
              )}
              {strangers.map((p) => (
                <li key={p.id}>
                  <button onClick={() => startChat(p.id)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-white/10">
                    <Avatar name={p.name} picture={p.picture} tone="bg-white/25 text-white" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="rounded-full bg-equal-lime px-2.5 py-0.5 text-xs font-semibold text-equal-ink">Chat</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <main className={`${show("chat")} min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white text-equal-ink shadow-xl shadow-blue-950/20 md:flex`}>
          <header className="flex items-center justify-between gap-2 border-b border-blue-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {isMe && (
                <button onClick={() => setPane("chats")} className="rounded-full px-2 py-1 text-lg text-equal-sky md:hidden" aria-label="Back to chats">
                  ‹
                </button>
              )}
              <div className="min-w-0">
                <div className="truncate font-semibold">{isMe ? contact?.name ?? "Pick a chat" : `You are ${contact?.name}`}</div>
                <div className="truncate text-xs text-equal-ink/60">{isMe ? contact?.relation : "Your side of the chat. Equal is not visible here."}</div>
              </div>
            </div>
            {isMe && contact?.sample && (
              <a href={side(contact)} target="_blank" className="shrink-0 text-xs font-medium text-equal-sky underline">
                Open their side
              </a>
            )}
          </header>

          <div className="flex-1 space-y-2 overflow-y-auto bg-blue-50/60 px-4 py-4">
            {thread.length === 0 && <div className="pt-8 text-center text-sm text-equal-ink/50">No messages yet. Say hello.</div>}
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
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] shadow-sm ${mine ? "bg-equal-sky text-white" : "bg-white"}`}>
                    {m.voice && (
                      <span className={`mb-0.5 block text-[10px] font-semibold uppercase tracking-wider ${mine ? "text-white/75" : "text-equal-sky"}`}>
                        Voice note{m.voice.language ? ` · ${m.voice.language}` : ""}
                      </span>
                    )}
                    {m.text}
                    <span className={`ml-2 text-[10px] ${mine ? "text-white/70" : "text-equal-ink/40"}`}>{clock(m.at, now)}</span>
                    {m.voice?.english && <span className={`mt-1 block border-t pt-1 text-[13px] italic ${mine ? "border-white/25 text-white/85" : "border-blue-100 text-equal-ink/70"}`}>In English: {m.voice.english}</span>}
                  </div>
                  {isMe && m.scam && (
                    <div className="mt-1.5 max-w-[80%] rounded-2xl bg-rose-600 px-4 py-3 text-white shadow">
                      <div className="font-bold">Equal: this looks like a scam ({m.scam.pattern})</div>
                      <div className="mt-1 text-sm">{m.scam.reason}</div>
                      <div className="mt-2 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">{m.scam.advice}</div>
                    </div>
                  )}
                  {isMe && quiet.has(m.id) && <div className="mt-0.5 max-w-[80%] text-[11px] italic text-equal-ink/50">Equal stayed quiet: {quiet.get(m.id)}</div>}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {isMe && inlineOffer && (
            <div className="mx-3 mb-2 mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-equal-lime px-4 py-2.5 text-equal-ink shadow-sm">
              <span className="min-w-0 flex-1 basis-48 text-sm">
                <span className="font-semibold">Equal · only you see this.</span> {inlineOffer.title}
              </span>
              <span className="flex shrink-0 gap-2">
                <button onClick={() => { answer(inlineOffer, "accept"); setPane("equal"); }} className="rounded-full bg-equal-ink px-4 py-1.5 text-sm font-semibold text-white">
                  Yes, please
                </button>
                <button onClick={() => answer(inlineOffer, "dismiss")} className="rounded-full px-3 py-1.5 text-sm font-medium hover:bg-black/10">
                  Not now
                </button>
              </span>
            </div>
          )}

          {notice && <div className="mx-3 mb-2 rounded-xl bg-blue-100 px-3 py-2 text-xs text-equal-ink">{notice}</div>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 border-t border-blue-100 px-3 py-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={contact ? `Message ${isMe ? contact.name : "back"}` : "Pick a chat first"}
              disabled={!contact}
              className="min-w-0 flex-1 rounded-full border border-blue-200 bg-white px-4 py-2 outline-none placeholder:text-equal-ink/40 focus:border-equal-sky"
            />
            {isMe && contact && (
              <button
                type="button"
                onClick={toggleVoice}
                disabled={sending && !recording}
                aria-label={recording ? "Stop and send voice note" : "Record a voice note"}
                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold disabled:opacity-40 ${recording ? "animate-pulse bg-rose-500 text-white" : "border border-blue-200 text-equal-sky"}`}
              >
                {recording ? "Stop" : "Voice"}
              </button>
            )}
            <button disabled={sending || !draft.trim() || !contact} className="rounded-full bg-equal-sky px-5 py-2 font-semibold text-white disabled:opacity-40">
              {sending ? "…" : "Send"}
            </button>
          </form>
        </main>

        {isMe && (
          <aside className={`${panel} ${show("equal")} w-full shrink-0 flex-col gap-5 overflow-y-auto p-4 md:flex md:w-[22rem]`}>
            <div className="flex items-center justify-between">
              <div className="font-display text-2xl text-equal-lime">Your Equal</div>
              <span title={snap.butler} className={`${label} rounded-full px-2.5 py-1 ${snap.butler === "online" ? "bg-equal-lime text-equal-ink" : "bg-rose-500 text-white"}`}>
                {snap.butler === "online" ? "listening" : "offline"}
              </span>
            </div>
            {snap.butler !== "online" && <p className="-mt-3 text-xs text-rose-200">{snap.butler}</p>}

            <section className="space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  askQuestion();
                }}
                className="flex gap-2"
              >
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask me anything you've forgotten"
                  className="min-w-0 flex-1 rounded-full border border-white/30 bg-white/10 px-3.5 py-2 text-sm outline-none placeholder:text-white/55 focus:border-equal-lime"
                />
                <button disabled={asking || !question.trim()} className="rounded-full bg-equal-lime px-4 py-2 text-sm font-semibold text-equal-ink disabled:opacity-40">
                  {asking ? "…" : "Ask"}
                </button>
              </form>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-white/40 px-3 py-2 text-sm text-white/90 hover:bg-white/10">
                <span className="font-semibold text-equal-lime">+ Photo to remember</span>
                <span className="text-xs text-white/60">prescription, bill, invitation</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) addPhoto(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {reply && (
                <div className="rounded-2xl bg-white p-3 text-equal-ink shadow-lg">
                  <div className="text-xs text-equal-ink/60">{reply.question}</div>
                  <div className="mt-1 text-sm font-medium">{reply.error ? `I could not answer: ${reply.error}` : reply.answer}</div>
                  {reply.sources?.map((src, i) => (
                    <div key={i} className="mt-2 border-l-2 border-equal-sky pl-2 text-xs text-equal-ink/70">
                      <span className="font-semibold">
                        {src.from} · chat with {src.who} · {new Date(src.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                      <div className="line-clamp-2">{src.text}</div>
                    </div>
                  ))}
                  <button onClick={() => setReply(null)} className="mt-2 text-xs text-equal-sky underline">
                    Close
                  </button>
                </div>
              )}
            </section>

            {reminders.length > 0 && (
              <section className="space-y-2">
                <h2 className={`${label} text-white/70`}>Don&apos;t forget</h2>
                {reminders.map((s) => (
                  <div key={s.id} className="rounded-2xl border-l-4 border-equal-lime bg-white/10 p-3">
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="text-xs text-white/75">{s.detail}</div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => answer(s, "accept")} className="rounded-full bg-equal-lime px-3.5 py-1 text-sm font-semibold text-equal-ink">
                        Done
                      </button>
                      <button onClick={() => answer(s, "dismiss")} className="rounded-full px-3 py-1 text-sm text-white/85 hover:bg-white/10">
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-2">
              <h2 className={`${label} text-white/70`}>For you</h2>
              {others.length === 0 && snap.jobs.length === 0 && <p className="text-sm text-white/70">Nothing needs you right now.</p>}
              {others.map((s) => (
                <div key={s.id} className={`rounded-2xl border p-3 ${s.type === "guardian" ? "border-rose-300 bg-rose-600" : "border-white/20 bg-white/10"}`}>
                  <div className={`${label} ${s.type === "guardian" ? "text-white" : "text-equal-lime"}`}>
                    {s.type === "guardian" ? "Family alert" : s.type === "intent" ? "Can help now" : s.type === "keep_close" ? "Stay close" : "Follow up"}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{s.title}</div>
                  <div className="text-sm text-white/85">{s.detail}</div>
                  <div className="mt-2.5 flex flex-wrap gap-2 whitespace-nowrap">
                    <button onClick={() => answer(s, "accept")} className="rounded-full bg-equal-lime px-3.5 py-1 text-sm font-semibold text-equal-ink hover:brightness-95">
                      {s.type === "guardian" ? "I'll call them" : s.type === "intent" ? "Yes, please" : "Open chat"}
                    </button>
                    {(s.type === "keep_close" || s.type === "follow_up") && (
                      <button onClick={() => draftFor(s)} className="rounded-full border border-equal-lime px-3 py-1 text-sm font-medium text-equal-lime hover:bg-white/10">
                        Draft a message
                      </button>
                    )}
                    <button onClick={() => answer(s, "dismiss")} className="rounded-full px-3 py-1 text-sm text-white/85 hover:bg-white/10">
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
              {[...snap.jobs].reverse().map((j) => (
                <JobCard key={j.id} job={j} onBook={bookProvider} />
              ))}
            </section>

            {contact && (
              <section className="space-y-2">
                <h2 className={`${label} text-white/70`}>What I remember about {contact.name}</h2>
                {!contact.unknown && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="text-white/75">{contact.name} is your</span>
                    <select
                      value={(RELATIONS as readonly string[]).includes(contact.relation) ? contact.relation : ""}
                      onChange={(e) => describe(contact.id, { relation: e.target.value })}
                      className="rounded-full border border-white/30 bg-equal-card px-2 py-0.5 text-sm text-white outline-none"
                    >
                      <option value="" disabled>
                        {contact.relation}
                      </option>
                      {RELATIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-white/75">
                      <input type="checkbox" checked={contact.close} onChange={(e) => describe(contact.id, { close: e.target.checked })} className="accent-[#cef82c]" />
                      keep close
                    </label>
                  </div>
                )}
                {contact.relationSource === "inferred" && contact.relationWhy && <div className="text-xs text-white/60">Worked out from your chat: {contact.relationWhy}</div>}
                {memories.length === 0 && <p className="text-sm text-white/70">Nothing yet.</p>}
                {memories.map((m) => (
                  <div key={m.id} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm">
                    <button onClick={() => forget(m.id)} title="Forget this" className="float-right ml-2 rounded-full px-1.5 text-xs text-white/50 hover:bg-white/15 hover:text-white">
                      Forget
                    </button>
                    {m.fact}
                    <span className="ml-2 text-xs text-white/60">
                      {m.when ? new Date(m.when).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : m.kind}
                      {m.sample ? " · sample" : ""}
                    </span>
                  </div>
                ))}
              </section>
            )}

            <section className="space-y-2 border-t border-white/20 pt-4">
              <h2 className={`${label} text-white/70`}>Bring in a WhatsApp chat</h2>
              <p className="text-xs text-white/70">In WhatsApp: open a chat, then More, Export chat, Without media. Choose the .txt file here.</p>
              <input
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                placeholder="Your name as WhatsApp shows it"
                className="w-full rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-sm outline-none placeholder:text-white/50 focus:border-equal-lime"
              />
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importChat(f);
                  e.target.value = "";
                }}
                className="w-full text-xs text-white/70 file:mr-2 file:rounded-full file:border-0 file:bg-equal-lime file:px-3 file:py-1.5 file:font-semibold file:text-equal-ink"
              />
            </section>

            <section className="mt-auto space-y-1.5 border-t border-white/20 pt-4 text-xs text-white/70">
              <h2 className={`${label} text-white/70`}>Try the family scam shield</h2>
              <a href={`/ring?u=${me?.id ?? ""}&c=unknown-nanna`} target="_blank" className="block underline">
                Call Nanna as a stranger
              </a>
              <a href={`/friend?u=${me?.id ?? ""}&c=unknown-nanna`} target="_blank" className="block underline">
                Message Nanna as a stranger
              </a>
              <a href={`/protected?u=${me?.id ?? ""}&c=unknown-nanna`} target="_blank" className="block underline">
                See Nanna&apos;s phone
              </a>
              <button
                onClick={async () => {
                  const next = await api("/api/state", "DELETE");
                  if (next.contacts) setSnap(next);
                  setNotice("Sample chats reset. Your real chats were kept.");
                }}
                className="pt-1 underline"
              >
                Reset the sample chats
              </button>
            </section>
          </aside>
        )}
      </div>

      {isMe && (
        <nav className="grid grid-cols-3 gap-2 md:hidden">
          {(["chats", "chat", "equal"] as Pane[]).map((p) => (
            <button
              key={p}
              onClick={() => setPane(p)}
              className={`rounded-full py-2 text-sm font-semibold ${pane === p ? "bg-equal-lime text-equal-ink" : "bg-white/15 text-white"}`}
            >
              {p === "chats" ? "Chats" : p === "chat" ? contact?.name ?? "Chat" : `Equal${offers.length ? ` · ${offers.length}` : ""}`}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
