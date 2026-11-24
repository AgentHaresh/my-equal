// The Equal home: the greeting, the box to ask or tell Equal something, what not to forget,
// what needs me right now, what Equal knows about each person, and bringing chats in and out.

import { useState } from "react";
import type { Snapshot } from "@/lib/snapshot";
import type { Answer } from "@/lib/ask";
import { FAMILY_RELATIONS, RELATIONS } from "@/lib/relations";
import { RHYTHMS, ago, historyOf, inTouch, lastPhrase, rhythmStatus, type HistoryItem } from "@/lib/touch";
import JobCard from "../JobCard";
import { SparkIcon } from "../Icons";
import { label, listTime, type Api, type Contact, type Pane, type PersonChange, type Suggestion } from "./format";
import { Avatar } from "./parts";

type Props = {
  pane: Pane;
  snap: Snapshot;
  me: Snapshot["me"];
  now: number;
  greeting: string;
  reminders: Suggestion[];
  unreadTotal: number;
  askQuestion: () => void;
  question: string;
  setQuestion: (text: string) => void;
  asking: boolean;
  addPhoto: (file: File) => void;
  askReminder: (target: { id?: string; text: string }) => void;
  reply: (Answer & { question: string }) | null;
  setReply: (reply: null) => void;
  answer: (s: Suggestion, action: "accept" | "dismiss") => void;
  urgent: boolean;
  others: Suggestion[];
  bookProvider: (jobId: string, callId: string) => Promise<void>;
  removeJob: (jobId: string) => Promise<void>;
  tryDemo: () => void;
  draftFor: (s: Suggestion) => void;
  placeCall: (c: Contact, video?: boolean) => void;
  people: Contact[];
  peopleShown: Contact[];
  person: Contact | null;
  personMemories: Snapshot["memories"];
  personQuery: string;
  setPersonQuery: (text: string) => void;
  setPersonId: (id: string | null) => void;
  personFact: string;
  setPersonFact: (text: string) => void;
  open: (id: string, focus?: string | null) => void;
  describe: (contactId: string, change: PersonChange) => void;
  addFact: (contactId: string) => void;
  forget: (id: string) => void;
  importing: boolean;
  importChat: (file: File | null, me?: string) => void;
  importNote: null | { ok: boolean; text: string };
  importWho: string[];
  contact: Contact | undefined;
  api: Api;
  setSnap: (s: Snapshot) => void;
  setNotice: (text: string | null) => void;
};

