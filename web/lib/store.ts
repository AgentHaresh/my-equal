import crypto from "crypto";
import { sampleSpace } from "./sample";
import { poke } from "./live";
import { loadEverything, saveEverything, storageInfo } from "./storage";
import { errorText, log } from "./log";
import { count, timing } from "./metrics";
import type { Touch } from "./touch";
export { computeNudges, parseWhen, rhythmDays, startOfTodayIST, todayIST } from "./nudges";
import type { PublicKey, Sealed } from "./e2e";

export type Contact = {
  id: string;
  name: string;
  relation: string;
  close: boolean; // one of the people I care about; everyone else is an acquaintance until I say so
  family?: boolean; // I said they are family
  everyDays?: number; // how often I want to be in touch with them, in days; set only by me
  nudgedFor?: string; // the last "time to talk" nudge sent as a notification, so it goes once
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
  tone?: { mood: string; note: string }; // how a message from them sounded, as Equal read it; private to me
  enc?: Sealed; // end-to-end encrypted: "text" is empty and only the two phones can read this
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
  type: "intent" | "keep_close" | "follow_up" | "guardian" | "reminder" | "reply" | "tone";
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
  username?: string; // unique handle others can find them by (lowercase, without the @)
  about?: string; // an optional line about themselves, shown with their profile
  profileSetAt?: string; // when they set up their profile; until then the app asks them to
  test?: boolean; // created by the automated tests; never shown to real people
  seenAt?: string; // when their app last checked in; kept in memory, written with the next save
  keys?: PublicKey[]; // public keys of their devices, oldest first; the private keys never leave the device
  privateMode?: boolean; // they chose end-to-end encrypted chats
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
  touches?: Touch[]; // calls and meetings with each person; texts are the messages themselves
};


/** A new id. Ids name accounts, calls and files and appear in links, so they come from the system's secure random source. */
export const uid = () => crypto.randomBytes(6).toString("hex");

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
  if (space.touches) space.touches = space.touches.filter((t) => !gone.has(t.contactId));
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

export function findUserByUsername(username: string): User | undefined {
  const u = normaliseUsername(username);
  return u ? root().users.find((x) => x.username === u) : undefined;
}

/** A username as stored: lowercase, without a leading @. Not checked; see usernameProblem. */
export function normaliseUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

const RESERVED = new Set(["equal", "myequal", "admin", "support", "help", "official", "system", "root", "me", "you", "notes"]);

/** Why a username cannot be used, or null if it can. Taken names are checked separately. */
export function usernameProblem(username: string): string | null {
  if (username.length < 3 || username.length > 20) return "A username is 3 to 20 characters.";
  if (!/^[a-z0-9._]+$/.test(username)) return "Use only letters, numbers, dots and underscores.";
  if (!/^[a-z]/.test(username)) return "Start your username with a letter.";
  if (/[._]$/.test(username) || /[._]{2}/.test(username)) return "A dot or underscore cannot end the name or come twice in a row.";
  if (RESERVED.has(username)) return "That username is reserved.";
  return null;
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
  space.touches = [...(space.touches ?? []).filter((t) => keep.has(t.contactId)), ...(fresh.touches ?? [])];
  space.gateLog = [];
  space.dismissed = [];
  space.screens = [];
}

/** Keep a call or meeting with someone. It counts as being in touch. */
export function recordTouch(db: DB, t: Omit<Touch, "id">): Touch {
  const touch = { id: uid(), ...t };
  const list = (db.touches ??= []);
  list.push(touch);
  if (list.length > 2000) list.splice(0, list.length - 2000);
  const c = db.contacts.find((x) => x.id === t.contactId);
  if (c && t.kind !== "missed" && t.at > c.lastContactAt) c.lastContactAt = t.at;
  return touch;
}

