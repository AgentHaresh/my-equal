// The left-hand column: the way to the Equal home, search and the starred filter,
// starting a chat by phone number or username, the invitation note, and the list of chats.

import type { Snapshot } from "@/lib/snapshot";
import { SparkIcon, StarIcon, TickIcon } from "../Icons";
import { DAY, ago, listTime, type Contact, type Msg, type Pane, type Suggestion } from "./format";
import { Avatar } from "./parts";

type Props = {
  panel: string;
  show: (p: Pane) => string;
  pane: Pane;
  setPane: (p: Pane) => void;
  offers: Suggestion[];
  unreadTotal: number;
  search: string;
  setSearch: (text: string) => void;
  starredOnly: boolean;
  setStarredOnly: (on: boolean) => void;
  startByNumber: () => void;
  newNumber: string;
  setNewNumber: (text: string) => void;
  numberNote: string | null;
  inviteFor: string | null;
  sendInvite: () => void;
  inviteSms: string | null;
  copyInvite: () => void;
  searching: boolean;
  foundPeople: Contact[];
  foundMessages: Msg[];
  open: (id: string, focus?: string | null) => void;
  nameOf: (id: string) => string;
  needle: string;
  ordered: Contact[];
  me: Snapshot["me"];
  setNotice: (text: string | null) => void;
  snap: Snapshot;
  now: number;
  current: string;
  unreadOf: (c: Contact) => number;
};

