import { save, uid } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// The user tells the assistant to forget something it remembered. It is deleted, not hidden.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  // The user tells Equal a fact about someone directly.
  if (body?.action === "add") {
    const contact = ctx.db.contacts.find((c) => c.id === body?.contactId && !c.owner);
    const fact = typeof body?.fact === "string" ? body.fact.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (!contact || !fact) return Response.json({ error: "Pick a person and say what to remember." }, { status: 400 });
    if (!ctx.db.memories.some((m) => m.contactId === contact.id && m.fact.toLowerCase() === fact.toLowerCase()))
      ctx.db.memories.push({ id: uid(), contactId: contact.id, fact, kind: "preference", about: "contact", when: null, status: "open", createdAt: new Date().toISOString() });
    save();
    return Response.json(snapshot(ctx.db, ctx.user));
  }
  const before = ctx.db.memories.length;
  ctx.db.memories = ctx.db.memories.filter((m) => m.id !== body?.id);
  if (ctx.db.memories.length === before) return Response.json({ error: "No such memory." }, { status: 404 });
  save();
  return Response.json(snapshot(ctx.db, ctx.user));
}
