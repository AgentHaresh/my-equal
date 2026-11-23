import { recordTouch, save } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// The user says who someone is to them: their relation, whether they are one of the people they
// care about, whether they are family, and how often to stay in touch. Their word is final: none
// of this is ever overwritten by what the assistant infers. Everyone starts as an acquaintance.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  const contact = ctx.db.contacts.find((c) => c.id === body?.contactId && !c.unknown && !c.owner);
  if (!contact) return Response.json({ error: "No such contact." }, { status: 400 });
  // Starring a person keeps them at hand in Starred. It says nothing about the relationship.
  if (typeof body?.starred === "boolean") contact.starred = body.starred || undefined;
  // Who they are to me, in my own words ("college roommate", "cousin in Pune"). Free text, kept short.
  if (typeof body?.relation === "string") {
    const relation = body.relation.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!relation) return Response.json({ error: "Say who they are to you." }, { status: 400 });
    contact.relation = relation;
    contact.relationSource = "user";
  }
  if (typeof body?.close === "boolean") {
    contact.close = body.close;
    // Someone I no longer count among my people is not family with a rhythm either.
    if (!body.close) {
      contact.family = undefined;
      contact.everyDays = undefined;
    }
  }
  // Family are always among the people I care about.
  if (typeof body?.family === "boolean") {
    contact.family = body.family || undefined;
    if (body.family) contact.close = true;
  }
  // How often to stay in touch: a whole number of days, 1 to 90, or null to stop the reminders.
  if (body && "everyDays" in body) {
    const n = body.everyDays;
    if (n === null || n === 0) contact.everyDays = undefined;
    else if (Number.isInteger(n) && n >= 1 && n <= 90) {
      contact.everyDays = n;
      contact.close = true;
    } else return Response.json({ error: "Choose how often in days, from 1 to 90." }, { status: 400 });
  }
  // "I called Amma" or "I met Ravi": contact that happened outside My Equal still counts.
  if (body?.logged === "call" || body?.logged === "met") {
    const mins = Number.isInteger(body?.mins) && body.mins > 0 && body.mins < 600 ? body.mins : undefined;
    recordTouch(ctx.db, { contactId: contact.id, kind: body.logged === "call" ? "logged_call" : "met", dir: "out", at: new Date().toISOString(), mins });
  }
  save();
  return Response.json(snapshot(ctx.db, ctx.user));
}
