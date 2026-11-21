import { DB, Contact, Message, parseWhen, todayIST, uid } from "./store";

/**
 * The butler reads a conversation and does two jobs:
 *  1. Remember: pull out facts worth keeping about the people involved.
 *  2. Decide whether to speak: offer help only for a concrete practical need
 *     of the user's that it can act on. Venting alone is not a reason to speak.
 * The model interprets; plain code stores state and applies the result.
 */

const SYSTEM = `You are Equal, a discreet personal AI assistant built into the Equal messaging app used in India.
You read one conversation between the USER ("me") and a contact ("them"). Messages may mix English with Hindi or Telugu.

Return ONLY a JSON object with this shape:
{
  "memories": [{"fact": string, "about": "user"|"contact", "kind": "event"|"promise"|"worry"|"preference", "when": string|null}],
  "resolved": [string],
  "intent": null | {
    "need": string,
    "category": "mechanic"|"doctor"|"pharmacy"|"plumber"|"electrician"|"travel"|"other",
    "urgency": 1|2|3|4|5,
    "speak": boolean,
    "reason": string,
    "offer": string
  }
}

MEMORIES: facts from the NEWEST message only that are worth remembering later about the contact or the user:
appointments, exams, interviews, trips, health worries, promises made by either side. "fact" is short and in English. "about" is "user" when the fact concerns the user's own life, and "contact" when it concerns the contact.
"when" is an ISO date (YYYY-MM-DD) if the message places it in time, or YYYY-MM-DDTHH:MM (24-hour, Indian time) if it also gives a time of day. Use TODAY and WEEKDAY to resolve words like Thursday, tomorrow or tonight. Otherwise null.
The user's own plans and promises matter most, because they must not be forgotten: "I have a client meeting at 4", "I'll send you the deck by Friday", "I need to renew the insurance this week". Record each with "about": "user", and use kind "promise" when the user said they would do something for someone.
Do not repeat anything already listed in KNOWN_MEMORIES. Small talk produces no memories.

RESOLVED: ids from KNOWN_MEMORIES that the newest message shows are finished or answered.

INTENT: fill only if the NEWEST message is from "me" and reveals a practical problem.
"speak" must be true ONLY when ALL hold:
 - the problem is one the user personally has to deal with (their own, or an errand they must run for family), and it is happening now or soon;
 - a concrete errand would help (finding, comparing, calling, booking);
 - the user has not said it is already handled, and the contact has not already solved it.
"speak" must be false when the user is only venting or sad, when the problem is someone else's to handle,
when it is hypothetical or in the past, or when interrupting would be tactless (grief, a fight, bad news).
"reason" explains the decision in one short sentence.
"offer" is what you would say to the user, privately, in one warm short sentence starting with a verb phrase like "Want me to".
If there is no practical problem at all, "intent" is null.`;

type Analysis = {
  memories?: { fact: string; about?: string; kind: string; when: string | null }[];
  resolved?: string[];
  intent?: null | {
    need: string;
    category: string;
    urgency: number;
    speak: boolean;
    reason: string;
    offer: string;
  };
};

/** Accepts a display name like "GPT-6.1 Terra" as well as the id "gpt-6.1-terra". */
export function modelId() {
  return (process.env.OPENAI_MODEL ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

export function butlerStatus() {
  if (!process.env.OPENAI_API_KEY) return "offline: OPENAI_API_KEY is not set";
  if (!process.env.OPENAI_MODEL) return "offline: OPENAI_MODEL is not set";
  return "online";
}

/** Known-good model, used if the configured name is rejected, so a typo in the key file cannot take the demo down. */
const FALLBACK_MODEL = "gpt-6.1-terra";
let useFallback = false;

export function activeModel() {
  return useFallback ? FALLBACK_MODEL : modelId();
}

function post(model: string, system: string, payload: unknown) {
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
      response_format: { type: "json_object" },
    }),
  });
}

export async function askJson<T>(system: string, payload: unknown): Promise<T> {
  let res = await post(activeModel(), system, payload);
  if (!useFallback && (res.status === 404 || res.status === 400) && modelId() !== FALLBACK_MODEL) {
    const body = await res.text();
    if (/model/i.test(body)) {
      console.warn(`Model "${modelId()}" was rejected; using ${FALLBACK_MODEL} instead.`);
      useFallback = true;
      res = await post(FALLBACK_MODEL, system, payload);
    } else {
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
    }
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content) as T;
}

