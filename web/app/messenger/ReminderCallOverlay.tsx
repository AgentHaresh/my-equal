// The full-screen call Equal makes about a reminder: it rings, and once answered
// it shows the words it is saying aloud.

import type { Ringing } from "./format";

type Props = { ringing: Ringing; answerReminder: () => void; closeReminder: () => void };

export default function ReminderCallOverlay({ ringing, answerReminder, closeReminder }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-equal-deep/95 px-8 text-center text-white backdrop-blur">
      <span className={`flex h-28 w-28 items-center justify-center rounded-full bg-equal-lime font-display text-6xl text-equal-ink ${ringing.answered ? "" : "animate-pulse"}`}>e</span>
      <div>
        <div className="font-display text-4xl text-equal-lime">Your Equal</div>
        <div className="mt-2 text-lg text-white/90">{ringing.answered ? "Reminder call" : "is calling you with a reminder"}</div>
      </div>
      {ringing.answered && <div className="max-w-sm rounded-2xl bg-white px-5 py-4 text-lg font-medium text-equal-ink shadow-xl">{ringing.line}</div>}
      <div className="flex gap-4">
        {!ringing.answered && (
          <button onClick={answerReminder} className="rounded-full bg-equal-lime px-9 py-4 text-lg font-bold text-equal-ink shadow-xl">
            Answer
          </button>
        )}
        <button onClick={closeReminder} className={`rounded-full px-9 py-4 text-lg font-bold shadow-xl ${ringing.answered ? "bg-equal-lime text-equal-ink" : "bg-rose-500 text-white"}`}>
          {ringing.answered ? "Got it" : "Dismiss"}
        </button>
      </div>
      <div className="text-xs text-white/60">An AI voice. It rings while My Equal is open.</div>
    </div>
  );
}
