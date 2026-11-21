// Test of commitments, "Ask my Equal" and learned relationships. Usage: node tests/memory-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const me = await signIn(B, `test-memory-${Date.now().toString(36)}@example.com`, "Mem Tester");
const link = anon(B);

// --- My own commitments become reminders.
let s = await me.json("/api/messages", "POST", { contactId: "ravi", text: "I'll send you the project deck by tomorrow evening, promise" });
if (s.error) console.log("      error:", s.error);
let deck = s.suggestions.find((x) => x.type === "reminder" && /deck/i.test(x.title));
check("a promise I made becomes a reminder", Boolean(deck), deck ? `${deck.title} — ${deck.detail}` : JSON.stringify(s.memories.slice(-2)));
check("the reminder is due tomorrow", /^Tomorrow/.test(deck?.detail ?? ""), deck?.detail ?? "");

s = await me.json("/api/messages", "POST", { contactId: "ravi", text: "Also I have a dentist appointment today at 6 pm so I'll be offline for a bit" });
const dentist = s.suggestions.find((x) => x.type === "reminder" && /dentist/i.test(x.title));
check("a plan of mine today becomes a reminder with its time", /^Today, 6/.test(dentist?.detail ?? ""), dentist ? `${dentist.title} — ${dentist.detail}` : "no reminder");
check("reminders are listed before other suggestions", s.suggestions.filter((x) => x.status === "new")[0]?.type === "reminder");

s = await me.json("/api/suggestions", "POST", { id: deck.id, action: "accept" });
check("marking a reminder done removes it", !s.suggestions.some((x) => x.id === deck.id) && s.memories.some((m) => /deck/i.test(m.fact) && m.status === "done"));

// --- Ask my Equal.
check("asking needs sign-in", (await link.call("/api/ask", "POST", { question: "hi" })).status === 401);
let a = await me.json("/api/ask", "POST", { question: "What did I promise Ravi?" });
check("it answers from my own messages", a.known === true && /deck/i.test(a.answer), a.answer || a.error);
check("it shows the message it relied on", a.sources?.length >= 1 && /deck/i.test(a.sources[0].text), a.sources?.[0]?.text ?? "no source");
a = await me.json("/api/ask", "POST", { question: "When was Anna's eye check-up?" });
check("it answers from what it remembers", a.known === true && /thursday|19/i.test(a.answer), a.answer || a.error);
a = await me.json("/api/ask", "POST", { question: "What is Kiran's dog's name?" });
check("it says so when it does not know", a.known === false, a.answer || a.error);

// --- Relationships learned from an imported chat.
const pad = (n) => String(n).padStart(2, "0");
const stamp = (daysAgo, hour) => {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${hour}:15 pm`;
};
const lines = [];
const theirs = ["Nanna tinnava? Time ki tinu", "BP tablets vesukunnanu, nuvvu jagratta", "Pandaga ki intiki raa nanna", "Akka phone chesindi, nuvvu kuda cheyyi", "Chali ekkuva undi, sweater vesuko"];
const mine = ["Tinna Amma, nuvvu tinnava?", "Sare Amma, tablets marchipoku", "Vastanu Amma, tickets book chesta", "Chesta Amma", "Sare Amma, love you"];
let i = 0;
for (let day = 48; day >= 20; day -= 2, i++) {
  lines.push(`${stamp(day, 7)} - Lakshmi: ${theirs[i % theirs.length]}`);
  lines.push(`${stamp(day, 8)} - Mem Tester: ${mine[i % mine.length]}`);
}
const imp = await me.json("/api/import", "POST", { text: lines.join("\n"), myName: "Mem Tester" });
const amma = imp.contacts?.find((c) => c.name === "Lakshmi");
check("the imported chat arrives", imp.imported === lines.length && Boolean(amma), imp.error ?? "");
check("it works out she is my mother", amma?.relation === "mother" && amma?.relationSource === "inferred", `${amma?.relation} — ${amma?.relationWhy}`);
check("family is marked as someone to stay close to", amma?.close === true);
const drift = imp.suggestions?.find((x) => x.type === "keep_close" && x.contactId === amma?.id);
check("it notices we have gone quiet", Boolean(drift), drift?.title ?? "no nudge");
check("and compares that with how often we usually talk", /usually talk every 2 days/.test(drift?.detail ?? ""), drift?.detail ?? "");

// --- The user's own word about a relationship is final.
s = await me.json("/api/contacts", "POST", { contactId: amma.id, relation: "family" });
check("I can correct a relationship", s.contacts.find((c) => c.id === amma.id)?.relation === "family" && s.contacts.find((c) => c.id === amma.id)?.relationSource === "user");
s = await me.json("/api/contacts", "POST", { contactId: amma.id, close: false });
check("turning off 'keep close' stops the nudge", !s.suggestions.some((x) => x.type === "keep_close" && x.contactId === amma.id));
check("correcting needs sign-in", (await link.call("/api/contacts", "POST", { contactId: amma.id, relation: "friend" })).status === 401);

finish();
