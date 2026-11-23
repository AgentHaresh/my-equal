import { computeNudges, DB, User, root } from "./store";
import { butlerStatus } from "./butler";
import { currentCall } from "./rtc";
import { dueReminderCall } from "./remind";
import { scheduledOf } from "./scheduled";

type Person = { id: string; name: string; picture?: string };

/** "online" while their app is checking in; otherwise when they were last here, to the minute, so it does not change every second. */
function presenceOf(seenAt: string | undefined): string | null {
  if (!seenAt) return null;
  if (Date.now() - Date.parse(seenAt) < 8000) return "online";
  return seenAt.slice(0, 16) + ":00.000Z";
}

/** Everything the signed-in person's screen renders from. Computed nudges are added fresh on every read. */
export function snapshot(db: DB, user: User | null, error?: string | null) {
  // Starting a chat with someone must not reveal when they are online; that needs a reply from them.
  const replied = new Set(db.messages.filter((m) => m.from === "them").map((m) => m.contactId));
  const mine = (contactId: string) => !db.contacts.find((c) => c.id === contactId)?.owner;
  return {
    me: user ? ({ id: user.id, name: user.name, email: user.email, phone: user.phone, username: user.username, picture: user.picture, about: user.about, needsSetup: (!user.profileSetAt || !user.username) && !user.test, profileReady: Boolean(user.profileSetAt) } as Person & { email: string; phone?: string; username?: string; about?: string; needsSetup: boolean; profileReady: boolean }) : null,
    // Threads on a protected family member's phone are theirs, not the user's.
    contacts: db.contacts.filter((c) => !c.owner),
    messages: db.messages.filter((m) => mine(m.contactId)),
    memories: db.memories,
    suggestions: [...db.suggestions.filter((s) => s.status !== "dismissed"), ...computeNudges(db)],
    gateLog: db.gateLog.slice(-20),
    jobs: db.jobs,
    // Calls and meetings with each person, for their history. Texts are in messages.
    touches: (db.touches ?? []).filter((t) => mine(t.contactId)),
    // A voice call this person is in, or being rung for.
    // When each real person in my chats was last here, so the chat can say "online" or "last seen".
    presence: Object.fromEntries(db.contacts.filter((c) => c.userId && replied.has(c.id)).map((c) => [c.id, presenceOf(root().users.find((u) => u.id === c.userId)?.seenAt)])) as Record<string, string | null>,
    demo: Boolean(db.demo) || db.contacts.some((c) => c.sample),
    call: user ? currentCall(user) : null,
    // A reminder Equal should ring the user about right now.
    reminderCall: user ? dueReminderCall(db) : null,
    // Messages written now and waiting to be sent later.
    scheduled: scheduledOf(db),
    butler: butlerStatus(),
    error: error ?? null,
  };
}
export type Snapshot = ReturnType<typeof snapshot>;

const bare = { me: null, presence: {}, touches: [], demo: false, call: null, reminderCall: null, scheduled: [], memories: [], suggestions: [], gateLog: [], jobs: [], butler: "online", error: null };

/** The other side of a sample chat sees only that one conversation: no notes from Equal, memories, offers or jobs. */
export function friendSnapshot(db: DB, contactId: string): Snapshot {
  const contact = db.contacts.find((c) => c.id === contactId && c.sample);
  return {
    ...bare,
    contacts: contact ? [contact] : [],
    // The sender never learns whether their message was flagged.
    messages: contact ? db.messages.filter((m) => m.contactId === contactId && m.from !== "butler").map((m) => ({ ...m, scam: undefined, starred: undefined, tone: undefined })) : [],
  };
}

/** A protected family member's phone: one thread from an unknown number, with the scam warnings shown. */
export function protectedSnapshot(db: DB, contactId: string): Snapshot {
  const contact = db.contacts.find((c) => c.id === contactId && c.owner);
  return {
    ...bare,
    contacts: contact ? [contact] : [],
    messages: contact ? db.messages.filter((m) => m.contactId === contact.id && m.from !== "butler") : [],
  };
}
