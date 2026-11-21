import { findUser } from "@/lib/store";
import { answerCall, endCall, startCall } from "@/lib/rtc";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// Voice and video calls between two signed-in people. This route only relays what the two browsers need
// to connect to each other; the audio itself never passes through the server.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  const sdp = (v: unknown) => (typeof v === "string" && v.length < 60000 ? v : "");

  if (body?.action === "start") {
    const contact = ctx.db.contacts.find((c) => c.id === body.contactId && c.userId);
    const other = contact?.userId ? findUser(contact.userId) : undefined;
    const offer = sdp(body.offer);
    if (!other || !offer) return Response.json({ error: "You can only call someone who is on My Equal." }, { status: 400 });
    const call = startCall(ctx.user, other, offer, body.video === true);
    if ("error" in call) return Response.json(call, { status: 409 });
    return Response.json({ id: call.id, ...snapshot(ctx.db, ctx.user) });
  }
  if (body?.action === "answer") {
    const answer = sdp(body.answer);
    if (!answer || !answerCall(ctx.user, String(body.id ?? ""), answer)) return Response.json({ error: "That call is no longer ringing." }, { status: 409 });
    return Response.json(snapshot(ctx.db, ctx.user));
  }
  if (body?.action === "end") {
    endCall(ctx.user, String(body.id ?? ""));
    return Response.json(snapshot(ctx.db, ctx.user));
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}
