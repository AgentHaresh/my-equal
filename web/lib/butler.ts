import { DB, Contact, Message, parseWhen, todayIST, uid } from "./store";
import { errorText, log } from "./log";
import { modelCall } from "./metrics";

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
appointments, exams, interviews, trips, health worries, promises made by either side. "fact" is short and in English. The user reads these as their own notes, so a fact about the user is written as a plain note with no subject: "Demo at 2 pm", "Send Ravi the deck", never "User has a demo" or "The user will send". A fact about the contact names them by CONTACT's name. "about" is "user" when the fact concerns the user's own life, and "contact" when it concerns the contact.
"when" is an ISO date (YYYY-MM-DD) if the message places it in time, or YYYY-MM-DDTHH:MM (24-hour, Indian time) if it also gives a time of day. Use TODAY and WEEKDAY to resolve words like Thursday, tomorrow or tonight. Otherwise null.
The user's own plans and promises matter most, because they must not be forgotten: "I have a client meeting at 4", "I'll send you the deck by Friday", "I need to renew the insurance this week". Record each with "about": "user", and use kind "promise" when the user said they would do something for someone.
A problem the user is having right now (a breakdown, an illness, being stuck, something not working) is NOT a plan or a promise. If you record it at all, give it "when": null, so it is never shown as a reminder. Do not repeat a plan that KNOWN_MEMORIES already holds in other words.
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
If the newest message from "me" shares bad news, sadness or frustration with nothing practical to be done about it, still return an "intent" with "speak": false, "urgency": 1 and "category": "other", and a "reason" saying you are staying quiet because the user needs a friend right now, not an errand.
If the message is ordinary conversation with no problem in it at all, "intent" is null.`;

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

/** How long a model call may take before it is given up on. A hung call must not hang the request. */
const MODEL_TIMEOUT_MS = 45_000;

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
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
}

type Usage = { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };

/** Pull the JSON answer out of a model reply, with a clear error when there is none (a refusal, an empty choice, cut-off text). */
function readAnswer<T>(data: { choices?: { message?: { content?: string | null; refusal?: string | null } }[] }): T {
  const message = data.choices?.[0]?.message;
  if (!message?.content) throw new Error(message?.refusal ? "The model declined to answer." : "The model returned no answer.");
  try {
    return JSON.parse(message.content) as T;
  } catch {
    throw new Error("The model's answer was not valid JSON.");
  }
}

/**
 * Ask the model a question and get JSON back. Every call is timed and its token counts recorded
 * under `purpose` (see lib/metrics.ts), and one log line is written. Neither holds any text.
 */
export async function askJson<T>(system: string, payload: unknown, purpose = "other"): Promise<T> {
  const started = Date.now();
  let model = activeModel();
  let usage: Usage | undefined;
  try {
    let res = await post(model, system, payload);
    if (!useFallback && (res.status === 404 || res.status === 400) && modelId() !== FALLBACK_MODEL) {
      const body = await res.text();
      if (/model/i.test(body)) {
        log.warn("model.fallback", { configured: modelId(), using: FALLBACK_MODEL });
        useFallback = true;
        model = FALLBACK_MODEL;
        res = await post(FALLBACK_MODEL, system, payload);
      } else {
        throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
      }
    }
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    usage = data.usage;
    const answer = readAnswer<T>(data);
    const ms = Date.now() - started;
    modelCall({ purpose, ms, ok: true, model, promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens, cachedTokens: usage?.prompt_tokens_details?.cached_tokens });
    log.info("model.call", { purpose, model, ms, prompt_tokens: usage?.prompt_tokens, completion_tokens: usage?.completion_tokens });
    return answer;
  } catch (e) {
    const ms = Date.now() - started;
    modelCall({ purpose, ms, ok: false, model });
    log.error("model.call_failed", { purpose, model, ms, error: errorText(e) });
    throw e instanceof Error && e.name === "TimeoutError" ? new Error("The model took too long to answer.") : e;
  }
}

const KINDS = ["event", "promise", "worry", "preference"];

/** The most facts one message may add. */
const MAX_FACTS_PER_MESSAGE = 4;

/** The most memories shown to the model alongside one new message. */
export const KNOWN_LIMIT = 40;

/**
 * The words of a text, in any script. Marks (\p{M}) are kept, because in Telugu, Hindi and other
 * Indian scripts the vowel signs are marks: splitting on them would cut every word into pieces.
 */
export const wordsOf = (t: string) => t.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((w) => w.length > 2);

/** Analyse the newest message in a thread and apply the result to the db. Returns an error string if it failed. */
export async function analyse(db: DB, contact: Contact, msg: Message, memoriesOnly = false): Promise<string | null> {
  if (butlerStatus() !== "online") return butlerStatus();
  const thread = db.messages.filter((m) => m.contactId === contact.id && !m.deleted).slice(-12);
  // What is already known is ranked and capped, so a long friendship does not make every later
  // reading slower and worse. First: anything sharing a word with the new message (so it is not saved
  // twice, and can be marked done). Then: dated things nearest to now. Then: the newest undated ones.
  const at = Date.parse(msg.at);
  const said = new Set(wordsOf(msg.text));
  const day = 86400000;
  const rank = (m: DB["memories"][number]) => {
    if (wordsOf(m.fact).some((w) => said.has(w))) return -1;
    return m.when ? Math.abs(Date.parse(m.when) - at) / day : 30 + Math.max(0, at - Date.parse(m.createdAt)) / day;
  };
  const known = db.memories
    .filter((m) => m.status === "open" && (m.contactId === contact.id || (m.about === "user" && m.when)))
    .map((m) => ({ m, r: rank(m) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, KNOWN_LIMIT)
    .map(({ m }) => ({ id: m.id, fact: m.fact, when: m.when }));
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
    }, "read_message");
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (memoriesOnly) a.intent = null; // old messages must never trigger an offer
  applyAnalysis(db, contact, msg, a);
  return null;
}

export function applyAnalysis(db: DB, contact: Contact, msg: Message, a: Analysis) {
  const now = new Date().toISOString();
  // One message can add only a few facts, however many the model (or a crafted message) proposes.
  for (const m of (a.memories ?? []).slice(0, MAX_FACTS_PER_MESSAGE)) {
    if (!m?.fact) continue;
    const dup = db.memories.some(
      (x) => x.contactId === contact.id && x.fact.toLowerCase() === m.fact.toLowerCase()
    );
    if (dup) continue;
    const parsed = m.when ? parseWhen(m.when) : null;
    const when = parsed?.iso ?? null;
    // The same plan said twice in different words (for the same day) is kept once. Names and
    // everyday verbs are ignored, so "send Ravi the deck" is not confused with "send Ravi the shortlist".
    const ignore = new Set(["send", "call", "with", "from", "that", "this", "have", "will", "about", "today", "tomorrow", "need", "needs", "promised", ...db.contacts.flatMap((c) => c.name.toLowerCase().split(/\s+/))]);
    const words = (t: string) => new Set(wordsOf(t).filter((w) => w.length > 3 && !ignore.has(w)));
    const mine = words(m.fact);
    const same = when
      ? db.memories.some((x) => {
          if (x.status !== "open" || !x.when || todayIST(Date.parse(x.when)) !== todayIST(Date.parse(when))) return false;
          const theirs = words(x.fact);
          const shared = [...theirs].filter((w) => mine.has(w)).length;
          return shared >= 2 && shared / Math.min(theirs.size, mine.size) >= 0.6;
        })
      : false;
    if (same) continue;
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
    // The model's own judgement decides; urgency only screens out plain venting (1). A planned
    // errand ("I need a check-up this week", urgency 2) is still worth an offer.
    const spoke = Boolean(i.speak) && Number(i.urgency) >= 2;
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

/** Ask the model about a picture. Same model and JSON reply as askJson, with an image attached. */
export async function askVision<T>(system: string, text: string, imageDataUrl: string): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: activeModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: imageDataUrl } }] },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content) as T;
}
