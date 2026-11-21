import { findUserByPhone } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { normalisePhone, sendText, smsProvider } from "@/lib/otp";

// POST {phone}: text an invitation to someone who is not on Equal yet. The person signed in
// asks for each one; it goes out in their name. Limits stop it being used to pester people:
// five invitations a day per person, and one a day to any one number.
const DAY = 86400000;
const holder = globalThis as unknown as { __equalInvites?: { by: Map<string, number[]>; to: Map<string, number> } };
const sent = () => (holder.__equalInvites ??= { by: new Map<string, number[]>(), to: new Map<string, number>() });

export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  const phone = normalisePhone(String(body?.phone ?? ""));
  if (!phone) return Response.json({ error: "That does not look like a phone number." }, { status: 400 });
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const link = process.env.PUBLIC_URL ?? (host ? `https://${host}` : new URL(request.url).origin);
  const message = `${ctx.user.name} invited you to chat on Equal, a messenger that remembers for you: ${link}`;
  // What the app can fall back to: the phone's own messages app, with the words filled in.
  const fallback = { phone, message, link };

  const known = findUserByPhone(phone);
  if (known && Boolean(known.test) === Boolean(ctx.user.test)) return Response.json({ error: "They are already on Equal. Start the chat." }, { status: 409 });
  // The automated tests' accounts never send real texts.
  if (!smsProvider() || ctx.user.test) return Response.json({ error: "This server cannot send texts. Send it from your own phone instead.", ...fallback }, { status: 503 });

  const now = Date.now();
  const mine = (sent().by.get(ctx.user.id) ?? []).filter((t) => now - t < DAY);
  if (mine.length >= 5) return Response.json({ error: "You have sent five invitations today. Send this one from your own phone.", ...fallback }, { status: 429 });
  if (now - (sent().to.get(phone) ?? 0) < DAY) return Response.json({ error: "That number was already invited today.", ...fallback }, { status: 429 });
  try {
    await sendText(phone, message);
  } catch (e) {
    return Response.json({ error: `${e instanceof Error ? e.message : "Could not send it."} Send it from your own phone instead.`, ...fallback }, { status: 502 });
  }
  sent().by.set(ctx.user.id, [...mine, now]);
  sent().to.set(phone, now);
  return Response.json({ ok: true, phone });
}
