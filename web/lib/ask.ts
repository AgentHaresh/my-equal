import { DB, parseWhen, recordTouch, save, todayIST, uid } from "./store";
import { notesContact } from "./photo";
import { askJson, butlerStatus, wordsOf } from "./butler";
import { createJob } from "./calls";

/** The most memories shown to the model for one question. */
const MEMORY_LIMIT = 80;

/**
 * "Ask my Equal": answer a question from what is remembered and from the user's own messages.
 * Plain code picks the relevant material; the model only words the answer and must point to
 * the messages it used. If the answer is not in the material, it has to say so.
 */

const SYSTEM = `You are the user's personal assistant. Answer the QUESTION using ONLY the MEMORIES, PEOPLE and MESSAGES provided. They are the user's own chats.
"me" in messages is the user. TODAY is today's date in India.

Return ONLY JSON: {"known": boolean, "answer": string, "source_ids": [number], "remember": null | {"person": string|null, "fact": string, "when": string|null}, "errand": null | {"need": string, "category": "mechanic"|"doctor"|"pharmacy"|"plumber"|"electrician"|"travel"|"other"}, "people": [{"person": string, "relation": string|null, "family": boolean|null, "care": boolean|null, "every_days": number|null, "logged": "call"|"met"|null}]}
- If the material answers the question, "known" is true and "answer" is one or two plain sentences, addressed to the user as "you".
- If it does not, "known" is false and "answer" says briefly that you don't have that yet. Never guess, and never use outside knowledge about the people.
- "source_ids" lists the ids of the MESSAGES (at most 3) that the answer rests on. Use [] if it rests only on MEMORIES.
- Give dates in words (for example "Thursday, 19 November"). Reply in the language of the question.
- If the user asks what you know or remember about a person, list everything in MEMORIES and PEOPLE about that person: who they are to the user, and each fact, briefly. "known" is true if there is anything at all.
- Sometimes the QUESTION is not a question: the user is TELLING you something to keep ("Remember that Abhishek is allergic to peanuts", "Note: Priya's birthday is 5 January", "Abhishek moved to Pune"). Then fill "remember": "person" is the exact name from PEOPLE the fact is about, or null if it is about the user or about nobody in PEOPLE; "fact" is one short plain sentence in English; "when" is YYYY-MM-DD or YYYY-MM-DDTHH:MM if the fact has a date, else null. Set "known" true and make "answer" a short confirmation of what you noted. For a real question, "remember" is null. Never fill "remember" from MESSAGES or MEMORIES, only from what the user typed.
- Sometimes the user asks you to DO a practical errand that needs calling local service providers: find, compare or book a mechanic, a doctor or clinic, a pharmacy, a plumber, an electrician, or travel ("my car broke down, find me a mechanic", "I need a doctor for a check-up this week", "get me a plumber"). A plain statement of such a need, typed to you, counts as asking. Then fill "errand": "need" is one short English sentence of what is needed, with any place and timing the user gave; "category" is the closest one. Set "known" true and make "answer" one short sentence saying you will call a few providers, compare their answers, and book nothing until the user approves. For anything else, "errand" is null.
- Sometimes the user tells you about the PEOPLE in their life, or how often to stay in touch: "Amma and Nanna are my parents", "Priya is my sister, remind me to talk to her every 3 days", "Ravi is one of my people", "Kiran is just a colleague", "remind me to call Nanna every day", "I just called Amma", "met Ravi for lunch". Fill "people" with one entry per person named, using the exact name from PEOPLE; leave out anyone not in PEOPLE. "relation" is who they are to the user in a word or two if said ("mother", "sister"), else null. "family" is true if the user says they are family (parent, sibling, partner, child, grandparent, cousin...), false if the user says they are not, else null. "care" is true if the user says they are one of the people they care about or want to stay close to, false if the user says they are just an acquaintance or colleague, else null. "every_days" is how often the user wants to be in touch, in days (every day 1, every other day 2, twice a week 3, every week 7, every two weeks 14, every month 30), else null. "logged" is "call" if the user says they called or spoke to them on the phone just now or today, "met" if they met in person, else null. Set "known" true and make "answer" a short confirmation of what you will do ("I'll remind you to talk to Priya every 3 days."). Otherwise "people" is [].`;

