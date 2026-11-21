import { computeNudges, DB, User, root } from "./store";
import { butlerStatus } from "./butler";

type Person = { id: string; name: string; picture?: string };

/** Everything the signed-in person's screen renders from. Computed nudges are added fresh on every read. */
export function snapshot(db: DB, user: User | null, error?: string | null) {
  const mine = (contactId: string) => !db.contacts.find((c) => c.id === contactId)?.owner;
  return {
    me: user ? ({ id: user.id, name: user.name, email: user.email, picture: user.picture } as Person & { email: string }) : null,
    // Other signed-in people, so a chat can be started with them.
    people: user ? root().users.filter((u) => u.id !== user.id).map((u): Person => ({ id: u.id, name: u.name, picture: u.picture })) : ([] as Person[]),
    // Threads on a protected family member's phone are theirs, not the user's.
    contacts: db.contacts.filter((c) => !c.owner),
    messages: db.messages.filter((m) => mine(m.contactId)),
    memories: db.memories,
    suggestions: [...db.suggestions.filter((s) => s.status !== "dismissed"), ...computeNudges(db)],
    gateLog: db.gateLog.slice(-20),
    jobs: db.jobs,
    butler: butlerStatus(),
    error: error ?? null,
  };
}
export type Snapshot = ReturnType<typeof snapshot>;

const bare = { me: null, people: [], memories: [], suggestions: [], gateLog: [], jobs: [], butler: "online", error: null };

/** The other side of a sample chat sees only that one conversation: no notes from Equal, memories, offers or jobs. */
export function friendSnapshot(db: DB, contactId: string): Snapshot {
  const contact = db.contacts.find((c) => c.id === contactId && c.sample);
  return {
    ...bare,
    contacts: contact ? [contact] : [],
    // The sender never learns whether their message was flagged.
    messages: contact ? db.messages.filter((m) => m.contactId === contactId && m.from !== "butler").map((m) => ({ ...m, scam: undefined })) : [],
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
