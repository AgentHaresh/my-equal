import { load, save, uid, Message } from "@/lib/store";
import { analyse, parseWhatsApp } from "@/lib/butler";
import { snapshot } from "@/lib/snapshot";


// Import a WhatsApp "Export chat" text file as a conversation with one contact.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const myName = String(body?.myName ?? "").trim();
  if (!text || !myName) return Response.json({ error: "text and myName are required" }, { status: 400 });

  const parsed = parseWhatsApp(text, myName);
  if (!parsed.length) return Response.json({ error: "No messages recognised. Is this a WhatsApp chat export?" }, { status: 400 });

  const other = parsed.find((m) => m.from === "them")?.sender ?? "Imported chat";
  const db = load();
  let contact = db.contacts.find((c) => c.name.toLowerCase() === other.toLowerCase());
  if (!contact) {
    contact = { id: uid(), name: other, relation: String(body?.relation ?? "friend"), close: true, lastContactAt: parsed[parsed.length - 1].at };
    db.contacts.push(contact);
  }
  const added: Message[] = parsed.slice(-200).map((m) => ({ id: uid(), contactId: contact.id, from: m.from, text: m.text.slice(0, 2000), at: m.at }));
  db.messages.push(...added);
  contact.lastContactAt = added[added.length - 1].at;
  save(db);

  // Read the most recent messages for memories. Kept small so an import stays fast.
  let error: string | null = null;
  for (const m of added.slice(-8)) {
    error = await analyse(db, contact, m, true);
    if (error) break;
  }
  save(db);
  return Response.json({ ...snapshot(db, error), imported: added.length, contactId: contact.id });
}
