/**
 * Where the data lives on disk.
 *
 * A SQLite database (data/equal.db), using the database engine built into Node, so there is
 * nothing extra to install or run:
 *
 *   spaces(user_id, body, hash, updated_at)   one row per person: their chats, facts and reminders
 *   meta(key, body)                           the list of accounts, and small shared records
 *
 * Two properties matter:
 *
 * 1. Only what changed is written. Each save compares a person's data with what was last written
 *    and rewrites that one row, inside a transaction. One person sending a message no longer
 *    rewrites everyone's data. The database runs in write-ahead mode, so a crash cannot leave a
 *    half-written state.
 *
 * 2. It is encrypted at rest. With DATA_KEY set (32 random bytes, in hex), every row and every
 *    uploaded file is sealed with AES-256-GCM before it touches the disk. A copy of the disk
 *    without the key is unreadable. Without DATA_KEY (a developer's laptop) data is stored in the
 *    clear, and `storageInfo()` says so.
 *
 * This file imports only Node's own modules, so it can be unit-tested with no server.
 * It replaces the earlier single JSON file, which is imported once and then removed.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

// ---------- encryption at rest

const SEALED_TEXT = "enc1:";
const SEALED_BYTES = Buffer.from("EQENC1\n");

function dataKey(): Buffer | null {
  const hex = (process.env.DATA_KEY ?? "").trim();
  return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, "hex") : null;
}

/** Seal bytes with AES-256-GCM: a fresh 12-byte nonce, then the 16-byte check tag, then the sealed bytes. */
function seal(plain: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

/** Open sealed bytes. Throws if the key is wrong or the bytes were altered. */
function open(sealed: Buffer, key: Buffer): Buffer {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}

export function sealText(text: string): string {
  const key = dataKey();
  return key ? SEALED_TEXT + seal(Buffer.from(text, "utf8"), key).toString("base64") : text;
}

export function openText(stored: string): string {
  if (!stored.startsWith(SEALED_TEXT)) return stored; // written before encryption was switched on
  const key = dataKey();
  if (!key) throw new Error("The data is encrypted and DATA_KEY is not set.");
  return open(Buffer.from(stored.slice(SEALED_TEXT.length), "base64"), key).toString("utf8");
}

/** For uploaded files. */
export function sealBytes(bytes: Buffer): Buffer {
  const key = dataKey();
  return key ? Buffer.concat([SEALED_BYTES, seal(bytes, key)]) : bytes;
}

export function openBytes(stored: Buffer): Buffer {
  if (!stored.subarray(0, SEALED_BYTES.length).equals(SEALED_BYTES)) return stored;
  const key = dataKey();
  if (!key) throw new Error("The file is encrypted and DATA_KEY is not set.");
  return open(stored.subarray(SEALED_BYTES.length), key);
}

// ---------- the database

/** The few calls used, of Node's built-in SQLite. Declared here because the project's Node types predate it. */
type Statement = { run: (...values: unknown[]) => unknown; get: (...values: unknown[]) => Record<string, unknown> | undefined; all: (...values: unknown[]) => Record<string, unknown>[] };
type Database = { exec: (sql: string) => void; prepare: (sql: string) => Statement; close: () => void };

export const dataDir = () => process.env.DATA_DIR || path.join(process.cwd(), "data");

type Handle = { db: Database; written: Map<string, string> };
const holder = globalThis as unknown as { __equalDb?: Handle | null };

function database(): Handle | null {
  if (holder.__equalDb !== undefined) return holder.__equalDb;
  try {
    // Asked for by name at run time, so the bundler does not try to package a part of Node itself.
    const sqlite = (process as unknown as { getBuiltinModule: (name: string) => { DatabaseSync: new (file: string) => Database } }).getBuiltinModule("node:sqlite");
    fs.mkdirSync(dataDir(), { recursive: true });
    const db = new sqlite.DatabaseSync(path.join(dataDir(), "equal.db"));
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    db.exec("CREATE TABLE IF NOT EXISTS spaces (user_id TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL, updated_at TEXT NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL)");
    holder.__equalDb = { db, written: new Map() };
  } catch {
    holder.__equalDb = null; // this Node has no built-in database: the JSON file is used instead
  }
  return holder.__equalDb;
}

/** Close the database and forget it. Used by tests that point DATA_DIR somewhere else. */
export function closeStorage() {
  holder.__equalDb?.db.close();
  holder.__equalDb = undefined;
}

export function storageInfo() {
  return { engine: database() ? ("sqlite" as const) : ("json-file" as const), encryptedAtRest: Boolean(dataKey()) };
}

const hashOf = (text: string) => crypto.createHash("sha1").update(text).digest("hex");
const legacyFile = () => path.join(dataDir(), "db.json");

/** Everything the app keeps: the accounts, one space per person, and a few small shared records. */
export type Everything = { users: unknown[]; spaces: Record<string, unknown> } & Record<string, unknown>;

/**
 * Read everything from disk. Returns null on a first start, when there is nothing yet.
 * Throws if data exists but cannot be read (a wrong key, a damaged file): starting empty on top of
 * unreadable data would overwrite it.
 */
export function loadEverything(): Everything | null {
  const h = database();
  if (!h) {
    if (!fs.existsSync(legacyFile())) return null;
    return JSON.parse(fs.readFileSync(legacyFile(), "utf8")) as Everything;
  }
  const metaRows = h.db.prepare("SELECT key, body, hash FROM meta").all();
  const spaceRows = h.db.prepare("SELECT user_id, body, hash FROM spaces").all();
  if (!metaRows.length && !spaceRows.length) {
    // Nothing in the database yet. If the earlier JSON file is there, bring it in once and remove it.
    if (!fs.existsSync(legacyFile())) return null;
    const old = JSON.parse(fs.readFileSync(legacyFile(), "utf8")) as Everything;
    if (!old.users || !old.spaces) return null;
    saveEverything(old);
    fs.rmSync(legacyFile());
    return old;
  }
  const all: Everything = { users: [], spaces: {} };
  for (const row of metaRows) {
    all[String(row.key)] = JSON.parse(openText(String(row.body)));
    h.written.set(`meta:${row.key}`, String(row.hash));
  }
  for (const row of spaceRows) {
    all.spaces[String(row.user_id)] = JSON.parse(openText(String(row.body)));
    h.written.set(`space:${row.user_id}`, String(row.hash));
  }
  return all;
}

/** Write what changed since the last save. Returns how many rows were written. */
export function saveEverything(all: Everything): number {
  const h = database();
  if (!h) {
    fs.mkdirSync(dataDir(), { recursive: true });
    const next = `${legacyFile()}.next`;
    fs.writeFileSync(next, JSON.stringify(all)); // written whole, then swapped in
    fs.renameSync(next, legacyFile());
    return 1;
  }
  const changed: { table: "spaces" | "meta"; key: string; body: string; hash: string }[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (key === "spaces") continue;
    const text = JSON.stringify(value);
    const hash = hashOf(text);
    if (h.written.get(`meta:${key}`) !== hash) changed.push({ table: "meta", key, body: text, hash });
  }
  for (const [userId, space] of Object.entries(all.spaces)) {
    const text = JSON.stringify(space);
    const hash = hashOf(text);
    if (h.written.get(`space:${userId}`) !== hash) changed.push({ table: "spaces", key: userId, body: text, hash });
  }
  if (!changed.length) return 0;

  const now = new Date().toISOString();
  const putSpace = h.db.prepare("INSERT INTO spaces (user_id, body, hash, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET body = excluded.body, hash = excluded.hash, updated_at = excluded.updated_at");
  const putMeta = h.db.prepare("INSERT INTO meta (key, body, hash) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body, hash = excluded.hash");
  h.db.exec("BEGIN");
  try {
    for (const c of changed) {
      if (c.table === "spaces") putSpace.run(c.key, sealText(c.body), c.hash, now);
      else putMeta.run(c.key, sealText(c.body), c.hash);
    }
    h.db.exec("COMMIT");
  } catch (e) {
    h.db.exec("ROLLBACK");
    throw e;
  }
  for (const c of changed) h.written.set(`${c.table === "spaces" ? "space" : "meta"}:${c.key}`, c.hash);
  return changed.length;
}
