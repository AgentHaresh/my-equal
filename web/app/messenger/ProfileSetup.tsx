// Setting up an account: the name others will see, a username to be found by, an optional photo
// (moved and zoomed to sit in the circle), and an optional line about you.
// Shown once to a new person before anything else, and again from Settings to change it.

import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/snapshot";

type Props = {
  me: NonNullable<Snapshot["me"]>;
  /** True when opened from Settings: it can be closed without saving. */
  editing?: boolean;
  onDone: (next: Snapshot) => void;
  onClose?: () => void;
};

/** The circle the photo is placed in while choosing, in CSS pixels. */
const VIEW = 260;
/** The saved photo: a small square JPEG, so only a few kilobytes are sent. */
const OUT = 320;

type Placing = { url: string; img: HTMLImageElement; zoom: number; x: number; y: number };

/** How large the photo is drawn so that, at zoom 1, it just covers the circle. */
const coverScale = (img: HTMLImageElement) => Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight);

/** Keep the photo covering the whole circle: it may not be dragged so far that a gap shows. */
function clamp(p: Placing): Placing {
  const s = coverScale(p.img) * p.zoom;
  const maxX = Math.max(0, (p.img.naturalWidth * s - VIEW) / 2);
  const maxY = Math.max(0, (p.img.naturalHeight * s - VIEW) / 2);
  return { ...p, x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
}

/** Cut the part of the photo inside the circle into a square JPEG. */
function cut(p: Placing): Promise<Blob> {
  const s = coverScale(p.img) * p.zoom;
  const left = VIEW / 2 - (p.img.naturalWidth * s) / 2 + p.x;
  const top = VIEW / 2 - (p.img.naturalHeight * s) / 2 + p.y;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = OUT;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OUT, OUT);
  ctx.drawImage(p.img, -left / s, -top / s, VIEW / s, VIEW / s, 0, 0, OUT, OUT);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read that photo."))), "image/jpeg", 0.88));
}

function loadImage(file: File): Promise<{ url: string; img: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, img });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });
}

/** What is wrong with a username as typed, for the hint under the box. Mirrors the server's rules. */
function usernameHint(u: string): string | null {
  if (!u) return null;
  if (u.length < 3) return "At least 3 characters.";
  if (u.length > 20) return "At most 20 characters.";
  if (!/^[a-z0-9._]+$/.test(u)) return "Only letters, numbers, dots and underscores.";
  if (!/^[a-z]/.test(u)) return "Start with a letter.";
  if (/[._]$/.test(u) || /[._]{2}/.test(u)) return "A dot or underscore cannot end it or come twice in a row.";
  return null;
}

/** A first guess at a username from a name: "Haresh Gundela" -> "haresh.gundela". */
const suggestFrom = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(".")
    .slice(0, 20);

