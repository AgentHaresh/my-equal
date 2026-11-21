import { DB, Job, Call, Quote, Suggestion, root, uid } from "./store";
import { askJson, butlerStatus } from "./butler";

/**
 * Call-around: the butler contacts several providers for the user, asks the same
 * questions, and brings back a comparison. The user approves before anything is booked.
 * The model talks and extracts; plain code opens the call, compares quotes and books.
 */

const FALLBACK_QUESTIONS = ["Can you help with this today?", "How much will it cost?", "How soon can you come or take it in?"];

const PLAN_SYSTEM = `You prepare a short phone enquiry for an AI assistant in India calling service providers on behalf of a customer.
Given the customer's NEED and CATEGORY, return ONLY JSON:
{"brief": string, "questions": [string, string, string]}
"brief" is one sentence describing the customer's situation to the provider, with no personal details beyond what the need states.
"questions" are exactly three short questions covering: whether they can help now, the cost, and how soon.`;

const CALL_SYSTEM = `You are Equal, an AI assistant on a call with a service provider in India, calling on behalf of a customer.
You have ALREADY introduced yourself as an AI assistant. Never claim to be human. If asked, say you are an AI calling for a customer.

Your goal is to get answers to QUESTIONS. Rules:
- One short question at a time. Be polite and brief, like a good receptionist.
- Reply in the provider's language and style: English, Hindi, Telugu or a mix. Match them.
- Never agree to book and never promise payment. Say the customer will confirm.
- Do not invent details about the customer. If asked something that is not in BRIEF, say you will check with the customer.
- If the provider cannot help, thank them and end.
- Ask each of the QUESTIONS at most once, and ask nothing beyond them. An answer already given, even in passing, counts.
- As soon as each question has an answer or a refusal, thank them, say the customer will confirm shortly, and end with "done": true. Do not keep the provider on the line.

Return ONLY JSON:
{"say": string, "done": boolean,
 "quote": {"shop": string|null, "available": boolean|null, "price_inr": number|null, "price_note": string|null, "eta_minutes": number|null, "notes": string}}
"say" is your next line. "done" is true when the call should end after this line.
"quote" holds everything learned SO FAR in the whole call: "shop" is the provider's or shop's name if given;
"price_inr" is a single number in rupees (for a range, the upper figure) and "price_note" explains it (e.g. "800 to 1000, plus parts");
"eta_minutes" is how soon they can come or start, in minutes; "notes" is anything else useful, in English, at most 15 words.`;

export async function createJob(db: DB, s: Suggestion): Promise<Job> {
  let brief = s.need ?? s.detail;
  let questions = FALLBACK_QUESTIONS;
  if (butlerStatus() === "online") {
    try {
      const p = await askJson<{ brief?: string; questions?: string[] }>(PLAN_SYSTEM, { NEED: brief, CATEGORY: s.category ?? "other" });
      if (p.brief) brief = p.brief;
      if (Array.isArray(p.questions) && p.questions.length >= 2) questions = p.questions.slice(0, 4).map(String);
    } catch {
      /* keep the fallback questions */
    }
  }
  const job: Job = {
    id: uid(),
    suggestionId: s.id,
    contactId: s.contactId,
    need: brief,
    category: s.category ?? "other",
    questions,
    status: "calling",
    calls: [1, 2, 3].map((n) => ({ id: uid(), label: `Provider ${n}`, status: "waiting", transcript: [], quote: null })),
    recommendation: null,
    bookedCallId: null,
    createdAt: new Date().toISOString(),
  };
  db.jobs.push(job);
  return job;
}

/** A call link carries only the call's id, so look for it across everyone's jobs. */
export function findCall(callId: string): { db: DB; job: Job; call: Call } | null {
  if (!callId) return null;
  for (const db of Object.values(root().spaces)) {
    for (const job of db.jobs) {
      const call = job.calls.find((c) => c.id === callId);
      if (call) return { db, job, call };
    }
  }
  return null;
}

