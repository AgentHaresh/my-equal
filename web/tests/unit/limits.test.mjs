// Unit tests for the rate limiter, the metrics store and phone-number handling.
//   node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile } from "../../lib/metrics.ts";
import { normalisePhone, checkCode, requestCode } from "../../lib/otp.ts";

test("phone numbers are put in international form", () => {
  assert.equal(normalisePhone("98765 43210"), "+919876543210");
  assert.equal(normalisePhone("098765-43210"), "+919876543210");
  assert.equal(normalisePhone("+91 98765 43210"), "+919876543210");
  assert.equal(normalisePhone("919876543210"), "+919876543210");
  assert.equal(normalisePhone("+1 (415) 555-0100"), "+14155550100");
});

test("things that are not phone numbers are refused", () => {
  for (const bad of ["", "12345", "hello", "1234567890", "+0123456789", "98765432101234567"]) assert.equal(normalisePhone(bad), null, bad);
});

test("percentiles are read from the samples", () => {
  const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(samples, 50), 60);
  assert.equal(percentile(samples, 95), 100);
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([7], 95), 7);
});

test("a one-time code works once, and a wrong code is refused", async () => {
  delete process.env.FAST2SMS_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  process.env.OTP_ONSCREEN_FALLBACK = "on"; // the demo switch hands the code back, which is what lets this run offline
  const phone = "+919000000001";
  const asked = await requestCode(phone);
  assert.equal(asked.ok, true);
  assert.match(asked.shownCode, /^\d{6}$/);
  const wrong = asked.shownCode === "000000" ? "000001" : "000000";
  assert.equal(checkCode(phone, wrong).ok, false);
  assert.equal(checkCode(phone, asked.shownCode).ok, true);
  assert.equal(checkCode(phone, asked.shownCode).ok, false); // used up
});

test("a code can be proved and kept while a new person gives their name", async () => {
  const phone = "+919000000002";
  const asked = await requestCode(phone);
  assert.equal(checkCode(phone, asked.shownCode, true).ok, true); // kept
  assert.equal(checkCode(phone, asked.shownCode).ok, true); // then used
  assert.equal(checkCode(phone, asked.shownCode).ok, false);
});

test("asking for a second code straight away is refused", async () => {
  const phone = "+919000000003";
  assert.equal((await requestCode(phone)).ok, true);
  const again = await requestCode(phone);
  assert.equal(again.ok, false);
  assert.equal(again.status, 429);
});

test("five wrong tries throw the code away", async () => {
  const phone = "+919000000004";
  const asked = await requestCode(phone);
  const wrong = asked.shownCode === "111111" ? "222222" : "111111";
  for (let i = 0; i < 5; i++) assert.equal(checkCode(phone, wrong).ok, false);
  assert.equal(checkCode(phone, asked.shownCode).ok, false);
});

test("by default a code is never handed back: with no SMS service, sign-in is refused", async () => {
  delete process.env.OTP_ONSCREEN_FALLBACK;
  const asked = await requestCode("+919000000005");
  assert.equal(asked.ok, false);
  assert.equal(asked.status, 503);
  assert.equal(asked.shownCode, undefined);
  process.env.OTP_ONSCREEN_FALLBACK = "on";
});
