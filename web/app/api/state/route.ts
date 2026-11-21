import { findUser, resetSamples, save, spaceOf } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot, friendSnapshot, protectedSnapshot } from "@/lib/snapshot";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const friend = q.get("friend");
  const guarded = q.get("protected");

  // The other side of a sample chat, and a protected family member's phone, are opened by link.
  // The link names whose account they belong to; they expose one sample thread and nothing else.
  if (friend || guarded) {
    const owner = findUser(q.get("u") ?? "");
    if (!owner) return Response.json({ error: "This link is not valid." }, { status: 404 });
    const space = spaceOf(owner.id);
    return Response.json(guarded ? protectedSnapshot(space, guarded) : friendSnapshot(space, friend!));
  }

  const ctx = context(request);
  if (!ctx) return unauthorised();
  return Response.json(snapshot(ctx.db, ctx.user));
}

// DELETE puts the sample contacts back to their starting state. Real chats and imports are kept.
export async function DELETE(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  resetSamples(ctx.db);
  save();
  return Response.json(snapshot(ctx.db, ctx.user));
}
