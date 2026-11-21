import { contactFor, findUser, save, spaceOf, uid, Message } from "@/lib/store";
import { analyse } from "@/lib/butler";
import { checkScam } from "@/lib/scam";
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

  const msg: Message = { id: uid(), contactId: contact.id, from: "me", text, at };
  db.messages.push(msg);
  contact.lastContactAt = at;

  // A real person: deliver a copy into their space, where their own Equal reads it for them.
  const other = contact.userId ? findUser(contact.userId) : undefined;
  if (other) {
    const theirs = spaceOf(other.id);
    const me = contactFor(theirs, user);
    const copy: Message = { id: uid(), contactId: me.id, from: "them", text, at };
    theirs.messages.push(copy);
    me.lastContactAt = at;
    void analyse(theirs, me, copy).then(() => save()); // does not hold up the sender
  }
  save(); // the message is stored even if the reading fails

  const error = contact.unknown ? null : await analyse(db, contact, msg);
  save();
  return Response.json(snapshot(db, user, error));
}
