import { DB, findUser, root, save, uid } from "./store";
import { deliver } from "./deliver";
import { notify } from "./push";
import { errorText, log } from "./log";
import { count } from "./metrics";

/**
 * Send later: a message written now and delivered at a chosen time. Until then it lives only in
 * the sender's space, where they can see it and cancel it. When its time comes it goes out the
 * same way a typed message does, so the other person's Equal reads it as usual.
 *
 * A timer on the server sends what is due, so the sender does not need the app open.
 */

export type Scheduled = { id: string; contactId: string; text: string; at: string; createdAt: string };
type Space = DB & { scheduled?: Scheduled[] };

const MAX_WAITING = 50;

export function scheduledOf(db: DB): Scheduled[] {
  return (db as Space).scheduled ?? [];
}

export function schedule(db: DB, contactId: string, text: string, when: string): Scheduled | { error: string } {
  const t = Date.parse(when);
  // The time comes from the sender's own clock, which can be a little off from the server's.
  // Anything up to a minute "ago" is treated as now; only a clearly past time is refused.
  if (isNaN(t) || t < Date.now() - 60000) return { error: "Pick a time that is still ahead." };
  if (t > Date.now() + 366 * 86400000) return { error: "That is more than a year away." };
  const contact = db.contacts.find((c) => c.id === contactId && !c.owner && !c.unknown && c.id !== "self");
  if (!contact) return { error: "No such chat." };
  const list = ((db as Space).scheduled ??= []);
  if (list.length >= MAX_WAITING) return { error: "Too many messages are already waiting to be sent." };
  const item: Scheduled = { id: uid(), contactId, text, at: new Date(t).toISOString(), createdAt: new Date().toISOString() };
  list.push(item);
  save();
  startScheduler();
  return item;
}

export function cancelScheduled(db: DB, id: string): boolean {
  const space = db as Space;
  const before = scheduledOf(db).length;
  space.scheduled = scheduledOf(db).filter((s) => s.id !== id);
  if (space.scheduled.length === before) return false;
  save();
  return true;
}

/** Send everything that is due, for every person. Each message is taken off the list before it is sent, so it can never go twice. */
export function sendDue(now = Date.now()) {
  const r = root();
  for (const [userId, db] of Object.entries(r.spaces)) {
    const space = db as Space;
    const due = scheduledOf(db).filter((s) => Date.parse(s.at) <= now);
    if (!due.length) continue;
    space.scheduled = scheduledOf(db).filter((s) => !due.includes(s));
    save();
    const user = findUser(userId);
    for (const s of due.sort((a, b) => a.at.localeCompare(b.at))) {
      const contact = db.contacts.find((c) => c.id === s.contactId);
      count("scheduled.sent");
      if (user && contact) void deliver(db, user, contact, s.text).catch((e) => log.error("scheduled.send_failed", { error: errorText(e) }));
    }
  }
}

/** A reminder whose time has come is also sent as a notification, so it reaches a closed app. Once each. */
export function notifyDueReminders(now = Date.now()) {
  let changed = false;
  for (const [userId, db] of Object.entries(root().spaces)) {
    for (const m of db.memories) {
      if (m.status !== "open" || !m.remindAt || m.notifiedAt || m.rangAt || Date.parse(m.remindAt) > now) continue;
      m.notifiedAt = new Date(now).toISOString();
      changed = true;
      if (now - Date.parse(m.remindAt) < 30 * 60000) notify(userId, { title: "Your Equal: a reminder", body: m.fact, tag: `reminder-${m.id}`, url: "/" });
    }
  }
  if (changed) save();
}

const holder = globalThis as unknown as { __equalScheduler?: ReturnType<typeof setInterval> };

/** Start the timer once per server process. */
export function startScheduler() {
  if (holder.__equalScheduler) return;
  holder.__equalScheduler = setInterval(() => {
    try {
      sendDue();
      notifyDueReminders();
    } catch (e) {
      log.error("scheduler.tick_failed", { error: errorText(e) }); // tried again on the next tick
    }
  }, 5000);
}
