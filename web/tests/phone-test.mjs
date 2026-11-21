// Test of sign-in by phone number and one-time code, and starting a chat by number.
// Usage: node tests/phone-test.mjs <base-url>
// The real code path makes real (non-test) accounts, so it is only exercised against a local server.
import { anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const SECRET = process.env.TEST_LOGIN_SECRET ?? "localtest";
// Asking for a code texts a real phone when an SMS service is connected. This test uses made-up
// numbers, so that part runs ONLY against a local server that has no SMS service.
const smsConnected = (await (await fetch(B + "/api/auth")).json()).sms === true;
// It also needs the demo switch (OTP_ONSCREEN_FALLBACK=on), which hands the code back instead of texting it.
const health = await (await fetch(B + "/api/health")).json();
const local = /localhost|127\.0\.0\.1/.test(B) && !smsConnected && health.signIn?.codeShownOnScreen === true;
if (smsConnected) console.log("An SMS service is connected: skipping every step that would send a text.");
const { check, finish } = checker();
const auth = (body, cookie) => fetch(B + "/api/auth", { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (res) => res.headers.get("set-cookie")?.split(";")[0];
const rnd = () => String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const number = () => "9" + rnd();

// --- numbers
let res = await auth({ phone: "12345" });
check("a number that is too short is refused", res.status === 400);
res = await auth({ phone: "hello" });
check("something that is not a number is refused", res.status === 400);

// --- sign in with the test secret (works on any server), as two people
const signInAs = async (phone, name) => {
  const r = await auth({ phone, name, secret: SECRET });
  const cookie = cookieOf(r);
  const { user } = await r.json();
  const call = (path, method = "GET", body) => fetch(B + path, { method, headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { user, cookie, call, json: (path, method, body) => call(path, method, body).then((x) => x.json()) };
};
const p1 = number();
const p2 = number();
const asha = await signInAs(p1, "Asha");
const bala = await signInAs(`+91 ${p2.slice(0, 5)} ${p2.slice(5)}`, "Bala");
check("a phone account is created with its number in international form", asha.user.phone === `+91${p1}` && bala.user.phone === `+91${p2}`, `${asha.user.phone} ${bala.user.phone}`);
check("the same number, written differently, is the same account", (await signInAs(`0${p1}`, undefined)).user.id === asha.user.id);
const me = await asha.json("/api/state");
check("my own number is shown to me", me.me.phone === `+91${p1}`);

// --- start a chat by number
res = await asha.call("/api/chats", "POST", { phone: p2 });
const started = await res.json();
check("a chat can be started with a phone number", res.status === 200 && Boolean(started.contactId) && started.contacts.some((c) => c.id === started.contactId && c.name === "Bala"));
check("the chat appears on the other side too", (await bala.json("/api/state")).contacts.some((c) => c.userId === asha.user.id));
check("a number that is not on My Equal is reported as such", (await asha.call("/api/chats", "POST", { phone: number() })).status === 404);
check("my own number cannot be chatted with", (await asha.call("/api/chats", "POST", { phone: p1 })).status === 400);
check("starting a chat needs sign-in", (await anon(B).call("/api/chats", "POST", { phone: p2 })).status === 401);
check("other people's numbers are not given out", !JSON.stringify(started).includes(p2));

// --- inviting a number that is not here yet. Test accounts never send a real text: the server
// prepares the words and hands them back for the person's own phone to send.
res = await asha.call("/api/invite", "POST", { phone: number() });
const inv = await res.json();
check("for a number not on Equal, an invitation is prepared in my name with the link", res.status === 503 && /^Asha invited you to chat on Equal/.test(inv.message ?? "") && /https?:\/\//.test(inv.message ?? "") && /^\+91\d{10}$/.test(inv.phone ?? ""), JSON.stringify(inv).slice(0, 160));
check("someone already on Equal is not invited", (await asha.call("/api/invite", "POST", { phone: p2 })).status === 409);
check("a bad number is refused", (await asha.call("/api/invite", "POST", { phone: "123" })).status === 400);
check("inviting needs sign-in", (await anon(B).call("/api/invite", "POST", { phone: number() })).status === 401);

// --- the code itself (local only, and only with no SMS service)
if (local) {
  const p3 = number();
  res = await auth({ phone: p3 });
  const asked = await res.json();
  check("asking for a code works, and does not say whether the number has an account", res.status === 200 && asked.known === undefined && asked.phone === `+91${p3}`);
  check("with no SMS service connected, the code is shown instead of sent", asked.sent === false && /^\d{6}$/.test(asked.shownCode ?? ""));
  check("asking again straight away is refused", (await auth({ phone: p3 })).status === 429);
  const wrong = asked.shownCode === "000000" ? "000001" : "000000";
  check("a wrong code is refused", (await auth({ phone: p3, code: wrong, name: "Chitra" })).status === 401);
  res = await auth({ phone: p3, code: asked.shownCode });
  const fresh = await res.json();
  check("a new person with the right code is signed in, with a placeholder name that is not their number", res.status === 200 && fresh.user?.name === "New on Equal" && !fresh.user.name.includes(p3.slice(-4)));
  const freshState = await (await fetch(B + "/api/state", { headers: { cookie: cookieOf(res) } })).json();
  check("and is asked to set up their profile first", freshState.me?.needsSetup === true);
  check("a code works once only", (await auth({ phone: p3, code: asked.shownCode })).status === 401);

  const p4 = number();
  const code = (await (await auth({ phone: p4 })).json()).shownCode;
  res = await auth({ phone: p4, code, name: "Divya" });
  const d = await res.json();
  check("the right code and a name sign a new person in", res.status === 200 && d.user?.name === "Divya" && Boolean(cookieOf(res)));
  const state = await (await fetch(B + "/api/state", { headers: { cookie: cookieOf(res) } })).json();
  check("a new real account starts with no made-up chats", state.contacts.every((c) => !c.sample) && state.messages.length === 0);

  const p5 = number();
  const c5 = (await (await auth({ phone: p5 })).json()).shownCode;
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await auth({ phone: p5, code: c5 === "111111" ? "222222" : "111111", name: "X" })).status;
  check("after five wrong tries the code is thrown away", last === 401 && (await auth({ phone: p5, code: c5, name: "X" })).status === 401);
}

finish();
