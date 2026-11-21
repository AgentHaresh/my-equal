import { DB, Contact, Message } from "./store";
import { askJson, butlerStatus } from "./butler";

/**
 * Scam shield: messages from unknown numbers are checked for known scam patterns.
 * If the message went to a protected family member, the user gets a guardian alert.
 * The sender is never told their message was flagged.
 */

const SYSTEM = `You protect people in India from scam messages. You read ONE message sent by an unknown number, plus any earlier messages in the same thread.

Return ONLY JSON:
{"scam": boolean, "pattern": "digital_arrest"|"kyc_or_account_block"|"otp_or_remote_access"|"fake_delivery_or_customs"|"job_or_task"|"relative_in_trouble"|"lottery_or_refund"|"loan_or_investment"|"other"|null,
 "confidence": number, "reason": string, "advice": string}

Mark "scam": true when the message shows the signs of fraud, for example:
- someone claiming to be police, CBI, customs, a court or a telecom authority, threatening arrest or legal action, demanding the person stay on a call, keep it secret, or transfer money to "verify" it;
- a warning that a bank account, SIM, KYC or electricity connection will be blocked unless the person clicks a link, installs an app, or calls a number;
- a request for an OTP, PIN, card details or screen-sharing;
- a parcel, customs or courier problem that needs a fee or personal details;
- easy money: paid tasks, guaranteed returns, a prize, a refund that needs a payment first;
- a relative or friend on a "new number" who urgently needs money.
Urgency, secrecy, threats and a request for money or credentials together are the strongest signs.

Mark "scam": false for ordinary messages: a genuine delivery update with no payment request, an appointment reminder, a bank's information-only alert with no link or call-back demand, a wrong number, a shop or service replying.
When unsure, prefer false unless money, credentials or threats are involved.

"confidence" is 0 to 1. "reason" is one plain sentence a non-technical older person would understand, saying why. Do not use jargon.
"advice" is one short sentence saying what to do (for example: do not pay or share any code, hang up, call 1930 or tell a family member).
Write "reason" and "advice" in English.`;

type Verdict = { scam?: boolean; pattern?: string | null; confidence?: number; reason?: string; advice?: string };

const LABELS: Record<string, string> = {
  digital_arrest: "fake police or arrest threat",
  kyc_or_account_block: "fake account or KYC block",
  otp_or_remote_access: "asking for a code or access",
  fake_delivery_or_customs: "fake delivery or customs fee",
  job_or_task: "fake job or paid task",
  relative_in_trouble: "pretending to be a relative",
  lottery_or_refund: "fake prize or refund",
  loan_or_investment: "fake loan or investment",
  other: "suspicious request",
};

/** Check one incoming message from an unknown number. Returns an error string if the check failed. */
export async function checkScam(db: DB, contact: Contact, msg: Message): Promise<string | null> {
  if (butlerStatus() !== "online") return butlerStatus();
  const earlier = db.messages.filter((m) => m.contactId === contact.id && m.id !== msg.id).slice(-6);
  let v: Verdict;
  try {
    v = await askJson<Verdict>(SYSTEM, {
      EARLIER: earlier.map((m) => ({ from: m.from === "them" ? "unknown number" : "recipient", text: m.text })),
      MESSAGE: msg.text,
    });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (!v.scam || Number(v.confidence ?? 0) < 0.6) return null;

  const pattern = LABELS[v.pattern ?? "other"] ?? LABELS.other;
  msg.scam = {
    pattern,
    reason: v.reason ?? "This message has the signs of a scam.",
    advice: v.advice ?? "Do not pay or share any code. Tell a family member.",
  };

  // A scam sent to a protected family member raises one alert for the user per thread.
  if (contact.owner) {
    const id = `guard-${contact.id}`;
    const existing = db.suggestions.find((s) => s.id === id);
    const alert = {
      id,
      type: "guardian" as const,
      contactId: contact.id,
      title: `${contact.owner} just got a message that looks like a scam`,
      detail: `${pattern[0].toUpperCase()}${pattern.slice(1)}. ${msg.scam.reason}`,
      status: "new" as const,
      createdAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, alert);
    else db.suggestions.push(alert);
  }
  return null;
}

