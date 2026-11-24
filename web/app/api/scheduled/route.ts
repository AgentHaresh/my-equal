import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { cancelScheduled, schedule } from "@/lib/scheduled";
import { isSealed } from "@/lib/e2e";

// POST {action:"set", contactId, text, when}: write a message now, to be sent at "when".
// POST {action:"cancel", id}: take a waiting message back before it is sent.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);

  if (body?.action === "cancel") {
    if (!cancelScheduled(ctx.db, String(body?.id ?? ""))) return Response.json({ error: "It has already been sent, or was cancelled." }, { status: 404 });
    return Response.json(snapshot(ctx.db, ctx.user));
  }
  if (body?.action !== "set") return Response.json({ error: "Unknown action." }, { status: 400 });
  // A private message to send later waits as ciphertext, like any other private message.
  if (body?.enc !== undefined && !isSealed(body.enc)) return Response.json({ error: "That private message is not in the right form." }, { status: 400 });
  const enc = body?.enc;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!text && !enc) return Response.json({ error: "text is required" }, { status: 400 });
  const r = schedule(ctx.db, String(body?.contactId ?? ""), text, String(body?.when ?? ""), enc);
  if ("error" in r) return Response.json({ error: r.error }, { status: 400 });
  return Response.json(snapshot(ctx.db, ctx.user));
}