const STOP = new Set("the a an is are was were did do does what when where who whom how why my me i you your to of for and in on at with about has have had will would should can could tell say said any".split(" "));

export type Answer = { known: boolean; answer: string; sources: { who: string; from: string; text: string; at: string }[]; error?: string; remembered?: { about: string; fact: string }; errand?: { jobId: string; need: string; already?: boolean }; people?: string[] };

const CATEGORIES = ["mechanic", "doctor", "pharmacy", "plumber", "electrician", "travel", "other"];

export async function askEqual(db: DB, question: string): Promise<Answer> {
  if (butlerStatus() !== "online") return { known: false, answer: "", sources: [], error: butlerStatus() };
  const q = question.toLowerCase();
  const words = wordsOf(q).filter((w) => !STOP.has(w));
  const contacts = db.contacts.filter((c) => !c.owner);
  const name = (id: string) => contacts.find((c) => c.id === id)?.name ?? "someone";
  const mentioned = contacts.filter((c) => c.name.toLowerCase().split(/\s+/).some((part) => part.length > 2 && q.includes(part)));

  // Messages: everything recent from the people named in the question, plus the best keyword matches.
  const all = db.messages.filter((m) => m.from !== "butler" && !m.deleted && contacts.some((c) => c.id === m.contactId));
  const picked = new Map<string, (typeof all)[number]>();
  for (const c of mentioned) for (const m of all.filter((x) => x.contactId === c.id).slice(-20)) picked.set(m.id, m);
  const scored = all
    .map((m) => ({ m, score: words.filter((w) => m.text.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.at.localeCompare(a.m.at));
  for (const { m } of scored.slice(0, 25)) picked.set(m.id, m);
  const messages = [...picked.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-45);

  // Memories: chosen by how well they fit the question, not by how new they are. A memory scores
  // for each question word in it, and for belonging to a person the question names. The rest of
  // the room goes to the newest ones, so a general question ("what's coming up?") still works.
  const scoredMemories = db.memories
    .filter((m) => contacts.some((c) => c.id === m.contactId))
    .map((m, i) => {
      const fact = m.fact.toLowerCase();
      const score = words.filter((w) => fact.includes(w)).length * 2 + (mentioned.some((c) => c.id === m.contactId) ? 1 : 0);
      return { m, i, score };
    })
    .sort((a, b) => b.score - a.score || b.i - a.i)
    .slice(0, MEMORY_LIMIT)
    .sort((a, b) => a.i - b.i);

  let r: { people?: { person?: string; relation?: string | null; family?: boolean | null; care?: boolean | null; every_days?: number | null; logged?: string | null }[]; known?: boolean; answer?: string; source_ids?: number[]; remember?: { person?: string | null; fact?: string; when?: string | null } | null; errand?: { need?: string; category?: string } | null };
  try {
    r = await askJson(SYSTEM, {
      TODAY: todayIST(),
      QUESTION: question,
      PEOPLE: contacts.filter((c) => !c.unknown && c.id !== "self").map((c) => ({ name: c.name, relation: c.relation, cares_about: c.close, family: Boolean(c.family), every_days: c.everyDays ?? null, last_spoke: c.lastContactAt.slice(0, 10) })),
      MEMORIES: scoredMemories.map(({ m }) => ({ with: name(m.contactId), about: m.about === "user" ? "the user" : name(m.contactId), fact: m.fact, when: m.when?.slice(0, 16) ?? null, status: m.status })),
      MESSAGES: messages.map((m, i) => ({ id: i, chat_with: name(m.contactId), from: m.from === "me" ? "me" : name(m.contactId), text: m.text.slice(0, 400), date: m.at.slice(0, 10) })),
    }, "answer_question");
  } catch (e) {
    return { known: false, answer: "", sources: [], error: e instanceof Error ? e.message : String(e) };
  }
  const sources = (Array.isArray(r.source_ids) ? r.source_ids : [])
    .map((i) => messages[i])
    .filter(Boolean)
    .slice(0, 3)
    .map((m) => ({ who: name(m.contactId), from: m.from === "me" ? "You" : name(m.contactId), text: m.text, at: m.at }));
  // The user told Equal something to keep: plain code stores it against the right person.
  let remembered: Answer["remembered"];
  const fact = typeof r.remember?.fact === "string" ? r.remember.fact.trim().slice(0, 200) : "";
  if (fact) {
    const who = typeof r.remember?.person === "string" ? r.remember.person.trim().toLowerCase() : "";
    const person = who ? contacts.find((c) => c.name.toLowerCase() === who) : undefined;
    const parsed = r.remember?.when ? parseWhen(r.remember.when) : null;
    const target = person ?? notesContact(db);
    if (!db.memories.some((m) => m.contactId === target.id && m.fact.toLowerCase() === fact.toLowerCase())) {
      db.memories.push({ id: uid(), contactId: target.id, fact, kind: parsed ? "event" : "preference", about: person ? "contact" : "user", when: parsed?.iso ?? null, timed: parsed?.timed || undefined, status: "open", createdAt: new Date().toISOString() });
      save();
    }
    remembered = { about: person?.name ?? "you", fact };
  }
  // The user asked Equal directly to run an errand: that request is the yes, so the call-around
  // starts now. Booking still waits for the user to choose a provider.
  let errand: Answer["errand"];
  const need = typeof r.errand?.need === "string" ? r.errand.need.trim().slice(0, 200) : "";
  if (need) {
    const category = CATEGORIES.includes(String(r.errand?.category)) ? String(r.errand?.category) : "other";
    const busy = db.jobs.find((j) => j.category === category && j.status === "calling");
    if (busy) {
      // One call-around per kind of need at a time. Say so plainly, instead of promising a new one.
      errand = { jobId: busy.id, need: busy.need, already: true };
      r.answer = "I'm already calling around for this. See it under Right now below. Tap Stop on it if you want me to start a fresh search.";
    } else {
      const s = { id: uid(), type: "intent" as const, contactId: notesContact(db).id, title: `Help with: ${need}`, detail: need, category, need, status: "accepted" as const, createdAt: new Date().toISOString() };
      db.suggestions.push(s);
      const job = await createJob(db, s);
      save();
      errand = { jobId: job.id, need };
    }
  }
  // The user said who people are to them, or how often to stay in touch. Plain code applies it,
  // exactly as if they had set it on the person's card.
  const updated: string[] = [];
  for (const p of (Array.isArray(r.people) ? r.people : []).slice(0, 12)) {
    const who = typeof p?.person === "string" ? p.person.trim().toLowerCase() : "";
    const c = who ? contacts.find((x) => !x.unknown && x.id !== "self" && x.name.toLowerCase() === who) : undefined;
    if (!c) continue;
    if (typeof p.relation === "string" && p.relation.trim()) {
      c.relation = p.relation.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
      c.relationSource = "user";
    }
    if (p.care === false) {
      c.close = false;
      c.family = undefined;
      c.everyDays = undefined;
    }
    if (p.care === true) c.close = true;
    if (p.family === true) c.family = c.close = true;
    if (p.family === false) c.family = undefined;
    const n = Number(p.every_days);
    if (Number.isInteger(n) && n >= 1 && n <= 90) {
      c.everyDays = n;
      c.close = true;
    }
    if (p.logged === "call" || p.logged === "met") recordTouch(db, { contactId: c.id, kind: p.logged === "call" ? "logged_call" : "met", dir: "out", at: new Date().toISOString() });
    updated.push(c.name);
  }
  if (updated.length) save();
  return { known: Boolean(r.known) || Boolean(remembered) || Boolean(errand) || updated.length > 0, answer: r.answer ?? "", sources: errand || updated.length ? [] : sources, remembered, errand, people: updated.length ? updated : undefined };
}
