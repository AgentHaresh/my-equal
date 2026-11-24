// Unit tests for end-to-end encryption: two people share a key nobody else can derive.
//   node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportPublic, isPublicJwk, isSealed, makeKeyPair, open, seal, sharedKey } from "../../lib/e2e.ts";

async function person() {
  const pair = await makeKeyPair();
  return { pair, pub: await exportPublic(pair) };
}

test("both people derive the same key, and only they can read the message", async () => {
  const asha = await person();
  const bala = await person();
  const eve = await person();
  const kA = await sharedKey(asha.pair.privateKey, asha.pub.id, bala.pub);
  const kB = await sharedKey(bala.pair.privateKey, bala.pub.id, asha.pub);
  const sealed = await seal(kA, "Amma ki phone chey, ra 🙏", asha.pub.id, bala.pub.id);
  assert.ok(isSealed(sealed));
  assert.ok(!sealed.ct.includes("Amma"));
  assert.equal(await open(kB, sealed), "Amma ki phone chey, ra 🙏");
  assert.equal(await open(kA, sealed), "Amma ki phone chey, ra 🙏"); // the sender can read their own copy
  // Someone else, even holding both public keys, cannot.
  const kE = await sharedKey(eve.pair.privateKey, eve.pub.id, asha.pub);
  await assert.rejects(open(kE, sealed));
});

test("any change to the ciphertext or its key ids is refused", async () => {
  const asha = await person();
  const bala = await person();
  const k = await sharedKey(asha.pair.privateKey, asha.pub.id, bala.pub);
  const sealed = await seal(k, "hello", asha.pub.id, bala.pub.id);
  const flipped = { ...sealed, ct: (sealed.ct[0] === "A" ? "B" : "A") + sealed.ct.slice(1) };
  await assert.rejects(open(k, flipped));
  await assert.rejects(open(k, { ...sealed, k: sealed.r, r: sealed.k }));
});

test("each message has its own nonce", async () => {
  const asha = await person();
  const bala = await person();
  const k = await sharedKey(asha.pair.privateKey, asha.pub.id, bala.pub);
  const a = await seal(k, "same words", asha.pub.id, bala.pub.id);
  const b = await seal(k, "same words", asha.pub.id, bala.pub.id);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test("public keys are checked for shape, and never carry a private part", async () => {
  const { pub } = await person();
  assert.ok(isPublicJwk(pub.jwk));
  assert.ok(!isPublicJwk({ ...pub.jwk, d: "secret" }));
  assert.ok(!isPublicJwk({ ...pub.jwk, crv: "P-384" }));
  assert.ok(!isPublicJwk({ kty: "EC", crv: "P-256", x: "short", y: "short" }));
  assert.match(pub.id, /^[0-9a-f]{16}$/);
});

test("sealed bodies are checked for shape and size", () => {
  const ok = { v: 1, iv: "AAAAAAAAAAAAAAAA", ct: "QUJD", k: "0123456789abcdef", r: "fedcba9876543210" };
  assert.ok(isSealed(ok));
  assert.ok(!isSealed({ ...ok, v: 2 }));
  assert.ok(!isSealed({ ...ok, ct: "x".repeat(12004) }));
  assert.ok(!isSealed({ ...ok, k: "not-an-id" }));
  assert.ok(!isSealed({ ...ok, ct: "<script>" }));
});
