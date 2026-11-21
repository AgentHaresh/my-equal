import { DB, Contact, ScreenCall, root, uid } from "./store";
import { askJson, butlerStatus } from "./butler";

/**
 * Call screening for a protected family member. When an unknown number calls, Equal answers
 * on their behalf, finds out who is calling and why, and decides whether to pass the call on.
 * A scam call is refused and the family is told; a genuine one is taken as a message.
 * The caller is never given any information about the person they are calling.
 */

const SYSTEM = `You are Equal, an AI assistant answering a phone call on behalf of OWNER, an older person in India. The caller is an unknown number.
You have ALREADY said that you are an AI assistant answering for OWNER, and asked who is calling and why.

Your job is to protect OWNER:
- Find out who is calling and what they want. Ask at most two short follow-up questions in total.
- Never share anything about OWNER: not their whereabouts, family, bank, or whether they are home.
- Never agree to pay, transfer, share a code, install an app, stay on the line, or keep anything secret.
- Reply in the caller's language (English, Hindi, Telugu or a mix). Be calm and brief. Never claim to be human.

Signs of a scam: claiming to be police, CBI, customs, a court, a bank or a telecom authority and threatening arrest, a blocked account or a disconnected number; demanding money, an OTP, card details or screen sharing; a parcel with illegal items; a prize or refund that needs a payment; a relative on a "new number" needing money urgently; pressure to act now and tell no one.
Genuine callers include: a courier with a delivery and no payment demand, a clinic or lab confirming an appointment, a neighbour, a shop about an order, a wrong number.

Return ONLY JSON:
{"say": string, "done": boolean, "verdict": "scam"|"genuine"|"unsure", "pattern": string|null, "reason": string, "summary": string}
- While you still need to ask something: "done" false, "verdict" "unsure".
- If it is a scam: "done" true, "verdict" "scam". In "say", tell the caller firmly that you cannot connect this call and that it has been reported, then end. Do not argue.
- If it is genuine: "done" true, "verdict" "genuine". In "say", thank them and say OWNER will be told and will call back.
- "pattern" names the kind of scam in a few words, or null. "reason" is one plain sentence a family member would understand. "summary" is one sentence, in English, of who called and what they wanted.`;

export function findScreen(id: string): { db: DB; screen: ScreenCall; contact: Contact } | null {
  if (!id) return null;
  for (const db of Object.values(root().spaces)) {
    const screen = (db.screens ?? []).find((s) => s.id === id);
    const contact = screen && db.contacts.find((c) => c.id === screen.contactId);
    if (screen && contact) return { db, screen, contact };
  }
  return null;
}

/** An unknown number rings a protected person. The first line is fixed, so the disclosure can never be skipped. */
export function startScreen(db: DB, contact: Contact): ScreenCall {
  const screen: ScreenCall = {
    id: uid(),
    contactId: contact.id,
    status: "active",
    transcript: [
      {
        from: "equal",
        text: `Hello, this is Equal, an AI assistant answering for ${contact.owner}. May I know who is calling, and what this is about?`,
        at: new Date().toISOString(),
      },
    ],
    verdict: null,
    summary: "",
    createdAt: new Date().toISOString(),
  };
  (db.screens ??= []).push(screen);
  return screen;
}

export async function callerSays(db: DB, contact: Contact, screen: ScreenCall, text: string): Promise<string | null> {
  if (screen.status === "done") return null;
  const at = new Date().toISOString();
  screen.transcript.push({ from: "caller", text, at });
  if (butlerStatus() !== "online") return butlerStatus();
  const turns = screen.transcript.filter((t) => t.from === "caller").length;
  let r: { say?: string; done?: boolean; verdict?: string; pattern?: string | null; reason?: string; summary?: string };
  try {
    r = await askJson(SYSTEM, {
      OWNER: contact.owner,
      CALL_SO_FAR: screen.transcript.map((t) => ({ from: t.from, text: t.text })),
      NOTE: turns >= 3 ? "This is the caller's third turn. Decide now: set done true with your best verdict." : undefined,
    }, "screen_call");
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (r.say) screen.transcript.push({ from: "equal", text: r.say, at: new Date().toISOString() });
  if (!r.done && turns < 3) return null;

  // The call is over. Record the outcome where the family member and the user will see it.
  screen.status = "done";
  screen.verdict = r.verdict === "scam" ? "scam" : r.verdict === "genuine" ? "genuine" : "unsure";
  screen.summary = r.summary ?? "";
  const scam = screen.verdict === "scam";
  const pattern = r.pattern ?? "suspicious call";
  db.messages.push({
    id: uid(),
    contactId: contact.id,
    from: "them",
    text: `${scam ? "Call blocked by Equal" : "Call answered by Equal"}. ${screen.summary}`,
    at,
    scam: scam
      ? { pattern, reason: r.reason ?? "This call had the signs of a scam.", advice: "Equal did not connect the call. If they ring again, do not pay or share any code." }
      : undefined,
  });
  contact.lastContactAt = at;
  if (scam && contact.owner) {
    const id = `guard-${contact.id}`;
    const alert = {
      id,
      type: "guardian" as const,
      contactId: contact.id,
      title: `Equal blocked a scam call to ${contact.owner}`,
      detail: `${pattern[0].toUpperCase()}${pattern.slice(1)}. ${r.reason ?? ""} The call was not connected.`,
      status: "new" as const,
      createdAt: at,
    };
    const existing = db.suggestions.find((s) => s.id === id);
    if (existing) Object.assign(existing, alert);
    else db.suggestions.push(alert);
  }
  return null;
}
