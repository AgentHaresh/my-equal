// The open chat: who it is with, the messages day by day with each message's menu,
// messages waiting to be sent, Equal's offer and notices, and the box to write in.

import type { RefObject } from "react";
import type { Snapshot } from "@/lib/snapshot";
import { BackIcon, ChatIcon, ClipIcon, ClockIcon, FileIcon, MicIcon, PhoneIcon, SendIcon, StarIcon, StopIcon, TickIcon, VideoIcon } from "../Icons";
import { REACTIONS, dayLabel, type Contact, type Msg, type Pane, type Suggestion } from "./format";
import { Avatar } from "./parts";

type Props = {
  privateChat?: boolean; // texts in this chat are end-to-end encrypted
  role: "me" | "them";
  isMe: boolean;
  show: (p: Pane) => string;
  setPane: (p: Pane) => void;
  unreadTotal: number;
  unreadHere: number;
  contact: Contact | undefined;
  status: string | null;
  side: (c: Contact) => string;
  starPerson: (c: Contact) => void;
  placeCall: (c: Contact, video?: boolean) => void;
  thread: Msg[];
  now: number;
  menuFor: string | null;
  setMenuFor: (id: string | null) => void;
  focusId: string | null;
  inEnglish: string[];
  setInEnglish: (ids: string[]) => void;
  reactTo: (m: Msg, emoji: string) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
  replyTo: Msg | null;
  setReplyTo: (m: Msg | null) => void;
  startEdit: (m: Msg) => void;
  setForwarding: (m: Msg | null) => void;
  star: (m: Msg) => void;
  askReminder: (target: { id?: string; text: string }) => void;
  removeMessage: (id: string) => void;
  quiet: Map<string, Snapshot["gateLog"][number]["reason"]>;
  waiting: Snapshot["scheduled"];
  whenWords: (iso: string) => string;
  cancelLater: (id: string) => void;
  endRef: RefObject<HTMLDivElement | null>;
  inlineOffer: Suggestion | undefined;
  answer: (s: Suggestion, action: "accept" | "dismiss") => void;
  notice: string | null;
  draft: string;
  setDraft: (text: string) => void;
  saveEdit: () => void;
  send: () => void;
  sending: boolean;
  attach: (file: File) => void;
  toggleVoice: () => void;
  recording: boolean;
  canSchedule: boolean;
  setLaterError: (text: string | null) => void;
  setLaterOpen: (open: boolean) => void;
};

