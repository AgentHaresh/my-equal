import { contactFor, findUser, save, spaceOf } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// Start (or reopen) a chat with another signed-in person.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  const other = findUser(String(body?.userId ?? ""));
  if (!other || other.id === ctx.user.id || Boolean(other.test) !== Boolean(ctx.user.test)) return Response.json({ error: "No such person." }, { status: 400 });

  const contact = contactFor(ctx.db, other);
  contactFor(spaceOf(other.id), ctx.user); // so the chat also appears on their side
  save();
  return Response.json({ ...snapshot(ctx.db, ctx.user), contactId: contact.id });
}
