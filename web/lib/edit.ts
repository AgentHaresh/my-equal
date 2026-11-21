import { DB, Message, root, save } from "./store";
import { analyse } from "./butler";
import { dropFileIfUnused } from "./files";

/**
 * Editing and deleting messages. What Equal remembered from a message is tied to that message,
 * so when the words change or go, the memories made from them go too, and an edited message is
 * read again. Nothing stays remembered from words that no longer exist.
 */

/** The other person's copy of a message between two real people, with the space it lives in. */
function otherCopy(db: DB, msg: Message): { space: DB; copy: Message } | null {
  if (!msg.pair) return null;
  for (const space of Object.values(root().spaces)) {
    if (space === db) continue;
    const copy = space.messages.find((m) => m.pair === msg.pair);
    if (copy) return { space, copy };
  }
  return null;
}

/** Drop everything Equal took from one message. */
function unlearn(space: DB, messageId: string) {
  space.memories = space.memories.filter((m) => m.sourceMessageId !== messageId || m.important);
  space.gateLog = space.gateLog.filter((g) => g.messageId !== messageId);
}

type Edited = { ok: true; error: string | null } | { ok: false; status: number; error: string };

export async function editMessage(db: DB, id: string, text: string): Promise<Edited> {
  const msg = db.messages.find((m) => m.id === id);
  if (!msg || msg.deleted) return { ok: false, status: 404, error: "No such message." };
  if (msg.from !== "me") return { ok: false, status: 403, error: "You can only edit your own messages." };
  if (msg.voice) return { ok: false, status: 400, error: "A voice note cannot be edited." };
  if (msg.file && !msg.text) return { ok: false, status: 400, error: "A file with no caption has no words to edit." };
  if (msg.text === text) return { ok: true, error: null };

  const at = new Date().toISOString();
  const change = (space: DB, m: Message) => {
    m.text = text;
    m.editedAt = at;
    unlearn(space, m.id);
  };
  change(db, msg);
  const other = otherCopy(db, msg);
  if (other) {
    change(other.space, other.copy);
    const theirContact = other.space.contacts.find((c) => c.id === other.copy.contactId);
    // Their Equal reads the new words too. An edit never raises a fresh offer.
    if (theirContact) void analyse(other.space, theirContact, other.copy, true).then(() => save());
  }
  save();
  const contact = db.contacts.find((c) => c.id === msg.contactId);
  const error = contact && !contact.unknown ? await analyse(db, contact, msg, true) : null;
  save();
  return { ok: true, error };
}

/** The reactions a message can carry. One per person; choosing the same one again takes it off. */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function react(db: DB, id: string, emoji: string | null): boolean {
  const msg = db.messages.find((m) => m.id === id && m.from !== "butler" && !m.deleted);
  if (!msg || (emoji !== null && !REACTIONS.includes(emoji))) return false;
  const set = (m: Message, side: "me" | "them", value: string | null) => {
    const r = { ...(m.reactions ?? {}) };
    if (value) r[side] = value;
    else delete r[side];
    m.reactions = r.me || r.them ? r : undefined;
  };
  const next = emoji && msg.reactions?.me === emoji ? null : emoji;
  set(msg, "me", next);
  const other = otherCopy(db, msg);
  if (other) set(other.copy, "them", next); // on their side it is "them" who reacted
  save();
  return true;
}

export function deleteMessage(db: DB, id: string): boolean {
  const msg = db.messages.find((m) => m.id === id);
  if (!msg || msg.from === "butler") return false;
  if (msg.from === "me") {
    // Taken back for everyone: the words go on both sides, the place it stood stays.
    const wipe = (space: DB, m: Message) => {
      m.text = "";
      m.deleted = true;
      delete m.starred;
      delete m.reactions;
      delete m.file;
      delete m.voice;
      delete m.scam;
      unlearn(space, m.id);
    };
    const fileId = msg.file?.id;
    wipe(db, msg);
    const other = otherCopy(db, msg);
    if (other) wipe(other.space, other.copy);
    if (fileId) dropFileIfUnused(fileId); // the bytes go too
  } else {
    // Someone else's message: removed from my side only.
    unlearn(db, msg.id);
    db.messages = db.messages.filter((m) => m.id !== id);
  }
  save();
  return true;
}
