import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { deliver } from "@/lib/deliver";
import { MAX_FILE_BYTES, fileFor, isPicture, storeFile } from "@/lib/files";

// POST (form: file, contactId, caption?): send a photo or file in a chat.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { db, user } = ctx;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const contact = db.contacts.find((c) => c.id === String(form?.get("contactId") ?? "") && !c.owner);
  if (!contact) return Response.json({ error: "No such chat." }, { status: 400 });
  if (!(file instanceof Blob) || file.size === 0) return Response.json({ error: "Choose a file to send." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "That file is larger than 8 MB." }, { status: 400 });

  const name = file instanceof File && file.name ? file.name : "file";
  const stored = storeFile(Buffer.from(await file.arrayBuffer()), name, file.type);
  const caption = String(form?.get("caption") ?? "").trim().slice(0, 2000);
  const error = await deliver(db, user, contact, caption, undefined, undefined, stored);
  return Response.json(snapshot(db, user, error));
}

// GET ?id=: the bytes of a file, for someone who has a message carrying it.
export async function GET(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const found = fileFor(ctx.db, new URL(request.url).searchParams.get("id") ?? "");
  if (!found) return Response.json({ error: "No such file." }, { status: 404 });
  const { file, bytes } = found;
  const picture = isPicture(file.type);
  return new Response(new Uint8Array(bytes), {
    headers: {
      // Only known picture types are shown in place. Anything else is a download, served as plain
      // bytes, so a file can never run as a page on this site.
      "Content-Type": picture ? file.type : "application/octet-stream",
      "Content-Disposition": `${picture ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
