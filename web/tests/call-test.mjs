// Test of voice-call routing between two signed-in people. Usage: node tests/call-test.mjs <base-url>
// This checks the server's part (who rings whom, what each side is shown, the notes afterwards).
// The audio connection itself is browser-to-browser and is checked separately in a real browser.
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const link = anon(B);
const stamp = Date.now().toString(36);
const asha = await signIn(B, `call-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `call-bala-${stamp}@example.com`, "Bala");
const chitra = await signIn(B, `call-chitra-${stamp}@example.com`, "Chitra");

const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const chitraToBala = (await chitra.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const rtc = (who, body) => who.call("/api/rtc", "POST", body);

check("calls need sign-in", (await link.call("/api/rtc", "POST", { action: "start", contactId: toBala, offer: "x" })).status === 401);
check("a sample contact cannot be called", (await rtc(asha, { action: "start", contactId: "ravi", offer: "v=0 offer" })).status === 400);

// Asha calls Bala.
let res = await rtc(asha, { action: "start", contactId: toBala, offer: "v=0 asha-offer" });
const started = await res.json();
check("a call starts ringing", res.status === 200 && Boolean(started.id) && started.call?.role === "caller" && started.call?.status === "ringing");
let b = await bala.json("/api/state");
check("the other person is rung, and given the caller's offer", b.call?.role === "callee" && b.call?.status === "ringing" && b.call?.offer === "v=0 asha-offer" && b.call?.withName === "Asha");
check("the caller is not shown their own offer back", !started.call?.offer);
check("a third person sees neither call nor offer", (await chitra.json("/api/state")).call === null);
res = await rtc(chitra, { action: "start", contactId: chitraToBala, offer: "v=0 chitra-offer" });
check("someone already being rung cannot be called by another", res.status === 409, (await res.json()).error);
check("only the person being called can answer", (await rtc(chitra, { action: "answer", id: started.id, answer: "v=0 nope" })).status === 409);

// Bala answers; Asha is given the answer.
res = await rtc(bala, { action: "answer", id: started.id, answer: "v=0 bala-answer" });
check("the call is answered", res.status === 200 && (await res.json()).call?.status === "active");
let a = await asha.json("/api/state");
check("the caller is given the answer", a.call?.status === "active" && a.call?.answer === "v=0 bala-answer");

// Asha hangs up.
a = await (await rtc(asha, { action: "end", id: started.id })).json();
b = await bala.json("/api/state");
check("hanging up ends it for both", a.call === null && b.call === null);
const aNote = a.messages.filter((m) => m.contactId === toBala && m.from === "butler").at(-1);
const fromAsha = b.contacts.find((c) => c.userId === asha.user.id);
const bNote = b.messages.filter((m) => m.contactId === fromAsha.id && m.from === "butler").at(-1);
check("each side gets a private note about the call", /You had a call with Bala/.test(aNote?.text ?? "") && /Asha had a call with you/.test(bNote?.text ?? ""), `${aNote?.text} | ${bNote?.text}`);
check("a call counts as being in touch", Date.now() - Date.parse(a.contacts.find((c) => c.id === toBala).lastContactAt) < 60000);

// A declined call.
const second = await (await rtc(asha, { action: "start", contactId: toBala, offer: "v=0 again" })).json();
await rtc(bala, { action: "end", id: second.id });
a = await asha.json("/api/state");
check("a declined call ends, and the caller is told", a.call === null && /couldn't take your call/.test(a.messages.filter((m) => m.contactId === toBala && m.from === "butler").at(-1)?.text ?? ""));

// A video call is marked as one for both sides.
const vid = await (await rtc(asha, { action: "start", contactId: toBala, offer: "v=0 video-offer", video: true })).json();
check("a video call rings as a video call", vid.call?.video === true && (await bala.json("/api/state")).call?.video === true);
await rtc(bala, { action: "answer", id: vid.id, answer: "v=0 video-answer" });
a = await (await rtc(asha, { action: "end", id: vid.id })).json();
check("the note afterwards says it was a video call", /video call with Bala/.test(a.messages.filter((m) => m.contactId === toBala && m.from === "butler").at(-1)?.text ?? ""));
check("a voice call is not marked as video", started.call?.video === false);

// A cancelled call leaves no ringing behind.
const third = await (await rtc(asha, { action: "start", contactId: toBala, offer: "v=0 third" })).json();
await rtc(asha, { action: "end", id: third.id });
check("a cancelled call stops ringing", (await bala.json("/api/state")).call === null);

finish();
