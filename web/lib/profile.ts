import fs from "fs";
import path from "path";
import { DB, User, root, save } from "./store";
import { dataDir, openBytes, sealBytes } from "./storage";

/**
 * A person's profile: the name others see, an optional photo, and an optional line about them.
 * It is set once when the account is new, and can be changed later from Settings.
 *
 * The photo is kept on disk like any other file (sealed when a data key is set) and is shown
 * only to the person themselves and to people they already have a chat with.
 */

const DIR = () => path.join(dataDir(), "avatars");
export const MAX_PHOTO_BYTES = 600 * 1024;
export const MAX_NAME = 40;
export const MAX_ABOUT = 140;

/** What kind of picture these bytes are, read from their first bytes and not from a claimed type. */
export function pictureType(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length > 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export type ProfileChange = { name: string; about?: string; photo?: Buffer; removePhoto?: boolean };

/** Set the profile. Returns an error to show, or null when it is saved. */
export function setProfile(user: User, change: ProfileChange): string | null {
  const name = change.name.replace(/\s+/g, " ").trim();
  if (!name) return "Enter your name.";
  if (name.length > MAX_NAME) return `Keep your name under ${MAX_NAME} characters.`;
  const about = (change.about ?? "").replace(/\s+/g, " ").trim();
  if (about.length > MAX_ABOUT) return `Keep the line about you under ${MAX_ABOUT} characters.`;

  if (change.photo) {
    if (change.photo.length > MAX_PHOTO_BYTES) return "That photo is too large.";
    if (!pictureType(change.photo)) return "Choose a JPEG, PNG or WebP photo.";
    fs.mkdirSync(DIR(), { recursive: true });
    fs.writeFileSync(path.join(DIR(), user.id), sealBytes(change.photo));
    // The address changes with each new photo, so browsers never show a stale one.
    user.picture = `/api/avatar?id=${user.id}&v=${Date.now().toString(36)}`;
  } else if (change.removePhoto) {
    fs.rmSync(path.join(DIR(), user.id), { force: true });
    user.picture = undefined;
  }
  user.name = name;
  user.about = about || undefined;
  user.profileSetAt = new Date().toISOString();

  // Everyone who has a chat with this person sees the new name and photo.
  for (const space of Object.values(root().spaces)) {
    for (const c of space.contacts) {
      if (c.userId !== user.id) continue;
      c.name = user.name;
      c.picture = user.picture;
    }
  }
  save();
  return null;
}

/** The photo of the person with this id, if the asker is that person or has a chat with them. */
export function photoFor(asker: User, askerSpace: DB, id: string): { bytes: Buffer; type: string } | null {
  if (!/^[a-z0-9]{6,24}$/.test(id)) return null;
  if (id !== asker.id && !askerSpace.contacts.some((c) => c.userId === id)) return null;
  try {
    const bytes = openBytes(fs.readFileSync(path.join(DIR(), id)));
    const type = pictureType(bytes);
    return type ? { bytes, type } : null;
  } catch {
    return null;
  }
}
