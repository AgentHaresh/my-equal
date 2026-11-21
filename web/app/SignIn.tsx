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

/** The first screen: sign in with Google. Says plainly what Equal does with messages. */
export default function SignIn({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const slot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    const start = () => {
      if (!window.google || !slot.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) });
          if (res.ok) onDone();
          else setError((await res.json()).error ?? "Sign-in failed.");
        },
      });
      window.google.accounts.id.renderButton(slot.current, { theme: "filled_blue", size: "large", shape: "pill", text: "continue_with", width: 280 });
    };
    if (window.google) return start();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = start;
    script.onerror = () => setError("Could not load Google sign-in. Check your connection.");
    document.head.appendChild(script);
  }, [clientId, onDone]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 px-6 py-10 text-center text-white">
      <span className="flex items-center gap-2.5">
        <span className="grid grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full bg-equal-lime" />
          ))}
        </span>
        <span className="text-3xl font-semibold lowercase tracking-tight">my equal</span>
      </span>

      <div className="max-w-xl">
        <h1 className="font-display text-4xl leading-tight text-equal-lime sm:text-5xl">Your AI messenger is your AI assistant.</h1>
        <p className="mt-4 text-lg text-white/90">It remembers what matters in your chats, makes the hard calls for you, and keeps you and your family close and safe.</p>
      </div>

      <div className="flex min-h-[44px] flex-col items-center gap-3">
        {clientId ? <div ref={slot} /> : <div className="rounded-2xl bg-white/15 px-4 py-3 text-sm">Google sign-in is not set up on this server yet.</div>}
        {error && <div className="rounded-xl bg-rose-600 px-3 py-2 text-sm">{error}</div>}
      </div>

      <p className="max-w-md text-xs leading-relaxed text-white/70">
        A demo built at Builders 2026. Equal reads your messages with an AI model (OpenAI) so it can help you. Only you see what it notices. Please
        don&apos;t share anything sensitive here.
      </p>
    </div>
  );
}
