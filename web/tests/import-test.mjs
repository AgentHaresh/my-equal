// Test of bringing in a WhatsApp chat export, in the shapes different phones produce.
// Usage: node tests/import-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const stamp = Date.now().toString(36);
const me = await signIn(B, `import-${stamp}@example.com`, "Haresh Gundela");
await me.json("/api/demo", "POST", { on: false });
const bring = (body) => me.call("/api/import", "POST", body);
const chat = (s, id) => s.messages.filter((m) => m.contactId === id && m.from !== "butler");
const NB = " "; // the narrow space newer phones put before AM/PM
const LRM = "‎";

// --- Android, 12-hour, with the narrow space, a notice line, media, and a two-line message
const android = [
  `21/11/26, 5:40${NB}pm - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.`,
  `21/11/26, 5:41${NB}pm - Sai Abhijit: Anna, ekkada unnav?`,
  `21/11/26, 5:42${NB}pm - Haresh: Office lo unna.`,
  `Inko gantalo vastha.`,
  `21/11/26, 5:43${NB}pm - Sai Abhijit: <Media omitted>`,
  `21/11/26, 5:44${NB}pm - Sai Abhijit: Dinner ki Paradise ki veldam, 8:30 ki`,
  `21/11/26, 5:45${NB}pm - Haresh: Ok done`,
].join("\n");
let res = await bring({ text: android });
let r = await res.json();
check("an Android export comes in without typing a name", res.status === 200 && r.imported === 4 && r.title === "Sai Abhijit" && r.importedAs === "Haresh", JSON.stringify({ s: res.status, i: r.imported, t: r.title, me: r.importedAs, e: r.error, c: r.choose }));
const sai = r.contactId;
let msgs = chat(r, sai);
check("WhatsApp's own notice and media placeholders are left out", !msgs.some((m) => /encrypted|omitted/i.test(m.text)));
check("a message that runs over two lines stays one message", msgs.some((m) => m.text === "Office lo unna.\nInko gantalo vastha." && m.from === "me"));
check("who said what is right", msgs[0].from === "them" && msgs.at(-1).from === "me" && msgs.at(-1).text === "Ok done");
check("times are read as Indian time", msgs[0].at === "2026-11-21T12:11:00.000Z", msgs[0].at);
check("the chat is listed with its last message", r.contacts.some((c) => c.id === sai && c.name === "Sai Abhijit"));

// --- the same file again adds nothing
res = await bring({ text: android });
r = await res.json();
check("bringing in the same file twice does not double the chat", r.imported === 0 && r.already === true && chat(r, sai).length === 4);

// --- iPhone: brackets, seconds, direction marks, and a name that is not mine by the account
const iphone = [
  `[20/11/26, 9:05:10 AM] Priya: ${LRM}Annayya, visa interview December 3 ki confirm ayyindi`,
  `[20/11/26, 9:06:42 AM] HG: Super! All the best`,
  `[20/11/26, 9:07:01 AM] Priya: ${LRM}image omitted`,
  `[20/11/26, 9:07:30 AM] Priya: Thanks annayya`,
].join("\r\n");
res = await bring({ text: iphone });
r = await res.json();
check("when it is not clear who I am, it asks instead of guessing", res.status === 200 && Array.isArray(r.choose) && r.choose.includes("HG") && r.choose.includes("Priya") && r.count === 3 && !r.imported, JSON.stringify(r).slice(0, 160));
res = await bring({ text: iphone, me: "HG" });
r = await res.json();
check("an iPhone export comes in once I say which one is me", res.status === 200 && r.imported === 3 && r.title === "Priya", JSON.stringify({ i: r.imported, t: r.title, e: r.error }));
const priya = r.contactId;
check("the morning time is right", chat(r, priya)[0].at === "2026-11-20T03:35:00.000Z", chat(r, priya)[0].at);

// --- 24-hour, four-digit year, dots; and month-first dates
res = await bring({ text: ["21.11.2026, 17:48 - Kiran: Review at 11 tomorrow", "21.11.2026, 17:49 - Haresh Gundela: Noted"].join("\n") });
r = await res.json();
check("a 24-hour export with dots in the date comes in", r.imported === 2 && chat(r, r.contactId)[0].at === "2026-11-21T12:18:00.000Z", JSON.stringify({ i: r.imported, e: r.error }));
res = await bring({ text: ["11/21/26, 5:48 PM - Ravi: Trip plan ready", "11/21/26, 5:49 PM - Haresh: Send it"].join("\n") });
r = await res.json();
check("month-first dates are recognised", r.imported === 2 && chat(r, r.contactId)[0].at === "2026-11-21T12:18:00.000Z", JSON.stringify({ i: r.imported, e: r.error, at: r.contactId && chat(r, r.contactId)[0]?.at }));

// --- a group
res = await bring({ text: ["21/11/26, 6:00 pm - Asha: Party at 9", "21/11/26, 6:01 pm - Bala: I'm in", "21/11/26, 6:02 pm - Haresh: Me too"].join("\n") });
r = await res.json();
check("a group export comes in as one chat, with each line saying who spoke", r.imported === 3 && /^Group: /.test(r.title) && chat(r, r.contactId).some((m) => m.text === "Bala: I'm in"), JSON.stringify({ t: r.title, e: r.error }));

// --- things that are not exports
res = await bring({ text: "just some notes\nwith no dates at all" });
check("a file that is not an export is refused with a reason", res.status === 400 && /No messages were recognised/.test((await res.json()).error));
res = await bring({ text: android, me: "Nobody Here" });
r = await res.json();
check("a wrong name is refused, and says who is in the chat", res.status === 400 && /Sai Abhijit/.test(r.error));
check("an empty request is refused", (await bring({})).status === 400);
check("bringing in a chat needs sign-in", (await anon(B).call("/api/import", "POST", { text: android })).status === 401);

// --- Equal reads what was brought in
const s = await me.json("/api/state");
check("Equal remembers something from the imported chats", s.memories.some((m) => /visa|dinner|paradise|review/i.test(m.fact)), s.memories.map((m) => m.fact).join(" | "));

finish();
