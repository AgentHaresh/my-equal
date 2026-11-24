/**
 * The on-device reader: what Equal asks a small language model running on the phone, for chats
 * that are end-to-end encrypted and so can never be read anywhere else.
 *
 * A small model cannot do the cloud reader's whole job in one answer. Measured on 24 Nov 2026:
 * asked for facts, dates, tone and finished plans at once, a 3-billion-parameter model returned
 * nothing for every message, and a 1.5-billion one returned nonsense. So the job is split into
 * small, focused questions, each with a short prompt and an answer constrained to a tiny schema,
 * and plain code assembles the result:
 *
 *   1. "Is there a plan or a promise in this message?"  yes/no first, then the words of the message
 *      that say it (copied, not written: small models copy far better than they write, and a quote
 *      whose words are not in the message is thrown away), whether it is a promise, and the day
 *      picked from a fixed list ("today", "tomorrow", "Thu 26 Nov"). Code builds the note and the
 *      date; the model never writes free text or does date arithmetic.
 *   2. "How does the writer feel?"  one word from a fixed list, only for the other person's
 *      messages. Code writes the note, so there is nothing for the model to make up.
 *   3. "Does this say that plan is done?"  asked only when code finds a known fact that shares
 *      words with the new message.
 *
 * Prompts are also kept short because the model processes the whole prompt in one GPU pass, which
 * is slow on phone and laptop GPUs. While testing on an integrated laptop GPU (Intel Xe-LPG, Windows)
 * the operating system reset the GPU mid-request several times; the cause is not established (it
 * happened with prompts from about 190 to 670 tokens, after an earlier run of 40 calls had none),
 * so the app recovers from a lost GPU instead of assuming it cannot happen.
 *
 * No server, browser or model imports: the caller supplies `generate`, which runs the model.
 */

export const LOCAL_MOODS = ["neutral", "happy", "excited", "grateful", "tired", "stressed", "sad", "upset", "angry", "worried", "unwell", "lonely", "hurt"] as const;
export type Mood = (typeof LOCAL_MOODS)[number];

/** How much of a chat the model is shown: a few short lines. */
export const LOCAL_MESSAGES = 4;
const MAX_CHARS = 200;

/** Runs the model once: a system prompt, a user prompt, and a JSON schema the answer must match. Returns the raw text. */
export type Generate = (system: string, user: string, schema: object) => Promise<string>;

export type ChatLine = { from: "me" | "them"; text: string; at: string };
export type KnownFact = { id: string; fact: string; when: string | null };
export type LocalAnalysis = {
  memories: { fact: string; about: "user" | "contact"; kind: "promise" | "event"; when: string | null }[];
  resolved: string[];
  tone: { mood: string; note: string } | null;
};

