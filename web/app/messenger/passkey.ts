// A passkey on this device, used only as a lock: its PRF extension gives a secret that only this passkey
// can produce, after the person unlocks it with their fingerprint, face or screen lock. Nothing about it
// is sent to the server; the server is not part of this.
import { b64, random, unb64 } from "@/lib/vault";

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };
const prfInput = (salt: Uint8Array) => ({ prf: { eval: { first: salt } } }) as AuthenticationExtensionsClientInputs;

export const passkeysAvailable = () => typeof window !== "undefined" && "PublicKeyCredential" in window && Boolean(navigator.credentials);

/** Ask the passkey for its secret. */
export async function passkeySecret(credentialId: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      allowCredentials: [{ type: "public-key", id: unb64(credentialId) }],
      userVerification: "required",
      timeout: 60000,
      extensions: prfInput(salt),
    },
  })) as PublicKeyCredential | null;
  const first = (cred?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first;
  if (!first) throw new Error("This passkey did not give a secret, so it cannot lock Equal's memory on this browser.");
  return first;
}

/**
 * Make a passkey for this account on this device and get its secret. Returns null if this browser or
 * device cannot do it (no passkeys, or passkeys without the PRF extension); the recovery code still works.
 */
export async function makePasskey(userId: string, name: string): Promise<{ credentialId: string; salt: Uint8Array; prf: ArrayBuffer } | null> {
  if (!passkeysAvailable()) return null;
  const salt = random(32);
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: "My Equal" },
      user: { id: new TextEncoder().encode(`mind:${userId}`), name: `${name} · Equal's memory`, displayName: name },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
      extensions: prfInput(salt),
    },
  })) as PublicKeyCredential | null;
  if (!cred) return null;
  const credentialId = b64(cred.rawId);
  const out = cred.getClientExtensionResults() as PrfResults;
  if (out.prf?.enabled === false) return null;
  // Some devices give the secret when the passkey is made; others only when it is used.
  const prf = out.prf?.results?.first ?? (await passkeySecret(credentialId, salt).catch(() => null));
  return prf ? { credentialId, salt, prf } : null;
}
