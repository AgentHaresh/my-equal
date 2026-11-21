import { upsertUser } from "@/lib/store";
import { clearCookie, currentUser, googleClientId, sessionCookie, verifyGoogle } from "@/lib/auth";

// GET: what the sign-in screen needs, and who is signed in (if anyone).
export async function GET(request: Request) {
  const user = currentUser(request);
  return Response.json({
    clientId: googleClientId(),
    user: user ? { id: user.id, name: user.name, email: user.email, picture: user.picture } : null,
  });
}

// POST: sign in. Normally with a Google token. A second path, guarded by a server-side secret,
// exists only so automated tests can sign in without a browser.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  let profile: { email: string; name: string; picture?: string };

  if (typeof body?.credential === "string") {
    if (!googleClientId()) return Response.json({ error: "Google sign-in is not set up on this server yet." }, { status: 503 });
    try {
      profile = await verifyGoogle(body.credential);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Sign-in failed." }, { status: 401 });
    }
  } else if (process.env.TEST_LOGIN_SECRET && body?.secret === process.env.TEST_LOGIN_SECRET && typeof body?.email === "string") {
    profile = { email: body.email, name: String(body.name ?? "Tester") };
  } else {
    return Response.json({ error: "Sign in with Google." }, { status: 400 });
  }

  const user = upsertUser(profile);
  return Response.json(
    { user: { id: user.id, name: user.name, email: user.email, picture: user.picture } },
    { headers: { "Set-Cookie": sessionCookie(user.id) } }
  );
}

// DELETE: sign out.
export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } });
}
