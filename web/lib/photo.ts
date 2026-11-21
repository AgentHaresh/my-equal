import { DB, Contact, parseWhen, todayIST, uid } from "./store";
import { askVision, butlerStatus } from "./butler";

/**
 * Photo to memory. The user photographs something they need to remember (a prescription, a bill,
 * an invitation, an appointment card) and it becomes memories with dates, kept in a private
 * "My notes" thread. Anything with a date about now then shows up under "Don't forget".
 */

const SYSTEM = `You read a photo the user took so they will not forget something: a prescription, a bill, an invitation, a ticket, an appointment card, a notice, a whiteboard, a visiting card.
TODAY is today's date in India. Use it to resolve dates that have no year.

Return ONLY JSON:
{"readable": boolean, "kind": "prescription"|"bill"|"invitation"|"ticket"|"appointment"|"notice"|"contact"|"other",
 "title": string, "summary": string,
 "memories": [{"fact": string, "when": string|null}]}
- "readable" is false if the photo is too unclear to read or holds nothing worth remembering; then leave "memories" empty.
- "title" is at most 8 words. "summary" is one or two plain sentences saying what the photo is.
- "memories" are the things the user must not forget: an appointment and its time, a due date and the amount, an event and its venue, a medicine and how to take it, a travel time. Each "fact" is a short self-contained sentence in English.
- "when" is YYYY-MM-DD, or YYYY-MM-DDTHH:MM (24-hour) if a time is shown; null if the fact has no date.
- Record only what is visible in the photo. Never invent a date, a name or an amount.`;

type Reading = { readable?: boolean; kind?: string; title?: string; summary?: string; memories?: { fact?: string; when?: string | null }[] };

/** The private thread where notes to self and saved photos live. */
export function notesContact(db: DB): Contact {
  let c = db.contacts.find((x) => x.id === "self");
  if (!c) {
    c = { id: "self", name: "My notes", relation: "notes to self", close: false, lastContactAt: new Date().toISOString(), relationSource: "user" };
    db.contacts.unshift(c);
  }
  return c;
}

export async function readPhoto(db: DB, imageDataUrl: string): Promise<{ title: string; summary: string; added: number; contactId: string; error?: string }> {
  const contact = notesContact(db);
  const fail = (error: string) => ({ title: "", summary: "", added: 0, contactId: contact.id, error });
  if (butlerStatus() !== "online") return fail(butlerStatus());
  let r: Reading;
  try {
    r = await askVision<Reading>(SYSTEM, `TODAY: ${todayIST()}`, imageDataUrl);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  if (!r.readable) return fail("I could not read anything worth remembering in that photo. Try a closer, sharper shot.");

  const at = new Date().toISOString();
  const noteId = uid();
  db.messages.push({ id: noteId, contactId: contact.id, from: "butler", text: `Photo saved: ${r.title ?? "a photo"}. ${r.summary ?? ""}`.trim(), at });
  contact.lastContactAt = at;
  let added = 0;
  for (const m of r.memories ?? []) {
    if (!m?.fact) continue;
    const parsed = m.when ? parseWhen(m.when) : null;
    db.memories.push({
      id: uid(),
      contactId: contact.id,
      fact: m.fact,
      about: "user",
      kind: "event",
      when: parsed?.iso ?? null,
      timed: parsed?.timed || undefined,
      sourceMessageId: noteId,
      status: "open",
      createdAt: at,
    });
    added++;
  }
  return { title: r.title ?? "Photo", summary: r.summary ?? "", added, contactId: contact.id };
}
