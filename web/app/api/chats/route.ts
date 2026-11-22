import { contactFor, findUser, findUserByPhone, findUserByUsername, normaliseUsername, save, spaceOf, User } from "@/lib/store";
import { normalisePhone } from "@/lib/otp";
import { allow, tooMany } from "@/lib/ratelimit";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

/**
 * Start (or reopen) a chat with another person on Equal.
 *
 * There is no directory: nobody can browse who is here. A chat can be started only with someone
 * whose phone number or username the caller already knows. Lookups are rate-limited so the
 * endpoint cannot be used to test lists of numbers or names.
 */
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  let other: User | undefined;

  if (typeof body?.phone === "string" || typeof body?.username === "string") {
    const limit = allow("lookup", ctx.user.id, 30, 3600);
    if (!limit.ok) return tooMany(limit, "Too many lookups");
    if (typeof body.phone === "string") {
      const phone = normalisePhone(body.phone);
      if (!phone) return Response.json({ error: "That does not look like a phone number." }, { status: 400 });
      other = findUserByPhone(phone);
    } else {
      const username = normaliseUsername(String(body.username));
      if (!/^[a-z0-9._]{3,20}$/.test(username)) return Response.json({ error: "That does not look like a username." }, { status: 400 });
      other = findUserByUsername(username);
    }
    if (other?.id === ctx.user.id) return Response.json({ error: "That is you." }, { status: 400 });
    if (!other || Boolean(other.test) !== Boolean(ctx.user.test)) return Response.json({ error: typeof body.username === "string" ? "Nobody on Equal has that username. Check the spelling, or use their phone number." : "They are not on Equal yet. Send them the invite link." }, { status: 404 });
  } else {
    // By account id: only to reopen a chat with someone already in my contacts. (The automated
    // tests' accounts may also start one this way; they never mix with real people.)
    other = findUser(String(body?.userId ?? ""));
    const already = other && ctx.db.contacts.some((c) => c.userId === other!.id);
    if (!other || other.id === ctx.user.id || Boolean(other.test) !== Boolean(ctx.user.test) || !(already || ctx.user.test)) return Response.json({ error: "No such person." }, { status: 400 });
  }

  const contact = contactFor(ctx.db, other);
  contactFor(spaceOf(other.id), ctx.user); // so the chat also appears on their side
  save();
  return Response.json({ ...snapshot(ctx.db, ctx.user), contactId: contact.id });
}
