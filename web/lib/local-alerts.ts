/**
 * Reminders the phone shows by itself, even when My Equal is closed (Android app).
 *
 * Each time the app opens or what it knows changes, it plans the next two weeks of reminders from what
 * is on the phone already (promises and plans with a date, reminders the person set, and "stay in touch
 * every N days") and hands them to Android to show at the right moment. Nothing goes to a server, so this
 * works for what was read on the phone from private chats too. Never at night: only 9 am to 9 pm, India time.
 *
 * Plain code, no model. No server or browser-only imports.
 */

export type LocalAlert = { id: number; at: number; title: string; body: string };

type Person = { id: string; name: string; everyDays?: number; lastContactAt: string; owner?: string; unknown?: boolean };
type Note = { id: string; contactId: string; fact: string; when: string | null; timed?: boolean; status: string; about?: string };
type Source = { contacts: Person[]; memories: Note[] };
/** When I last really talked to a person (lib/touch.ts inTouch(...).last), or null. */
type LastSpoke = (contactId: string) => number | null;

const HOUR = 3600000;
const DAY = 24 * HOUR;
const IST = 5.5 * HOUR;
export const HORIZON_DAYS = 14;
const MAX_ALERTS = 60;

/** A stable 31-bit number for a key: Android notifications are named by integers. */
export function alertId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % 2147483647 || 1;
}

/** That day at the given hour, India time. day is any moment in that Indian day. */
const atIST = (day: number, hour: number) => Date.parse(`${new Date(day + IST).toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00+05:30`);
const hourIST = (t: number) => new Date(t + IST).getUTCHours() + new Date(t + IST).getUTCMinutes() / 60;

/** Move a moment out of the night: before 9 am it waits for 9 am, after 9 pm for 9 am the next day. */
export function daytime(t: number): number {
  const h = hourIST(t);
  if (h < 9) return atIST(t, 9);
  if (h >= 21) return atIST(t + DAY, 9);
  return t;
}

const dayWords = (t: number) => new Date(t).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
const timeWords = (t: number) => new Date(t).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

export function planAlerts(s: Source, lastSpoke: LastSpoke, now = Date.now()): LocalAlert[] {
  const until = now + HORIZON_DAYS * DAY;
  const people = s.contacts.filter((c) => !c.owner && !c.unknown);
  const name = (id: string) => people.find((c) => c.id === id)?.name;
  const out: (LocalAlert & { key: string })[] = [];

  // Promises, plans and reminders with a date: half an hour before a set time, else 9 am that day.
  for (const m of s.memories) {
    if (m.status !== "open" || !m.when) continue;
    const when = Date.parse(m.when);
    if (!Number.isFinite(when)) continue;
    const at = daytime(m.timed ? when - 30 * 60000 : atIST(when, 9));
    if (at <= now || at > until) continue;
    const who = name(m.contactId);
    out.push({
      key: `memory:${m.id}`,
      id: 0,
      at,
      title: m.timed ? `At ${timeWords(when)}: don't forget` : "Today: don't forget",
      body: who && !m.fact.toLowerCase().includes(who.toLowerCase()) ? `${m.fact} (with ${who})` : m.fact,
    });
  }

  // Stay in touch every N days: 10 am on the day it is due; if it is already due, the next daytime hour.
  for (const c of people) {
    if (!c.everyDays) continue;
    const last = lastSpoke(c.id) ?? Date.parse(c.lastContactAt);
    if (!Number.isFinite(last)) continue;
    const due = atIST(last + c.everyDays * DAY, 10);
    const at = due > now ? due : daytime(Math.max(Math.ceil(now / HOUR) * HOUR + HOUR, atIST(now, 10))); // whole hours, so planning again keeps the same time
    if (at > until) continue;
    out.push({
      key: `rhythm:${c.id}:${new Date(last).toISOString().slice(0, 10)}`,
      id: 0,
      at,
      title: `Time to talk to ${c.name}`,
      body: `You wanted to be in touch every ${c.everyDays === 1 ? "day" : `${c.everyDays} days`}. You last spoke on ${dayWords(last)}.`,
    });
  }

  return out
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_ALERTS)
    .map(({ key, ...a }) => ({ ...a, id: alertId(key) }));
}
