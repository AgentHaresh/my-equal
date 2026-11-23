/**
 * Who reached out to whom, and when: texts, calls, missed calls and the times the user says
 * "I called Amma" or "I met Ravi". Plain code over stored state, never the model.
 *
 * This file has no server imports, so the screen uses the same functions to show a person's history.
 */
import type { Contact, Message } from "./store";

export type TouchKind = "call" | "video" | "missed" | "logged_call" | "met";

/** One call or meeting with a person. Texts are not stored here: they are the messages themselves. */
export type Touch = {
  id: string;
  contactId: string;
  kind: TouchKind;
  dir: "in" | "out"; // "out": I called or reached out; "in": they called me
  at: string;
  mins?: number;
};

export type HistoryItem = { at: string; kind: "text" | TouchKind; dir: "in" | "out"; count?: number; mins?: number };

type Source = { messages: Message[]; touches?: Touch[] };

const DAY = 86400000;

/** Moods worth a gentle word to the user when someone they care about writes in them. */
export const CONCERN = new Set(["sad", "stressed", "upset", "angry", "worried", "unwell", "lonely", "tired", "hurt"]);
export const MOODS = ["happy", "excited", "grateful", "neutral", "tired", "stressed", "sad", "upset", "angry", "worried", "unwell", "lonely", "hurt"] as const;

/** How often someone can be set to be kept in touch with, in days. */
export const RHYTHMS = [1, 2, 3, 7, 14, 30] as const;

const talked = (k: TouchKind) => k !== "missed";

/**
 * A person's history, newest first. Texts sent in a row by the same side within half an hour
 * are one item ("Amma texted you · 3 messages"), so the list reads like a call log.
 */
export function historyOf(src: Source, contactId: string, limit = 30): HistoryItem[] {
  const items: HistoryItem[] = [];
  const texts = src.messages.filter((m) => m.contactId === contactId && m.from !== "butler" && !m.deleted).sort((a, b) => a.at.localeCompare(b.at));
  for (const m of texts) {
    const dir = m.from === "me" ? "out" : "in";
    const last = items[items.length - 1];
    if (last && last.kind === "text" && last.dir === dir && Date.parse(m.at) - Date.parse(last.at) < 30 * 60000) {
      last.count = (last.count ?? 1) + 1;
      last.at = m.at;
    } else items.push({ at: m.at, kind: "text", dir, count: 1 });
  }
  for (const t of src.touches ?? []) if (t.contactId === contactId) items.push({ at: t.at, kind: t.kind, dir: t.dir, mins: t.mins });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export type InTouch = {
  /** When we last really talked: I wrote to them, or we spoke on a call, or I said we met. */
  last: number | null;
  lastFromThem: number | null;
  lastFromMe: number | null;
  lastCall: Touch | null;
  /** Their newest message, if nothing from me has followed it. */
  unanswered: Message | null;
};

export function inTouch(src: Source, contactId: string): InTouch {
  let lastFromMe: number | null = null;
  let lastFromThem: number | null = null;
  let newestTheirs: Message | null = null;
  for (const m of src.messages) {
    if (m.contactId !== contactId || m.deleted || m.from === "butler") continue;
    const t = Date.parse(m.at);
    if (m.from === "me") lastFromMe = Math.max(lastFromMe ?? 0, t);
    else if (t >= (lastFromThem ?? 0)) {
      lastFromThem = t;
      newestTheirs = m;
    }
  }
  let lastCall: Touch | null = null;
  for (const t of src.touches ?? []) if (t.contactId === contactId && talked(t.kind) && (!lastCall || t.at > lastCall.at)) lastCall = t;
  const callAt = lastCall ? Date.parse(lastCall.at) : null;
  const last = Math.max(lastFromMe ?? 0, callAt ?? 0) || null;
  const unanswered = newestTheirs && (last === null || Date.parse(newestTheirs.at) > last) ? newestTheirs : null;
  return { last, lastFromThem, lastFromMe, lastCall, unanswered };
}

/** "today", "yesterday", "3 days ago", "Tue 5 Nov". */
export function ago(t: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(t).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

const IST_MS = 5.5 * 3600000;
const startOfDay = (t: number) => Math.floor((t + IST_MS) / DAY) * DAY - IST_MS;

/** Whole days since a time, counted in Indian calendar days. */
export function daysSince(t: number, now = Date.now()) {
  return Math.max(0, Math.floor((startOfDay(now) - startOfDay(t)) / DAY));
}

/** The last real contact, said plainly: "you called her yesterday (12 min)". */
export function lastPhrase(c: Pick<Contact, "name">, s: InTouch, now = Date.now()): string {
  const call = s.lastCall ? Date.parse(s.lastCall.at) : 0;
  if (!s.last) return `You haven't talked to ${c.name} on My Equal yet.`;
  if (call && call >= (s.lastFromMe ?? 0)) {
    const k = s.lastCall!.kind;
    const what = k === "met" ? "you met" : k === "video" ? "you had a video call" : s.lastCall!.dir === "in" && k !== "logged_call" ? `${c.name} called you` : "you called";
    const mins = s.lastCall!.mins ? ` (${s.lastCall!.mins} min)` : "";
    return `Last time: ${what} ${ago(call, now)}${mins}.`;
  }
  return `Last time: you wrote to ${c.name} ${ago(s.lastFromMe!, now)}.`;
}

/** What the person-card shows about where things stand with someone who has a rhythm. */
export function rhythmStatus(c: Pick<Contact, "everyDays" | "lastContactAt">, s: InTouch, now = Date.now()): { dueIn: number; days: number } | null {
  if (!c.everyDays) return null;
  const since = s.last ?? Date.parse(c.lastContactAt);
  const days = daysSince(since, now);
  return { days, dueIn: c.everyDays - days };
}
