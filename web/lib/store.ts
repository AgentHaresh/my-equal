import fs from "fs";
import path from "path";

export type Contact = {
  id: string;
  name: string;
  relation: string;
  close: boolean; // someone the user wants to stay close to
  lastContactAt: string;
  userId?: string; // set when this contact is a real signed-in person
  picture?: string;
  sample?: boolean; // demo contact that comes with every new account
  unknown?: boolean; // a number that is not in contacts
  owner?: string; // set when the thread is on a protected family member's phone, not the user's
};
export type Message = {
  id: string;
  contactId: string;
  from: "me" | "them" | "butler"; // "butler" notes are private to the user
  text: string;
  at: string;
  scam?: { pattern: string; reason: string; advice: string }; // set when the scam shield flags it
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
  sample?: boolean;
};
export type Suggestion = {
  id: string;
  type: "intent" | "keep_close" | "follow_up" | "guardian";
  contactId: string;
  title: string;
  detail: string;
  category?: string;
  need?: string;
  status: "new" | "accepted" | "dismissed";
  createdAt: string;
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
export type User = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: string;
  test?: boolean; // created by the automated tests; never shown to real people
};
/** One person's private space: their chats, what Equal remembers for them, and its offers. */
export type DB = {
  jobs: Job[];
  contacts: Contact[];
  messages: Message[];
  memories: Memory[];
  suggestions: Suggestion[]; // stored ones (intent offers)
  dismissed: string[]; // ids of computed nudges the user dismissed
  gateLog: GateEntry[];
};

const FILE = path.join(process.cwd(), "data", "db.json");
const DAY = 86400000;

export const uid = () => Math.random().toString(36).slice(2, 10);

function lastWeekday(target: number, from: Date) {
  const d = new Date(from);
  do d.setDate(d.getDate() - 1);
  while (d.getDay() !== target);
  d.setHours(11, 0, 0, 0);
  return d;
}

export function seed(): DB {
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  const thursday = lastWeekday(4, new Date(now)).toISOString();
  return {
    contacts: [
      { id: "anna", sample: true, name: "Anna", relation: "brother", close: true, lastContactAt: ago(22) },
      { id: "ravi", sample: true, name: "Ravi", relation: "close friend", close: true, lastContactAt: ago(2) },
      { id: "priya", sample: true, name: "Priya", relation: "sister", close: true, lastContactAt: ago(9) },
      { id: "kiran", sample: true, name: "Kiran", relation: "colleague", close: false, lastContactAt: ago(1) },
      { id: "unknown-me", sample: true, name: "+91 90000 12345", relation: "not in contacts", close: false, lastContactAt: ago(0), unknown: true },
      { id: "unknown-nanna", sample: true, name: "+91 98765 00000", relation: "not in contacts", close: false, lastContactAt: ago(0), unknown: true, owner: "Nanna" },
    ],
    messages: [
      { id: uid(), contactId: "anna", from: "them", text: "Thursday eye check-up undi ra, LV Prasad lo. Don't worry.", at: ago(22) },
      { id: uid(), contactId: "anna", from: "me", text: "Ok Anna, tell me how it goes.", at: ago(22) },
      { id: uid(), contactId: "ravi", from: "them", text: "Interview went okay I think. Results next week.", at: ago(2) },
    ],
    memories: [
      { id: uid(), contactId: "anna", fact: "Eye check-up at LV Prasad", kind: "event", when: thursday, status: "open", createdAt: ago(22), sample: true },
      { id: uid(), contactId: "ravi", fact: "Waiting for interview results", kind: "worry", when: null, status: "open", createdAt: ago(2), sample: true },
    ],
    suggestions: [],
    dismissed: [],
    gateLog: [],
    jobs: [],
  };
}

/** Everything the server knows: the people who have signed in, and one private space each. */
export type Root = { users: User[]; spaces: Record<string, DB> };

// One object shared by every request in this process. Handlers change it directly, so two
// requests can never overwrite each other's work, and it is written to disk after each change.
const holder = globalThis as unknown as { __equalRoot?: Root };

export function root(): Root {
  if (!holder.__equalRoot) {
    try {
      const r = JSON.parse(fs.readFileSync(FILE, "utf8")) as Root;
      holder.__equalRoot = r.users && r.spaces ? r : { users: [], spaces: {} };
    } catch {
      holder.__equalRoot = { users: [], spaces: {} };
    }
  }
  return holder.__equalRoot;
}

/** Write the current state to disk. The argument is accepted for readability at call sites and ignored. */
export function save(_db?: DB) {
  void _db;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(root()));
}

/** A person's space, created with the sample contacts on first use. */
export function spaceOf(userId: string): DB {
  const r = root();
  if (!r.spaces[userId]) r.spaces[userId] = seed();
  return r.spaces[userId];
}

export function findUser(id: string): User | undefined {
  return root().users.find((u) => u.id === id);
}

export function upsertUser(profile: { email: string; name: string; picture?: string }, test = false): User {
  const r = root();
  const email = profile.email.trim().toLowerCase();
  let user = r.users.find((u) => u.email === email);
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

/** Find, or create, the contact in `space` that stands for the real person `other`. */
export function contactFor(space: DB, other: User): Contact {
  let c = space.contacts.find((x) => x.userId === other.id);
  if (!c) {
    c = { id: `u-${other.id}`, name: other.name, relation: other.email, close: false, lastContactAt: new Date().toISOString(), userId: other.id, picture: other.picture };
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
    if (!c.close || days < 14) continue;
    drifting.add(c.id);
    const recent = db.memories
      .filter((m) => m.contactId === c.id && m.status === "open" && m.about !== "user")
      .sort((a, b) => (b.when ?? b.createdAt).localeCompare(a.when ?? a.createdAt))[0];
    out.push({
      id: `kc-${c.id}`,
      type: "keep_close",
      contactId: c.id,
      title: `It's been ${days} days since you spoke to ${c.name}`,
      detail: recent ? `Something to ask about: ${recent.fact}${whenPhrase(recent.when, now)}.` : "A quick call or voice note would do.",
      status: "new",
      createdAt: new Date(now).toISOString(),
    });
  }
  for (const m of db.memories) {
    // Only things that happened to the contact are worth asking them about.
    if (m.status !== "open" || !m.when || m.about === "user" || drifting.has(m.contactId)) continue;
    const t = new Date(m.when).getTime();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    if (t >= today.getTime() || now - t > 7 * DAY) continue; // the day must be over before asking how it went
    const c = db.contacts.find((x) => x.id === m.contactId);
    if (!c) continue;
    out.push({
      id: `fu-${m.id}`,
      type: "follow_up",
      contactId: c.id,
      title: `Ask ${c.name} how it went`,
      detail: `${m.fact}${whenPhrase(m.when, now)}.`,
      status: "new",
      createdAt: new Date(now).toISOString(),
    });
  }
  return out.filter((s) => !db.dismissed.includes(s.id));
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
