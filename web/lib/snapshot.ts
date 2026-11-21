import { computeNudges, DB } from "./store";
import { butlerStatus } from "./butler";

/** The full state the screens render from. Computed nudges are added fresh on every read. */
export function snapshot(db: DB, error?: string | null) {
  return {
    // Threads on a protected family member's phone are theirs, not the user's.
    contacts: db.contacts.filter((c) => !c.owner),
    messages: db.messages.filter((m) => !db.contacts.find((c) => c.id === m.contactId)?.owner),
    memories: db.memories,
    suggestions: [...db.suggestions.filter((s) => s.status !== "dismissed"), ...computeNudges(db)],
    gateLog: db.gateLog.slice(-20),
    jobs: db.jobs,
    butler: butlerStatus(),
    error: error ?? null,
  };
}
export type Snapshot = ReturnType<typeof snapshot>;

/** The friend's side of a chat sees only that one conversation: no butler notes, memories, offers or jobs. */
export function friendSnapshot(db: DB, contactId: string): Snapshot {
  return {
    contacts: db.contacts.filter((c) => c.id === contactId),
    // The sender never learns whether their message was flagged.
    messages: db.messages.filter((m) => m.contactId === contactId && m.from !== "butler").map((m) => ({ ...m, scam: undefined })),
    memories: [],
    suggestions: [],
    gateLog: [],
    jobs: [],
    butler: "online",
    error: null,
  };
}

/** A protected family member's phone: one thread from an unknown number, with the scam warnings shown. */
export function protectedSnapshot(db: DB, contactId: string): Snapshot {
  const contact = db.contacts.find((c) => c.id === contactId && c.owner);
  return {
    contacts: contact ? [contact] : [],
    messages: contact ? db.messages.filter((m) => m.contactId === contact.id && m.from !== "butler") : [],
    memories: [],
    suggestions: [],
    gateLog: [],
    jobs: [],
    butler: "online",
    error: null,
  };
}
