// Test of staying in touch: family and the people I care about, how often to talk, who reached out
// to whom and when, reply and tone nudges, calls in the history, and telling Equal in the Ask box.
// Usage: node tests/family-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const stamp = Date.now().toString(36);
const me = await signIn(B, `family-me-${stamp}@example.com`, "Fam Tester");
const nudge = (s, type, id) => s.suggestions.find((x) => x.type === type && x.contactId === id);
const person = (s, id) => s.contacts.find((c) => c.id === id);

// --- The sample life: Nanna every 2 days, Priya every 3, Anna every week; Ravi is waiting for a reply.
let s = await me.json("/api/demo", "POST", { on: true });
check("family carry their rhythm", person(s, "nanna")?.family === true && person(s, "nanna")?.everyDays === 2 && person(s, "priya")?.everyDays === 3);
const nanna = nudge(s, "keep_close", "nanna");
check("it is time to talk to Nanna", /Time to talk to Nanna/.test(nanna?.title ?? ""), nanna?.title ?? "no nudge");
check("and it says the rhythm I chose", /every 2 days/.test(nanna?.detail ?? ""), nanna?.detail ?? "");
const priya = nudge(s, "keep_close", "priya");
check("an overdue sister is counted in days", /It's been \d+ days since you talked to Priya/.test(priya?.title ?? ""), priya?.title ?? "no nudge");
const anna = nudge(s, "keep_close", "anna");
check("a call counts, and is said plainly", /Anna called you .* \(22 min\)/.test(anna?.detail ?? ""), anna?.detail ?? "no nudge");
const ravi = nudge(s, "reply", "ravi");
check("someone I care about who is waiting for my reply is flagged", /Ravi wrote to you yesterday and you haven't replied/.test(ravi?.title ?? ""), ravi?.title ?? "no nudge");
check("acquaintances get no nudges", !s.suggestions.some((x) => ["keep_close", "reply", "tone"].includes(x.type) && ["kiran", "rao"].includes(x.contactId)));
check("calls are in the history sent to the screen", s.touches?.some((t) => t.contactId === "anna" && t.kind === "call" && t.dir === "in" && t.mins === 22));

// --- "I called Nanna" counts as being in touch.
s = await me.json("/api/contacts", "POST", { contactId: "nanna", logged: "call", mins: 10 });
check("logging a call clears the nudge", !nudge(s, "keep_close", "nanna"));
check("and the call is in her history", s.touches.some((t) => t.contactId === "nanna" && t.kind === "logged_call" && t.mins === 10));

// --- Who someone is, and how often, is mine to say.
s = await me.json("/api/contacts", "POST", { contactId: "kiran", everyDays: 7 });
check("a rhythm makes someone one of my people", person(s, "kiran")?.close === true && person(s, "kiran")?.everyDays === 7);
check("a rhythm out of range is refused", (await me.call("/api/contacts", "POST", { contactId: "kiran", everyDays: 500 })).status === 400);
s = await me.json("/api/contacts", "POST", { contactId: "kiran", family: true });
check("family are among my people", person(s, "kiran")?.family === true && person(s, "kiran")?.close === true);
s = await me.json("/api/contacts", "POST", { contactId: "kiran", close: false });
check("back to acquaintance clears family and the rhythm", person(s, "kiran")?.close === false && !person(s, "kiran")?.family && !person(s, "kiran")?.everyDays);
check("changing this needs sign-in", (await anon(B).call("/api/contacts", "POST", { contactId: "kiran", everyDays: 2 })).status === 401);

// --- Real people: a new contact starts as an acquaintance, and calls go into both histories.
const asha = await signIn(B, `family-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `family-bala-${stamp}@example.com`, "Bala");
await asha.json("/api/demo", "POST", { on: false });
await bala.json("/api/demo", "POST", { on: false });
const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const toAsha = (await bala.json("/api/chats", "POST", { userId: asha.user.id })).contactId;
s = await asha.json("/api/state");
check("a new person starts as an acquaintance", person(s, toBala)?.close === false && !person(s, toBala)?.family);

const rtc = (who, body) => who.call("/api/rtc", "POST", body).then((r) => r.json());
const call = await rtc(asha, { action: "start", contactId: toBala, offer: "v=0 offer" });
await rtc(bala, { action: "answer", id: call.id, answer: "v=0 answer" });
await rtc(asha, { action: "end", id: call.id });
const aTouch = (await asha.json("/api/state")).touches.find((t) => t.contactId === toBala);
const bTouch = (await bala.json("/api/state")).touches.find((t) => t.contactId === toAsha);
check("a finished call is in the caller's history as outgoing", aTouch?.kind === "call" && aTouch?.dir === "out", JSON.stringify(aTouch));
check("and in the other person's as incoming", bTouch?.kind === "call" && bTouch?.dir === "in", JSON.stringify(bTouch));

// --- Tone: Equal reads how a message sounded, keeps it private, and nudges me if they matter to me.
await asha.json("/api/contacts", "POST", { contactId: toBala, family: true, everyDays: 2 });
await bala.json("/api/messages", "POST", { contactId: toAsha, text: "Honestly I'm feeling really low today. Nothing is going right at work and I miss home so much." });
let toned = null;
for (let i = 0; i < 40 && !toned; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  s = await asha.json("/api/state");
  toned = s.messages.find((m) => m.contactId === toBala && m.from === "them" && m.tone);
}
check("Equal reads that they sound low", ["sad", "lonely", "stressed", "upset", "tired", "hurt", "worried"].includes(toned?.tone?.mood), JSON.stringify(toned?.tone ?? null));
const tn = nudge(s, "tone", toBala);
check("and gently tells me, because they are family", Boolean(tn) && /Bala sounded/.test(tn.title), tn?.title ?? "no nudge");
const bView = await bala.json("/api/state");
check("the sender never sees how Equal read them", !bView.messages.some((m) => m.tone));

// --- Promises in both directions.
await bala.json("/api/messages", "POST", { contactId: toAsha, text: "Don't worry about the tickets, I'll book them tomorrow and send you the PDF." });
let promise = null;
for (let i = 0; i < 40 && !promise; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  promise = (await asha.json("/api/state")).memories.find((m) => m.contactId === toBala && m.kind === "promise" && m.about === "contact");
}
check("a promise made to me is remembered", Boolean(promise), promise?.fact ?? "none");
const mine = await asha.json("/api/messages", "POST", { contactId: toBala, text: "Thank you! I'll call you tonight after dinner, promise." });
const myPromise = mine.memories?.find((m) => m.contactId === toBala && m.kind === "promise" && m.about === "user");
check("a small promise of mine is remembered", Boolean(myPromise), myPromise?.fact ?? mine.error ?? "none");

// --- Telling Equal in the Ask box.
let a = await me.json("/api/ask", "POST", { question: "Kiran is my cousin, remind me to talk to him every 3 days" });
s = await me.json("/api/state");
check("the Ask box can set family and a rhythm", person(s, "kiran")?.family === true && person(s, "kiran")?.everyDays === 3, `${a.answer || a.error} ${JSON.stringify(person(s, "kiran"))}`);
a = await me.json("/api/ask", "POST", { question: "I just called Priya" });
s = await me.json("/api/state");
check("and can log a call", s.touches.some((t) => t.contactId === "priya" && t.kind === "logged_call"), a.answer || a.error);
check("which clears her nudge", !nudge(s, "keep_close", "priya"));

finish();
