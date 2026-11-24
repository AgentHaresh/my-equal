import { save } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { isPublicJwk, keyId } from "@/lib/e2e";

/** How many device keys are kept per person. Older ones are needed to read older messages. */
const MAX_KEYS = 8;

// POST {key: {id, jwk}}: this device's public key, so others can write to it privately. The
// private key stays on the device; anything carrying a private part is refused.
// POST {privateMode: boolean}: turn end-to-end encrypted chats on or off for this person.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { user } = ctx;
  const body = await request.json().catch(() => null);
  if (body?.key !== undefined) {
    const jwk = body.key?.jwk;
    if (!isPublicJwk(jwk)) return Response.json({ error: "That is not a public key this app can use." }, { status: 400 });
    const clean: JsonWebKey = { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
    const id = await keyId(clean);
    if (body.key?.id !== id) return Response.json({ error: "The key id does not match the key." }, { status: 400 });
    const keys = (user.keys ??= []);
    if (!keys.some((k) => k.id === id)) {
      keys.push({ id, jwk: clean });
      if (keys.length > MAX_KEYS) keys.splice(0, keys.length - MAX_KEYS);
    }
  }
  if (typeof body?.privateMode === "boolean") {
    if (body.privateMode && !user.keys?.length) return Response.json({ error: "This device has no key yet. Reload the app and try again." }, { status: 400 });
    user.privateMode = body.privateMode || undefined;
  }
  save();
  return Response.json(snapshot(ctx.db, user));
}
