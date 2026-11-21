import crypto from "crypto";

/**
 * Sign-in by phone number: the server sends a six-digit code by SMS and the person types it in.
 *
 * Codes are kept only in memory, as a salted hash, for five minutes, and a code allows five
 * wrong tries. A number can ask for a code at most once every 30 seconds and five times an hour.
 *
 * Sending SMS needs an account with an SMS service, set through the server's settings:
 *   FAST2SMS_KEY                                        (India), or
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM  (worldwide)
 * With neither set, no SMS can be sent. The code is then handed back to the sign-in screen and
 * shown there with a plain notice. That keeps a demo usable, but it proves nothing about who
 * holds the number, so it must not be used for a real launch.
 */

const CODE_MINUTES = 5;
const MAX_TRIES = 5;
type Pending = { hash: string; salt: string; expires: number; tries: number };
const holder = globalThis as unknown as { __equalOtp?: Map<string, Pending>; __equalOtpAsked?: Map<string, number[]> };
const pending = () => (holder.__equalOtp ??= new Map<string, Pending>());
const asked = () => (holder.__equalOtpAsked ??= new Map<string, number[]>());

/** A phone number in international form. Ten digits are taken to be Indian. Null if it cannot be one. */
export function normalisePhone(raw: string): string | null {
  const digits = String(raw).replace(/[\s\-().]/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export function smsProvider(): "fast2sms" | "twilio" | null {
  if (process.env.FAST2SMS_KEY) return "fast2sms";
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) return "twilio";
  return null;
}

async function sendSms(phone: string, code: string): Promise<void> {
  const provider = smsProvider();
  if (provider === "fast2sms") {
    if (!phone.startsWith("+91")) throw new Error("This SMS service only reaches Indian numbers.");
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: { authorization: process.env.FAST2SMS_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ route: "otp", variables_values: code, numbers: phone.slice(3) }),
    });
    const r = await res.json().catch(() => null);
    if (!res.ok || r?.return === false) throw new Error("The SMS service refused to send the code.");
  } else if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM!, Body: `${code} is your My Equal code. It works for ${CODE_MINUTES} minutes. Do not share it with anyone.` }),
    });
    if (!res.ok) throw new Error("The SMS service refused to send the code.");
  }
}

/** Send an ordinary text (not a code), for an invitation. Throws if it cannot be sent. */
export async function sendText(phone: string, message: string): Promise<void> {
  const provider = smsProvider();
  if (!provider) throw new Error("No SMS service is connected.");
  if (provider === "fast2sms") {
    if (!phone.startsWith("+91")) throw new Error("This SMS service only reaches Indian numbers.");
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: { authorization: process.env.FAST2SMS_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ route: "q", message, language: "english", flash: 0, numbers: phone.slice(3) }),
    });
    const r = await res.json().catch(() => null);
    if (!res.ok || r?.return === false) throw new Error(typeof r?.message === "string" ? `The SMS service said: ${r.message}` : "The SMS service refused to send it.");
  } else {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM!, Body: message }),
    });
    if (!res.ok) throw new Error("The SMS service refused to send it.");
  }
}

const hashOf = (code: string, salt: string) => crypto.createHash("sha256").update(salt + code).digest("hex");

export type Asked = { ok: true; sent: boolean; shownCode?: string } | { ok: false; status: number; error: string };

/** Make a code for this number and send it. */
export async function requestCode(phone: string): Promise<Asked> {
  const now = Date.now();
  const recent = (asked().get(phone) ?? []).filter((t) => now - t < 3600000);
  if (recent.length && now - recent[recent.length - 1] < 30000) return { ok: false, status: 429, error: "A code was just sent. Wait half a minute before asking again." };
  if (recent.length >= 5) return { ok: false, status: 429, error: "Too many codes asked for this number. Try again in an hour." };
  asked().set(phone, [...recent, now]);

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const salt = crypto.randomBytes(8).toString("hex");
  pending().set(phone, { hash: hashOf(code, salt), salt, expires: now + CODE_MINUTES * 60000, tries: 0 });
  if (pending().size > 5000) for (const [k, v] of pending()) if (v.expires < now) pending().delete(k);

  if (!smsProvider()) return { ok: true, sent: false, shownCode: code };
  try {
    await sendSms(phone, code);
    return { ok: true, sent: true };
  } catch (e) {
    pending().delete(phone);
    return { ok: false, status: 502, error: e instanceof Error ? e.message : "Could not send the code." };
  }
}

/** Is this the code we sent to this number? A right code is used up; a wrong one counts against it. */
export function checkCode(phone: string, code: string): { ok: true } | { ok: false; error: string } {
  const p = pending().get(phone);
  if (!p || p.expires < Date.now()) {
    pending().delete(phone);
    return { ok: false, error: "That code has run out. Ask for a new one." };
  }
  if (p.tries >= MAX_TRIES) {
    pending().delete(phone);
    return { ok: false, error: "Too many wrong tries. Ask for a new code." };
  }
  const given = hashOf(String(code).trim(), p.salt);
  if (given.length !== p.hash.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(p.hash))) {
    p.tries++;
    return { ok: false, error: "That code is not right. Check it and try again." };
  }
  pending().delete(phone);
  return { ok: true };
}
