// The three sheets that rise over the chat: choose who to forward a message to,
// choose when a message should be sent, and set a reminder.

import type { Contact, Msg } from "./format";
import { Avatar } from "./parts";
import type { ShareItem } from "@/lib/share";

type ForwardProps = { forwarding: Msg; setForwarding: (m: Msg | null) => void; ordered: Contact[]; forwardTo: (contactId: string) => void };

export function ForwardSheet({ forwarding, setForwarding, ordered, forwardTo }: ForwardProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-equal-ink/60 p-3 sm:items-center" onClick={() => setForwarding(null)}>
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl bg-white p-5 text-equal-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-2xl text-equal-deep">Forward to</div>
        <div className="mt-2 line-clamp-2 rounded-xl border-l-4 border-equal-sky bg-blue-50 px-3 py-2 text-sm">{forwarding.text || forwarding.file?.name}</div>
        <ul className="mt-3 flex-1 overflow-y-auto">
          {ordered
            .filter((c) => !c.unknown && c.id !== forwarding.contactId)
            .map((c) => (
              <li key={c.id}>
                <button onClick={() => forwardTo(c.id)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-blue-50">
                  <Avatar name={c.name} picture={c.picture} />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                </button>
              </li>
            ))}
          {ordered.filter((c) => !c.unknown && c.id !== forwarding.contactId).length === 0 && <li className="py-4 text-center text-sm text-equal-ink/60">You have no other chats yet.</li>}
        </ul>
        <button onClick={() => setForwarding(null)} className="mt-2 w-full py-1 text-sm text-equal-ink/60">
          Cancel
        </button>
      </div>
    </div>
  );
}

type SendLaterProps = {
  setLaterOpen: (open: boolean) => void;
  draft: string;
  sendLater: (when: string) => void;
  laterWhen: string;
  setLaterWhen: (when: string) => void;
  laterError: string | null;
};

