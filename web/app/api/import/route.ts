import { save, uid, Message } from "@/lib/store";
import { analyse, parseWhatsApp } from "@/lib/butler";
import { learnRelation } from "@/lib/people";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// Import a WhatsApp "Export chat" text file as a conversation with one contact, into the signed-in person's space.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { db, user } = ctx;
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const myName = String(body?.myName ?? "").trim();
  if (!text || !myName) return Response.json({ error: "Choose the exported file and enter your name as it appears in it." }, { status: 400 });
  if (text.length > 3_000_000) return Response.json({ error: "That export is too large. Export without media and try again." }, { status: 400 });

  const parsed = parseWhatsApp(text, myName);
  if (!parsed.length) return Response.json({ error: "No messages recognised. Is this a WhatsApp chat export (.txt)?" }, { status: 400 });
  if (!parsed.some((m) => m.from === "me"))
    return Response.json({ error: `None of the messages are from "${myName}". Enter your name exactly as WhatsApp shows it in the file.` }, { status: 400 });

  const other = parsed.find((m) => m.from === "them")?.sender ?? "Imported chat";
  let contact = db.contacts.find((c) => !c.sample && !c.userId && c.name.toLowerCase() === other.toLowerCase());
  if (!contact) {
    contact = { id: uid(), name: other, relation: "imported from WhatsApp", close: false, lastContactAt: parsed[parsed.length - 1].at };
    db.contacts.unshift(contact);
  }
  const added: Message[] = parsed.slice(-300).map((m) => ({ id: uid(), contactId: contact.id, from: m.from, text: m.text.slice(0, 2000), at: m.at }));
  db.messages.push(...added);
  contact.lastContactAt = added[added.length - 1].at;
  save();

  // Read the most recent messages for memories. Old messages never trigger an offer of help.
  let error: string | null = null;
  for (const m of added.slice(-10)) {
    error = await analyse(db, contact, m, true);
    if (error) break;
  }
  // Work out who this person is to the user, and so whether to watch for drifting apart.
  if (!error) error = await learnRelation(db, contact);
  save();
  return Response.json({ ...snapshot(db, user, error), imported: added.length, contactId: contact.id });
}
