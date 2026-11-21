import { DB, todayIST } from "./store";
import { askJson, butlerStatus } from "./butler";

/**
 * "Ask my Equal": answer a question from what is remembered and from the user's own messages.
 * Plain code picks the relevant material; the model only words the answer and must point to
 * the messages it used. If the answer is not in the material, it has to say so.
 */

const SYSTEM = `You are the user's personal assistant. Answer the QUESTION using ONLY the MEMORIES, PEOPLE and MESSAGES provided. They are the user's own chats.
"me" in messages is the user. TODAY is today's date in India.

Return ONLY JSON: {"known": boolean, "answer": string, "source_ids": [number]}
- If the material answers the question, "known" is true and "answer" is one or two plain sentences, addressed to the user as "you".
- If it does not, "known" is false and "answer" says briefly that you don't have that yet. Never guess, and never use outside knowledge about the people.
- "source_ids" lists the ids of the MESSAGES (at most 3) that the answer rests on. Use [] if it rests only on MEMORIES.
- Give dates in words (for example "Thursday, 19 November"). Reply in the language of the question.`;

const STOP = new Set("the a an is are was were did do does what when where who whom how why my me i you your to of for and in on at with about has have had will would should can could tell say said any".split(" "));

export type Answer = { known: boolean; answer: string; sources: { who: string; from: string; text: string; at: string }[]; error?: string };

export async function askEqual(db: DB, question: string): Promise<Answer> {
  if (butlerStatus() !== "online") return { known: false, answer: "", sources: [], error: butlerStatus() };
  const q = question.toLowerCase();
  const words = q.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w));
  const contacts = db.contacts.filter((c) => !c.owner);
  const name = (id: string) => contacts.find((c) => c.id === id)?.name ?? "someone";
  const mentioned = contacts.filter((c) => c.name.toLowerCase().split(/\s+/).some((part) => part.length > 2 && q.includes(part)));

  // Messages: everything recent from the people named in the question, plus the best keyword matches.
  const all = db.messages.filter((m) => m.from !== "butler" && contacts.some((c) => c.id === m.contactId));
  const picked = new Map<string, (typeof all)[number]>();
  for (const c of mentioned) for (const m of all.filter((x) => x.contactId === c.id).slice(-20)) picked.set(m.id, m);
  const scored = all
    .map((m) => ({ m, score: words.filter((w) => m.text.toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.at.localeCompare(a.m.at));
  for (const { m } of scored.slice(0, 25)) picked.set(m.id, m);
  const messages = [...picked.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-45);

  let r: { known?: boolean; answer?: string; source_ids?: number[] };
  try {
    r = await askJson(SYSTEM, {
      TODAY: todayIST(),
      QUESTION: question,
      PEOPLE: contacts.map((c) => ({ name: c.name, relation: c.relation, last_spoke: c.lastContactAt.slice(0, 10) })),
      MEMORIES: db.memories
        .filter((m) => contacts.some((c) => c.id === m.contactId))
        .slice(-150)
        .map((m) => ({ with: name(m.contactId), about: m.about === "user" ? "the user" : name(m.contactId), fact: m.fact, when: m.when?.slice(0, 16) ?? null, status: m.status })),
      MESSAGES: messages.map((m, i) => ({ id: i, chat_with: name(m.contactId), from: m.from === "me" ? "me" : name(m.contactId), text: m.text.slice(0, 400), date: m.at.slice(0, 10) })),
    });
  } catch (e) {
    return { known: false, answer: "", sources: [], error: e instanceof Error ? e.message : String(e) };
  }
  const sources = (Array.isArray(r.source_ids) ? r.source_ids : [])
    .map((i) => messages[i])
    .filter(Boolean)
    .slice(0, 3)
    .map((m) => ({ who: name(m.contactId), from: m.from === "me" ? "You" : name(m.contactId), text: m.text, at: m.at }));
  return { known: Boolean(r.known), answer: r.answer ?? "", sources };
}
