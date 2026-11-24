/**
 * Asking the cloud model about private chats, with the person's approval each time.
 *
 * Private chats are end-to-end encrypted: the server cannot read them, so "Ask my Equal" (answered by
 * the cloud model, lib/ask.ts) does not know what is in them, nor what Equal learned from them on the
 * phone. When a question needs them, the phone picks the few private lines that fit the question
 * (pickPrivate), shows exactly those lines, and sends only the ones the person approves, for that one
 * answer. The server checks and caps what arrives (cleanShared), passes it to the model with the
 * question, and does not store or log it.
 *
 * The same code runs on the phone and on the server. No server or browser-only imports.
 */

export type SharedMessage = { chat_with: string; from: string; text: string; date: string };
export type SharedNote = { with: string; fact: string; when: string | null };
export type Shared = { messages: SharedMessage[]; notes: SharedNote[] };
/** One line the person sees, and can untick, before anything is sent. */
export type ShareItem = { key: string; kind: "message" | "note"; who: string; line: string; message?: SharedMessage; note?: SharedNote };

export const SHARE_LIMITS = { messages: 20, notes: 12, text: 400, fact: 200, name: 60 };

type Person = { id: string; name: string };
type PlainMessage = { id: string; contactId: string; from: "me" | "them" | "butler"; text: string; at: string; deleted?: boolean };
type Fact = { id: string; contactId: string; fact: string; when: string | null; status: string };

const STOP = new Set("the a an is are was were did do does what when where who whom how why my me i you your to of for and in on at with about has have had will would should can could tell say said any know remember".split(" "));
const wordsOf = (t: string) => t.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w));

/**
 * The private lines that fit a question: recent ones with the people it names, and the best word
 * matches, plus what Equal learned on this phone about them. Only from private chats: everything else
 * the server can already read. Returns [] when nothing private fits, and then nothing is asked.
 */
export function pickPrivate(question: string, people: Person[], privateMessages: PlainMessage[], facts: Fact[]): ShareItem[] {
  const q = question.toLowerCase();
  const words = wordsOf(q);
  const named = people.filter((p) => p.name.toLowerCase().split(/\s+/).some((part) => part.length > 2 && q.includes(part)));
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "someone";
  const isNamed = (id: string) => named.some((p) => p.id === id);
  const hits = (text: string) => words.filter((w) => text.toLowerCase().includes(w)).length;

  const usable = privateMessages.filter((m) => m.from !== "butler" && !m.deleted && m.text.trim() && people.some((p) => p.id === m.contactId));
  const picked = new Map<string, PlainMessage>();
  for (const p of named) for (const m of usable.filter((x) => x.contactId === p.id).slice(-8)) picked.set(m.id, m);
  const scored = usable
    .map((m) => ({ m, s: hits(m.text) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.m.at.localeCompare(a.m.at));
  for (const { m } of scored.slice(0, 8)) picked.set(m.id, m);
  const messages = [...picked.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-SHARE_LIMITS.messages);

  const notes = facts
    .filter((f) => people.some((p) => p.id === f.contactId))
    .map((f) => ({ f, s: hits(f.fact) * 2 + (isNamed(f.contactId) ? 1 : 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, SHARE_LIMITS.notes)
    .map((x) => x.f);

  return [
    ...notes.map((f): ShareItem => {
      const note = { with: name(f.contactId), fact: f.fact.slice(0, SHARE_LIMITS.fact), when: f.when?.slice(0, 16) ?? null };
      return { key: `n:${f.id}`, kind: "note", who: note.with, line: note.fact, note };
    }),
    ...messages.map((m): ShareItem => {
      const message = { chat_with: name(m.contactId), from: m.from === "me" ? "me" : name(m.contactId), text: m.text.slice(0, SHARE_LIMITS.text), date: m.at.slice(0, 10) };
      return { key: `m:${m.id}`, kind: "message", who: message.chat_with, line: `${message.from === "me" ? "You" : message.from}: ${message.text}`, message };
    }),
  ];
}

/** What the person approved, in the shape sent with the question. */
export function toShared(items: ShareItem[]): Shared {
  return { messages: items.flatMap((i) => (i.message ? [i.message] : [])), notes: items.flatMap((i) => (i.note ? [i.note] : [])) };
}

const str = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").slice(0, max) : "");

/** On the server: keep only well-formed, capped entries. Anything else is dropped, not trusted. */
export function cleanShared(x: unknown): Shared | undefined {
  if (!x || typeof x !== "object") return undefined;
  const raw = x as { messages?: unknown; notes?: unknown };
  const messages = (Array.isArray(raw.messages) ? raw.messages : [])
    .slice(0, SHARE_LIMITS.messages)
    .map((m) => ({ chat_with: str(m?.chat_with, SHARE_LIMITS.name), from: str(m?.from, SHARE_LIMITS.name), text: str(m?.text, SHARE_LIMITS.text), date: str(m?.date, 10) }))
    .filter((m) => m.chat_with && m.from && m.text.trim());
  const notes = (Array.isArray(raw.notes) ? raw.notes : [])
    .slice(0, SHARE_LIMITS.notes)
    .map((n) => ({ with: str(n?.with, SHARE_LIMITS.name), fact: str(n?.fact, SHARE_LIMITS.fact), when: str(n?.when, 16) || null }))
    .filter((n) => n.with && n.fact.trim());
  return messages.length || notes.length ? { messages, notes } : undefined;
}
