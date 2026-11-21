import { save } from "@/lib/store";
import { readPhoto } from "@/lib/photo";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// The user photographs something to remember. The image is read once and not stored;
// only what was read from it is kept.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof Blob) || !image.type.startsWith("image/")) return Response.json({ error: "Choose a photo." }, { status: 400 });
  if (image.size > 6_000_000) return Response.json({ error: "That photo is too large." }, { status: 400 });
  const dataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
  const photo = await readPhoto(ctx.db, dataUrl);
  save();
  return Response.json({ ...snapshot(ctx.db, ctx.user, photo.error ?? null), photo, contactId: photo.contactId }, { status: photo.error ? 422 : 200 });
}
