import crypto from "crypto";
import { sampleSpace } from "./sample";
import { poke } from "./live";
import { loadEverything, saveEverything, storageInfo } from "./storage";
import { errorText, log } from "./log";
import { count, timing } from "./metrics";

export type Contact = {
  id: string;
  name: string;
  relation: string;
  close: boolean; // someone the user wants to stay close to
  lastContactAt: string;
  relationSource?: "inferred" | "user"; // how the relation was decided; "user" is never overwritten
  relationWhy?: string;
  userId?: string; // set when this contact is a real signed-in person
  picture?: string;
  sample?: boolean; // demo contact that comes with every new account
  unknown?: boolean; // a number that is not in contacts
  owner?: string; // set when the thread is on a protected family member's phone, not the user's
  starred?: boolean; // a person the user keeps at hand in Starred
  readAt?: string; // when the user last read this chat; later messages from them are unread
};
export type Message = {
  id: string;
  contactId: string;
  from: "me" | "them" | "butler"; // "butler" notes are private to the user
  text: string;
  at: string;
  scam?: { pattern: string; reason: string; advice: string }; // set when the scam shield flags it
  voice?: { language?: string; english?: string }; // set when the message was spoken; "english" is a translation for the reader
  file?: { id: string; name: string; type: string; size: number }; // a photo or file sent with the message; the bytes live on disk
  replyTo?: string; // the id of the message this one answers, in the same person's space
  editedAt?: string;
  deleted?: boolean; // the sender took it back; the text is gone, the place it stood remains
  starred?: boolean; // kept by me to find again; the other person never sees this
  readAt?: string; // on a message I sent: when the other person read it
  reactions?: { me?: string; them?: string }; // one reaction from each side
  forwarded?: boolean; // passed on from another chat
  pair?: string; // shared by the two copies of a message between real people, so an edit reaches both
};
export type Memory = {
  id: string;
  contactId: string;
  fact: string;
  kind: "event" | "promise" | "worry" | "preference";
  when: string | null; // ISO date the fact is about, if any
  status: "open" | "done";
  createdAt: string;
  about?: "user" | "contact"; // whose life the fact concerns
  timed?: boolean; // true when "when" carries a time of day, not just a date
  sourceMessageId?: string;
  sample?: boolean;
  important?: boolean; // the user asked to be reminded of this themselves
  remindAt?: string | null; // when to remind, which can be well before "when"
  callMe?: boolean; // Equal rings the user at remindAt and says it aloud
  rangAt?: string; // set once that call has been shown
  notifiedAt?: string; // set once a notification about it has been sent
};
export type Suggestion = {
  id: string;
  type: "intent" | "keep_close" | "follow_up" | "guardian" | "reminder";
  contactId: string;
  title: string;
  detail: string;
  category?: string;
  need?: string;
  status: "new" | "accepted" | "dismissed";
  createdAt: string;
  important?: boolean;
};
export type GateEntry = {
  messageId: string;
  spoke: boolean;
  reason: string;
  at: string;
};
export type Quote = {
  shop: string | null;
  available: boolean | null;
  price_inr: number | null;
  price_note: string | null;
  eta_minutes: number | null;
  notes: string;
};
export type Call = {
  id: string;
  label: string; // "Provider 1" until the provider says who they are
  status: "waiting" | "active" | "done";
  transcript: { from: "butler" | "provider"; text: string; at: string }[];
  quote: Quote | null;
};
export type Job = {
  id: string;
  suggestionId: string;
  contactId: string;
  need: string;
  category: string;
  questions: string[];
  status: "calling" | "ready" | "booked";
  calls: Call[];
  recommendation: { callId: string; reason: string } | null;
  bookedCallId: string | null;
  createdAt: string;
};
/** A call from an unknown number that Equal answered for a protected family member. */
export type ScreenCall = {
  id: string;
  contactId: string;
  status: "active" | "done";
  transcript: { from: "equal" | "caller"; text: string; at: string }[];
  verdict: "scam" | "genuine" | "unsure" | null;
  summary: string;
  createdAt: string;
};
export type User = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: string;
  phone?: string; // set for people who signed in with their phone number, in international form
  about?: string; // an optional line about themselves, shown with their profile
  profileSetAt?: string; // when they set up their profile; until then the app asks them to
  test?: boolean; // created by the automated tests; never shown to real people
  seenAt?: string; // when their app last checked in; kept in memory, written with the next save
};
/** One person's private space: their chats, what Equal remembers for them, and its offers. */
export type DB = {
  demo?: boolean; // the user asked for the demo chats; real accounts start without them
  screens?: ScreenCall[];
  jobs: Job[];
  contacts: Contact[];
  messages: Message[];
  memories: Memory[];
  suggestions: Suggestion[]; // stored ones (intent offers)
  dismissed: string[]; // ids of computed nudges the user dismissed
  gateLog: GateEntry[];
};

