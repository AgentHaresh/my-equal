import { save } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// The user corrects who someone is to them, or whether to keep them close. Their word is final:
// a relation set here is never overwritten by what the assistant infers.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  const contact = ctx.db.contacts.find((c) => c.id === body?.contactId && !c.unknown && !c.owner);
  if (!contact) return Response.json({ error: "No such contact." }, { status: 400 });
  // Starring a person keeps them at hand in Starred. It says nothing about the relationship.
  if (typeof body?.starred === "boolean") contact.starred = body.starred || undefined;
  // Who they are to me, in my own words ("college roommate", "cousin in Pune"). Free text, kept short.
  if (typeof body?.relation === "string") {
    const relation = body.relation.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!relation) return Response.json({ error: "Say who they are to you." }, { status: 400 });
    contact.relation = relation;
    contact.relationSource = "user";
  }
  if (typeof body?.close === "boolean") {
    contact.close = body.close;
    contact.relationSource = "user";
  }
  save();
  return Response.json(snapshot(ctx.db, ctx.user));
}
