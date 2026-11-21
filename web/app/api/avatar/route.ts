import { context, unauthorised } from "@/lib/auth";
import { photoFor } from "@/lib/profile";

// GET ?id=: someone's profile photo. Served only to that person and to people who already have
// a chat with them, so photos cannot be collected by guessing ids.
export async function GET(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const found = photoFor(ctx.user, ctx.db, new URL(request.url).searchParams.get("id") ?? "");
  if (!found) return Response.json({ error: "No such photo." }, { status: 404 });
  return new Response(new Uint8Array(found.bytes), {
    headers: { "Content-Type": found.type, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400" },
  });
}
