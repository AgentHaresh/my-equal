import { DB, Contact, Message, User, contactFor, findUser, save, spaceOf, uid } from "./store";
import { analyse, askJson, butlerStatus } from "./butler";
import { dueForLearning, learnRelation } from "./people";

/**
 * Sending a message as the signed-in person: store it, deliver a copy to a real recipient,
 * and let each side's own assistant read it. Used for typed messages and for voice notes.
 */
export async function deliver(db: DB, user: User, contact: Contact, text: string, voice?: Message["voice"]): Promise<string | null> {
  const at = new Date().toISOString();
  const msg: Message = { id: uid(), contactId: contact.id, from: "me", text, at, voice };
  db.messages.push(msg);
  contact.lastContactAt = at;

  // A real person: deliver a copy into their space, where their own Equal reads it for them.
  const other = contact.userId ? findUser(contact.userId) : undefined;
  if (other) {
    const theirs = spaceOf(other.id);
    const me = contactFor(theirs, user);
    const copy: Message = { id: uid(), contactId: me.id, from: "them", text, at, voice };
    theirs.messages.push(copy);
    me.lastContactAt = at;
    void analyse(theirs, me, copy).then(() => save()); // does not hold up the sender
    if (dueForLearning(theirs, me)) void learnRelation(theirs, me).then(() => save());
    if (dueForLearning(db, contact)) void learnRelation(db, contact).then(() => save());
  }
  save(); // the message is stored even if the reading fails

  const error = contact.unknown ? null : await analyse(db, contact, msg);
  save();
  return error;
}

/** For a voice note: what language it is in, and an English version when it is not English. */
export async function describeVoice(text: string): Promise<NonNullable<Message["voice"]>> {
  if (butlerStatus() !== "online") return {};
  try {
    const r = await askJson<{ language?: string; is_english?: boolean; english?: string }>(
      `You are given the transcript of a voice note sent in India. Return ONLY JSON: {"language": string, "is_english": boolean, "english": string}
"language" names the language or mix (for example "Telugu", "Hindi and English"). "is_english" is true only if it is entirely English.
"english" is a faithful, natural English translation; if it is already English, repeat it unchanged. Do not add or drop anything.`,
      { TRANSCRIPT: text }
    );
    return { language: r.language, english: r.is_english ? undefined : r.english };
  } catch {
    return {};
  }
}

/** Draft a short message to a contact in the user's own voice. It is only ever placed in the box for them to edit. */
export async function draftMessage(db: DB, contact: Contact, about: string): Promise<{ draft: string; error?: string }> {
  if (butlerStatus() !== "online") return { draft: "", error: butlerStatus() };
  const thread = db.messages.filter((m) => m.contactId === contact.id && m.from !== "butler");
  const mine = thread.filter((m) => m.from === "me").slice(-15).map((m) => m.text);
  try {
    const r = await askJson<{ draft?: string }>(
      `You help the user write a short message to someone they care about. Write it the way the USER writes: match the language mix, the warmth, the length and the forms of address in MY_PAST_MESSAGES. If there are none, write a short, warm, plain message.
Return ONLY JSON: {"draft": string}
One or two sentences. Mention ABOUT naturally if it is given. Sound like a person, not an assistant: no "I hope this message finds you well". Never invent facts.`,
      {
        TO: { name: contact.name, relation: contact.relation },
        ABOUT: about || null,
        MY_PAST_MESSAGES: mine,
        THEIR_RECENT_MESSAGES: thread.filter((m) => m.from === "them").slice(-5).map((m) => m.text),
      }
    );
    return { draft: (r.draft ?? "").trim() };
  } catch (e) {
    return { draft: "", error: e instanceof Error ? e.message : String(e) };
  }
}
