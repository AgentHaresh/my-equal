import { findUser, save, spaceOf, uid, Message } from "@/lib/store";
import { analyse } from "@/lib/butler";
import { checkScam } from "@/lib/scam";
import { deliver } from "@/lib/deliver";
import { context, unauthorised } from "@/lib/auth";
import { snapshot, friendSnapshot } from "@/lib/snapshot";
import { deleteMessage, editMessage, react } from "@/lib/edit";
import { allow, clientAddress, tooMany } from "@/lib/ratelimit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.forwardOf === "string") {
    const ctx = context(request);
    if (!ctx) return unauthorised();
    const source = ctx.db.messages.find((m) => m.id === body.forwardOf && m.from !== "butler" && !m.deleted && !ctx.db.contacts.find((c) => c.id === m.contactId)?.owner);
    const to = ctx.db.contacts.find((c) => c.id === body?.contactId && !c.owner && !c.unknown);
    if (!source || !to) return Response.json({ error: "No such message or chat." }, { status: 404 });
    const error = await deliver(ctx.db, ctx.user, to, source.text, source.voice, undefined, source.file, true);
    return Response.json(snapshot(ctx.db, ctx.user, error));
  }
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });
  const at = new Date().toISOString();

  // The other side of a sample chat, typed from a link. Only sample contacts can be written to this way.
  if (body?.from === "them") {
    // This page needs no sign-in and each message is read by the model, so it is limited per network address and per account.
    const byAddress = allow("link.message", clientAddress(request), 1500, 600);
    if (!byAddress.ok) return tooMany(byAddress);
    const owner = findUser(String(body?.u ?? ""));
    const byOwner = owner ? allow("link.message.owner", owner.id, 300, 600) : null;
    if (byOwner && !byOwner.ok) return tooMany(byOwner);
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

  const error = await deliver(db, user, contact, text, undefined, typeof body?.replyTo === "string" ? body.replyTo : undefined);
  return Response.json(snapshot(db, user, error));
}

// Change the words of a message I sent. The other person's copy changes too, and both are marked "edited".
export async function PATCH(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  // A reaction is seen by both of us.
  if ("reaction" in (body ?? {})) {
    if (!react(ctx.db, String(body.id ?? ""), typeof body.reaction === "string" ? body.reaction : null)) return Response.json({ error: "No such message or reaction." }, { status: 404 });
    return Response.json(snapshot(ctx.db, ctx.user));
  }
  // Starring is private to me: it marks my copy only, on anyone's message.
  if (typeof body?.starred === "boolean") {
    const msg = ctx.db.messages.find((m) => m.id === body.id && m.from !== "butler" && !m.deleted);
    if (!msg) return Response.json({ error: "No such message." }, { status: 404 });
    msg.starred = body.starred || undefined;
    save();
    return Response.json(snapshot(ctx.db, ctx.user));
  }
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });
  const r = await editMessage(ctx.db, String(body?.id ?? ""), text);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json(snapshot(ctx.db, ctx.user, r.error));
}

// Delete a message. Mine is taken back for both of us; someone else's is removed from my side only.
export async function DELETE(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  if (!deleteMessage(ctx.db, String(body?.id ?? ""))) return Response.json({ error: "No such message." }, { status: 404 });
  return Response.json(snapshot(ctx.db, ctx.user));
}
