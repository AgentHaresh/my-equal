import { upsertPhoneUser, upsertUser, User } from "@/lib/store";
import { checkCode, normalisePhone, requestCode, smsProvider } from "@/lib/otp";
import { allow, clientAddress, tooMany } from "@/lib/ratelimit";
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
    if (process.env.TEST_LOGIN_SECRET && body?.secret === process.env.TEST_LOGIN_SECRET) {
      try {
        return signedIn(upsertPhoneUser(phone, body?.name ? String(body.name).slice(0, 60) : undefined, true));
      } catch {
        return Response.json({ error: "That number belongs to a real account." }, { status: 403 });
      }
    }
    const from = clientAddress(request);
    if (typeof body?.code !== "string") {
      // Each code is a text message that costs money, so one network address can ask for only so many.
      const limit = allow("otp.request", from, 60, 3600);
      if (!limit.ok) return tooMany(limit, "Too many codes asked for");
      const r = await requestCode(phone);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      // Nothing here says whether the number already has an account: that is told only after the code is proved.
      return Response.json({ sent: r.sent, shownCode: r.shownCode, why: r.why, phone });
    }
    const tries = allow("otp.verify", from, 200, 3600);
    if (!tries.ok) return tooMany(tries, "Too many tries");
    const name = typeof body?.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    const ok = checkCode(phone, body.code);
    if (!ok.ok) return Response.json({ error: ok.error }, { status: 401 });
    // A new person is signed in straight away; the app then asks them to set up their profile.
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

  let user: User;
  try {
    user = upsertUser(profile, test);
  } catch {
    return Response.json({ error: "That address belongs to a real account." }, { status: 403 });
  }
  return Response.json(
    { user: { id: user.id, name: user.name, email: user.email, picture: user.picture } },
    { headers: { "Set-Cookie": sessionCookie(user.id) } }
  );
}

// DELETE: sign out.
export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } });
}
