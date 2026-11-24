// This device's encryption key, and locking and unlocking private messages on the phone.
//
// The key pair is made here, with the browser's WebCrypto, and kept in this browser's IndexedDB.
// Its private half cannot be exported, so it never leaves the device: not to the server, not in
// a backup. One key per account per device; a second account on the same browser has its own.
import { exportPublic, makeKeyPair, open, seal, sharedKey, type PublicKey, type Sealed } from "@/lib/e2e";

export type Device = { pair: CryptoKeyPair; pub: PublicKey };

const DB_NAME = "my-equal-keys";
const STORE = "device";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get(userId: string): Promise<Device | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(userId);
    req.onsuccess = () => resolve(req.result as Device | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function put(userId: string, device: Device): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(device, userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const devices = new Map<string, Promise<Device>>();

/** This device's key for this account, made on first use. Null where the browser has no WebCrypto (an insecure page). */
export function deviceKey(userId: string): Promise<Device> | null {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) return null;
  let d = devices.get(userId);
  if (!d) {
    d = (async () => {
      const found = await get(userId);
      if (found) return found;
      const pair = await makeKeyPair();
      const device = { pair, pub: await exportPublic(pair) };
      await put(userId, device);
      return device;
    })();
    devices.set(userId, d);
  }
  return d;
}

const shared = new Map<string, Promise<CryptoKey>>();
function keyWith(me: Device, peer: PublicKey) {
  const k = `${me.pub.id}|${peer.id}`;
  let p = shared.get(k);
  if (!p) shared.set(k, (p = sharedKey(me.pair.privateKey, me.pub.id, peer)));
  return p;
}

/** Lock text for the other person's newest device. */
export async function lockFor(me: Device, peer: PublicKey, text: string): Promise<Sealed> {
  return seal(await keyWith(me, peer), text, me.pub.id, peer.id);
}

/**
 * Unlock a private message. Null if it was locked for another device of mine (this device cannot
 * read it) or the other person's key is no longer known. Throws only if it was tampered with.
 */
export async function unlock(me: Device, enc: Sealed, mine: boolean, peerKeys: PublicKey[]): Promise<string | null> {
  const myId = mine ? enc.k : enc.r;
  const theirId = mine ? enc.r : enc.k;
  if (myId !== me.pub.id) return null;
  const peer = peerKeys.find((k) => k.id === theirId);
  if (!peer) return null;
  return open(await keyWith(me, peer), enc);
}

/** What a private message shows when this device cannot read it. */
export const ON_OTHER_DEVICE = "🔒 Private message for another device of yours";
export const UNLOCKING = "🔒 …";
export const TAMPERED = "⚠️ This private message was changed on the way and cannot be trusted.";
