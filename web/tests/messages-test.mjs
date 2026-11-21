// Test of reply, edit, delete and reminders. Usage: node tests/messages-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);
const asha = await signIn(B, `msg-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `msg-bala-${stamp}@example.com`, "Bala");
const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const thread = (s, contactId) => s.messages.filter((m) => m.contactId === contactId && m.from !== "butler");

// --- reply
let a = await asha.json("/api/messages", "POST", { contactId: toBala, text: "Shall we meet for coffee on Saturday?" });
const first = thread(a, toBala).at(-1);
let b = await bala.json("/api/state");
const toAsha = b.contacts.find((c) => c.userId === asha.user.id).id;
const firstAtBala = thread(b, toAsha).at(-1);
b = await bala.json("/api/messages", "POST", { contactId: toAsha, text: "Yes, 5 pm works.", replyTo: firstAtBala.id });
const replyAtBala = thread(b, toAsha).at(-1);
check("a reply points at the message it answers", replyAtBala.replyTo === firstAtBala.id);
a = await asha.json("/api/state");
const replyAtAsha = thread(a, toBala).at(-1);
check("on the other side the reply points at their own copy", replyAtAsha.replyTo === first.id && replyAtAsha.from === "them");
b = await bala.json("/api/messages", "POST", { contactId: toAsha, text: "ok", replyTo: "not-a-message" });
check("a reply to a message that is not in the chat is sent as a plain message", thread(b, toAsha).at(-1).replyTo === undefined);

// --- edit
a = await asha.json("/api/messages", "POST", { contactId: toBala, text: "I have a dentist appointment on 28 November at 4 pm." });
const dentist = thread(a, toBala).at(-1);
const about = (s, word) => s.memories.filter((m) => new RegExp(word, "i").test(m.fact));
check("the assistant remembers a plan from a message", about(a, "dentist").length > 0, JSON.stringify(a.memories.map((m) => m.fact)));
let res = await asha.call("/api/messages", "PATCH", { id: dentist.id, text: "Sorry, wrong chat. Ignore that." });
a = await res.json();
const edited = thread(a, toBala).find((m) => m.id === dentist.id);
check("my message can be edited, and is marked edited", res.status === 200 && edited.text === "Sorry, wrong chat. Ignore that." && Boolean(edited.editedAt));
check("what was remembered from the old words is dropped", about(a, "dentist").length === 0, JSON.stringify(a.memories.map((m) => m.fact)));
await wait(500);
b = await bala.json("/api/state");
const editedAtBala = thread(b, toAsha).find((m) => m.text === "Sorry, wrong chat. Ignore that.");
check("the other person sees the edit", Boolean(editedAtBala?.editedAt) && !thread(b, toAsha).some((m) => /dentist/i.test(m.text)));
check("someone else's message cannot be edited", (await bala.call("/api/messages", "PATCH", { id: editedAtBala.id, text: "hacked" })).status === 403);
check("editing needs sign-in", (await anon(B).call("/api/messages", "PATCH", { id: dentist.id, text: "x" })).status === 401);

// --- delete
res = await asha.call("/api/messages", "DELETE", { id: dentist.id });
a = await res.json();
const gone = thread(a, toBala).find((m) => m.id === dentist.id);
check("deleting my message removes its words but keeps its place", res.status === 200 && gone?.deleted === true && gone.text === "");
b = await bala.json("/api/state");
check("it is deleted for the other person too", thread(b, toAsha).find((m) => m.id === editedAtBala.id)?.deleted === true);
check("a deleted message cannot be edited back", (await asha.call("/api/messages", "PATCH", { id: dentist.id, text: "back" })).status === 404);
b = await (await bala.call("/api/messages", "DELETE", { id: firstAtBala.id })).json();
a = await asha.json("/api/state");
check("deleting someone else's message removes it from my side only", !thread(b, toAsha).some((m) => m.id === firstAtBala.id) && thread(a, toBala).some((m) => m.id === first.id && !m.deleted));
check("a reply whose original is gone still stands", thread(b, toAsha).some((m) => m.id === replyAtBala.id));

// --- remind: a time I pick
const soon = new Date(Date.now() + 4000).toISOString();
let r = await asha.json("/api/remind", "POST", { action: "set", messageId: first.id, when: soon });
const mem = r.memories.find((m) => m.id === r.reminderId);
check("a reminder from a message is saved as important", Boolean(r.reminderSaid) && mem?.important === true && mem.callMe === true && mem.sourceMessageId === first.id, r.reminderError);
check("it is listed under Don't forget, marked important", r.suggestions.some((s) => s.id === `rm-${mem.id}` && s.important));
check("Equal does not ring before the time", r.reminderCall === null);
await wait(5500);
a = await asha.json("/api/state");
check("Equal rings when the time comes", a.reminderCall?.id === mem.id, JSON.stringify(a.reminderCall));
check("the other person is not rung", (await bala.json("/api/state")).reminderCall === null);
res = await asha.call(`/api/remind?id=${mem.id}`);
check("the reminder is spoken", res.status === 200 && res.headers.get("content-type") === "audio/mpeg" && /this is your Equal/.test(decodeURIComponent(res.headers.get("x-line") ?? "")), `${res.status} ${res.headers.get("x-line")}`);
check("another person cannot hear my reminder", (await bala.call(`/api/remind?id=${mem.id}`)).status === 404);
a = await asha.json("/api/remind", "POST", { action: "rang", id: mem.id });
check("once answered it does not ring again", a.reminderCall === null);
check("a time in the past is refused", Boolean((await asha.json("/api/remind", "POST", { action: "set", messageId: first.id, when: new Date(Date.now() - 3600000).toISOString() })).reminderError));

// --- remind: Equal works out the time
const day = new Date(Date.now() + 2 * 86400000);
const dayWords = day.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
r = await asha.json("/api/remind", "POST", { action: "set", text: `My flight to Delhi is on ${dayWords} at 7:15 pm` });
const flight = r.memories.find((m) => m.id === r.reminderId);
const lead = flight ? Math.round((Date.parse(flight.when) - Date.parse(flight.remindAt)) / 60000) : null;
const hourIST = flight ? new Date(Date.parse(flight.when) + 5.5 * 3600000).toISOString().slice(11, 16) : null;
check("Equal finds the time in the words", hourIST === "19:15" && /flight/i.test(flight?.fact ?? ""), `${r.reminderError ?? ""} ${flight?.fact} ${flight?.when}`);
check("for a flight it will ring three hours ahead", lead === 180, `lead ${lead}`);
check("a typed reminder lives in my notes", flight?.contactId === "self");
check("a distant important reminder is still listed", r.suggestions.some((s) => s.id === `rm-${flight?.id}`));
r = await asha.json("/api/remind", "POST", { action: "set", text: "Buy better shoes some day" });
check("with no day or time in the words, it asks me to pick one", Boolean(r.reminderError) && !r.reminderId, r.reminderSaid);
check("reminders need sign-in", (await anon(B).call("/api/remind", "POST", { action: "set", text: "x" })).status === 401);

finish();
