import { draftMessage } from "@/lib/deliver";
import { context, unauthorised } from "@/lib/auth";

// Draft a message in the user's own voice. Nothing is sent: the draft goes into the message box
// for the user to edit and send themselves.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  const contact = ctx.db.contacts.find((c) => c.id === body?.contactId && !c.unknown);
  if (!contact) return Response.json({ error: "No such chat." }, { status: 400 });
  return Response.json(await draftMessage(ctx.db, contact, String(body?.about ?? "").slice(0, 300)));
}
