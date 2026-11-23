// Test of accounts and real person-to-person chats. Usage: node tests/multiuser-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const link = anon(B);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Nothing works without signing in.
check("state needs sign-in", (await link.call("/api/state")).status === 401);
check("sending needs sign-in", (await link.call("/api/messages", "POST", { contactId: "ravi", text: "hi" })).status === 401);
check("import needs sign-in", (await link.call("/api/import", "POST", { text: "x", myName: "y" })).status === 401);
check("a made-up sign-in is refused", (await link.call("/api/auth", "POST", { secret: "wrong", email: "x@example.com" })).status === 400);
check("a forged session cookie is refused", (await fetch(B + "/api/state", { headers: { cookie: "equal_session=someone.deadbeef" } })).status === 401);

const stamp = Date.now().toString(36);
const asha = await signIn(B, `asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `bala-${stamp}@example.com`, "Bala");

let a = await asha.json("/api/state");
check("a new account starts with the sample chats", a.contacts.some((c) => c.id === "ravi" && c.sample));
// There is no directory. Nobody can see who else is on Equal.
check("the state lists no other people", a.people === undefined && !JSON.stringify(a).includes(bala.user.id) && !JSON.stringify(a).includes("Bala"));
// A chat starts only from something I already know: their username.
// Email and phone lookup are switched off.
const setProfile = (who, fields) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return fetch(B + "/api/profile", { method: "POST", headers: { cookie: who.cookie }, body: form });
};
const balaName = `bala_${stamp}`.slice(0, 20);
check("a username can be set", (await setProfile(bala, { name: "Bala", username: balaName })).status === 200);
check("a taken username is refused", (await setProfile(asha, { name: "Asha", username: balaName })).status === 400);
check("a badly formed username is refused", (await setProfile(asha, { name: "Asha", username: "1-bad name" })).status === 400);
check("a reserved username is refused", (await setProfile(asha, { name: "Asha", username: "admin" })).status === 400);
let found = await asha.call("/api/chats", "POST", { username: `@${balaName.toUpperCase()}` });
check("a chat can be started with a username I know", found.status === 200 && (await found.json()).contacts.some((c) => c.userId === bala.user.id));
check("a username that is not on Equal says so", (await asha.call("/api/chats", "POST", { username: `nobody_${stamp}` })).status === 404);
check("something that is not a username is refused", (await asha.call("/api/chats", "POST", { username: "no" })).status === 400);
check("email lookup is no longer offered", (await asha.call("/api/chats", "POST", { email: `bala-${stamp}@example.com` })).status === 400);

// Asha starts a chat with Bala and asks for help.
a = await asha.json("/api/chats", "POST", { userId: bala.user.id });
const toBala = a.contactId;
check("starting a chat creates the contact", Boolean(toBala) && a.contacts.some((c) => c.id === toBala && c.userId === bala.user.id));
a = await asha.json("/api/messages", "POST", { contactId: toBala, text: "Bala, my car broke down near Gachibowli and I need it fixed today" });
const offer = a.suggestions.find((s) => s.type === "intent" && s.status === "new");
check("Asha's Equal offers her help", Boolean(offer), offer?.title ?? a.error ?? "");

let b = await bala.json("/api/state");
const fromAsha = b.contacts.find((c) => c.userId === asha.user.id);
check("the chat appears on Bala's side", Boolean(fromAsha));
const got = b.messages.filter((m) => m.contactId === fromAsha?.id);
check("Bala receives the message", got.length === 1 && got[0].from === "them" && /car broke down/.test(got[0].text));
check("Bala sees none of Asha's offers or jobs", !b.suggestions.some((s) => s.type === "intent") && b.jobs.length === 0);

// Bala replies with something worth remembering; Asha's Equal should note it for her.
await bala.json("/api/messages", "POST", { contactId: fromAsha.id, text: "Oh no! I can't come, my daughter's school annual day is on Friday and I'm stuck with rehearsals" });
let memory;
for (let i = 0; i < 10 && !memory; i++) {
  await wait(1500);
  a = await asha.json("/api/state");
  memory = a.memories.find((m) => m.contactId === toBala);
}
check("Asha receives Bala's reply", a.messages.filter((m) => m.contactId === toBala).length === 2);
check("Asha's Equal remembers what Bala said", Boolean(memory), memory?.fact ?? "no memory");
b = await bala.json("/api/state");
check("Asha's memories are not visible to Bala", !b.memories.some((m) => /car/i.test(m.fact) && m.about === "user" && m.contactId !== fromAsha.id));

// Spaces are separate.
check("Bala cannot post into a chat that is not his", (await bala.call("/api/messages", "POST", { contactId: toBala, text: "x" })).status === 400);
check("a stranger's link cannot write to a real chat", (await link.call("/api/messages", "POST", { contactId: toBala, from: "them", text: "x", u: asha.user.id })).status === 404);
check("a stranger's link cannot read a real chat", (await link.json(`/api/state?friend=${toBala}&u=${asha.user.id}`)).messages.length === 0);

// WhatsApp import goes into the signed-in person's own space.
const exportText = ["12/11/2026, 9:41 pm - Sita: Exam on Monday ra, pray for me", "12/11/2026, 9:43 pm - Asha: All the best!", "[13/11/26, 10:05:22 AM] Sita: Thanks", "and call home also"].join("\n");
const imp = await asha.json("/api/import", "POST", { text: exportText, myName: "Asha" });
check("WhatsApp import works for a signed-in person", imp.imported === 3 && imp.contacts.some((c) => c.name === "Sita"), imp.error ?? "");
check("import with the wrong name explains the problem", (await asha.call("/api/import", "POST", { text: exportText, myName: "Nobody" })).status === 400);
b = await bala.json("/api/state");
check("the import is not visible to anyone else", !b.contacts.some((c) => c.name === "Sita"));

// Resetting samples keeps real chats and imports.
a = await asha.json("/api/state", "DELETE");
check("resetting samples keeps real chats and imports", a.contacts.some((c) => c.id === toBala) && a.contacts.some((c) => c.name === "Sita") && a.messages.some((m) => m.contactId === toBala));

// Signing out ends the session.
const out = await asha.call("/api/auth", "DELETE");
check("signing out clears the cookie", /Max-Age=0/.test(out.headers.get("set-cookie") ?? ""));
finish();
