import { context, unauthorised } from "@/lib/auth";
import { pushPublicKey, subscribe, subscribed, unsubscribe } from "@/lib/push";

// GET: the server's public key, which a browser needs before it can accept notifications from us.
export async function GET(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  return Response.json({ key: pushPublicKey(), on: subscribed(ctx.user.id) });
}

// POST {subscription}: this browser agreed to notifications. POST {off: endpoint}: it no longer does.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  if (typeof body?.off === "string") {
    unsubscribe(ctx.user.id, body.off);
    return Response.json({ on: subscribed(ctx.user.id) });
  }
  if (!subscribe(ctx.user.id, body?.subscription)) return Response.json({ error: "That is not a notification subscription." }, { status: 400 });
  return Response.json({ on: true });
}
