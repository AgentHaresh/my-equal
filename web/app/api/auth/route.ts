import { findUserByPhone, upsertPhoneUser, upsertUser, User } from "@/lib/store";
import { checkCode, normalisePhone, requestCode, smsProvider } from "@/lib/otp";
import { clearCookie, currentUser, googleClientId, sessionCookie, verifyGoogle } from "@/lib/auth";

// GET: what the sign-in screen needs, and who is signed in (if anyone).
export async function GET(request: Request) {
  const user = currentUser(request);
  return Response.json({
    clientId: googleClientId(),
    sms: Boolean(smsProvider()), // whether codes really go out by SMS
    user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone, picture: user.picture } : null,
  });
}

// POST: sign in. Normally with a Google token. A second path, guarded by a server-side secret,
// exists only so automated tests can sign in without a browser.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  let profile: { email: string; name: string; picture?: string };
  let test = false;
  const signedIn = (user: User) =>
    Response.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, picture: user.picture } }, { headers: { "Set-Cookie": sessionCookie(user.id) } });

  // Sign-in by phone number, in two steps: ask for a code, then give it back.
  if (typeof body?.phone === "string") {
    const phone = normalisePhone(body.phone);
    if (!phone) return Response.json({ error: "That does not look like a phone number. Enter all ten digits." }, { status: 400 });
    // The automated tests may sign in as a number without an SMS, with the server's test secret.
    if (process.env.TEST_LOGIN_SECRET && body?.secret === process.env.TEST_LOGIN_SECRET) return signedIn(upsertPhoneUser(phone, body?.name ? String(body.name).slice(0, 60) : undefined, true));
    if (typeof body?.code !== "string") {
      const r = await requestCode(phone);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      // Is this a number we already know? The screen asks a new person for their name.
      return Response.json({ sent: r.sent, shownCode: r.shownCode, why: r.why, phone, known: Boolean(findUserByPhone(phone)) });
    }
    const ok = checkCode(phone, body.code);
    if (!ok.ok) return Response.json({ error: ok.error }, { status: 401 });
    const name = typeof body?.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!findUserByPhone(phone) && !name) return Response.json({ error: "Tell us your name to finish." }, { status: 400 });
    return signedIn(upsertPhoneUser(phone, name || undefined));
  }

  if (typeof body?.credential === "string") {
    if (!googleClientId()) return Response.json({ error: "Google sign-in is not set up on this server yet." }, { status: 503 });
    try {
      profile = await verifyGoogle(body.credential);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Sign-in failed." }, { status: 401 });
    }
  } else if (process.env.TEST_LOGIN_SECRET && body?.secret === process.env.TEST_LOGIN_SECRET && typeof body?.email === "string") {
    profile = { email: body.email, name: String(body.name ?? "Tester") };
    test = true;
  } else {
    return Response.json({ error: "Sign in with Google." }, { status: 400 });
  }

  const user = upsertUser(profile, test);
  return Response.json(
    { user: { id: user.id, name: user.name, email: user.email, picture: user.picture } },
    { headers: { "Set-Cookie": sessionCookie(user.id) } }
  );
}

// DELETE: sign out.
export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } });
}
