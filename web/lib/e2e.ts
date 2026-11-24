/**
 * End-to-end encryption of messages between two people.
 *
 * Each device makes its own key pair (ECDH on P-256) with the platform's WebCrypto. The private
 * key never leaves the device and cannot be exported; only the public key goes to the server.
 * Two people derive the same secret from their own private key and the other's public key
 * (ECDH), stretch it with HKDF into an AES-256-GCM key, and encrypt each message with a fresh
 * 96-bit nonce. One ciphertext is readable by both of them and by no one else, the server included.
 *
 * The server stores and relays the ciphertext with the message's metadata (who, to whom, when),
 * which it needs to deliver messages and to say who reached out to whom. It never sees the words.
 *
 * What this does not yet do (later steps): protect against a server that swaps in its own
 * public key (people will compare a safety code), forward secrecy (keys do not rotate per
 * message), and encrypting photos, files and voice notes.
 *
 * No server or browser-only imports: the same code runs in the browser, in Node's tests, and
 * later in the native app's web view.
 */

export type PublicKey = { id: string; jwk: JsonWebKey };
/** An encrypted message body. "k" is the sender's key id, "r" the recipient's. */
export type Sealed = { v: 1; iv: string; ct: string; k: string; r: string };

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
const CURVE = { name: "ECDH", namedCurve: "P-256" } as const;

const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** A new key pair for this device. The private key is not extractable. */
export async function makeKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(CURVE, false, ["deriveBits"]) as Promise<CryptoKeyPair>;
}

/** The short id of a public key: the first 16 hex digits of the SHA-256 of its coordinates. */
export async function keyId(jwk: JsonWebKey): Promise<string> {
  const digest = await subtle().digest("SHA-256", enc.encode(`${jwk.crv}|${jwk.x}|${jwk.y}`));
  return [...new Uint8Array(digest).slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function exportPublic(pair: CryptoKeyPair): Promise<PublicKey> {
  const full = await subtle().exportKey("jwk", pair.publicKey);
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x: full.x, y: full.y };
  return { id: await keyId(jwk), jwk };
}

/** True if this is a P-256 public key in the expected shape, with nothing private in it. */
export function isPublicJwk(j: unknown): j is JsonWebKey {
  const k = j as Record<string, unknown> | null;
  const coord = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
  return Boolean(k) && k!.kty === "EC" && k!.crv === "P-256" && coord(k!.x) && coord(k!.y) && !("d" in k!);
}

/** True if this looks like a sealed message body, within size limits. */
export function isSealed(s: unknown): s is Sealed {
  const x = s as Record<string, unknown> | null;
  const id = (v: unknown) => typeof v === "string" && /^[0-9a-f]{16}$/.test(v);
  return Boolean(x) && x!.v === 1 && typeof x!.iv === "string" && /^[A-Za-z0-9+/]{16}$/.test(x!.iv as string) && typeof x!.ct === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(x!.ct as string) && (x!.ct as string).length <= 12000 && id(x!.k) && id(x!.r);
}

/** The AES key two people share. The same on both sides, whichever of them derives it. */
export async function sharedKey(mine: CryptoKey, myId: string, theirs: PublicKey): Promise<CryptoKey> {
  const pub = await subtle().importKey("jwk", { ...theirs.jwk, ext: true }, CURVE, false, []);
  const bits = await subtle().deriveBits({ name: "ECDH", public: pub }, mine, 256);
  const hkdf = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const pairIds = [myId, theirs.id].sort().join("|");
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("my-equal/e2e/v1"), info: enc.encode(pairIds) },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt text for the other person. The key ids are bound into the ciphertext. */
export async function seal(key: CryptoKey, text: string, myId: string, theirId: string): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`v1|${myId}|${theirId}`) }, key, enc.encode(text));
  return { v: 1, iv: b64(iv), ct: b64(ct), k: myId, r: theirId };
}

/** Decrypt a sealed body. Throws if it was changed in any way, or the key is not the right one. */
export async function open(key: CryptoKey, s: Sealed): Promise<string> {
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: unb64(s.iv), additionalData: enc.encode(`v1|${s.k}|${s.r}`) }, key, unb64(s.ct));
  return dec.decode(pt);
}
