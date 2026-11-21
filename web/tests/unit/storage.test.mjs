// Unit tests for the storage layer: the database, saving only what changed, and encryption at rest.
//   node --test "tests/unit/*.test.mjs"
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeStorage, loadEverything, saveEverything, storageInfo, sealBytes, openBytes, sealText, openText } from "../../lib/storage.ts";

const KEY = "a".repeat(64);
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "equal-store-"));
  process.env.DATA_DIR = dir;
  process.env.DATA_KEY = KEY;
});
afterEach(() => {
  closeStorage();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sample = () => ({
  users: [{ id: "u1", name: "Asha" }, { id: "u2", name: "Bala" }],
  spaces: { u1: { messages: [{ text: "the secret plan is at nine" }] }, u2: { messages: [] } },
  rtc: [],
});

test("a first start has nothing to load", () => {
  assert.equal(loadEverything(), null);
  assert.equal(storageInfo().engine, "sqlite");
});

test("what is saved comes back the same after a restart", () => {
  saveEverything(sample());
  closeStorage(); // as if the server restarted
  assert.deepEqual(loadEverything(), sample());
});

test("only the rows that changed are written", () => {
  const all = sample();
  assert.equal(saveEverything(all), 4); // users, rtc, and two people
  assert.equal(saveEverything(all), 0); // nothing changed
  all.spaces.u1.messages.push({ text: "one more" });
  assert.equal(saveEverything(all), 1); // only Asha's row
  all.users.push({ id: "u3", name: "Chitra" });
  all.spaces.u3 = { messages: [] };
  assert.equal(saveEverything(all), 2); // the account list, and the new person
});

test("a restart does not rewrite rows that have not changed", () => {
  saveEverything(sample());
  closeStorage();
  const loaded = loadEverything();
  assert.equal(saveEverything(loaded), 0);
});

test("with a key set, nothing readable is on the disk", () => {
  saveEverything(sample());
  closeStorage();
  const onDisk = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f)).toString("latin1")).join("");
  assert.equal(storageInfo().encryptedAtRest, true);
  assert.ok(!onDisk.includes("secret plan"), "message text must not be readable on disk");
  assert.ok(!onDisk.includes("Asha"), "names must not be readable on disk");
});

test("without the key the data cannot be read, and is not silently replaced", () => {
  saveEverything(sample());
  closeStorage();
  delete process.env.DATA_KEY;
  assert.throws(() => loadEverything(), /encrypted/);
  closeStorage();
  process.env.DATA_KEY = "b".repeat(64); // a wrong key
  assert.throws(() => loadEverything());
});

test("without a key (a laptop), data is stored in the clear and that is reported", () => {
  delete process.env.DATA_KEY;
  saveEverything(sample());
  assert.equal(storageInfo().encryptedAtRest, false);
  closeStorage();
  assert.deepEqual(loadEverything(), sample());
});

test("the earlier JSON file is brought in once and then removed", () => {
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify(sample()));
  assert.deepEqual(loadEverything(), sample());
  assert.equal(fs.existsSync(path.join(dir, "db.json")), false);
  closeStorage();
  assert.deepEqual(loadEverything(), sample()); // now from the database
});

test("text and files seal and open, and tampering is detected", () => {
  const sealed = sealText("hello");
  assert.ok(sealed.startsWith("enc1:") && !sealed.includes("hello"));
  assert.equal(openText(sealed), "hello");
  assert.equal(openText("plain old text"), "plain old text"); // written before encryption was on

  const bytes = Buffer.from([1, 2, 3, 4, 5]);
  const sealedBytes = sealBytes(bytes);
  assert.ok(!sealedBytes.equals(bytes));
  assert.ok(openBytes(sealedBytes).equals(bytes));
  assert.ok(openBytes(bytes).equals(bytes)); // a file stored before encryption was on

  sealedBytes[sealedBytes.length - 1] ^= 1; // flip one bit
  assert.throws(() => openBytes(sealedBytes));
});

test("each seal uses a fresh nonce, so the same text never looks the same twice", () => {
  assert.notEqual(sealText("same"), sealText("same"));
});
