// The lock on Equal's memory on this device (lib/vault.ts): set it up, see the recovery code once,
// unlock with the passkey or the code, lock again, or forget it all.
"use client";

import { useState } from "react";
import type { MindLock } from "./localMind";

export type MemoryControls = {
  lock: MindLock;
  /** The recovery code, shown once right after the lock is made. */
  code: string | null;
  codeSaved: () => void;
  busy: boolean;
  note: string | null;
  setUp: () => void;
  unlock: (code?: string) => void;
  relock: () => void;
  forget: () => void;
};

const button = "mt-2 w-full rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40";
const small = "mt-1 text-[11px] leading-snug text-equal-ink/70";

export default function MemoryLock({ m }: { m: MemoryControls }) {
  const [typed, setTyped] = useState("");
  const [sure, setSure] = useState(false);

  if (m.code)
    return (
      <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2">
        <p className="text-[11px] font-semibold text-equal-ink">Your recovery code. It is shown only now.</p>
        <p data-testid="recovery-code" className="mt-1 select-all break-all font-mono text-sm tracking-wide text-equal-ink">
          {m.code}
        </p>
        <p className={small}>Write it down or keep it in a password manager. If this phone&apos;s passkey is lost, it is the only way back in.</p>
        <button onClick={m.codeSaved} className={`${button} bg-equal-lime text-equal-ink`}>
          I have kept it
        </button>
      </div>
    );

  return (
    <>
      {!m.lock && (
        <>
          <button onClick={m.setUp} disabled={m.busy} className={`${button} border border-blue-200 text-equal-sky`}>
            Lock Equal&apos;s memory here
          </button>
          <p className={small}>With this phone&apos;s passkey (fingerprint, face or screen lock) and a recovery code. Without them, what Equal learned here cannot be read.</p>
        </>
      )}
      {m.lock?.locked && (
        <>
          <p className="mt-2 text-[12px] font-semibold text-equal-ink">🔐 Equal&apos;s memory here is locked</p>
          {m.lock.passkey && (
            <button onClick={() => m.unlock()} disabled={m.busy} className={`${button} bg-equal-lime text-equal-ink`}>
              Unlock with passkey
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) m.unlock(typed);
            }}
            className="mt-2 flex gap-1"
          >
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Recovery code" aria-label="Recovery code" className="min-w-0 flex-1 rounded-full border border-blue-200 px-3 py-1 font-mono text-xs text-equal-ink" />
            <button type="submit" disabled={m.busy || !typed.trim()} className="rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-equal-sky disabled:opacity-40">
              Unlock
            </button>
          </form>
          <p className={small}>Private chats wait, unread by Equal, until it is unlocked.</p>
        </>
      )}
      {m.lock && !m.lock.locked && (
        <>
          <button onClick={m.relock} className={`${button} border border-blue-200 text-equal-sky`}>
            🔐 Lock Equal&apos;s memory now
          </button>
          <p className={small}>{m.lock.passkey ? "Locked with this phone's passkey and your recovery code. It locks again when the app is closed." : "This browser could not make a passkey that can lock it, so it opens with your recovery code. It locks again when the app is closed."}</p>
        </>
      )}
      {m.lock?.locked && (
        <button
          onClick={() => (sure ? m.forget() : setSure(true))}
          className="mt-1 w-full text-center text-[11px] text-red-700 underline"
        >
          {sure ? "Tap again: forget it all and read the chats again" : "Lost the passkey and the code?"}
        </button>
      )}
      {m.note && <p className="mt-1 text-[11px] leading-snug text-red-700">{m.note}</p>}
    </>
  );
}
