import fs from "fs";
import path from "path";

export type Contact = {
  id: string;
  name: string;
  relation: string;
  close: boolean; // someone the user wants to stay close to
  lastContactAt: string;
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
      { id: "anna", name: "Anna", relation: "brother", close: true, lastContactAt: ago(22) },
      { id: "ravi", name: "Ravi", relation: "close friend", close: true, lastContactAt: ago(2) },
      { id: "priya", name: "Priya", relation: "sister", close: true, lastContactAt: ago(9) },
      { id: "kiran", name: "Kiran", relation: "colleague", close: false, lastContactAt: ago(1) },
      { id: "unknown-me", name: "+91 90000 12345", relation: "not in contacts", close: false, lastContactAt: ago(0), unknown: true },
      { id: "unknown-nanna", name: "+91 98765 00000", relation: "not in contacts", close: false, lastContactAt: ago(0), unknown: true, owner: "Nanna" },
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

export function load(): DB {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, "utf8")) as DB;
    db.jobs ??= []; // files written before jobs existed
    return db;
  } catch {
    const db = seed();
    save(db);
    return db;
  }
}

export function save(db: DB) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
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
