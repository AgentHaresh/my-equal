import { contactFor, findUser, findUserByUsername, normaliseUsername, save, spaceOf, User } from "@/lib/store";
// import { findUserByPhone } from "@/lib/store";
// import { normalisePhone } from "@/lib/otp";
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

  // Phone lookup is switched off while sign-in is Google only (accounts have no phone number).
  if (typeof body?.phone === "string") return Response.json({ error: "Start a chat by @username." }, { status: 400 });
  if (typeof body?.username === "string") {
    const limit = allow("lookup", ctx.user.id, 30, 3600);
    if (!limit.ok) return tooMany(limit, "Too many lookups");
    // Lookup by phone number, switched off for now:
    // const phone = normalisePhone(body.phone);
    // if (!phone) return Response.json({ error: "That does not look like a phone number." }, { status: 400 });
    // other = findUserByPhone(phone);
    const username = normaliseUsername(String(body.username));
    if (!/^[a-z0-9._]{3,20}$/.test(username)) return Response.json({ error: "That does not look like a username." }, { status: 400 });
    other = findUserByUsername(username);
    if (other?.id === ctx.user.id) return Response.json({ error: "That is you." }, { status: 400 });
    if (!other || Boolean(other.test) !== Boolean(ctx.user.test)) return Response.json({ error: "Nobody on My Equal has that username. Check the spelling." }, { status: 404 });
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
