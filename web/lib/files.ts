import fs from "fs";
import path from "path";
import { DB, Message, root, uid } from "./store";

/**
 * Photos and files sent in a chat. The bytes are kept on the server's disk beside the chat data;
 * a message only carries the file's id, name, type and size. A file can be fetched only by
 * someone who has a message carrying it.
 */

const DIR = path.join(process.cwd(), "data", "files");
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Pictures the browser may show in place. Everything else is only ever offered as a download. */
const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
export const isPicture = (type: string) => INLINE.has(type);

export function storeFile(bytes: Buffer, name: string, type: string): NonNullable<Message["file"]> {
  fs.mkdirSync(DIR, { recursive: true });
  const id = uid() + uid();
  fs.writeFileSync(path.join(DIR, id), bytes);
  // Keep the name readable but harmless: no path parts, no control characters.
  const clean = name.replace(/[\\/\u0000-\u001f]+/g, " ").trim().slice(0, 120) || "file";
  return { id, name: clean, type: type.slice(0, 100) || "application/octet-stream", size: bytes.length };
}

/** The file, if this person has a message that carries it. */
export function fileFor(db: DB, id: string): { file: NonNullable<Message["file"]>; bytes: Buffer } | null {
  if (!/^[a-z0-9]{8,24}$/.test(id)) return null;
  const msg = db.messages.find((m) => m.file?.id === id && !m.deleted);
  if (!msg?.file) return null;
  try {
    return { file: msg.file, bytes: fs.readFileSync(path.join(DIR, id)) };
  } catch {
    return null;
  }
}

/** Remove the bytes once no message anywhere still carries the file. */
export function dropFileIfUnused(id: string) {
  const used = Object.values(root().spaces).some((space) => space.messages.some((m) => m.file?.id === id && !m.deleted));
  if (used) return;
  try {
    fs.unlinkSync(path.join(DIR, id));
  } catch {
    /* already gone */
  }
}