export default function ChatList(props: Props) {
  const { panel, show, pane, setPane, offers, unreadTotal, search, setSearch, starredOnly, setStarredOnly, startByNumber, newNumber, setNewNumber, numberNote, inviteFor, sendInvite, inviteSms, copyInvite } = props;
  const { searching, foundPeople, foundMessages, open, nameOf, needle, ordered, me, setNotice, snap, now, current, unreadOf } = props;
  return (
    <aside className={`${panel} ${show("chats")} w-full shrink-0 flex-col overflow-hidden md:flex md:w-80`}>
      <div className="hidden px-3 pt-3 md:block">
        <button onClick={() => setPane("equal")} aria-current={pane !== "chat"} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold transition ${pane !== "chat" ? "bg-white/10 text-equal-lime" : "text-white/85 hover:bg-white/5"}`}>
          <SparkIcon />
          My Equal
          {offers.length > 0 && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-equal-lime px-1.5 text-[11px] font-bold text-equal-ink">{offers.length}</span>}
        </button>
      </div>
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <span className="font-display text-2xl text-equal-lime">Chats</span>
        {unreadTotal > 0 && <span className="rounded-full bg-equal-lime px-2 py-0.5 text-xs font-bold text-equal-ink">{unreadTotal} new</span>}
      </div>
      <div className="flex gap-2 px-3 pb-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people and messages"
          aria-label="Search people and messages"
          className="min-w-0 flex-1 rounded-full border border-white/30 bg-white/10 px-3.5 py-2 text-sm outline-none placeholder:text-white/55 focus:border-equal-lime"
        />
        <button
          onClick={() => setStarredOnly(!starredOnly)}
          aria-pressed={starredOnly}
          aria-label="Starred people and messages"
          title="Starred"
          className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold ${starredOnly ? "bg-equal-lime text-equal-ink" : "border border-white/30 text-white/85"}`}
        >
          <StarIcon filled={starredOnly} className="h-[18px] w-[18px]" />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startByNumber();
        }}
        className="flex gap-2 px-3 pb-2"
      >
        <input
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="New chat: phone number or @username"
          aria-label="Start a chat by phone number or username"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm outline-none placeholder:text-white/45 focus:border-equal-lime"
        />
        <button disabled={!(/[a-z]/i.test(newNumber) ? newNumber.trim().replace(/^@+/, "").length >= 3 : newNumber.replace(/\D/g, "").length >= 10)} aria-label="Start chat" className="shrink-0 rounded-full bg-equal-lime px-3.5 py-2 text-sm font-bold text-equal-ink disabled:opacity-30">
          +
        </button>
      </form>
      {numberNote && (
        <div className="px-5 pb-2 text-xs text-amber-200">
          <p className="break-words">{numberNote}</p>
          {inviteFor !== null && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {inviteFor && (
                <button onClick={sendInvite} className="rounded-full bg-equal-lime px-3 py-1 text-xs font-bold text-equal-ink">
                  Text them the invite
                </button>
              )}
              {inviteSms && (
                <a href={inviteSms} className="rounded-full bg-equal-sky px-3 py-1 text-xs font-bold text-white">
                  Send from my phone
                </a>
              )}
              <button onClick={copyInvite} className="rounded-full border border-white/30 px-3 py-1 text-xs font-semibold text-white/90">
                Copy link
              </button>
            </div>
          )}
        </div>
      )}
      {searching && (
        <ul className="flex-1 overflow-y-auto px-2 pb-2">
          {foundPeople.map((c) => (
            <li key={c.id}>
              <button onClick={() => { setSearch(""); open(c.id); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-white/10">
                <Avatar name={c.unknown ? "?" : c.name} picture={c.picture} />
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              </button>
            </li>
          ))}
          {foundMessages.map((m) => (
            <li key={m.id}>
              <button onClick={() => open(m.contactId, m.id)} className="block w-full rounded-2xl px-3 py-2 text-left hover:bg-white/10">
                <span className="flex items-baseline justify-between gap-2 text-xs text-white/65">
                  <span className="truncate font-semibold text-equal-lime">{m.from === "me" ? `You, to ${nameOf(m.contactId)}` : nameOf(m.contactId)}</span>
                  <span className="shrink-0">{new Date(m.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </span>
                <span className="line-clamp-2 text-sm text-white/90">{m.text || m.file?.name}</span>
              </button>
            </li>
          ))}
          {foundPeople.length + foundMessages.length === 0 && (
            <li className="px-3 py-4 text-sm text-white/70">{starredOnly && needle.length < 2 ? "Nothing starred yet. Open a chat and tap the star at the top to star a person, or tap a message and choose Star." : <>Nothing found for &ldquo;{search.trim()}&rdquo;.</>}</li>
          )}
        </ul>
      )}
      <ul className={`flex-1 overflow-y-auto px-2 pb-2 ${searching ? "hidden" : ""}`}>
        {ordered.length === 0 && (
          <li className="px-3 pb-3 pt-2">
            <div className="rounded-3xl bg-white/10 p-5">
              <div className="font-display text-2xl text-equal-lime">Welcome{me ? `, ${me.name.split(/\s+/)[0]}` : ""}</div>
              <p className="mt-2 text-sm leading-relaxed text-white/90">This is your messenger, with your Equal inside it. Start a chat and your Equal begins remembering what matters, reminding you, and keeping you close to your people.</p>
              <ol className="mt-4 space-y-2.5 text-sm text-white/90">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-equal-lime text-xs font-bold text-equal-ink">1</span>
                  <span>Start a chat with someone&apos;s phone number or @username, in the box above. If they are not here yet, send them the invite.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-equal-lime text-xs font-bold text-equal-ink">2</span>
                  <span>
                    Bring in a chat you already have, from the{" "}
                    <button onClick={() => setPane("equal")} className="font-semibold text-equal-lime underline">
                      Equal tab
                    </button>
                    .
                  </span>
                </li>
              </ol>
              <button
                onClick={() => navigator.clipboard?.writeText(window.location.origin).then(() => setNotice("Link copied. Send it to a friend."))}
                className="mt-4 w-full rounded-full bg-equal-lime py-2.5 text-sm font-bold text-equal-ink"
              >
                Copy invite link
              </button>
            </div>
          </li>
        )}
        {ordered.map((c) => {
          const last = snap.messages.filter((m) => m.contactId === c.id && m.from !== "butler").at(-1);
          const drifting = c.close && now - new Date(c.lastContactAt).getTime() > 14 * DAY;
          const active = c.id === current;
          const flagged = snap.messages.some((m) => m.contactId === c.id && m.scam);
          return (
            <li key={c.id}>
              <button
                onClick={() => open(c.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${active ? "bg-white/15 md:bg-white/20" : "hover:bg-white/10"}`}
              >
                <Avatar
                  name={c.unknown ? "?" : c.name}
                  picture={c.picture}
                  tone={flagged ? "bg-rose-500 text-white" : c.unknown ? "bg-white/25 text-white" : undefined}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">
                      {c.starred && <span className="mr-1 text-equal-lime">★</span>}
                      {c.name}
                      {c.sample && <span className="ml-1.5 rounded bg-white/15 px-1 text-[9px] font-normal uppercase tracking-wider text-white/70">demo</span>}
                    </span>
                    <span className={`shrink-0 text-xs ${unreadOf(c) || drifting ? "font-semibold text-equal-lime" : "text-white/60"}`}>{drifting ? `${ago(c.lastContactAt, now)} quiet` : listTime(c.lastContactAt, now)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {!flagged && last?.from === "me" && !last.deleted && <TickIcon double={Boolean(last.readAt)} className={`shrink-0 ${last.readAt ? "text-equal-lime" : "text-white/55"}`} />}
                    <span className={`min-w-0 flex-1 truncate text-sm ${flagged ? "font-semibold text-rose-200" : unreadOf(c) ? "font-medium text-white" : "text-white/70"}`}>
                      {flagged ? "Looks like a scam" : last?.deleted ? "Message deleted" : last ? (last.voice ? "Voice note: " : "") + (last.text || (last.file ? `Sent a file: ${last.file.name}` : "")) : c.relation}
                    </span>
                    {unreadOf(c) > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-equal-lime px-1.5 text-[11px] font-bold text-equal-ink">{unreadOf(c)}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