const KINDS = ["event", "promise", "worry", "preference"];

/** Analyse the newest message in a thread and apply the result to the db. Returns an error string if it failed. */
export async function analyse(db: DB, contact: Contact, msg: Message, memoriesOnly = false): Promise<string | null> {
  if (butlerStatus() !== "online") return butlerStatus();
  const thread = db.messages.filter((m) => m.contactId === contact.id).slice(-12);
  const known = db.memories
    .filter((m) => m.contactId === contact.id && m.status === "open")
    .map((m) => ({ id: m.id, fact: m.fact, when: m.when }));
  let a: Analysis;
  try {
    a = await askJson<Analysis>(SYSTEM, {
      // Dates are resolved against the day the message was sent, so an imported old chat is read correctly.
      TODAY: todayIST(Date.parse(msg.at)),
      WEEKDAY: new Date(msg.at).toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }),
      CONTACT: { name: contact.name, relation: contact.relation },
      KNOWN_MEMORIES: known,
      CONVERSATION: thread.map((m) => ({ from: m.from, text: m.text })),
      NEWEST: { from: msg.from, text: msg.text },
    });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (memoriesOnly) a.intent = null; // old messages must never trigger an offer
  applyAnalysis(db, contact, msg, a);
  return null;
}

export function applyAnalysis(db: DB, contact: Contact, msg: Message, a: Analysis) {
  const now = new Date().toISOString();
  for (const m of a.memories ?? []) {
    if (!m?.fact) continue;
    const dup = db.memories.some(
      (x) => x.contactId === contact.id && x.fact.toLowerCase() === m.fact.toLowerCase()
    );
    if (dup) continue;
    const parsed = m.when ? parseWhen(m.when) : null;
    const when = parsed?.iso ?? null;
    db.memories.push({
      id: uid(),
      contactId: contact.id,
      fact: m.fact,
      about: m.about === "user" ? "user" : "contact",
      kind: (KINDS.includes(m.kind) ? m.kind : "event") as "event",
      when,
      timed: parsed?.timed || undefined,
      sourceMessageId: msg.id,
      status: "open",
      createdAt: now,
    });
  }
  for (const id of a.resolved ?? []) {
    const m = db.memories.find((x) => x.id === id && x.contactId === contact.id);
    if (m) m.status = "done";
  }
  const i = a.intent;
  if (i && msg.from === "me") {
    const spoke = Boolean(i.speak) && Number(i.urgency) >= 3;
    db.gateLog.push({ messageId: msg.id, spoke, reason: i.reason ?? "", at: now });
    const already = db.suggestions.some(
      (s) => s.type === "intent" && s.status === "new" && s.category === i.category
    );
    if (spoke && !already) {
      db.suggestions.push({
        id: uid(),
        type: "intent",
        contactId: contact.id,
        title: i.offer,
        detail: i.need,
        category: i.category,
        need: i.need,
        status: "new",
        createdAt: now,
      });
    }
  }
}

/** Parse a WhatsApp "Export chat" text file (Android and iOS formats, day-first dates). */
export function parseWhatsApp(text: string, myName: string) {
  const android = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),? (\d{1,2}):(\d{2})(?::\d{2})?\s?([ap]\.?m\.?)? - ([^:]+): (.*)$/i;
  const ios = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),? (\d{1,2}):(\d{2})(?::\d{2})?\s?([ap]\.?m\.?)?\] ([^:]+): (.*)$/i;
  const out: { from: "me" | "them"; sender: string; text: string; at: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[‎ ]/g, " ").trim();
    const m = line.match(android) ?? line.match(ios);
    if (!m) {
      if (out.length && line) out[out.length - 1].text += "\n" + line; // continuation of a multi-line message
      continue;
    }
    const [, d, mo, y, h, mi, ap, sender, body] = m;
    let hour = Number(h);
    if (ap) {
      const pm = ap.toLowerCase().startsWith("p");
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const at = new Date(year, Number(mo) - 1, Number(d), hour, Number(mi));
    if (isNaN(at.getTime()) || /<Media omitted>|omitted$/i.test(body)) continue;
    const mine = sender.trim().toLowerCase() === myName.trim().toLowerCase();
    out.push({ from: mine ? "me" : "them", sender: sender.trim(), text: body, at: at.toISOString() });
  }
  return out;
}
