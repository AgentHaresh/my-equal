import { save } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// The user tells the assistant to forget something it remembered. It is deleted, not hidden.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  const before = ctx.db.memories.length;
  ctx.db.memories = ctx.db.memories.filter((m) => m.id !== body?.id);
  if (ctx.db.memories.length === before) return Response.json({ error: "No such memory." }, { status: 404 });
  save();
  return Response.json(snapshot(ctx.db, ctx.user));
}