const IST_MS = 5.5 * 3600000;
const DAY_MS = 86400000;
const isoDay = (t: number) => new Date(t + IST_MS).toISOString().slice(0, 10);
const words = (t: string) => t.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length > 2);
const clip = (t: string) => (t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS)}…` : t);

/** The days the model may choose from, as labels, and the date each stands for. */
export function dayChoices(at: number): { label: string; date: string | null }[] {
  const out: { label: string; date: string | null }[] = [
    { label: "none", date: null },
    { label: "today", date: isoDay(at) },
    { label: "tomorrow", date: isoDay(at + DAY_MS) },
  ];
  const name = (t: number) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  out.push({ label: `day after tomorrow, ${name(at + 2 * DAY_MS)}`, date: isoDay(at + 2 * DAY_MS) });
  for (let n = 3; n <= 7; n++) out.push({ label: name(at + n * DAY_MS), date: isoDay(at + n * DAY_MS) });
  return out;
}

export const FACT_SYSTEM = `You read the NEWEST message of a chat. Messages may mix English, Telugu and Hindi.
Does it contain a plan, meeting, appointment, money due, health news, or a promise (someone saying they will do something: call, send, book, come, pay)? Greetings, thanks, jokes, small talk and feelings on their own do not count.
If yes: "quote" copies the words of NEWEST that say it; "promise" is true if someone said they will do something; "day" is when it happens, chosen from the list ("none" if no day is said; "repu" and "kal" about the future mean tomorrow, "tonight" means today); "time" is "HH:MM" in 24-hour time if a time is said, else "".`;

// A yes/no question first: small models answer it far more reliably than picking a mood from a list.
export const TONE_SYSTEM = `Read the NEWEST message (it may mix English, Telugu and Hindi). Does the writer sound low: sad, stressed, worried, upset, lonely, hurt, tired or unwell? Ordinary, short or practical messages are not low.
"low" is true or false. If true, "mood" is the closest word.`;

export const DONE_SYSTEM = `Does the NEWEST message say that the TASK is now done, finished or cancelled?`;

export function factSchema(days: string[]) {
  return {
    type: "object",
    properties: {
      found: { type: "boolean" },
      quote: { type: "string" },
      promise: { type: "boolean" },
      day: { type: "string", enum: days },
      time: { type: "string" },
    },
    required: ["found", "quote", "promise", "day", "time"],
  };
}
const LOW_MOODS = ["sad", "stressed", "worried", "upset", "lonely", "hurt", "tired", "unwell"] as const;
export const TONE_SCHEMA = { type: "object", properties: { low: { type: "boolean" }, mood: { type: "string", enum: [...LOW_MOODS] } }, required: ["low", "mood"] };
export const DONE_SCHEMA = { type: "object", properties: { done: { type: "boolean" } }, required: ["done"] };

function parse(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * The day a message names outright, in English, Telugu or Hindi written in English letters:
 * "day after tomorrow", "ellundi", "parson"; "tomorrow", "tmrw", "repu"; "today", "tonight", "ivala",
 * "aaj"; or a weekday ("on Friday" is the coming Friday, today if it is Friday). "kal" is left to the
 * model, because it means both yesterday and tomorrow. Null if no day is named.
 */
export function dayFromWords(text: string, at: number): string | null {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const plus = (n: number) => isoDay(at + n * DAY_MS);
  if (/ (day after tomorrow|ellundi|parson|parso) /.test(t)) return plus(2);
  if (/ (tomorrow|tmrw|tmr|repu) /.test(t)) return plus(1);
  if (/ (today|tonight|ivala|eeroju|ee roju|aaj) /.test(t)) return plus(0);
  const today = new Date(at + IST_MS).getUTCDay();
  for (let i = 0; i < 7; i++) if (t.includes(` ${WEEKDAYS[i]} `)) return plus((i - today + 7) % 7);
  return null;
}

/** Known facts that share a word with the new message: the only ones worth asking "is this done?" about. */
export function candidatesToClose(newest: string, known: KnownFact[], limit = 2): KnownFact[] {
  const said = new Set(words(newest));
  return known
    .map((f) => ({ f, n: words(f.fact).filter((w) => said.has(w)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((x) => x.f);
}

/**
 * Read one message on the device. `generate` runs the model; everything else is plain code:
 * the dates, who the fact is about, how it is worded, and which facts may be closed.
 */
export async function readLocally(generate: Generate, contact: { name: string }, thread: ChatLine[], newest: ChatLine, known: KnownFact[]): Promise<LocalAnalysis> {
  const at = Date.parse(newest.at);
  const days = dayChoices(at);
  const chat = thread.slice(-LOCAL_MESSAGES).map((m) => `${m.from === "me" ? "me" : contact.name}: ${clip(m.text)}`);
  const said = `${newest.from === "me" ? "me" : contact.name}: ${clip(newest.text)}`;
  const result: LocalAnalysis = { memories: [], resolved: [], tone: null };

  // 1. A plan or a promise.
  const f = parse(await generate(FACT_SYSTEM, JSON.stringify({ DAYS: days.map((d) => d.label), CHAT: chat, NEWEST: said }), factSchema(days.map((d) => d.label))));
  // The message is shown as "Name: words", so a quote can come back with the speaker in front: drop it.
  const escaped = contact.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const speaker = new RegExp(`^(me|${escaped})\\s*:\\s*`, "i");
  const quote = typeof f.quote === "string" ? f.quote.replace(/\s+/g, " ").trim().replace(/^["'“]|["'”]$/g, "").replace(speaker, "").slice(0, 160) : "";
  // The quote must come from the message: most of its words have to be in it. Otherwise it is made up.
  const inMessage = new Set(words(newest.text));
  const quoted = words(quote);
  const real = quoted.length > 0 && quoted.filter((w) => inMessage.has(w)).length / quoted.length >= 0.7;
  const what = real ? quote.charAt(0).toUpperCase() + quote.slice(1) : "";
  if (f.found === true && what.length >= 3) {
    // When the message names the day in so many words, code reads it; the model's pick is used only otherwise.
    const date = dayFromWords(newest.text, at) ?? days.find((d) => d.label === f.day)?.date ?? null;
    const time = typeof f.time === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(f.time.trim()) ? f.time.trim().padStart(5, "0") : null;
    const about = newest.from === "me" ? "user" : "contact";
    // About the other person, the note starts with their name, so it reads right in a list of reminders.
    const fact = about === "contact" && !what.toLowerCase().startsWith(contact.name.toLowerCase()) ? `${contact.name}: ${what}` : what;
    if (!known.some((k) => k.fact.toLowerCase() === fact.toLowerCase())) {
      result.memories.push({ fact, about, kind: f.promise === true ? "promise" : "event", when: date ? (time ? `${date}T${time}` : date) : null });
    }
  }

  // 2. How they feel, for their messages only.
  if (newest.from === "them") {
    const t = parse(await generate(TONE_SYSTEM, JSON.stringify({ NEWEST: said }), TONE_SCHEMA));
    const mood = t.low === true && typeof t.mood === "string" && (LOW_MOODS as readonly string[]).includes(t.mood) ? t.mood : "neutral";
    if (mood !== "neutral") result.tone = { mood, note: `${contact.name} sounds ${mood}.` };
  }

  // 3. Plans this message may finish.
  for (const k of candidatesToClose(newest.text, known)) {
    const d = parse(await generate(DONE_SYSTEM, JSON.stringify({ TASK: k.fact, NEWEST: said }), DONE_SCHEMA));
    if (d.done === true) result.resolved.push(k.id);
  }
  return result;
}
