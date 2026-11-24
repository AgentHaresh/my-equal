// Unit tests for the lock on Equal's memory on the device: only the passkey's secret or the recovery code opens it.
//   node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, isBox, makeVault, newRecoveryCode, openJson, openWithCode, openWithPasskey, random, sealJson } from "../../lib/vault.ts";

const ROUNDS = 1000; // the real count (600,000) is slow in tests; the code path is the same
const mind = { facts: [{ id: "L1", fact: "Asha: I'll book the train tickets tomorrow." }], tones: { m1: { mood: "sad", note: "Asha sounds sad." } }, read: { m1: "iv" } };

test("a recovery code is 24 characters from an alphabet without look-alikes, in groups of four", () => {
  const code = newRecoveryCode();
  assert.match(code, /^([A-HJ-NP-Z2-9]{4}-){5}[A-HJ-NP-Z2-9]{4}$/);
  assert.notEqual(code, newRecoveryCode());
});

test("what is sealed shows no words, and the memory key opens it", async () => {
  const { key } = await makeVault(newRecoveryCode(), undefined, ROUNDS);
  const box = await sealJson(key, mind);
  assert.ok(isBox(box));
  assert.ok(!JSON.stringify(box).includes("tickets") && !JSON.stringify(box).includes("sad"));
  assert.deepEqual(await openJson(key, box), mind);
});

test("the recovery code opens it, typed in any case and with or without dashes; a wrong code does not", async () => {
  const code = newRecoveryCode();
  const { vault, key } = await makeVault(code, undefined, ROUNDS);
  const box = await sealJson(key, mind);
  const typed = code.toLowerCase().replace(/-/g, " ");
  assert.deepEqual(await openJson(await openWithCode(vault, typed), box), mind);
  await assert.rejects(openWithCode(vault, newRecoveryCode()));
  assert.equal(canonical(" ab-cd "), "ABCD");
});

test("the passkey's secret opens it; another passkey's does not; no passkey means code only", async () => {
  const prf = random(32);
  const { vault, key } = await makeVault(newRecoveryCode(), { credentialId: "cred", salt: random(32), prf }, ROUNDS);
  const box = await sealJson(key, mind);
  assert.deepEqual(await openJson(await openWithPasskey(vault, prf), box), mind);
  await assert.rejects(openWithPasskey(vault, random(32)));
  const { vault: codeOnly } = await makeVault(newRecoveryCode(), undefined, ROUNDS);
  await assert.rejects(openWithPasskey(codeOnly, prf), /No passkey/);
});

test("the vault stores no memory key in the clear, and the key cannot be exported", async () => {
  const { vault, key } = await makeVault(newRecoveryCode(), { credentialId: "cred", salt: random(32), prf: random(32) }, ROUNDS);
  assert.equal(key.extractable, false);
  await assert.rejects(globalThis.crypto.subtle.exportKey("raw", key));
  // Each copy of the memory key is ciphertext with a tag: 32 bytes of key + 16 of tag.
  assert.equal(atob(vault.code.key.ct).length, 48);
  assert.equal(atob(vault.passkey.key.ct).length, 48);
});

test("a sealed memory that was changed on disk does not open", async () => {
  const { key } = await makeVault(newRecoveryCode(), undefined, ROUNDS);
  const box = await sealJson(key, mind);
  const bytes = Uint8Array.from(atob(box.ct), (c) => c.charCodeAt(0));
  bytes[0] ^= 1;
  await assert.rejects(openJson(key, { iv: box.iv, ct: btoa(String.fromCharCode(...bytes)) }));
});
