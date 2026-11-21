import { findUser, resetSamples, save, spaceOf } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot, friendSnapshot, protectedSnapshot } from "@/lib/snapshot";
import { createHash } from "crypto";
import { sendDue, startScheduler } from "@/lib/scheduled";

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
  startScheduler(); // messages set to send later go out on a server timer
  sendDue();
  ctx.user.seenAt = new Date().toISOString(); // their app is open right now
  // The app says which version of its state it already holds. If nothing has changed, the answer
  // is a few bytes instead of the whole history.
  const body = JSON.stringify(snapshot(ctx.db, ctx.user));
  const v = createHash("sha1").update(body).digest("base64url").slice(0, 16);
  if (q.get("v") === v) return Response.json({ same: true, v });
  return new Response(`{"v":"${v}",${body.slice(1)}`, { headers: { "Content-Type": "application/json" } });
}

// DELETE puts the sample contacts back to their starting state. Real chats and imports are kept.
export async function DELETE(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  resetSamples(ctx.db);
  save();
  return Response.json(snapshot(ctx.db, ctx.user));
}
