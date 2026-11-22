import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { MAX_PHOTO_BYTES, setProfile } from "@/lib/profile";
import { allow, tooMany } from "@/lib/ratelimit";

// POST (form: name, username, about?, photo?, removePhoto?): set up or change my profile.
// Asked once when an account is new, and reachable later from Settings.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const limit = allow("profile", ctx.user.id, 30, 3600);
  if (!limit.ok) return tooMany(limit, "Too many profile changes");

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Send the profile as a form." }, { status: 400 });
  const photo = form.get("photo");
  if (photo instanceof Blob && photo.size > MAX_PHOTO_BYTES) return Response.json({ error: "That photo is too large." }, { status: 400 });

  const error = setProfile(ctx.user, {
    name: String(form.get("name") ?? ""),
    username: String(form.get("username") ?? ""),
    about: String(form.get("about") ?? ""),
    photo: photo instanceof Blob && photo.size > 0 ? Buffer.from(await photo.arrayBuffer()) : undefined,
    removePhoto: form.get("removePhoto") === "yes",
  });
  if (error) return Response.json({ error }, { status: 400 });
  return Response.json(snapshot(ctx.db, ctx.user));
}
