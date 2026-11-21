// Setting up an account: the name others will see, an optional photo, an optional line about you.
// Shown once to a new person before anything else, and again from Settings to change it.

import { useState } from "react";
import type { Snapshot } from "@/lib/snapshot";

type Props = {
  me: NonNullable<Snapshot["me"]>;
  /** True when opened from Settings: it can be closed without saving. */
  editing?: boolean;
  onDone: (next: Snapshot) => void;
  onClose?: () => void;
};

/** Shrink a chosen photo to a small square JPEG in the browser, so only a few kilobytes are sent. */
async function squarePhoto(file: File, size = 320): Promise<Blob> {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read that photo."))), "image/jpeg", 0.85));
}

export default function ProfileSetup({ me, editing, onDone, onClose }: Props) {
  // A brand-new phone account has a placeholder name; start the box empty so it is typed, not edited.
  const [name, setName] = useState(editing ? me.name : me.needsSetup && !me.email ? "" : me.name);
  const [about, setAbout] = useState(me.about ?? "");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(me.picture ?? null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File) {
    setError(null);
    try {
      const small = await squarePhoto(file);
      setPhoto(small);
      setRemovePhoto(false);
      setPreview(URL.createObjectURL(small));
    } catch {
      setError("That file could not be read as a photo. Choose a JPEG or PNG.");
    }
  }

  async function saveProfile() {
    if (busy) return;
    if (!name.trim()) return setError("Enter your name.");
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("about", about);
      if (photo) form.set("photo", photo, "photo.jpg");
      if (removePhoto) form.set("removePhoto", "yes");
      const res = await fetch("/api/profile", { method: "POST", body: form });
      const next = await res.json();
      if (!res.ok) return setError(next.error ?? "Could not save your profile.");
      onDone(next);
    } catch {
      setError("Could not reach Equal. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-lg text-white outline-none placeholder:text-white/40 focus:border-equal-lime";

  return (
    <div className={editing ? "fixed inset-0 z-50 flex items-center justify-center bg-equal-deep/90 p-4 backdrop-blur" : "flex min-h-dvh items-center justify-center p-4"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveProfile();
        }}
        className="glass w-full max-w-md rounded-3xl p-6 text-white"
      >
        <h1 className="hero-text font-display text-3xl">{editing ? "Your profile" : "Set up your profile"}</h1>
        <p className="mt-1 text-sm text-white/65">{editing ? "This is what people you chat with see." : "One step before you start. This is what people you chat with will see."}</p>

        <div className="mt-5 flex items-center gap-4">
          <label className="relative cursor-pointer" aria-label="Choose a profile photo" title="Choose a profile photo">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Your profile photo" className="h-24 w-24 rounded-full object-cover ring-2 ring-white/30" />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-equal-lime font-display text-4xl text-equal-ink">{(name.trim()[0] ?? "?").toUpperCase()}</span>
            )}
            <span className="absolute -bottom-1 -right-1 rounded-full bg-equal-sky px-2.5 py-1 text-xs font-bold text-white shadow-lg">{preview ? "Change" : "Add photo"}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void choose(f);
                e.target.value = "";
              }}
            />
          </label>
          <div className="min-w-0 text-sm text-white/65">
            <div>A photo is optional.</div>
            <div className="truncate">{me.phone ?? me.email}</div>
            {preview && (
              <button
                type="button"
                onClick={() => {
                  setPhoto(null);
                  setPreview(null);
                  setRemovePhoto(true);
                }}
                className="mt-1 text-xs text-white/60 underline"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        <label htmlFor="profile-name" className="mt-5 block text-sm font-semibold text-white/80">
          Your name
        </label>
        <input id="profile-name" autoFocus autoComplete="name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="As friends know you" className={`mt-1 ${field}`} />

        <label htmlFor="profile-about" className="mt-4 block text-sm font-semibold text-white/80">
          About <span className="font-normal text-white/50">(optional)</span>
        </label>
        <input id="profile-about" maxLength={140} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="A line about you" className={`mt-1 ${field}`} />

        {error && <div className="mt-4 rounded-xl bg-rose-600 px-3 py-2 text-sm">{error}</div>}

        <button disabled={busy || !name.trim()} className="mt-5 w-full rounded-2xl bg-equal-lime py-3.5 text-lg font-bold text-equal-ink disabled:opacity-40">
          {busy ? "Saving…" : editing ? "Save" : "Continue"}
        </button>
        {editing && (
          <button type="button" onClick={onClose} className="mt-2 w-full py-1 text-sm text-white/60">
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
