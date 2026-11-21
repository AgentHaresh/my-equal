import { DB, parseWhen, save, todayIST, uid } from "./store";
import { notesContact } from "./photo";
import { askJson, butlerStatus, wordsOf } from "./butler";

/** The most memories shown to the model for one question. */
const MEMORY_LIMIT = 80;

/**
 * "Ask my Equal": answer a question from what is remembered and from the user's own messages.
 * Plain code picks the relevant material; the model only words the answer and must point to
 * the messages it used. If the answer is not in the material, it has to say so.
 */

const SYSTEM = `You are the user's personal assistant. Answer the QUESTION using ONLY the MEMORIES, PEOPLE and MESSAGES provided. They are the user's own chats.
"me" in messages is the user. TODAY is today's date in India.

Return ONLY JSON: {"known": boolean, "answer": string, "source_ids": [number], "remember": null | {"person": string|null, "fact": string, "when": string|null}}
- If the material answers the question, "known" is true and "answer" is one or two plain sentences, addressed to the user as "you".
- If it does not, "known" is false and "answer" says briefly that you don't have that yet. Never guess, and never use outside knowledge about the people.
- "source_ids" lists the ids of the MESSAGES (at most 3) that the answer rests on. Use [] if it rests only on MEMORIES.
- Give dates in words (for example "Thursday, 19 November"). Reply in the language of the question.
- If the user asks what you know or remember about a person, list everything in MEMORIES and PEOPLE about that person: who they are to the user, and each fact, briefly. "known" is true if there is anything at all.
- Sometimes the QUESTION is not a question: the user is TELLING you something to keep ("Remember that Abhishek is allergic to peanuts", "Note: Priya's birthday is 5 January", "Abhishek moved to Pune"). Then fill "remember": "person" is the exact name from PEOPLE the fact is about, or null if it is about the user or about nobody in PEOPLE; "fact" is one short plain sentence in English; "when" is YYYY-MM-DD or YYYY-MM-DDTHH:MM if the fact has a date, else null. Set "known" true and make "answer" a short confirmation of what you noted. For a real question, "remember" is null. Never fill "remember" from MESSAGES or MEMORIES, only from what the user typed.`;

const STOP = new Set("the a an is are was were did do does what when where who whom how why my me i you your to of for and in on at with about has have had will would should can could tell say said any".split(" "));

export type Answer = { known: boolean; answer: string; sources: { who: string; from: string; text: string; at: string }[]; error?: string; remembered?: { about: string; fact: string } };

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

  let r: { known?: boolean; answer?: string; source_ids?: number[]; remember?: { person?: string | null; fact?: string; when?: string | null } | null };
  try {
    r = await askJson(SYSTEM, {
      TODAY: todayIST(),
      QUESTION: question,
      PEOPLE: contacts.map((c) => ({ name: c.name, relation: c.relation, keep_close: c.close, last_spoke: c.lastContactAt.slice(0, 10) })),
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
  return { known: Boolean(r.known) || Boolean(remembered), answer: r.answer ?? "", sources, remembered };
}
