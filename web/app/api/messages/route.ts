import { load, save, uid, Message } from "@/lib/store";
import { analyse } from "@/lib/butler";
import { checkScam } from "@/lib/scam";
import { snapshot, friendSnapshot } from "@/lib/snapshot";


export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const from = body?.from === "them" ? "them" : "me";
  const db = load();
  const contact = db.contacts.find((c) => c.id === body?.contactId);
  if (!contact || !text) return Response.json({ error: "contactId and text are required" }, { status: 400 });

  const msg: Message = { id: uid(), contactId: contact.id, from, text: text.slice(0, 2000), at: new Date().toISOString() };
  db.messages.push(msg);
  contact.lastContactAt = msg.at;
  save(db); // the message is stored even if the analysis fails

  // Unknown numbers get the scam check; people you know get the usual reading for memories and offers of help.
  const error = contact.unknown ? (from === "them" ? await checkScam(db, contact, msg) : null) : await analyse(db, contact, msg);
  save(db);
  return Response.json(from === "them" ? friendSnapshot(db, contact.id) : snapshot(db, error));
}