/** The first line is fixed text, so the AI disclosure can never be skipped. */
export function openCall(job: Job, call: Call) {
  if (call.transcript.length) return;
  call.status = "active";
  call.transcript.push({
    from: "butler",
    text: `Hello! I'm Equal, an AI assistant calling on behalf of a customer. ${job.need} ${job.questions[0]}`,
    at: new Date().toISOString(),
  });
}

export async function providerSays(db: DB, job: Job, call: Call, text: string): Promise<string | null> {
  if (call.status === "done") return null;
  call.transcript.push({ from: "provider", text, at: new Date().toISOString() });
  if (butlerStatus() !== "online") return butlerStatus();
  let r: { say?: string; done?: boolean; quote?: Partial<Quote> };
  try {
    r = await askJson(CALL_SYSTEM, {
      BRIEF: job.need,
      QUESTIONS: job.questions,
      CALL_SO_FAR: call.transcript.map((t) => ({ from: t.from, text: t.text })),
    });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (r.say) call.transcript.push({ from: "butler", text: r.say, at: new Date().toISOString() });
  const q = r.quote ?? {};
  call.quote = {
    shop: typeof q.shop === "string" && q.shop ? q.shop : call.quote?.shop ?? null,
    available: typeof q.available === "boolean" ? q.available : call.quote?.available ?? null,
    price_inr: typeof q.price_inr === "number" ? q.price_inr : call.quote?.price_inr ?? null,
    price_note: typeof q.price_note === "string" ? q.price_note : call.quote?.price_note ?? null,
    eta_minutes: typeof q.eta_minutes === "number" ? q.eta_minutes : call.quote?.eta_minutes ?? null,
    notes: typeof q.notes === "string" ? q.notes : call.quote?.notes ?? "",
  };
  if (call.quote.shop) call.label = call.quote.shop;
  // Safety net: a call cannot run forever.
  if (r.done || call.transcript.length >= 16) call.status = "done";
  if (job.calls.every((c) => c.status === "done") && job.status === "calling") job.status = "ready";
  job.recommendation = recommend(job);
  return null;
}

/**
 * Plain-code comparison: among providers who can help and gave a price, take those
 * within 30 minutes of the fastest, then the cheapest of them.
 */
export function recommend(job: Job): Job["recommendation"] {
  const ok = job.calls.filter((c) => c.status === "done" && c.quote && c.quote.available !== false && c.quote.price_inr != null);
  if (!ok.length) return null;
  const eta = (c: Call) => c.quote!.eta_minutes ?? 9999;
  const price = (c: Call) => c.quote!.price_inr!;
  const fastest = Math.min(...ok.map(eta));
  const pick = ok.filter((c) => eta(c) <= fastest + 30).sort((a, b) => price(a) - price(b))[0];
  const cheapest = [...ok].sort((a, b) => price(a) - price(b))[0];
  let reason = `₹${price(pick)}${eta(pick) < 9999 ? `, about ${eta(pick)} min away` : ""}.`;
  if (ok.length === 1) reason += " The only one who can help so far.";
  else if (cheapest.id !== pick.id) reason += ` ${cheapest.label} is ₹${price(pick) - price(cheapest)} cheaper but ${eta(cheapest) - eta(pick)} min slower.`;
  else reason += " Cheapest among the quickest.";
  return { callId: pick.id, reason };
}

/** Only ever called from the user's own tap. */
export function book(db: DB, job: Job, callId: string): boolean {
  const call = job.calls.find((c) => c.id === callId);
  if (!call || !call.quote || job.status === "booked") return false;
  job.status = "booked";
  job.bookedCallId = call.id;
  for (const c of job.calls) c.status = "done";
  const q = call.quote;
  db.messages.push({
    id: uid(),
    contactId: job.contactId,
    from: "butler",
    text: `Booked ${call.label}${q.price_inr != null ? ` for ₹${q.price_inr}` : ""}${q.eta_minutes != null ? `, arriving in about ${q.eta_minutes} min` : ""}. They have been told you confirmed.`,
    at: new Date().toISOString(),
  });
  return true;
}
