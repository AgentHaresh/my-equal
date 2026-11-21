// Test of telling Equal things about a person, and asking what it knows about them.
// Usage: node tests/people-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const stamp = Date.now().toString(36);
const asha = await signIn(B, `people-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `people-bala-${stamp}@example.com`, "Abhishek");
await asha.json("/api/demo", "POST", { on: false });
const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const about = (s, id) => s.memories.filter((m) => m.contactId === id).map((m) => m.fact);

// --- told directly, on the person's card
let a = await asha.json("/api/memories", "POST", { action: "add", contactId: toBala, fact: "Is allergic to peanuts" });
check("a fact typed about a person is kept", about(a, toBala).includes("Is allergic to peanuts"));
a = await asha.json("/api/memories", "POST", { action: "add", contactId: toBala, fact: "is allergic to peanuts" });
check("the same fact is not kept twice", about(a, toBala).length === 1);
check("an empty fact is refused", (await asha.call("/api/memories", "POST", { action: "add", contactId: toBala, fact: "  " })).status === 400);
check("a fact cannot be added to someone else's contact", (await bala.call("/api/memories", "POST", { action: "add", contactId: toBala, fact: "x" })).status === 400);
check("adding a fact needs sign-in", (await anon(B).call("/api/memories", "POST", { action: "add", contactId: toBala, fact: "x" })).status === 401);
const b = await bala.json("/api/state");
check("what I note about someone is private to me", !JSON.stringify(b.memories).includes("peanuts"));

// --- who they are to me is remembered
a = await asha.json("/api/contacts", "POST", { contactId: toBala, relation: "close friend", close: true });
const c = a.contacts.find((x) => x.id === toBala);
check("who a person is to me is remembered", c.relation === "close friend" && c.close === true && c.relationSource === "user");

// --- told through the ask box
let r = await asha.json("/api/ask", "POST", { question: "Remember that Abhishek's birthday is on 5 January 2027" });
check("telling Equal something in the ask box saves it", r.remembered?.about === "Abhishek" && /birthday/i.test(r.remembered?.fact ?? ""), JSON.stringify(r).slice(0, 200));
a = await asha.json("/api/state");
const birthday = a.memories.find((m) => m.contactId === toBala && /birthday/i.test(m.fact));
check("it is stored against that person, with its date", Boolean(birthday) && (birthday.when ?? "").startsWith("2027-01-0"), JSON.stringify(birthday));
r = await asha.json("/api/ask", "POST", { question: "Note that I renewed my passport last month" });
a = await asha.json("/api/state");
check("something about me goes to my own notes", r.remembered?.about === "you" && a.memories.some((m) => m.contactId === "self" && /passport/i.test(m.fact)), JSON.stringify(r).slice(0, 200));

// --- asked back
const before = a.memories.length;
r = await asha.json("/api/ask", "POST", { question: "What do you know about Abhishek?" });
check("asking what Equal knows about a person lists it", r.known === true && /peanut/i.test(r.answer) && /birthday|5 January/i.test(r.answer) && /close friend/i.test(r.answer), r.answer);
check("a question does not save anything new", !r.remembered && (await asha.json("/api/state")).memories.length === before);
r = await asha.json("/api/ask", "POST", { question: "What is Abhishek's blood group?" });
check("it does not make up what it was never told", r.known === false, r.answer);

finish();
