import { findUser, save, spaceOf } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// POST {contactId}: I have this chat open and have read it. My unread count for it clears, and
// the messages the other person sent me are marked read on their side.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  const contact = ctx.db.contacts.find((c) => c.id === body?.contactId && !c.owner);
  if (!contact) return Response.json({ error: "No such chat." }, { status: 404 });
  const now = new Date().toISOString();
  contact.readAt = now;

  const other = contact.userId ? findUser(contact.userId) : undefined;
  if (other) {
    const theirs = spaceOf(other.id);
    const me = theirs.contacts.find((c) => c.userId === ctx.user.id);
    if (me) for (const m of theirs.messages) if (m.contactId === me.id && m.from === "me" && !m.readAt) m.readAt = now;
  }
  save();
  return Response.json(snapshot(ctx.db, ctx.user));
}
