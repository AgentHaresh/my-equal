import { DB, Contact } from "./store";
import { askJson, butlerStatus } from "./butler";
import { RELATIONS } from "./relations";

/**
 * Who is this person to me? Worked out from the conversation itself, for real people and
 * imported chats. How often we talk is counted in plain code (see rhythmDays in store.ts).
 * A relation the user has set by hand is never overwritten.
 */

export { RELATIONS };

const FAMILY = new Set(["mother", "father", "brother", "sister", "partner", "family", "close friend"]);

const SYSTEM = `You work out how two people are related from their chat. "me" is the user; "them" is the other person, named in NAME.
Messages may mix English with Hindi or Telugu. Kinship words matter: amma, nanna, anna, akka, tammudu, chelli, bava, mummy, papa, bhaiya, didi, beta, ra, etc.
Note who uses the word about whom: if "me" calls them "amma", they are the user's mother; if THEY call the user "nanna" or "beta", they are a parent.

Return ONLY JSON: {"relation": one of ${JSON.stringify(RELATIONS)}, "confidence": number, "why": string}
Choose the most specific relation the chat supports. Use "acquaintance" when there is too little to tell.
"confidence" is 0 to 1. "why" is one short sentence quoting the clue.`;

/** Learn the relation for one contact. Returns an error string if the model call failed. */
export async function learnRelation(db: DB, contact: Contact): Promise<string | null> {
  if (contact.sample || contact.unknown || contact.relationSource === "user") return null;
  if (butlerStatus() !== "online") return butlerStatus();
  const thread = db.messages.filter((m) => m.contactId === contact.id && m.from !== "butler");
  if (thread.length < 4) return null;
  let r: { relation?: string; confidence?: number; why?: string };
  try {
    r = await askJson(SYSTEM, { NAME: contact.name, CHAT: thread.slice(-60).map((m) => ({ from: m.from, text: m.text.slice(0, 300) })) });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  const relation = (RELATIONS as readonly string[]).includes(r.relation ?? "") ? r.relation! : "acquaintance";
  if (Number(r.confidence ?? 0) < 0.5 && contact.relationSource === "inferred") return null; // keep what we had
  contact.relation = relation;
  contact.relationSource = "inferred";
  contact.relationWhy = r.why ?? "";
  // Close means family, a partner or a close friend, or simply someone I talk to a lot.
  contact.close = FAMILY.has(relation) || thread.length >= 30;
  return null;
}

/** Re-learn now and then as a chat grows: at the 4th message, then every 10 after. */
export function dueForLearning(db: DB, contact: Contact) {
  if (contact.sample || contact.unknown || contact.relationSource === "user") return false;
  const n = db.messages.filter((m) => m.contactId === contact.id && m.from !== "butler").length;
  return n >= 4 && n % 10 === 4;
}
