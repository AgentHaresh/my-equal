/**
 * Phone calls from the Android phone's own call log, matched to the people in My Equal.
 *
 * The native app reads the call log (with the person's permission) each time it opens. The calls are
 * matched here, on the phone, and used only to work out who is in touch with whom (lib/touch.ts,
 * lib/nudges.ts). They are not sent to the server and not stored by the app: the call log stays the
 * phone's own record.
 *
 * A call matches a person when it was linked to them by hand, or when the name the phone shows for the
 * number is that person's name (or a first name only one person here has). Anything else is left out.
 *
 * No server or browser-only imports.
 */
import type { Touch } from "./touch";

/** One entry of Android's call log, as the native side gives it. type is CallLog.Calls.TYPE. */
export type PhoneCall = { number: string; name: string | null; type: number; at: number; secs: number };
type Person = { id: string; name: string; unknown?: boolean };

/** A number in a comparable form: its last ten digits. */
export const numberKey = (n: string) => n.replace(/\D/g, "").slice(-10);
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Who a name from the phone's address book is here, if that is clear. */
export function matchName(phoneName: string | null, people: Person[]): Person | undefined {
  if (!phoneName) return undefined;
  const target = words(phoneName);
  if (!target.length) return undefined;
  const candidates = people.filter((p) => !p.unknown);
  const full = candidates.filter((p) => words(p.name).join(" ") === target.join(" "));
  if (full.length === 1) return full[0];
  if (full.length > 1) return undefined;
  const first = candidates.filter((p) => words(p.name)[0] === target[0]);
  return first.length === 1 ? first[0] : undefined;
}

/** Android's call types: what kind of touch each one is, and which way it went. */
function kindOf(c: PhoneCall): Pick<Touch, "kind" | "dir"> | null {
  switch (c.type) {
    case 1: // incoming
    case 7: // answered on another device
      return { kind: "call", dir: "in" };
    case 2: // outgoing: no answer if it lasted no time at all
      return c.secs > 0 ? { kind: "call", dir: "out" } : { kind: "missed", dir: "out" };
    case 3: // missed
    case 4: // voicemail
    case 5: // rejected
      return { kind: "missed", dir: "in" };
    default: // blocked and anything newer: not a touch
      return null;
  }
}

/**
 * The calls as touches with people here, and the names the phone knows that matched nobody (so the
 * person can link them by hand). links: number key -> contact id, set by the person.
 */
export function callsToTouches(calls: PhoneCall[], people: Person[], links: Record<string, string> = {}): { touches: Touch[]; unmatched: { number: string; name: string | null; calls: number }[] } {
  const touches: Touch[] = [];
  const unmatched = new Map<string, { number: string; name: string | null; calls: number }>();
  for (const c of calls) {
    const kind = kindOf(c);
    const key = numberKey(c.number);
    if (!kind || !key || !Number.isFinite(c.at)) continue;
    const linked = links[key] ? people.find((p) => p.id === links[key]) : undefined;
    const who = linked ?? matchName(c.name, people);
    if (!who) {
      const u = unmatched.get(key) ?? { number: c.number, name: c.name, calls: 0 };
      u.calls++;
      unmatched.set(key, u);
      continue;
    }
    touches.push({ id: `ph-${key}-${c.at}`, contactId: who.id, ...kind, at: new Date(c.at).toISOString(), mins: kind.kind === "call" && c.secs > 0 ? Math.max(1, Math.round(c.secs / 60)) : undefined });
  }
  return { touches, unmatched: [...unmatched.values()].sort((a, b) => b.calls - a.calls) };
}
