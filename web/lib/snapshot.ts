import { computeNudges, DB } from "./store";
import { butlerStatus } from "./butler";

/** The full state the screens render from. Computed nudges are added fresh on every read. */
export function snapshot(db: DB, error?: string | null) {
  return {
    contacts: db.contacts,
    messages: db.messages,
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
    messages: db.messages.filter((m) => m.contactId === contactId && m.from !== "butler"),
    memories: [],
    suggestions: [],
    gateLog: [],
    jobs: [],
    butler: "online",
    error: null,
  };
}
