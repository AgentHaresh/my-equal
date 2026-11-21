"use client";

import { useEffect, useRef, useState } from "react";

type GoogleId = {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const post = (body: unknown) => fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * The first screen. People sign in with their phone number and a one-time code, the way they
 * expect a messenger to work. Google sign-in stays as a second way in.
 */
export default function SignIn({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const slot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [known, setKnown] = useState(true);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    const start = () => {
      if (!window.google || !slot.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          const res = await post({ credential });
          if (res.ok) onDone();
          else setError((await res.json()).error ?? "Sign-in failed.");
        },
      });
      window.google.accounts.id.renderButton(slot.current, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 280 });
    };
    if (window.google) return start();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = start;
    script.onerror = () => setError("Could not load Google sign-in. Check your connection.");
    document.head.appendChild(script);
  }, [clientId, onDone]);

  async function askForCode() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post({ phone });
      const r = await res.json();
      if (!res.ok) return setError(r.error ?? "Could not send the code.");
      setSentTo(r.phone);
      setKnown(Boolean(r.known));
      setShownCode(r.sent ? null : (r.shownCode ?? null));
      setCode("");
      setStep("code");
    } catch {
      setError("Could not reach My Equal. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post({ phone: sentTo, code, name });
      if (res.ok) return onDone();
      setError((await res.json()).error ?? "Sign-in failed.");
    } catch {
      setError("Could not reach My Equal. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-2xl border border-white/20 bg-white/5 px-4 py-3.5 text-lg text-white outline-none placeholder:text-white/40 focus:border-equal-lime";
  const primary = "w-full rounded-2xl bg-equal-lime py-3.5 text-lg font-bold text-equal-ink transition disabled:opacity-40";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-10 text-center text-white">
      <span className="flex items-center gap-2.5">
        <span className="grid grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full bg-equal-lime" />
          ))}
        </span>
        <span className="text-3xl font-semibold lowercase tracking-tight">my equal</span>
      </span>

      <div className="max-w-xl">
        <h1 className="hero-text font-display text-4xl leading-tight sm:text-6xl">A messenger that remembers for you.</h1>
        <p className="mt-4 text-lg text-white/75">It keeps track of what matters in your chats, reminds you in time, and looks out for you and your family.</p>
      </div>

      <div className="glass w-full max-w-sm rounded-3xl p-5 text-left">
        {step === "phone" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              askForCode();
            }}
            className="space-y-3"
          >
            <label htmlFor="phone" className="block text-sm font-semibold text-white/80">
              Your phone number
            </label>
            <div className="flex gap-2">
              <span className="flex items-center rounded-2xl border border-white/20 bg-white/5 px-3 text-lg text-white/80">+91</span>
              <input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" className={field} />
            </div>
            <button disabled={busy || phone.replace(/\D/g, "").length < 10} className={primary}>
              {busy ? "Sending…" : "Send me a code"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
            className="space-y-3"
          >
            <label htmlFor="code" className="block text-sm font-semibold text-white/80">
              Enter the 6-digit code {shownCode ? "" : `sent to ${sentTo}`}
            </label>
            {shownCode && (
              <div className="rounded-2xl border border-amber-300/40 bg-amber-300/10 px-3 py-2.5 text-sm text-amber-100">
                No SMS service is connected to this server yet, so the code is shown here instead: <span className="font-mono text-lg font-bold tracking-widest text-white">{shownCode}</span>
              </div>
            )}
            <input id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" className={`${field} text-center font-mono text-2xl tracking-[0.5em]`} />
            {!known && (
              <>
                <label htmlFor="name" className="block text-sm font-semibold text-white/80">
                  Your name, as friends will see it
                </label>
                <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={field} />
              </>
            )}
            <button disabled={busy || code.length !== 6 || (!known && !name.trim())} className={primary}>
              {busy ? "Checking…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setError(null);
              }}
              className="w-full py-1 text-sm text-white/60 underline"
            >
              Use a different number
            </button>
          </form>
        )}
        {error && <div className="mt-3 rounded-xl bg-rose-600 px-3 py-2 text-sm">{error}</div>}
      </div>

      {clientId && (
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-white/40">or</span>
          <div ref={slot} className="min-h-[44px]" />
        </div>
      )}

      <p className="max-w-md text-xs leading-relaxed text-white/50">
        Built at Builders 2026. Equal reads your messages with an AI model (OpenAI) so it can help you. Only you see what it notices. Please don&apos;t share anything sensitive here.
      </p>
    </div>
  );
}
