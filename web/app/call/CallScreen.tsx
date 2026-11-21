"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Line = { from: "butler" | "provider"; text: string; at: string };
type View = {
  status: "waiting" | "active" | "done";
  transcript: Line[];
  outcome: "pending" | "chosen" | "not_chosen";
  error: string | null;
  heard?: string;
};
type Phase = "idle" | "recording" | "thinking" | "speaking";

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" };

export default function CallScreen() {
  const [id] = useState(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("id") ?? "" : ""));
  const [view, setView] = useState<View | null>(null);
  const [answered, setAnswered] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const busy = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

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

  // Release the microphone and stop any audio when the page closes.
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      player.current?.pause();
    },
    []
  );

  const lines = view?.transcript?.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, phase]);

  /** Play Equal's most recent line aloud. */
  function sayLatest(transcript: Line[]) {
    let n = -1;
    transcript.forEach((l, i) => {
      if (l.from === "butler") n = i;
    });
    if (n < 0) return setPhase("idle");
    player.current?.pause();
    const audio = new Audio(`/api/voice?id=${encodeURIComponent(id)}&n=${n}`);
    player.current = audio;
    setPhase("speaking");
    const done = () => setPhase((p) => (p === "speaking" ? "idle" : p));
    audio.onended = done;
    audio.onerror = () => {
      done();
      setNotice("Could not play the voice. The words are on screen.");
    };
    audio.play().catch(done);
  }

  function answer() {
    if (!view) return;
    setAnswered(true);
    sayLatest(view.transcript);
  }

  /** Send what the provider said (speech or typed text) and speak Equal's reply. */
  async function send(body: FormData | { id: string; text: string }) {
    busy.current = true;
    setPhase("thinking");
    setNotice(null);
    try {
      const res =
        body instanceof FormData
          ? await fetch("/api/voice", { method: "POST", body })
          : await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const next: View = await res.json();
      if (!next.transcript) {
        setNotice(next.error ?? "Something went wrong. Please try again.");
        setPhase("idle");
        return;
      }
      setView(next);
      if (next.error) setNotice(`Equal could not reply: ${next.error}`);
      sayLatest(next.transcript);
    } catch {
      setNotice("Connection problem. Please try again.");
      setPhase("idle");
    } finally {
      busy.current = false;
    }
  }

  async function startRecording() {
    player.current?.pause(); // talking over Equal interrupts it
    try {
      if (!stream.current) stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice("The microphone is blocked. You can type your reply instead.");
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
      const blob = new Blob(chunks.current, { type });
      const form = new FormData();
      form.append("id", id);
      form.append("audio", blob, `speech.${EXT[type] ?? "webm"}`);
      send(form);
    };
    recorder.current = rec;
    rec.start();
    setPhase("recording");
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function sendTyped() {
    const text = draft.trim();
    if (!text || !view || phase === "thinking") return;
    setDraft("");
    setView({ ...view, transcript: [...view.transcript, { from: "provider", text, at: new Date().toISOString() }] });
    send({ id, text });
  }

  if (!view) return <div className="flex h-screen items-center justify-center text-white/80">Connecting…</div>;
  if (!view.transcript)
    return <div className="flex h-screen items-center justify-center px-6 text-center text-white/80">{view.error ?? "This call link is not valid."}</div>;

  const over = view.status === "done";

  // Incoming-call screen. Answering is also the tap that lets the browser play sound.
  if (!answered && !over)
    return (
      <div className="mx-auto flex h-screen max-w-md flex-col items-center justify-center gap-6 px-8 text-center text-white">
        <span className="flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-equal-lime text-5xl font-bold lowercase text-equal-ink">e</span>
        <div>
          <div className="font-display text-4xl text-equal-lime">Equal is calling</div>
          <div className="mt-2 text-white/85">An AI assistant, calling on behalf of a customer who needs your help.</div>
        </div>
        <button onClick={answer} className="rounded-full bg-equal-lime px-10 py-4 text-lg font-bold text-equal-ink shadow-xl">
          Answer
        </button>
        <div className="text-xs text-white/60">You will hear Equal speak. Tap the button to reply by voice.</div>
      </div>
    );

  const status = { idle: "Your turn", recording: "Listening to you…", thinking: "Equal is thinking…", speaking: "Equal is speaking…" }[phase];

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col text-white">
      <header className="border-b border-white/20 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-equal-lime text-xl font-bold lowercase text-equal-ink">e</span>
          <div>
            <div className="font-display text-xl text-equal-lime">Equal</div>
            <div className="text-xs text-white/75">AI assistant · calling on behalf of a customer</div>
          </div>
          <span
            className={`ml-auto shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${over ? "bg-white/20 text-white/80" : "bg-equal-lime font-semibold text-equal-ink"}`}
          >
            {over ? "ended" : "on call"}
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {view.transcript.map((t, i) => (
          <div key={i} className={`flex ${t.from === "provider" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] ${t.from === "provider" ? "bg-white text-equal-ink" : "border border-white/20 bg-equal-card"}`}
            >
              {t.text}
            </div>
          </div>
        ))}
        {notice && <div className="rounded-xl bg-rose-900/70 px-3 py-2 text-xs">{notice}</div>}
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
                placeholder="Type your reply"
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
                onClick={phase === "recording" ? stopRecording : startRecording}
                disabled={phase === "thinking"}
                className={`flex h-20 w-20 items-center justify-center rounded-full text-sm font-bold shadow-xl transition disabled:opacity-40 ${
                  phase === "recording" ? "animate-pulse bg-rose-500 text-white" : "bg-equal-lime text-equal-ink"
                }`}
              >
                {phase === "recording" ? "Send" : "Talk"}
              </button>
              <div className="text-sm text-white/85">{phase === "recording" ? "Tap again when you have finished" : status}</div>
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