export default function ProfileSetup({ me, editing, onDone, onClose }: Props) {
  // A brand-new phone account has a placeholder name; start the box empty so it is typed, not edited.
  const [name, setName] = useState(editing || me.profileReady ? me.name : me.needsSetup && !me.email ? "" : me.name);
  const [username, setUsername] = useState(me.username ?? "");
  const [usernameTouched, setUsernameTouched] = useState(Boolean(me.username));
  const [about, setAbout] = useState(me.about ?? "");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(me.picture ?? null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Until the person types a username themselves, offer one made from their name.
  const shownUsername = usernameTouched ? username : suggestFrom(name);
  const hint = usernameHint(shownUsername);

  useEffect(() => () => {
    if (placing) URL.revokeObjectURL(placing.url);
  }, [placing]);

  async function choose(file: File) {
    setError(null);
    try {
      const { url, img } = await loadImage(file);
      setPlacing({ url, img, zoom: 1, x: 0, y: 0 });
    } catch {
      setError("That file could not be read as a photo. Choose a JPEG or PNG.");
    }
  }

  async function usePlaced() {
    if (!placing) return;
    try {
      const small = await cut(placing);
      setPhoto(small);
      setRemovePhoto(false);
      setPreview(URL.createObjectURL(small));
      setPlacing(null);
    } catch {
      setError("That photo could not be used. Try another.");
    }
  }

  async function saveProfile() {
    if (busy) return;
    if (!name.trim()) return setError("Enter your name.");
    if (!shownUsername) return setError("Choose a username.");
    if (hint) return setError(`Username: ${hint}`);
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("username", shownUsername);
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

  // Placing the photo: drag to move it, the slider (or a scroll) to zoom. The circle shows what people will see.
  if (placing) {
    const s = coverScale(placing.img) * placing.zoom;
    const w = placing.img.naturalWidth * s;
    const h = placing.img.naturalHeight * s;
    return (
      <div className={editing ? "fixed inset-0 z-50 flex items-center justify-center bg-equal-deep/90 p-4 backdrop-blur" : "flex min-h-dvh items-center justify-center p-4"}>
        <div className="glass w-full max-w-md rounded-3xl p-6 text-center text-white">
          <h1 className="hero-text font-display text-3xl">Place your photo</h1>
          <p className="mt-1 text-sm text-white/65">Drag to move it. Use the slider to zoom.</p>
          <div
            className="relative mx-auto mt-5 touch-none select-none overflow-hidden rounded-full bg-white/10 ring-2 ring-equal-lime"
            style={{ width: VIEW, height: VIEW, cursor: dragging ? "grabbing" : "grab" }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
              setDragging(true);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.id !== e.pointerId) return;
              const dx = e.clientX - d.x;
              const dy = e.clientY - d.y;
              drag.current = { ...d, x: e.clientX, y: e.clientY };
              setPlacing((p) => (p ? clamp({ ...p, x: p.x + dx, y: p.y + dy }) : p));
            }}
            onPointerUp={() => {
              drag.current = null;
              setDragging(false);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(false);
            }}
            onWheel={(e) => setPlacing((p) => (p ? clamp({ ...p, zoom: Math.min(4, Math.max(1, p.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))) }) : p))}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={placing.url}
              alt="Your photo, being placed"
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ width: w, height: h, left: VIEW / 2 - w / 2 + placing.x, top: VIEW / 2 - h / 2 + placing.y }}
            />
          </div>
          <label className="mt-5 flex items-center gap-3 text-sm text-white/75">
            <span aria-hidden>−</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={placing.zoom}
              onChange={(e) => setPlacing((p) => (p ? clamp({ ...p, zoom: Number(e.target.value) }) : p))}
              aria-label="Zoom"
              className="flex-1 accent-[#cef82c]"
            />
            <span aria-hidden>+</span>
          </label>
          {error && <div className="mt-4 rounded-xl bg-rose-600 px-3 py-2 text-sm">{error}</div>}
          <button type="button" onClick={usePlaced} className="mt-5 w-full rounded-2xl bg-equal-lime py-3.5 text-lg font-bold text-equal-ink">
            Use this photo
          </button>
          <button type="button" onClick={() => setPlacing(null)} className="mt-2 w-full py-1 text-sm text-white/60">
            Cancel
          </button>
        </div>
      </div>
    );
  }

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

        <label htmlFor="profile-username" className="mt-4 block text-sm font-semibold text-white/80">
          Username <span className="font-normal text-white/50">(people can find you by it)</span>
        </label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-white/50">@</span>
          <input
            id="profile-username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            value={shownUsername}
            onChange={(e) => {
              setUsernameTouched(true);
              setUsername(e.target.value.toLowerCase().replace(/^@+/, "").replace(/\s/g, ""));
            }}
            placeholder="yourname"
            className={`${field} pl-9`}
          />
        </div>
        <p className={`mt-1 text-xs ${hint ? "text-amber-200" : "text-white/50"}`}>{hint ?? "Friends can start a chat with you by typing @" + (shownUsername || "yourname") + "."}</p>

        <label htmlFor="profile-about" className="mt-4 block text-sm font-semibold text-white/80">
          About <span className="font-normal text-white/50">(optional)</span>
        </label>
        <input id="profile-about" maxLength={140} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="A line about you" className={`mt-1 ${field}`} />

        {error && <div className="mt-4 rounded-xl bg-rose-600 px-3 py-2 text-sm">{error}</div>}

        <button disabled={busy || !name.trim() || !shownUsername || Boolean(hint)} className="mt-5 w-full rounded-2xl bg-equal-lime py-3.5 text-lg font-bold text-equal-ink disabled:opacity-40">
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
