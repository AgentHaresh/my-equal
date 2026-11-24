/**
 * Reminders and nudges, computed from state by plain code, never by the model. Shared by the
 * server and the phone: the server computes them from what it stores, and the phone computes
 * the same ones again once it adds what it read privately from encrypted chats.
 *
 * No server imports, so the browser can run it.
 */
import type { DB, Suggestion } from "./store";
import { CONCERN, ago, daysSince, inTouch, lastPhrase } from "./touch";

const DAY = 86400000;

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

/**
 * Nudges that are computed from state by plain code, never by the model:
 * who the user is drifting from, and which past events deserve a follow-up.
 */
export function computeNudges(db: DB, now = Date.now()): Suggestion[] {
  const out: Suggestion[] = [];
  const drifting = new Set<string>();
  for (const c of db.contacts) {
    // Only the people I care about get nudges. Everyone else is an acquaintance until I say otherwise.
    if (!(c.close || c.family) || c.owner || c.unknown || c.id === "self") continue;
    const s = inTouch(db, c.id);
    const name = c.name;
    // They wrote, and I have not answered. If they sounded low, say that instead: it matters more.
    const u = s.unanswered;
    if (u && now - Date.parse(u.at) < 7 * DAY) {
      const waited = now - Date.parse(u.at);
      const when = ago(Date.parse(u.at), now);
      if (u.tone && CONCERN.has(u.tone.mood) && waited < 3 * DAY) {
        drifting.add(c.id);
        out.push({ id: `tn-${u.id}`, type: "tone", contactId: c.id, title: `${name} sounded ${u.tone.mood} ${when}`, detail: `${u.tone.note.replace(/\.$/, "")}. They wrote: "${clip(u.text)}"`, status: "new", createdAt: u.at });
        continue;
      }
      if (waited > 3 * 3600000) {
        drifting.add(c.id);
        out.push({ id: `rp-${u.id}`, type: "reply", contactId: c.id, title: `${name} wrote to you ${when} and you haven't replied`, detail: `"${clip(u.text)}"`, status: "new", createdAt: u.at });
        continue;
      }
    }
    // The rhythm I chose ("Amma, every 2 days") comes first. Without one, compare the silence
    // with how often we usually talk; without history, two weeks.
    const since = s.last ?? Date.parse(c.lastContactAt);
    const days = daysSince(since, now);
    if (c.everyDays) {
      if (days < c.everyDays) continue;
      drifting.add(c.id);
      const cycle = Math.floor(days / c.everyDays); // a dismissed nudge comes back after another full period
      const every = c.everyDays === 1 ? "every day" : c.everyDays === 7 ? "every week" : `every ${c.everyDays} days`;
      out.push({
        id: `kc-${c.id}-${todayIST(since)}-${cycle}`,
        type: "keep_close",
        contactId: c.id,
        title: days === c.everyDays ? `Time to talk to ${name}` : `It's been ${days} days since you talked to ${name}`,
        detail: `You wanted to stay in touch ${every}. ${lastPhrase(c, s, now)}${askAbout(db, c.id, now)}`,
        status: "new",
        createdAt: new Date(since).toISOString(),
      });
      continue;
    }
    const usual = rhythmDays(db, c.id);
    const limit = usual ? Math.max(7, Math.ceil(usual * 3)) : 14;
    if (days < limit) continue;
    drifting.add(c.id);
    out.push({
      id: `kc-${c.id}`,
      type: "keep_close",
      contactId: c.id,
      title: `It's been ${days} days since you spoke to ${name}`,
      detail: (usual ? `You usually talk every ${usual <= 1 ? "day" : `${Math.round(usual)} days`}. ` : "") + (askAbout(db, c.id, now).trim() || "A quick call or voice note would do."),
      status: "new",
      createdAt: new Date(since).toISOString(),
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

const clip = (t: string) => (t.length > 90 ? `${t.slice(0, 87).trimEnd()}…` : t);

/** Something worth asking them about when we next talk: the newest open thing in their life. */
function askAbout(db: DB, contactId: string, now: number): string {
  const recent = db.memories
    .filter((m) => m.contactId === contactId && m.status === "open" && m.about !== "user" && (m.kind === "event" || m.kind === "worry"))
    .sort((a, b) => (b.when ?? b.createdAt).localeCompare(a.when ?? a.createdAt))[0];
  return recent ? ` Something to ask about: ${recent.fact.replace(/\.$/, "")}${whenPhrase(recent.when, now)}.` : "";
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