const DAY = 86400000;

/** A new id. Ids name accounts, calls and files and appear in links, so they come from the system's secure random source. */
export const uid = () => crypto.randomBytes(6).toString("hex");

// Dates are understood in Indian time, wherever the server happens to run.
const IST_MS = 5.5 * 3600000;
export const todayIST = (now = Date.now()) => new Date(now + IST_MS).toISOString().slice(0, 10);
export const startOfTodayIST = (now = Date.now()) => Date.parse(`${todayIST(now)}T00:00:00+05:30`);

/** Read "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" as Indian time. */
export function parseWhen(s: string): { iso: string; timed: boolean } | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2] ?? "00:00"}:00+05:30`);
  return isNaN(d.getTime()) ? null : { iso: d.toISOString(), timed: Boolean(m[2]) };
}

/** How often two people usually talk: the typical gap, in days, between days with messages. Null if too little history. */
export function rhythmDays(db: DB, contactId: string): number | null {
  const days = [...new Set(db.messages.filter((m) => m.contactId === contactId && m.from !== "butler").map((m) => todayIST(Date.parse(m.at))))].sort();
  if (days.length < 3) return null;
  const gaps = days.slice(1).map((d, i) => (Date.parse(d) - Date.parse(days[i])) / DAY).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** The sample life a new account starts with. See sample.ts. */
export function seed(): DB {
  return sampleSpace();
}

/** Everything the server knows: the people who have signed in, and one private space each. */
export type Root = { users: User[]; spaces: Record<string, DB> };

// One object shared by every request in this process. Handlers change it directly, so two
// requests can never overwrite each other's work, and it is written to disk after each change.
const holder = globalThis as unknown as { __equalRoot?: Root };

export function root(): Root {
  if (!holder.__equalRoot) {
    let stored: Root | null;
    try {
      stored = loadEverything() as Root | null;
    } catch (e) {
      // Data exists but cannot be read (a wrong key, a damaged file). Starting empty would
      // overwrite it at the next save, so this is an error to be seen, never passed over.
      log.error("store.load_failed", { error: errorText(e) });
      throw new Error("The stored data could not be read. See the server log.");
    }
    if (!stored || !stored.users || !stored.spaces) {
      log.info("store.first_start", storageInfo());
      holder.__equalRoot = { users: [], spaces: {} };
    } else {
      holder.__equalRoot = stored;
      // Real accounts carry no made-up chats unless the person asked for the demo.
      for (const u of stored.users) {
        const space = stored.spaces[u.id];
        if (space && !u.test && !space.demo) removeSamples(space);
      }
      log.info("store.loaded", { ...storageInfo(), accounts: stored.users.length });
    }
  }
  return holder.__equalRoot;
}

/**
 * Write the current state to disk: only the rows that changed (see lib/storage.ts), then tell
 * every open app. The argument is accepted for readability at call sites and ignored.
 */
export function save(_db?: DB) {
  void _db;
  const started = Date.now();
  const rows = saveEverything(root());
  count("store.saves");
  count("store.rows_written", rows);
  timing("store.save_ms", Date.now() - started);
  poke(); // tell every open app that something changed
}

/** A space with nothing in it: how a real account starts. */
export function emptySpace(): DB {
  return { jobs: [], contacts: [], messages: [], memories: [], suggestions: [], dismissed: [], gateLog: [] };
}

/** Take the demo chats out of a space, with everything that hangs off them. Real chats are untouched. */
export function removeSamples(space: DB) {
  const gone = new Set(space.contacts.filter((c) => c.sample).map((c) => c.id));
  if (!gone.size) return;
  space.contacts = space.contacts.filter((c) => !gone.has(c.id));
  space.messages = space.messages.filter((m) => !gone.has(m.contactId));
  space.memories = space.memories.filter((m) => !gone.has(m.contactId));
  space.suggestions = space.suggestions.filter((x) => !gone.has(x.contactId));
  space.jobs = space.jobs.filter((j) => !gone.has(j.contactId));
  if (space.screens) space.screens = space.screens.filter((x) => !gone.has(x.contactId));
}

/**
 * A person's space, created on first use. A real account starts empty. The automated tests'
 * accounts start with the demo chats, because the tests exercise features against them.
 */
export function spaceOf(userId: string): DB {
  const r = root();
  if (!r.spaces[userId]) {
    const test = r.users.find((u) => u.id === userId)?.test;
    r.spaces[userId] = test ? seed() : emptySpace();
  }
  return r.spaces[userId];
}

export function findUser(id: string): User | undefined {
  return root().users.find((u) => u.id === id);
}

export function upsertUser(profile: { email: string; name: string; picture?: string }, test = false): User {
  const r = root();
  const email = profile.email.trim().toLowerCase();
  let user = r.users.find((u) => u.email === email);
  if (user && test && !user.test) throw new Error("The test login cannot sign in as a real account.");
  if (user) {
    user.name = profile.name || user.name;
    user.picture = profile.picture ?? user.picture;
  } else {
    user = { id: uid(), email, name: profile.name || email.split("@")[0], picture: profile.picture, createdAt: new Date().toISOString(), ...(test ? { test: true } : {}) };
    r.users.push(user);
  }
  spaceOf(user.id);
  save();
  return user;
}

/** What a new phone account is called until the person sets up their profile. It is never their number. */
export const NEW_PERSON = "New on Equal";

/** The account for a phone number, created the first time that number signs in. */
export function upsertPhoneUser(phone: string, name: string | undefined, test = false): User {
  const r = root();
  let user = r.users.find((u) => u.phone === phone);
  if (user && test && !user.test) throw new Error("The test login cannot sign in as a real account.");
  if (user) {
    if (name) user.name = name;
  } else {
    user = { id: uid(), email: "", phone, name: name || NEW_PERSON, createdAt: new Date().toISOString(), ...(test ? { test: true } : {}) };
    r.users.push(user);
  }
  spaceOf(user.id);
  save();
  return user;
}

export function findUserByEmail(email: string): User | undefined {
  const e = email.trim().toLowerCase();
  return e ? root().users.find((u) => u.email === e) : undefined;
}

export function findUserByPhone(phone: string): User | undefined {
  return root().users.find((u) => u.phone === phone);
}

/** Find, or create, the contact in `space` that stands for the real person `other`. */
export function contactFor(space: DB, other: User): Contact {
  let c = space.contacts.find((x) => x.userId === other.id);
  if (!c) {
    c = { id: `u-${other.id}`, name: other.name, relation: "on My Equal", close: false, lastContactAt: new Date().toISOString(), userId: other.id, picture: other.picture, readAt: new Date(0).toISOString() };
    space.contacts.unshift(c);
  } else {
    c.name = other.name;
    c.picture = other.picture;
  }
  return c;
}

/** Put the sample contacts back to their starting state, keeping real people and imported chats. */
export function resetSamples(space: DB) {
  const fresh = seed();
  const keep = new Set(space.contacts.filter((c) => !c.sample).map((c) => c.id));
  space.contacts = [...space.contacts.filter((c) => keep.has(c.id)), ...fresh.contacts];
  space.messages = [...space.messages.filter((m) => keep.has(m.contactId)), ...fresh.messages];
  space.memories = [...space.memories.filter((m) => keep.has(m.contactId)), ...fresh.memories];
  space.suggestions = space.suggestions.filter((x) => keep.has(x.contactId));
  space.jobs = space.jobs.filter((j) => keep.has(j.contactId));
  space.gateLog = [];
  space.dismissed = [];
  space.screens = [];
}

/**
 * Nudges that are computed from state by plain code, never by the model:
 * who the user is drifting from, and which past events deserve a follow-up.
 */
export function computeNudges(db: DB, now = Date.now()): Suggestion[] {
  const out: Suggestion[] = [];
  const drifting = new Set<string>();
  for (const c of db.contacts) {
    const days = Math.floor((now - new Date(c.lastContactAt).getTime()) / DAY);
    // Compare the silence with how often we usually talk; without history, two weeks.
    const usual = rhythmDays(db, c.id);
    const limit = usual ? Math.max(7, Math.ceil(usual * 3)) : 14;
    if (!c.close || c.owner || days < limit) continue;
    drifting.add(c.id);
    const recent = db.memories
      .filter((m) => m.contactId === c.id && m.status === "open" && m.about !== "user")
      .sort((a, b) => (b.when ?? b.createdAt).localeCompare(a.when ?? a.createdAt))[0];
    out.push({
      id: `kc-${c.id}`,
      type: "keep_close",
      contactId: c.id,
      title: `It's been ${days} days since you spoke to ${c.name}`,
      detail:
        (usual ? `You usually talk every ${usual <= 1 ? "day" : `${Math.round(usual)} days`}. ` : "") +
        (recent ? `Something to ask about: ${recent.fact.replace(/\.$/, "")}${whenPhrase(recent.when, now)}.` : "A quick call or voice note would do."),
      status: "new",
      createdAt: c.lastContactAt,
    });
  }
  for (const m of db.memories) {
    // Only things that happened to the contact are worth asking them about.
    if (m.status !== "open" || !m.when || m.about === "user" || drifting.has(m.contactId)) continue;
    const t = new Date(m.when).getTime();
    if (t >= startOfTodayIST(now) || now - t > 7 * DAY) continue; // the day must be over before asking how it went
    const c = db.contacts.find((x) => x.id === m.contactId);
    if (!c) continue;
    out.push({
      id: `fu-${m.id}`,
      type: "follow_up",
      contactId: c.id,
      title: `Ask ${c.name} how it went`,
      detail: `${m.fact.replace(/\.$/, "")}${whenPhrase(m.when, now)}.`,
      status: "new",
      createdAt: c.lastContactAt,
    });
  }
  // My own commitments: things I said I would do, and plans of mine, that are due about now.
  const start = startOfTodayIST(now);
  const mine: Suggestion[] = [];
  for (const m of db.memories) {
    if (m.status !== "open" || !m.when || !(m.about === "user" || m.kind === "promise")) continue;
    const t = new Date(m.when).getTime();
    // Things the user asked to be reminded of stay listed however far off they are.
    if (t < start - 3 * DAY || (t >= start + 2 * DAY && !m.important)) continue;
    const c = db.contacts.find((x) => x.id === m.contactId);
    if (!c || c.owner) continue;
    const day =
      t < start ? "Overdue" : t < start + DAY ? "Today" : t < start + 2 * DAY ? "Tomorrow" : new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
    const ring =
      m.callMe && m.remindAt && !m.rangAt
        ? ` · Equal will call you at ${new Date(m.remindAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`
        : "";
    const time = m.timed ? `, ${new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : "";
    mine.push({
      id: `rm-${m.id}`,
      type: "reminder",
      contactId: c.id,
      title: m.fact,
      detail: `${day}${time} · ${c.id === "self" ? "from your notes" : `from your chat with ${c.name}`}${ring}`,
      status: "new",
      createdAt: m.when,
      important: m.important,
    });
  }
  mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...mine, ...out].filter((s) => !db.dismissed.includes(s.id));
}

function whenPhrase(when: string | null, now: number) {
  if (!when) return "";
  const d = new Date(when);
  const days = Math.round((now - d.getTime()) / DAY);
  const name = d.toLocaleDateString("en-IN", { weekday: "long" });
  if (days >= 0 && days < 7) return ` (was on ${name})`;
  if (days < 0 && days > -7) return ` (coming ${name})`;
  return ` (${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })})`;
}
