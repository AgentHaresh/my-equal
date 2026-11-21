import { Contact, DB, Memory, User, parseWhen, save, todayIST, uid } from "./store";
import { askJson, butlerStatus } from "./butler";

/**
 * Reminders the user asks for themselves. They are marked important, stay in "Don't forget"
 * however far away they are, and Equal can ring the user ahead of time and say it aloud.
 *
 * The model only reads the words (what is this, when is it, what sort of thing is it). How long
 * before to ring is a fixed table in plain code, and the spoken line is built from a template.
 */

/** How many minutes ahead Equal rings, by the kind of thing. Enough time to actually get there. */
const LEAD: Record<string, number> = { flight: 180, train: 75, bus: 60, movie: 45, appointment: 45, meeting: 15, call: 5, other: 30 };

const SYSTEM = `The user wants to be reminded about something. Work out what it is and when it happens.
TODAY and NOW are in Indian time. MESSAGE is what they pointed at; CONVERSATION is the chat around it, for context only.

Return ONLY JSON: {"what": string, "when": string|null, "type": "flight"|"train"|"bus"|"movie"|"meeting"|"appointment"|"call"|"other"}
- "what" is a short plain phrase in English naming the thing, at most 10 words, for example "Flight to Delhi" or "Client review with Kiran's team".
- "when" is the moment the thing happens: YYYY-MM-DDTHH:MM (24-hour), or YYYY-MM-DD if a day is given without a time. Resolve "tomorrow", "Friday", "evening" against TODAY. null if no day can be worked out. Never invent a time.
- "type" is the closest kind.`;

const clockIST = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const dayIST = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

export type Reminder = { ok: true; memory: Memory; said: string } | { ok: false; error: string };

type Ask = { text: string; contact: Contact; messageId?: string; when?: string; callMe: boolean };

/** Set a reminder. With "when", that moment is used as given; without it, Equal reads the words to find it. */
export async function setReminder(db: DB, a: Ask): Promise<Reminder> {
  const now = Date.now();
  let what = a.text.replace(/\s+/g, " ").trim().slice(0, 140);
  let whenIso: string;
  let timed = true;
  let lead = 0;

  if (a.when) {
    const t = Date.parse(a.when);
    if (isNaN(t) || t < now - 60000) return { ok: false, error: "Pick a time that is still ahead." };
    whenIso = new Date(t).toISOString();
  } else {
    if (butlerStatus() !== "online") return { ok: false, error: butlerStatus() };
    let r: { what?: string; when?: string | null; type?: string };
    try {
      r = await askJson(SYSTEM, {
        TODAY: todayIST(now),
        NOW: new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }),
        WEEKDAY: new Date(now).toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }),
        MESSAGE: a.text,
        CONVERSATION: a.messageId
          ? db.messages
              .filter((m) => m.contactId === a.contact.id && m.from !== "butler" && !m.deleted)
              .slice(-8)
              .map((m) => ({ from: m.from, text: m.text.slice(0, 300) }))
          : [],
      });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const parsed = r.when ? parseWhen(r.when) : null;
    if (!parsed) return { ok: false, error: "I could not find a day or time in that. Pick one yourself." };
    if (!parsed.timed) parsed.iso = new Date(Date.parse(parsed.iso) + 9 * 3600000).toISOString(); // a day with no time: 9 in the morning
    if (Date.parse(parsed.iso) < now) return { ok: false, error: "That time has already passed." };
    whenIso = parsed.iso;
    timed = true;
    if (r.what) what = r.what.trim().slice(0, 140);
    lead = parsed.timed ? (LEAD[r.type ?? "other"] ?? LEAD.other) : 0;
  }

  // Ring ahead of time, but never in the past: if the lead has already gone by, ring straight away.
  const remindAt = new Date(Math.max(Date.parse(whenIso) - lead * 60000, now + 5000)).toISOString();
  const memory: Memory = {
    id: uid(),
    contactId: a.contact.id,
    fact: what,
    kind: "promise",
    about: "user",
    when: whenIso,
    timed,
    status: "open",
    createdAt: new Date(now).toISOString(),
    sourceMessageId: a.messageId,
    important: true,
    remindAt,
    callMe: a.callMe || undefined,
  };
  db.memories.push(memory);
  save();
  const ahead = Math.round((Date.parse(whenIso) - Date.parse(remindAt)) / 60000);
  const said =
    `Reminder set: ${what}, ${dayIST(whenIso)} at ${clockIST(whenIso)}. ` +
    (a.callMe ? `I'll call you at ${clockIST(remindAt)}${ahead >= 5 ? `, ${ahead >= 60 ? `${Math.round(ahead / 6) / 10} hours` : `${ahead} minutes`} before` : ""}.` : "It is in Don't forget.");
  return { ok: true, memory, said };
}

/** How long after its time a reminder call is still worth making. Older ones are not rung late. */
const STILL_USEFUL_MS = 30 * 60000;

/** The reminder Equal should be ringing about right now, if any. */
export function dueReminderCall(db: DB, now = Date.now()) {
  const m = db.memories.find((x) => x.status === "open" && x.callMe && x.remindAt && !x.rangAt && Date.parse(x.remindAt) <= now && now - Date.parse(x.remindAt) < STILL_USEFUL_MS);
  return m ? { id: m.id, what: m.fact, at: m.when ? clockIST(m.when) : null } : null;
}

/** What Equal says when the user answers. Built from a template, never by the model. */
export function reminderLine(user: User, m: Memory, now = Date.now()) {
  const first = user.name.split(/\s+/)[0];
  const what = m.fact.replace(/[\s.?!,]+$/, "");
  // A reminder set for a moment the user picked has no separate event time to announce.
  if (!m.when || m.when === m.remindAt) return `Hi ${first}, this is your Equal. A reminder: ${what}.`;
  const mins = Math.round((Date.parse(m.when) - now) / 60000);
  const away = mins <= 1 ? "now" : mins < 60 ? `in ${mins} minutes` : `in about ${Math.round(mins / 6) / 10} hours`;
  return `Hi ${first}, this is your Equal. A reminder: ${what}, at ${clockIST(m.when)}. That is ${away}.`;
}

/** The call was shown (answered or dismissed), so it does not ring again. */
export function markRang(db: DB, id: string) {
  const m = db.memories.find((x) => x.id === id && x.callMe);
  if (!m) return false;
  m.rangAt = new Date().toISOString();
  save();
  return true;
}