export default function Conversation(props: Props) {
  const { role, isMe, show, setPane, unreadTotal, unreadHere, contact, status, side, starPerson, placeCall, thread, now, menuFor, setMenuFor, focusId, inEnglish, setInEnglish, reactTo } = props;
  const { editing, setEditing, replyTo, setReplyTo, startEdit, setForwarding, star, askReminder, removeMessage, quiet, waiting, whenWords, cancelLater, endRef, inlineOffer, answer, notice } = props;
  const { draft, setDraft, saveEdit, send, sending, attach, toggleVoice, recording, canSchedule, setLaterError, setLaterOpen, privateChat } = props;
  return (
    <main className={`night ${show("chat")} min-w-0 flex-1 flex-col overflow-hidden md:rounded-3xl md:border md:border-white/10 md:shadow-2xl md:shadow-black/40`}>
      <header className="safe-top flex items-center justify-between gap-2 border-b border-blue-100 bg-white px-2 py-2 md:px-4 md:py-3">
        <div className="flex min-w-0 items-center gap-2">
          {isMe && (
            <button onClick={() => setPane("chats")} className="relative rounded-full p-2 text-equal-sky md:hidden" aria-label="Back to chats">
              <BackIcon />
              {unreadTotal - unreadHere > 0 && <span className="absolute -right-0.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-equal-sky px-1 text-[10px] font-bold text-white">{unreadTotal - unreadHere}</span>}
            </button>
          )}
          {contact && <Avatar name={contact.unknown ? "?" : contact.name} picture={contact.picture} tone={contact.unknown ? "bg-blue-100 text-equal-sky" : undefined} />}
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight">{isMe ? contact?.name ?? "My Equal" : `You are ${contact?.name}`}</div>
            <div className={`truncate text-xs ${status === "online" ? "font-medium text-emerald-600" : "text-equal-ink/60"}`}>
              {privateChat && <span title="Texts here are locked on your phones. The server cannot read them.">🔒 Private · </span>}
              {isMe ? status ?? contact?.relation ?? "Pick a chat to begin" : "Your side of the chat. Equal is not visible here."}
            </div>
          </div>
        </div>
        {isMe && contact?.sample && (
          <a href={side(contact)} target="_blank" className="shrink-0 text-xs font-medium text-equal-sky underline">
            Open their side
          </a>
        )}
        {isMe && contact && !contact.unknown && (
          <span className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => starPerson(contact)} aria-label={contact.starred ? `Remove ${contact.name} from Starred` : `Add ${contact.name} to Starred`} aria-pressed={Boolean(contact.starred)} title="Star" className={`rounded-full p-2 ${contact.starred ? "text-amber-500" : "text-equal-ink/40 hover:text-equal-sky"}`}>
              <StarIcon filled={Boolean(contact.starred)} />
            </button>
            {contact.userId && (
              <>
                <button onClick={() => placeCall(contact)} aria-label={`Call ${contact.name}`} title="Call" className="rounded-full bg-equal-sky p-2 text-white">
                  <PhoneIcon />
                </button>
                <button onClick={() => placeCall(contact, true)} aria-label={`Video call ${contact.name}`} title="Video call" className="rounded-full border border-equal-sky p-2 text-equal-sky">
                  <VideoIcon />
                </button>
              </>
            )}
          </span>
        )}
      </header>

      <div className="chat-ground flex-1 space-y-1.5 overflow-y-auto px-3 py-4 md:px-5">
        {!contact && (
          <div className="mx-auto mt-16 max-w-xs text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-equal-sky text-white">
              <ChatIcon className="h-8 w-8" />
            </div>
            <div className="mt-4 font-display text-2xl text-equal-deep">Your chats live here</div>
            <p className="mt-2 text-sm text-equal-ink/60">Pick a person to start. Everything your Equal learns stays private to you.</p>
          </div>
        )}
        {contact && thread.length === 0 && (
          <div className="mx-auto mt-10 max-w-xs rounded-2xl bg-white/80 px-4 py-3 text-center text-sm text-equal-ink/60 shadow-sm">No messages yet. Say hello to {contact.name}.</div>
        )}
        {thread.map((m, index) => {
          const heading = index === 0 || dayLabel(thread[index - 1].at, now) !== dayLabel(m.at, now) ? dayLabel(m.at, now) : null;
          const body = (() => {
          if (m.from === "butler")
            return (
              <div key={m.id} className="flex justify-center">
                <div className="max-w-[85%] rounded-2xl bg-equal-lime px-3.5 py-2 text-center text-sm text-equal-ink shadow-sm">
                  <span className="font-semibold">Equal · only you see this.</span> {m.text}
                </div>
              </div>
            );
          const mine = m.from === role;
          if (m.deleted)
            return (
              <div key={m.id} id={`m-${m.id}`} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div className="rounded-2xl border border-dashed border-equal-ink/20 px-3.5 py-2 text-sm italic text-equal-ink/50">{mine ? "You deleted this message" : "This message was deleted"}</div>
              </div>
            );
          const quoted = m.replyTo ? thread.find((x) => x.id === m.replyTo) : undefined;
          const canAct = isMe && !m.id.startsWith("pending-");
          return (
            <div key={m.id} id={`m-${m.id}`} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div
                onClick={
                  canAct
                    ? (e) => {
                        const row = e.currentTarget.parentElement;
                        setMenuFor(menuFor === m.id ? null : m.id);
                        setTimeout(() => row?.scrollIntoView({ block: "nearest" }), 60); // keep the menu in view
                      }
                    : undefined
                }
                className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-sm ${mine ? "rounded-br-md bg-equal-sky text-white" : "rounded-bl-md bg-white"} ${canAct ? "cursor-pointer" : ""} ${focusId === m.id ? "ring-4 ring-equal-lime" : ""}`}
              >
                {m.forwarded && <span className={`mb-0.5 block text-[11px] italic ${mine ? "text-white/75" : "text-equal-ink/50"}`}>Forwarded</span>}
                {m.replyTo && (
                  <span className={`mb-1 block rounded-lg border-l-4 px-2 py-1 text-[13px] ${mine ? "border-equal-lime bg-white/15 text-white/90" : "border-equal-sky bg-blue-50 text-equal-ink/75"}`}>
                    <span className="block text-[11px] font-semibold">{quoted ? (quoted.from === role ? "You" : isMe ? contact?.name : "Them") : "Message"}</span>
                    <span className="line-clamp-2">{!quoted ? "Not available" : quoted.deleted ? "Deleted message" : quoted.text}</span>
                  </span>
                )}
                {m.voice && (
                  <span className={`mb-0.5 block text-[10px] font-semibold uppercase tracking-wider ${mine ? "text-white/75" : "text-equal-sky"}`}>
                    Voice note{m.voice.language ? ` · ${m.voice.language}` : ""}
                  </span>
                )}
                {m.file &&
                  (/^image\/(png|jpeg|gif|webp)$/.test(m.file.type) ? (
                    <a href={`/api/files?id=${m.file.id}`} target="_blank" onClick={(e) => e.stopPropagation()} className="mb-1 block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files?id=${m.file.id}`} alt={m.file.name} className="max-h-72 rounded-xl" />
                    </a>
                  ) : (
                    <a href={`/api/files?id=${m.file.id}`} download={m.file.name} onClick={(e) => e.stopPropagation()} className={`mb-1 flex items-center gap-2 rounded-xl px-2.5 py-2 ${mine ? "bg-white/15" : "bg-blue-50"}`}>
                      <FileIcon className="shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{m.file.name}</span>
                        <span className="block text-[11px] opacity-70">{m.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(m.file.size / 1024))} KB` : `${(m.file.size / 1024 / 1024).toFixed(1)} MB`} · tap to download</span>
                      </span>
                    </a>
                  ))}
                {m.voice?.english && inEnglish.includes(m.id) ? m.voice.english : m.text}
                <span className={`ml-2 whitespace-nowrap text-[10px] ${mine ? "text-white/70" : "text-equal-ink/40"}`}>
                  {m.starred ? "★ " : ""}
                  {m.editedAt ? "edited · " : ""}
                  {new Date(m.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                  {mine && isMe && <TickIcon double={Boolean(m.readAt)} className={`ml-1 inline-block align-[-3px] ${m.readAt ? "text-equal-lime" : "text-white/70"}`} />}
                </span>
                {m.voice?.english && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInEnglish(inEnglish.includes(m.id) ? inEnglish.filter((x) => x !== m.id) : [...inEnglish, m.id]);
                    }}
                    className={`mt-1 block text-[12px] font-semibold underline ${mine ? "text-white/85" : "text-equal-sky"}`}
                  >
                    {inEnglish.includes(m.id) ? "Show original" : "Translate to English"}
                  </button>
                )}
              </div>
              {(m.reactions?.me || m.reactions?.them) && (
                <div className={`-mt-1.5 flex gap-0.5 rounded-full border border-blue-100 bg-white px-1.5 py-0.5 text-sm shadow-sm ${mine ? "mr-2" : "ml-2"}`} aria-label="Reactions">
                  {m.reactions.them && <span>{m.reactions.them}</span>}
                  {m.reactions.me && m.reactions.me !== m.reactions.them && <span>{m.reactions.me}</span>}
                  {m.reactions.me && m.reactions.me === m.reactions.them && <span className="text-[11px] font-semibold text-equal-ink/60">2</span>}
                </div>
              )}
              {canAct && menuFor === m.id && (
                <div className="mt-1 flex gap-1 rounded-full bg-white px-2 py-1 shadow">
                  {REACTIONS.map((e) => (
                    <button key={e} onClick={() => reactTo(m, e)} aria-label={`React ${e}`} className={`rounded-full px-1.5 text-xl leading-8 transition hover:scale-125 ${m.reactions?.me === e ? "bg-blue-100" : ""}`}>
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {canAct && menuFor === m.id && (
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
                  <button onClick={() => { setMenuFor(null); setEditing(null); setReplyTo(m); }} className="rounded-full bg-white px-3 py-1 text-equal-sky shadow">
                    Reply
                  </button>
                  {mine && !m.voice && (
                    <button onClick={() => startEdit(m)} className="rounded-full bg-white px-3 py-1 text-equal-sky shadow">
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMenuFor(null);
                      setForwarding(m);
                    }}
                    className="rounded-full bg-white px-3 py-1 text-equal-sky shadow"
                  >
                    Forward
                  </button>
                  <button onClick={() => star(m)} className="rounded-full bg-white px-3 py-1 text-equal-sky shadow">
                    {m.starred ? "Unstar" : "Star"}
                  </button>
                  <button onClick={() => askReminder({ id: m.id, text: m.text })} className="rounded-full bg-equal-lime px-3 py-1 text-equal-ink shadow">
                    Remind me
                  </button>
                  <button onClick={() => removeMessage(m.id)} className="rounded-full bg-white px-3 py-1 text-rose-600 shadow">
                    {mine ? "Delete for everyone" : "Delete for me"}
                  </button>
                </div>
              )}
              {isMe && m.scam && (
                <div className="mt-1.5 max-w-[80%] rounded-2xl bg-rose-600 px-4 py-3 text-white shadow">
                  <div className="font-bold">Equal: this looks like a scam ({m.scam.pattern})</div>
                  <div className="mt-1 text-sm">{m.scam.reason}</div>
                  <div className="mt-2 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">{m.scam.advice}</div>
                </div>
              )}
              {/* How their message sounded, as Equal read it. Only the user sees this, never the sender. */}
              {isMe && !mine && m.tone && (
                <div className="mt-0.5 max-w-[80%] text-[11px] italic text-equal-ink/60">
                  Equal: sounds {m.tone.mood}. {m.tone.note}
                </div>
              )}
              {isMe && quiet.has(m.id) && <div className="mt-0.5 max-w-[80%] text-[11px] italic text-equal-ink/50">Equal stayed quiet: {quiet.get(m.id)}</div>}
            </div>
          );
          })();
          return (
            <div key={m.id} className="space-y-1.5">
              {heading && (
                <div className="flex justify-center py-1.5">
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-equal-ink/60 shadow-sm">{heading}</span>
                </div>
              )}
              {body}
            </div>
          );
        })}
        {isMe &&
          waiting.map((w) => (
            <div key={w.id} className="flex flex-col items-end">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl border-2 border-dashed border-equal-sky bg-white px-3.5 py-2 text-[15px] text-equal-ink">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-equal-sky">Sends {whenWords(w.at)}</span>
                {w.text}
              </div>
              <button onClick={() => cancelLater(w.id)} className="mt-0.5 text-xs font-semibold text-rose-600">
                Cancel
              </button>
            </div>
          ))}
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

      {(replyTo || editing) && (
        <div className="mx-3 mb-1 flex items-center gap-2 rounded-xl border-l-4 border-equal-sky bg-blue-50 px-3 py-1.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-equal-sky">{editing ? "Editing your message" : `Replying to ${replyTo?.from === role ? "yourself" : contact?.name ?? "them"}`}</span>
            {replyTo && <span className="line-clamp-1 text-equal-ink/70">{replyTo.text}</span>}
          </span>
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => {
              if (editing) setDraft("");
              setEditing(null);
              setReplyTo(null);
            }}
            className="shrink-0 rounded-full px-2 text-lg text-equal-ink/60"
          >
            ×
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (editing) saveEdit();
          else send();
        }}
        className="flex items-center gap-1.5 border-t border-blue-100 px-3 py-3"
      >
        {isMe && contact && !editing && (
          <label aria-label="Attach a photo or file" title="Attach a photo or file" className={`shrink-0 cursor-pointer rounded-full p-2 text-equal-sky hover:bg-blue-50 ${sending ? "pointer-events-none opacity-40" : ""}`}>
            <ClipIcon />
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) attach(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
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
            title={recording ? "Stop and send" : "Voice note"}
            className={`shrink-0 rounded-full p-2 disabled:opacity-40 ${recording ? "animate-pulse bg-rose-500 text-white" : "border border-blue-200 text-equal-sky"}`}
          >
            {recording ? <StopIcon /> : <MicIcon />}
          </button>
        )}
        {canSchedule && !editing && draft.trim() && (
          <button
            type="button"
            onClick={() => {
              setLaterError(null);
              setLaterOpen(true);
            }}
            aria-label="Send later"
            title="Send later"
            className="shrink-0 rounded-full border border-blue-200 p-2 text-equal-sky"
          >
            <ClockIcon />
          </button>
        )}
        <button disabled={sending || !draft.trim() || !contact} aria-label={editing ? "Save the change" : "Send"} title={editing ? "Save" : "Send"} className="shrink-0 rounded-full bg-equal-sky p-2.5 text-white disabled:opacity-40">
          {sending ? <span className="block h-5 w-5 text-center leading-5">…</span> : editing ? <span className="block h-5 w-5 text-center text-lg font-bold leading-5">✓</span> : <SendIcon />}
        </button>
      </form>
    </main>
  );
}
