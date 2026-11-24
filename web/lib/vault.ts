/**
 * The lock on what Equal keeps on this device (its memory of private chats).
 *
 * One random memory key (AES-256-GCM) seals the memory. The memory key is never stored as it is:
 * it is stored twice, each copy locked by something only the person has:
 *
 *  - a passkey on this phone (fingerprint, face or screen lock). The passkey's PRF extension gives a
 *    secret that only that passkey can produce, and only after the person unlocks it; HKDF turns it
 *    into the key that locks the memory key.
 *  - a recovery code shown once (24 letters and digits, about 120 bits). PBKDF2-SHA256 with 600,000
 *    rounds turns it into a second key that locks a second copy, for when the passkey is lost or this
 *    browser cannot give a PRF secret.
 *
 * While unlocked, the memory key is held only in memory, as a key the page cannot export. A copy of the
 * browser's files without the passkey or the code shows only ciphertext. If both are lost the memory is
 * gone, but nothing else is: Equal reads the private chats again.
 *
 * What this does not protect against: code running in the unlocked page itself, and the browser's own
 * end-to-end keys (lib/e2e.ts), which are separate and protected by the browser.
 *
 * No browser-only imports: the same code runs in the browser and in Node's tests.
 */

export type Box = { iv: string; ct: string };
export type Vault = {
  v: 1;
  /** The memory key locked by the passkey, with what is needed to ask the passkey again. */
  passkey?: { credentialId: string; salt: string; key: Box };
  /** The memory key locked by the recovery code. */
  code: { salt: string; rounds: number; key: Box };
};

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
export const CODE_ROUNDS = 600_000;
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, so it can be read aloud and typed back

export const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
};
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** A recovery code: 24 characters in groups of four, about 120 bits. */
export function newRecoveryCode(): string {
  const bytes = random(24);
  const chars = Array.from(bytes, (b) => CODE_LETTERS[b % 32]).join(""); // 256 is a multiple of 32: no bias
  return chars.match(/.{4}/g)!.join("-");
}

/** The code as typed: case, spaces and dashes do not matter. */
export const canonical = (code: string) => code.toUpperCase().replace(/[\s-]/g, "");

async function lockKey(raw: ArrayBuffer | Uint8Array, wrapping: CryptoKey): Promise<Box> {
  const iv = random(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, wrapping, raw as BufferSource);
  return { iv: b64(iv), ct: b64(ct) };
}

async function unlockKey(box: Box, wrapping: CryptoKey): Promise<CryptoKey> {
  const raw = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, wrapping, unb64(box.ct)));
  try {
    return await subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}

/** The key that a recovery code opens. */
async function codeKey(code: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", enc.encode(canonical(code)), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: rounds }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** The key that a passkey's PRF secret opens. */
async function passkeyKey(prf: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", prf as BufferSource, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("my-equal/vault/v1"), info: enc.encode("memory key") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/**
 * Make a new vault: a fresh memory key, locked by the recovery code and, if given, by a passkey's PRF
 * secret. Returns the vault to store and the memory key to use now (not exportable).
 */
export async function makeVault(code: string, passkey?: { credentialId: string; salt: Uint8Array; prf: ArrayBuffer | Uint8Array }, rounds = CODE_ROUNDS): Promise<{ vault: Vault; key: CryptoKey }> {
  const raw = random(32);
  try {
    const salt = random(16);
    const vault: Vault = { v: 1, code: { salt: b64(salt), rounds, key: await lockKey(raw, await codeKey(code, salt, rounds)) } };
    if (passkey) vault.passkey = { credentialId: passkey.credentialId, salt: b64(passkey.salt), key: await lockKey(raw, await passkeyKey(passkey.prf)) };
    const key = await subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    return { vault, key };
  } finally {
    raw.fill(0);
  }
}

/** Open with the recovery code. Throws if the code is wrong. */
export async function openWithCode(vault: Vault, code: string): Promise<CryptoKey> {
  return unlockKey(vault.code.key, await codeKey(code, unb64(vault.code.salt), vault.code.rounds));
}

/** Open with the passkey's PRF secret. Throws if it is not the right passkey. */
export async function openWithPasskey(vault: Vault, prf: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  if (!vault.passkey) throw new Error("No passkey locks this memory.");
  return unlockKey(vault.passkey.key, await passkeyKey(prf));
}

/** Seal any JSON value with the memory key. A fresh nonce each time. */
export async function sealJson(key: CryptoKey, value: unknown): Promise<Box> {
  const iv = random(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("my-equal/mind/v1") }, key, enc.encode(JSON.stringify(value)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function openJson<T>(key: CryptoKey, box: Box): Promise<T> {
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: unb64(box.iv), additionalData: enc.encode("my-equal/mind/v1") }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt)) as T;
}

export const isBox = (x: unknown): x is Box => Boolean(x && typeof x === "object" && typeof (x as Box).iv === "string" && typeof (x as Box).ct === "string");