export default function Home(props: Props) {
  const { pane, snap, me, now, greeting, reminders, unreadTotal, askQuestion, question, setQuestion, asking, addPhoto, askReminder, reply, setReply, answer, urgent, others, bookProvider, removeJob, tryDemo, draftFor, placeCall } = props;
  const { people, peopleShown, person, personMemories, personQuery, setPersonQuery, setPersonId, personFact, setPersonFact, open, describe, addFact, forget } = props;
  const { importing, importChat, importNote, importWho, contact, api, setSnap, setNotice } = props;
  return (
    <aside className={`${pane === "chat" ? "hidden" : pane === "equal" ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-6 pt-2 md:px-8`}>
     <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="pt-2 md:pt-[8vh]">
        <span title={snap.butler} className={`${label} inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${snap.butler === "online" ? "bg-white/10 text-equal-lime" : "bg-rose-500 text-white"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${snap.butler === "online" ? "animate-pulse bg-equal-lime" : "bg-white"}`} />
          {snap.butler === "online" ? "Your Equal is listening" : "Your Equal is offline"}
        </span>
        <h1 className="hero-text mt-3 font-display text-4xl leading-tight md:text-6xl">
          {greeting}
          {me ? `, ${me.name.split(/\s+/)[0]}` : ""}.
        </h1>
        <p className="mt-2 text-lg text-white/65 md:text-xl">
          {reminders.length ? `You have ${reminders.length} thing${reminders.length === 1 ? "" : "s"} not to forget` : "Nothing is slipping today"}
          {unreadTotal ? ` and ${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}.` : "."}
        </p>
      </div>
      {snap.butler !== "online" && <p className="-mt-3 text-xs text-rose-200">{snap.butler}</p>}
      {/* A brand-new account is empty. One tap fills it with clearly labelled made-up chats, so every feature can be tried. */}
      {!snap.demo && !snap.contacts.some((c) => c.id !== "self") && (
        <div className="rounded-2xl border border-equal-lime/40 bg-white/5 p-4">
          <div className="font-semibold text-white">New here? See My Equal at work.</div>
          <p className="mt-1 text-sm text-white/70">Add a few made-up chats (a friend, your sister, your father and a scam number) to try reminders, nudges, the call-around and the scam shield. Remove them any time from Settings.</p>
          <button onClick={tryDemo} className="mt-3 rounded-full bg-equal-lime px-4 py-2 text-sm font-bold text-equal-ink">
            Try it with sample chats
          </button>
        </div>
      )}

      <section className="order-1 space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askQuestion();
          }}
          className="ask-glow flex items-center gap-2 rounded-[2rem] bg-white/[0.07] p-2 pl-3"
        >
          <SparkIcon className="shrink-0 text-equal-lime" />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask me anything, or tell me what to remember"
            className="min-w-0 flex-1 bg-transparent px-1 py-3 text-lg outline-none placeholder:text-white/50"
          />
          <button disabled={asking || !question.trim()} className="rounded-full bg-equal-lime px-6 py-3 text-base font-bold text-equal-ink disabled:opacity-40">
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
        <button onClick={() => askReminder({ text: "" })} className="flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-white/40 px-3 py-2 text-sm text-white/90 hover:bg-white/10">
          <span className="font-semibold text-equal-lime">+ Remind me</span>
          <span className="text-xs text-white/60">a flight, a film, a meeting</span>
        </button>
        {reply && (
          <div className="rounded-2xl bg-white p-3 text-equal-ink shadow-lg">
            <div className="text-xs text-equal-ink/60">{reply.question}</div>
            <div className="mt-1 whitespace-pre-wrap text-sm font-medium">{reply.error ? `I could not answer: ${reply.error}` : reply.answer}</div>
            {reply.remembered && <div className="mt-2 rounded-lg bg-equal-lime px-2.5 py-1.5 text-xs font-semibold text-equal-ink">Saved about {reply.remembered.about}: {reply.remembered.fact}</div>}
            {reply.errand && (
              <div className="mt-2 rounded-lg bg-equal-lime px-2.5 py-1.5 text-xs font-semibold text-equal-ink">
                {reply.errand.already ? "Already calling around" : "Calling around now"}: {reply.errand.need} · see Right now below
              </div>
            )}
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
        <section className="order-3 grid gap-2 md:grid-cols-2">
          <h2 className={`${label} text-white/70 md:col-span-2`}>Don&apos;t forget</h2>
          {reminders.map((s) => (
            <div key={s.id} className="rounded-2xl border-l-4 border-equal-lime bg-white/10 p-3">
              <div className="text-sm font-semibold">
                {s.important && <span className={`${label} mr-1.5 rounded bg-equal-lime px-1.5 py-0.5 text-equal-ink`}>Important</span>}
                {s.title}
              </div>
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

      <section className={`flex flex-col gap-2 ${urgent ? "order-2" : "order-4"}`}>
        <h2 className={`order-[-10000] ${label} ${urgent ? "text-equal-lime" : "text-white/70"}`}>{urgent ? "Right now" : "For you"}</h2>
        {others.length === 0 && snap.jobs.length === 0 && <p className="text-sm text-white/70">Nothing needs you right now.</p>}
        {[...snap.jobs].reverse().map((j) => (
          <JobCard key={j.id} job={j} onBook={bookProvider} onRemove={removeJob} />
        ))}
        {others.map((s) => (
          <div key={s.id} className={`rounded-2xl border p-3 ${s.type === "guardian" ? "border-rose-300 bg-rose-600" : "border-white/20 bg-white/10"} ${s.type === "guardian" || s.type === "intent" ? "order-first" : ""}`}>
            <div className={`${label} ${s.type === "guardian" ? "text-white" : "text-equal-lime"}`}>
              {s.type === "guardian" ? "Family alert" : s.type === "intent" ? "Can help now" : s.type === "keep_close" ? "Stay in touch" : s.type === "reply" ? "Waiting for you" : s.type === "tone" ? "Check in" : "Follow up"}
            </div>
            <div className="mt-1 text-sm font-semibold">{s.title}</div>
            <div className="text-sm text-white/85">{s.detail}</div>
            <div className="mt-2.5 flex flex-wrap gap-2 whitespace-nowrap">
              <button onClick={() => answer(s, "accept")} className="rounded-full bg-equal-lime px-3.5 py-1 text-sm font-semibold text-equal-ink hover:brightness-95">
                {s.type === "guardian" ? "I'll call them" : s.type === "intent" ? "Yes, please" : "Open chat"}
              </button>
              {(s.type === "keep_close" || s.type === "follow_up" || s.type === "reply" || s.type === "tone") && (
                <button onClick={() => draftFor(s)} className="rounded-full border border-equal-lime px-3 py-1 text-sm font-medium text-equal-lime hover:bg-white/10">
                  Draft a message
                </button>
              )}
              {(s.type === "keep_close" || s.type === "tone" || s.type === "reply") &&
                snap.contacts
                  .filter((c) => c.id === s.contactId && c.userId)
                  .map((c) => (
                    <button key={c.id} onClick={() => placeCall(c)} className="rounded-full border border-equal-lime px-3 py-1 text-sm font-medium text-equal-lime hover:bg-white/10">
                      Call
                    </button>
                  ))}
              {(s.type === "keep_close" || s.type === "tone") && (
                <button onClick={() => describe(s.contactId, { logged: "call" })} title="You talked outside My Equal" className="rounded-full border border-white/30 px-3 py-1 text-sm font-medium text-white/85 hover:bg-white/10">
                  I called them
                </button>
              )}
              <button onClick={() => answer(s, "dismiss")} className="rounded-full px-3 py-1 text-sm text-white/85 hover:bg-white/10">
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </section>

      <YourPeople snap={snap} now={now} pick={(id) => { setPersonId(id); setPersonQuery(""); setPersonFact(""); }} />

      {people.length > 0 && (
        <section className="order-5 space-y-2">
          <h2 className={`${label} text-white/70`}>People your Equal knows</h2>
          <input
            value={personQuery}
            onChange={(e) => setPersonQuery(e.target.value)}
            placeholder="Type a name or number"
            aria-label="Find a person"
            className="w-full rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-white/50 focus:border-equal-lime"
          />
          <div className="flex flex-wrap gap-1.5">
            {peopleShown.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setPersonId(c.id);
                  setPersonQuery("");
                  setPersonFact("");
                }}
                aria-pressed={person?.id === c.id}
                className={`rounded-full px-3 py-1 text-sm font-medium ${person?.id === c.id ? "bg-equal-lime text-equal-ink" : "border border-white/20 text-white/85 hover:bg-white/10"}`}
              >
                {c.name}
              </button>
            ))}
            {personQuery.trim() && peopleShown.length === 0 && <span className="text-sm text-white/60">No one by that name yet. Start a chat with them from the box above your chats.</span>}
          </div>
          {person && (
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={person.unknown ? "?" : person.name} picture={person.picture} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{person.name}</div>
                  <div className="text-xs text-white/60">
                    {personMemories.length} thing{personMemories.length === 1 ? "" : "s"} remembered · last spoke {listTime(person.lastContactAt, now)}
                  </div>
                </div>
                <button onClick={() => open(person.id)} className="shrink-0 rounded-full bg-equal-sky px-3.5 py-1.5 text-sm font-semibold text-white">
                  Open chat
                </button>
              </div>
              {!person.unknown && (
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="text-white/75">{person.name} is your</span>
                  <RelationBlank key={`${person.id}:${person.relation}`} value={person.relation} onSave={(relation) => describe(person.id, { relation })} />
                </div>
              )}
              {person.relationSource === "inferred" && person.relationWhy && (
                <div className="mt-1 text-xs text-white/60">
                  Worked out from your chat: {person.relationWhy}
                  {FAMILY_RELATIONS.has(person.relation) && !person.family && (
                    <button onClick={() => describe(person.id, { family: true })} className="ml-2 rounded-full border border-equal-lime px-2 py-0.5 font-semibold text-equal-lime hover:bg-white/10">
                      Add to family
                    </button>
                  )}
                </div>
              )}
              {!person.unknown && person.id !== "self" && <Circle person={person} snap={snap} now={now} describe={describe} />}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addFact(person.id);
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  value={personFact}
                  onChange={(e) => setPersonFact(e.target.value)}
                  placeholder={`Tell me something about ${person.name}`}
                  aria-label={`Something to remember about ${person.name}`}
                  className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-3.5 py-2 text-sm outline-none placeholder:text-white/50 focus:border-equal-lime"
                />
                <button disabled={!personFact.trim()} className="shrink-0 rounded-full bg-equal-lime px-4 py-2 text-sm font-bold text-equal-ink disabled:opacity-40">
                  Remember
                </button>
              </form>
              <div className="mt-3 space-y-1.5">
                {personMemories.length === 0 && <p className="text-sm text-white/70">Nothing yet. It fills up as you chat, or tell me above.</p>}
                {personMemories.map((m) => (
                  <div key={m.id} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm">
                    <button onClick={() => forget(m.id)} title="Forget this" className="float-right ml-2 rounded-full px-1.5 text-xs text-white/50 hover:bg-white/15 hover:text-white">
                      Forget
                    </button>
                    {m.fact}
                    <span className="ml-2 text-xs text-white/60">
                      {m.when ? new Date(m.when).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : m.kind}
                      {m.sample ? " · demo" : ""}
                      {"local" in m && m.local ? " · read on this device" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="order-6 space-y-2 border-t border-white/20 pt-4">
        <h2 className={`${label} text-white/70`}>Bring in a WhatsApp chat</h2>
        <p className="text-xs text-white/70">In WhatsApp: open a chat, then More, Export chat, Without media. Choose the file it makes (.txt, or .zip from an iPhone).</p>
        <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-full bg-equal-lime px-4 py-2.5 text-sm font-bold text-equal-ink ${importing ? "pointer-events-none opacity-50" : ""}`}>
          {importing ? "Reading…" : "Choose the exported chat"}
          <input
            type="file"
            accept=".txt,.zip,text/plain,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importChat(f);
              e.target.value = "";
            }}
          />
        </label>
        {importNote && (
          <div role="status" className={`rounded-xl px-3 py-2 text-sm ${importNote.ok ? "bg-white/10 text-white/90" : "bg-rose-600 text-white"}`}>
            {importNote.text}
          </div>
        )}
        {importWho.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {importWho.map((name) => (
              <button key={name} disabled={importing} onClick={() => importChat(null, name)} className="rounded-full border border-equal-lime px-3 py-1 text-sm font-semibold text-equal-lime hover:bg-white/10 disabled:opacity-50">
                {name}
              </button>
            ))}
          </div>
        )}
        <h2 className={`${label} pt-2 text-white/70`}>Take your chats with you</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {contact && (
            <a href={`/api/export?contactId=${encodeURIComponent(contact.id)}`} download className="rounded-full border border-white/40 px-3 py-1 font-medium text-white/90 hover:bg-white/10">
              Export chat with {contact.name}
            </a>
          )}
          <a href="/api/export" download className="rounded-full border border-white/40 px-3 py-1 font-medium text-white/90 hover:bg-white/10">
            Export everything
          </a>
        </div>
      </section>

      <section className={`order-7 mt-auto space-y-1.5 border-t border-white/20 pt-4 text-xs text-white/70 ${snap.demo ? "" : "hidden"}`}>
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
     </div>
    </aside>
  );
}

/**
 * "<name> is your ____": who someone is to the user, in their own words. Common answers are
 * offered as suggestions while typing; anything else ("college roommate", "cousin in Pune") is fine.
 * Saved when the box loses focus or Enter is pressed.
 */
function RelationBlank({ value, onSave }: { value: string; onSave: (relation: string) => void }) {
  const [text, setText] = useState(value);
  const commit = () => {
    const next = text.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!next) return setText(value);
    if (next !== value) onSave(next);
  };
  return (
    <>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        list="relation-suggestions"
        maxLength={40}
        placeholder="e.g. college roommate"
        aria-label="Who they are to you"
        size={Math.max(10, text.length + 1)}
        className="min-w-0 max-w-full border-0 border-b-2 border-dashed border-white/40 bg-transparent px-1 py-0.5 text-sm font-semibold text-white outline-none focus:border-equal-lime"
      />
      <datalist id="relation-suggestions">
        {RELATIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </>
  );
}

const everyWords = (n: number) => (n === 1 ? "every day" : n === 7 ? "every week" : n === 14 ? "every 2 weeks" : n === 30 ? "every month" : `every ${n} days`);

/** "Due today", "in 2 days", "3 days overdue": where things stand with someone who has a rhythm. */
function dueWords(dueIn: number) {
  if (dueIn > 1) return { text: `in ${dueIn} days`, late: false };
  if (dueIn === 1) return { text: "tomorrow", late: false };
  if (dueIn === 0) return { text: "due today", late: true };
  return { text: `${-dueIn} day${dueIn === -1 ? "" : "s"} overdue`, late: true };
}

/**
 * The people I care about, family first, with when each is next due. Everyone else is an
 * acquaintance and is not listed here. Until the user picks someone, it says how.
 */
function YourPeople({ snap, now, pick }: { snap: Snapshot; now: number; pick: (id: string) => void }) {
  const mine = snap.contacts.filter((c) => (c.close || c.family) && !c.unknown && c.id !== "self");
  if (!mine.length) {
    if (!snap.contacts.some((c) => c.id !== "self" && !c.unknown)) return null;
    return (
      <section className="order-4 rounded-2xl border border-dashed border-white/30 p-4 text-sm text-white/75">
        <h2 className={`${label} text-white/70`}>Your people</h2>
        <p className="mt-1">
          Everyone starts as an acquaintance. Pick a person below and mark them as family or one of your people, and say how often you want to stay in touch. Or tell me: &ldquo;Amma is my mother, remind me to talk to her every 2 days&rdquo;.
        </p>
      </section>
    );
  }
  const rows = mine
    .map((c) => {
      const s = inTouch(snap, c.id);
      return { c, s, r: rhythmStatus(c, s, now) };
    })
    .sort((a, b) => Number(Boolean(b.c.family)) - Number(Boolean(a.c.family)) || (a.r?.dueIn ?? 99) - (b.r?.dueIn ?? 99));
  return (
    <section className="order-4 space-y-2">
      <h2 className={`${label} text-white/70`}>Your people</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map(({ c, s, r }) => {
          const due = r ? dueWords(r.dueIn) : null;
          return (
            <button key={c.id} onClick={() => pick(c.id)} className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-3 text-left hover:bg-white/10">
              <Avatar name={c.name} picture={c.picture} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate font-semibold">
                  {c.name}
                  {c.family && <span className={`${label} rounded bg-white/15 px-1.5 py-0.5 text-white/80`}>Family</span>}
                </div>
                <div className="truncate text-xs text-white/60">
                  {s.last ? `Last talked ${ago(s.last, now)}` : "Not talked here yet"}
                  {s.unanswered ? " · waiting for your reply" : ""}
                </div>
              </div>
              {due && c.everyDays && (
                <div className={`shrink-0 text-right text-xs ${due.late ? "font-semibold text-equal-lime" : "text-white/60"}`}>
                  {due.text}
                  <div className="font-normal text-white/50">{everyWords(c.everyDays)}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Who this person is in my life (acquaintance, one of my people, family), how often to stay in touch, and our history. */
function Circle({ person, snap, now, describe }: { person: Contact; snap: Snapshot; now: number; describe: (id: string, change: PersonChange) => void }) {
  const circle = person.family ? "family" : person.close ? "mine" : "acquaintance";
  const s = inTouch(snap, person.id);
  const r = rhythmStatus(person, s, now);
  const history = historyOf(snap, person.id, 10);
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-medium ${on ? "bg-equal-lime text-equal-ink" : "border border-white/25 text-white/85 hover:bg-white/10"}`;
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Who ${person.name} is in your life`}>
        <button aria-pressed={circle === "acquaintance"} onClick={() => describe(person.id, { close: false })} className={chip(circle === "acquaintance")}>
          Acquaintance
        </button>
        <button aria-pressed={circle === "mine"} onClick={() => describe(person.id, { close: true, family: false })} className={chip(circle === "mine")}>
          One of my people
        </button>
        <button aria-pressed={circle === "family"} onClick={() => describe(person.id, { family: true })} className={chip(circle === "family")}>
          Family
        </button>
      </div>
      {circle !== "acquaintance" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor={`every-${person.id}`} className="text-white/75">
            Stay in touch
          </label>
          <select
            id={`every-${person.id}`}
            value={person.everyDays ?? 0}
            onChange={(e) => describe(person.id, { everyDays: Number(e.target.value) || null })}
            className="rounded-full border border-white/25 bg-equal-ink px-3 py-1 text-sm text-white outline-none focus:border-equal-lime"
          >
            <option value={0}>no reminders</option>
            {RHYTHMS.map((n) => (
              <option key={n} value={n}>
                {everyWords(n)}
              </option>
            ))}
            {person.everyDays && !(RHYTHMS as readonly number[]).includes(person.everyDays) && <option value={person.everyDays}>{everyWords(person.everyDays)}</option>}
          </select>
          {r && <span className={dueWords(r.dueIn).late ? "font-semibold text-equal-lime" : "text-white/60"}>{dueWords(r.dueIn).text}</span>}
        </div>
      )}
      <div className="text-xs text-white/60">{lastPhrase(person, s, now)}</div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => describe(person.id, { logged: "call" })} className="rounded-full border border-white/30 px-3 py-1 text-sm text-white/85 hover:bg-white/10">
          I called {person.name}
        </button>
        <button onClick={() => describe(person.id, { logged: "met" })} className="rounded-full border border-white/30 px-3 py-1 text-sm text-white/85 hover:bg-white/10">
          We met
        </button>
      </div>
      {history.length > 0 && (
        <div>
          <h3 className={`${label} text-white/60`}>Who reached out, and when</h3>
          <ul className="mt-1.5 space-y-1">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                <span className={h.dir === "in" ? "text-white/90" : "text-white/70"}>{historyWords(h, person.name)}</span>
                <span className="shrink-0 text-xs text-white/50">
                  {ago(Date.parse(h.at), now)}, {new Date(h.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function historyWords(h: HistoryItem, name: string) {
  const n = h.count && h.count > 1 ? ` · ${h.count} messages` : "";
  const mins = h.mins ? ` · ${h.mins} min` : "";
  switch (h.kind) {
    case "text":
      return (h.dir === "in" ? `${name} texted you` : `You texted ${name}`) + n;
    case "call":
      return (h.dir === "in" ? `${name} called you` : `You called ${name}`) + mins;
    case "video":
      return (h.dir === "in" ? `Video call from ${name}` : `You video-called ${name}`) + mins;
    case "missed":
      return h.dir === "in" ? `Missed call from ${name}` : `${name} didn't pick up`;
    case "logged_call":
      return `You called ${name} (outside My Equal)${mins}`;
    case "met":
      return `You met ${name}`;
  }
}
