import { findUser, save, spaceOf, uid, Message } from "@/lib/store";
import { analyse } from "@/lib/butler";
import { checkScam } from "@/lib/scam";
import { deliver } from "@/lib/deliver";
import { context, unauthorised } from "@/lib/auth";
import { snapshot, friendSnapshot } from "@/lib/snapshot";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });
  const at = new Date().toISOString();

  // The other side of a sample chat, typed from a link. Only sample contacts can be written to this way.
  if (body?.from === "them") {
    const owner = findUser(String(body?.u ?? ""));
    const space = owner && spaceOf(owner.id);
    const contact = space?.contacts.find((c) => c.id === body?.contactId && c.sample);
    if (!space || !contact) return Response.json({ error: "This link is not valid." }, { status: 404 });
    const msg: Message = { id: uid(), contactId: contact.id, from: "them", text, at };
    space.messages.push(msg);
    contact.lastContactAt = at;
    save();
    // Unknown numbers get the scam check; sample friends get the usual reading for memories.
    if (contact.unknown) await checkScam(space, contact, msg);
    else await analyse(space, contact, msg);
    save();
    return Response.json(friendSnapshot(space, contact.id));
  }

  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { db, user } = ctx;
  const contact = db.contacts.find((c) => c.id === body?.contactId);
  if (!contact) return Response.json({ error: "No such chat." }, { status: 400 });

  const error = await deliver(db, user, contact, text);
  return Response.json(snapshot(db, user, error));
}
