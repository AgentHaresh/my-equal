import { contactFor, findUser, findUserByPhone, save, spaceOf } from "@/lib/store";
import { normalisePhone } from "@/lib/otp";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// Start (or reopen) a chat with another person on My Equal, by their account or by their phone number.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  let other = findUser(String(body?.userId ?? ""));
  if (typeof body?.phone === "string") {
    const phone = normalisePhone(body.phone);
    if (!phone) return Response.json({ error: "That does not look like a phone number." }, { status: 400 });
    other = findUserByPhone(phone);
    if (other?.id === ctx.user.id) return Response.json({ error: "That is your own number." }, { status: 400 });
    if (!other || Boolean(other.test) !== Boolean(ctx.user.test)) return Response.json({ error: "That number is not on My Equal yet. Send them the invite link." }, { status: 404 });
  }
  if (!other || other.id === ctx.user.id || Boolean(other.test) !== Boolean(ctx.user.test)) return Response.json({ error: "No such person." }, { status: 400 });

  const contact = contactFor(ctx.db, other);
  contactFor(spaceOf(other.id), ctx.user); // so the chat also appears on their side
  save();
  return Response.json({ ...snapshot(ctx.db, ctx.user), contactId: contact.id });
}
