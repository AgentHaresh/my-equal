import { Root, User, contactFor, findUser, recordTouch, root, save, spaceOf, uid } from "./store";
import type { Touch } from "./touch";
import { notify } from "./push";

/**
 * Voice and video calls between two signed-in people. The sound and picture travel directly between their browsers;
 * this server only passes the two connection descriptions (the "offer" and the "answer") so the
 * browsers can find each other, and keeps a small record of the call. No audio touches the server.
 *
 * A finished call counts as being in touch, so the "stay close" nudge resets, and each person
 * gets a private note in the chat.
 */

export type RtcCall = {
  id: string;
  from: string;
  to: string;
  offer?: string;
  answer?: string;
  video?: boolean; // a video call; otherwise voice only
  status: "ringing" | "active" | "ended";
  outcome?: "completed" | "missed" | "declined" | "cancelled";
  createdAt: string;
  answeredAt?: string;
  endedAt?: string;
};

const RING_SECONDS = 45;

function calls(): RtcCall[] {
  const r = root() as Root & { rtc?: RtcCall[] };
  return (r.rtc ??= []);
}

function note(owner: User, other: User, text: string, touch?: Pick<Touch, "kind" | "dir" | "mins">) {
  const space = spaceOf(owner.id);
  const contact = contactFor(space, other);
  const at = new Date().toISOString();
  space.messages.push({ id: uid(), contactId: contact.id, from: "butler", text, at });
  // Each side keeps the call in its history of who reached out to whom.
  if (touch) recordTouch(space, { contactId: contact.id, at, ...touch });
}

function finish(call: RtcCall, outcome: NonNullable<RtcCall["outcome"]>) {
  if (call.status === "ended") return;
  call.status = "ended";
  call.outcome = outcome;
  call.endedAt = new Date().toISOString();
  delete call.offer; // the connection descriptions are no longer needed
  delete call.answer;
  const caller = findUser(call.from);
  const callee = findUser(call.to);
  if (caller && callee) {
    if (outcome === "completed") {
      const mins = Math.max(1, Math.round((Date.parse(call.endedAt) - Date.parse(call.answeredAt ?? call.endedAt)) / 60000));
      const kind = call.video ? "video call" : "call";
      const k = call.video ? "video" : "call";
      note(caller, callee, `You had a ${kind} with ${callee.name}. About ${mins} min.`, { kind: k, dir: "out", mins });
      note(callee, caller, `${caller.name} had a ${kind} with you. About ${mins} min.`, { kind: k, dir: "in", mins });
    } else if (outcome === "missed") {
      note(caller, callee, `${callee.name} didn't pick up.`, { kind: "missed", dir: "out" });
      note(callee, caller, `Missed ${call.video ? "video call" : "call"} from ${caller.name}.`, { kind: "missed", dir: "in" });
    } else if (outcome === "declined") {
      note(caller, callee, `${callee.name} couldn't take your call.`, { kind: "missed", dir: "out" });
    }
  }
  const all = calls();
  if (all.length > 60) all.splice(0, all.length - 60);
  save();
}

/** Ringing calls nobody answered are closed as missed. */
function expire() {
  const now = Date.now();
  for (const c of calls()) if (c.status === "ringing" && now - Date.parse(c.createdAt) > RING_SECONDS * 1000) finish(c, "missed");
}

export function startCall(caller: User, callee: User, offer: string, video = false): RtcCall | { error: string } {
  expire();
  if (Boolean(caller.test) !== Boolean(callee.test)) return { error: "No such person." };
  const busy = calls().find((c) => c.status !== "ended" && [c.from, c.to].some((x) => x === caller.id || x === callee.id));
  if (busy) return { error: busy.from === caller.id || busy.to === caller.id ? "You are already on a call." : `${callee.name} is on another call.` };
  const call: RtcCall = { id: uid(), from: caller.id, to: callee.id, offer, video: video || undefined, status: "ringing", createdAt: new Date().toISOString() };
  calls().push(call);
  save();
  notify(callee.id, { title: caller.name, body: video ? "Incoming video call. Open My Equal to answer." : "Incoming call. Open My Equal to answer.", tag: "call", url: "/" });
  return call;
}

export function answerCall(user: User, id: string, answer: string): boolean {
  expire();
  const call = calls().find((c) => c.id === id && c.to === user.id && c.status === "ringing");
  if (!call) return false;
  call.answer = answer;
  call.status = "active";
  call.answeredAt = new Date().toISOString();
  save();
  return true;
}

export function endCall(user: User, id: string): boolean {
  const call = calls().find((c) => c.id === id && (c.from === user.id || c.to === user.id) && c.status !== "ended");
  if (!call) return false;
  finish(call, call.status === "active" ? "completed" : call.from === user.id ? "cancelled" : "declined");
  return true;
}

/** The call this person is in right now, if any, as their screen needs to see it. */
export function currentCall(user: User) {
  expire();
  const call = calls().find((c) => c.status !== "ended" && (c.from === user.id || c.to === user.id));
  if (!call) return null;
  const role = call.from === user.id ? ("caller" as const) : ("callee" as const);
  const other = findUser(role === "caller" ? call.to : call.from);
  return {
    id: call.id,
    role,
    status: call.status,
    video: Boolean(call.video),
    withName: other?.name ?? "Someone",
    withPicture: other?.picture,
    // Each side is given only the description it needs from the other.
    offer: role === "callee" && call.status === "ringing" ? call.offer : undefined,
    answer: role === "caller" ? call.answer : undefined,
  };
}