export function SendLaterSheet({ setLaterOpen, draft, sendLater, laterWhen, setLaterWhen, laterError }: SendLaterProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-equal-ink/60 p-3 sm:items-center" onClick={() => setLaterOpen(false)}>
      <div className="w-full max-w-md rounded-3xl bg-white p-5 text-equal-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-2xl text-equal-deep">Send later</div>
        <div className="mt-2 line-clamp-3 rounded-xl border-l-4 border-equal-sky bg-blue-50 px-3 py-2 text-sm">{draft}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["In 1 minute", 1],
              ["In 1 hour", 60],
              ["In 3 hours", 180],
              ["This time tomorrow", 1440],
            ] as const
          ).map(([name, mins]) => (
            <button key={name} onClick={() => sendLater(new Date(Date.now() + mins * 60000).toISOString())} className="rounded-full border border-blue-200 px-3 py-1.5 text-sm font-medium text-equal-sky">
              {name}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input type="datetime-local" value={laterWhen} onChange={(e) => setLaterWhen(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-blue-200 px-3 py-1.5 text-sm" />
          <button disabled={!laterWhen} onClick={() => sendLater(new Date(laterWhen).toISOString())} className="rounded-full bg-equal-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
            Set
          </button>
        </div>
        {laterError && <div className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-800">{laterError}</div>}
        <p className="mt-3 text-xs text-equal-ink/60">It goes out at that time even if My Equal is closed. Until then you can cancel it from the chat.</p>
        <button onClick={() => setLaterOpen(false)} className="mt-2 w-full py-1 text-sm text-equal-ink/60">
          Cancel
        </button>
      </div>
    </div>
  );
}

type RemindProps = {
  remindFor: { id?: string; text: string };
  setRemindFor: (target: { id?: string; text: string } | null) => void;
  remindMsg: null | { ok: boolean; text: string };
  remindCall: boolean;
  setRemindCall: (on: boolean) => void;
  setReminder: (when?: string) => void;
  remindBusy: boolean;
  remindWhen: string;
  setRemindWhen: (when: string) => void;
};

export function RemindSheet({ remindFor, setRemindFor, remindMsg, remindCall, setRemindCall, setReminder, remindBusy, remindWhen, setRemindWhen }: RemindProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-equal-ink/60 p-3 sm:items-center" onClick={() => setRemindFor(null)}>
      <div className="w-full max-w-md rounded-3xl bg-white p-5 text-equal-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-2xl text-equal-deep">Remind me</div>
        {remindFor.id ? (
          <div className="mt-2 line-clamp-3 rounded-xl border-l-4 border-equal-sky bg-blue-50 px-3 py-2 text-sm">{remindFor.text}</div>
        ) : (
          <input
            autoFocus
            value={remindFor.text}
            onChange={(e) => setRemindFor({ text: e.target.value })}
            placeholder="Flight to Delhi tomorrow 7:15 pm"
            className="mt-2 w-full rounded-xl border border-blue-200 px-3 py-2 text-sm outline-none focus:border-equal-sky"
          />
        )}
        {remindMsg?.ok ? (
          <>
            <div className="mt-3 rounded-xl bg-equal-lime px-3 py-2.5 text-sm font-medium">{remindMsg.text}</div>
            <button onClick={() => setRemindFor(null)} className="mt-3 w-full rounded-full bg-equal-sky py-2.5 font-semibold text-white">
              Done
            </button>
          </>
        ) : (
          <>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={remindCall} onChange={(e) => setRemindCall(e.target.checked)} className="h-4 w-4 accent-[#0c63d0]" />
              Have Equal call me, well before time
            </label>
            <button onClick={() => setReminder()} disabled={remindBusy} className="mt-3 w-full rounded-full bg-equal-sky py-2.5 font-semibold text-white disabled:opacity-50">
              {remindBusy ? "Working it out…" : "Need AI help: let Equal work out when"}
            </button>
            <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-equal-ink/50">Or pick the time yourself</div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(
                [
                  ["In 1 minute", 1],
                  ["In 1 hour", 60],
                  ["In 3 hours", 180],
                  ["This time tomorrow", 1440],
                ] as const
              ).map(([name, mins]) => (
                <button key={name} disabled={remindBusy} onClick={() => setReminder(new Date(Date.now() + mins * 60000).toISOString())} className="rounded-full border border-blue-200 px-3 py-1.5 text-sm font-medium text-equal-sky disabled:opacity-50">
                  {name}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input type="datetime-local" value={remindWhen} onChange={(e) => setRemindWhen(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-blue-200 px-3 py-1.5 text-sm" />
              <button disabled={remindBusy || !remindWhen} onClick={() => setReminder(new Date(remindWhen).toISOString())} className="rounded-full bg-equal-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                Set
              </button>
            </div>
            {remindMsg && <div className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-800">{remindMsg.text}</div>}
            <button onClick={() => setRemindFor(null)} className="mt-3 w-full py-1 text-sm text-equal-ink/60">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

type ShareProps = {
  share: { question: string; items: ShareItem[]; off: string[] };
  setShare: (s: ShareProps["share"] | null) => void;
  sendAsk: (question: string, items: ShareItem[]) => void;
};

/**
 * Before a question goes to the cloud model with anything from private chats: every line that would be
 * sent, each one can be left out, and nothing goes until the person taps. "Ask without them" sends only
 * the question.
 */
export function ShareSheet({ share, setShare, sendAsk }: ShareProps) {
  const chosen = share.items.filter((i) => !share.off.includes(i.key));
  const toggle = (key: string) => setShare({ ...share, off: share.off.includes(key) ? share.off.filter((k) => k !== key) : [...share.off, key] });
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-equal-ink/60 p-3 sm:items-center" onClick={() => setShare(null)}>
      <div role="dialog" aria-label="Share private lines for this answer" className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl bg-white p-5 text-equal-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-2xl text-equal-deep">Use your private chats?</div>
        <p className="mt-1 text-sm text-equal-ink/80">
          To answer “{share.question}”, Equal would send these lines from private chats to the cloud model (OpenAI), for this answer only. My Equal&apos;s server does not keep them. Untick anything you&apos;d rather not send.
        </p>
        <ul className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {share.items.map((i) => (
            <li key={i.key}>
              <label className="flex cursor-pointer gap-2 rounded-xl border border-blue-100 px-3 py-2 text-sm">
                <input type="checkbox" checked={!share.off.includes(i.key)} onChange={() => toggle(i.key)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-equal-ink/60">{i.kind === "note" ? `Noted on this phone · ${i.who}` : `Chat with ${i.who}${i.message ? ` · ${i.message.date}` : ""}`}</span>
                  <span className="block break-words">{i.line}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button disabled={!chosen.length} onClick={() => sendAsk(share.question, chosen)} className="mt-3 w-full rounded-full bg-equal-ink py-2 text-sm font-semibold text-white disabled:opacity-40">
          Send {chosen.length} {chosen.length === 1 ? "line" : "lines"} and ask
        </button>
        <button onClick={() => sendAsk(share.question, [])} className="mt-2 w-full rounded-full border border-blue-200 py-2 text-sm font-semibold text-equal-sky">
          Ask without them
        </button>
        <button onClick={() => setShare(null)} className="mt-1 w-full py-1 text-sm text-equal-ink/60">
          Cancel
        </button>
      </div>
    </div>
  );
}
