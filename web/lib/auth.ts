import crypto from "crypto";
import { DB, User, findUser, spaceOf } from "./store";

/**
 * Sign-in. People prove who they are with Google; the server then gives the browser a signed
 * cookie naming their account. No passwords are stored here.
 */

const COOKIE = "equal_session";
const WEEK = 7 * 24 * 3600;

const holder = globalThis as unknown as { __equalSecret?: string };
function secret() {
  // Without a configured secret, sessions last until the server restarts.
  return process.env.SESSION_SECRET || (holder.__equalSecret ??= crypto.randomBytes(32).toString("hex"));
}

function sign(userId: string) {
  return crypto.createHmac("sha256", secret()).update(userId).digest("hex");
}

export function sessionCookie(userId: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${userId}.${sign(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${WEEK}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function currentUser(request: Request): User | null {
  const raw = request.headers.get("cookie") ?? "";
  const match = raw.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!match) return null;
  const [userId, mac] = match.slice(COOKIE.length + 1).split(".");
  if (!userId || !mac) return null;
  const expected = sign(userId);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return findUser(userId) ?? null;
}

/** The signed-in person and their private space, or null if nobody is signed in. */
export function context(request: Request): { user: User; db: DB } | null {
  const user = currentUser(request);
  return user ? { user, db: spaceOf(user.id) } : null;
}

export const unauthorised = () => Response.json({ error: "Please sign in." }, { status: 401 });

export function googleClientId() {
  return (process.env.GOOGLE_CLIENT_ID ?? "").trim();
}

/** Ask Google whether a sign-in token is genuine and meant for this app. */
export async function verifyGoogle(credential: string): Promise<{ email: string; name: string; picture?: string }> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) throw new Error("Google did not accept that sign-in.");
  const t = await res.json();
  if (t.aud !== googleClientId()) throw new Error("That sign-in was issued for a different app.");
  if (String(t.email_verified) !== "true" || !t.email) throw new Error("That Google account has no verified email.");
  return { email: t.email, name: t.name || t.given_name || t.email.split("@")[0], picture: t.picture };
}
