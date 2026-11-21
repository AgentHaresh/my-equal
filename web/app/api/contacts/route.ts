import { save } from "@/lib/store";
import { RELATIONS } from "@/lib/people";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// The user corrects who someone is to them, or whether to keep them close. Their word is final:
// a relation set here is never overwritten by what the assistant infers.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  const contact = ctx.db.contacts.find((c) => c.id === body?.contactId && !c.unknown);
  if (!contact) return Response.json({ error: "No such contact." }, { status: 400 });
  if (typeof body?.relation === "string" && (RELATIONS as readonly string[]).includes(body.relation)) {
    contact.relation = body.relation;
    contact.relationSource = "user";
  }
  if (typeof body?.close === "boolean") {
    contact.close = body.close;
    contact.relationSource = "user";
  }
  save();
  return Response.json(snapshot(ctx.db, ctx.user));
}
