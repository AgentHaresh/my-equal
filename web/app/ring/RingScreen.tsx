"use client";

import { useEffect, useRef, useState } from "react";

type Line = { from: "equal" | "caller"; text: string; at: string };
type View = { id: string; status: "active" | "done"; transcript: Line[]; error: string | null; heard?: string };
type Phase = "idle" | "recording" | "thinking" | "speaking";

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" };
const param = (name: string) => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(name) ?? "" : "");

/** What an unknown caller experiences when they ring a protected family member: Equal answers. */
export default function RingScreen() {
  const [view, setView] = useState<View | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      player.current?.pause();
    },
    []
  );

  const lines = view?.transcript.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, phase]);

  function sayLatest(v: View) {
    let n = -1;
    v.transcript.forEach((l, i) => {
      if (l.from === "equal") n = i;
    });
    if (n < 0) return setPhase("idle");
    player.current?.pause();
    const audio = new Audio(`/api/ring?id=${encodeURIComponent(v.id)}&n=${n}`);
    player.current = audio;
    setPhase("speaking");
    const done = () => setPhase((p) => (p === "speaking" ? "idle" : p));
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  }

  async function post(body: FormData | Record<string, string>) {
    setPhase("thinking");
    setNotice(null);
    try {
      const res =
        body instanceof FormData
          ? await fetch("/api/ring", { method: "POST", body })
          : await fetch("/api/ring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const next: View = await res.json();
      if (!next.transcript) {
        setNotice(next.error ?? "Something went wrong.");
        setPhase("idle");
        return;
      }
      setView(next);
      if (next.error) setNotice(`Equal could not reply: ${next.error}`);
      sayLatest(next);
    } catch {
      setNotice("Connection problem. Please try again.");
      setPhase("idle");
    }
  }

  async function startRecording() {
    if (!view) return;
    player.current?.pause();
    try {
      if (!stream.current) stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice("The microphone is blocked. You can type instead.");
      setTyping(true);
      return;
    }
    chunks.current = [];
    const rec = new MediaRecorder(stream.current);
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      const type = (rec.mimeType || "audio/webm").split(";")[0];
      const form = new FormData();
      form.append("id", view.id);
      form.append("audio", new Blob(chunks.current, { type }), `speech.${EXT[type] ?? "webm"}`);
      post(form);
    };
    recorder.current = rec;
    rec.start();
    setPhase("recording");
  }

  function sendTyped() {
    const text = draft.trim();
    if (!text || !view || phase === "thinking") return;
    setDraft("");
    setView({ ...view, transcript: [...view.transcript, { from: "caller", text, at: new Date().toISOString() }] });
    post({ id: view.id, text });
  }

  // Before the call: a dial screen. Tapping Call is also the tap that lets the browser play sound.
  if (!view)
    return (
      <div className="mx-auto flex h-dvh max-w-md flex-col items-center justify-center gap-6 px-8 text-center text-white">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">You are an unknown caller</div>
        <div className="font-display text-4xl text-equal-lime">Call Nanna</div>
        <p className="text-white/85">Nanna&apos;s phone is protected by Equal. Unknown numbers are answered by Equal first.</p>
        <button onClick={() => post({ u: param("u"), c: param("c") || "unknown-nanna" })} disabled={phase === "thinking"} className="rounded-full bg-equal-lime px-10 py-4 text-lg font-bold text-equal-ink shadow-xl disabled:opacity-50">
          {phase === "thinking" ? "Ringing…" : "Call"}
        </button>
        {notice && <div className="rounded-xl bg-rose-700 px-3 py-2 text-sm">{notice}</div>}
      </div>
    );

  const over = view.status === "done";
  const status = { idle: "Your turn", recording: "Tap again when you have finished", thinking: "Equal is thinking…", speaking: "Equal is speaking…" }[phase];

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col text-white">
      <header className="border-b border-white/20 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-equal-lime text-xl font-bold lowercase text-equal-ink">e</span>
          <div>
            <div className="font-display text-xl text-equal-lime">Equal</div>
            <div className="text-xs text-white/75">AI assistant · answering for Nanna</div>
          </div>
          <span className={`ml-auto shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${over ? "bg-white/20 text-white/80" : "bg-equal-lime font-semibold text-equal-ink"}`}>
            {over ? "call ended" : "on call"}
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {view.transcript.map((t, i) => (
          <div key={i} className={`flex ${t.from === "caller" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] ${t.from === "caller" ? "bg-white text-equal-ink" : "border border-white/20 bg-equal-card"}`}>{t.text}</div>
          </div>
        ))}
        {notice && <div className="rounded-xl bg-rose-900/70 px-3 py-2 text-xs">{notice}</div>}
        <div ref={endRef} />
      </div>

      {over ? (
        <div className="m-4 rounded-2xl border border-white/20 bg-equal-card px-4 py-4 text-center text-sm text-white/85">The call has ended.</div>
      ) : (
        <div className="border-t border-white/20 px-4 pb-5 pt-3">
          {typing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendTyped();
              }}
              className="flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type what you would say"
                autoFocus
                className="flex-1 rounded-full bg-white px-4 py-2.5 text-equal-ink outline-none placeholder:text-equal-ink/40 focus:ring-2 focus:ring-equal-lime"
              />
              <button disabled={phase === "thinking" || !draft.trim()} className="rounded-full bg-equal-lime px-5 py-2.5 font-semibold text-equal-ink disabled:opacity-40">
                Send
              </button>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => (phase === "recording" ? recorder.current?.stop() : startRecording())}
                disabled={phase === "thinking"}
                className={`flex h-20 w-20 items-center justify-center rounded-full text-sm font-bold shadow-xl transition disabled:opacity-40 ${phase === "recording" ? "animate-pulse bg-rose-500 text-white" : "bg-equal-lime text-equal-ink"}`}
              >
                {phase === "recording" ? "Send" : "Talk"}
              </button>
              <div className="text-sm text-white/85">{status}</div>
            </div>
          )}
          <button onClick={() => setTyping(!typing)} className="mt-2 block w-full text-center text-xs text-white/60 underline">
            {typing ? "Speak instead" : "Type instead"}
          </button>
        </div>
      )}
    </div>
  );
}
