// The gear at the top right and the menu it opens: who is signed in, light or dark,
// editing the profile, notifications, the invite link, export and signing out.

import type { Snapshot } from "@/lib/snapshot";
import { GearIcon } from "../Icons";
import { label } from "./format";

type Props = {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  checkPush: () => Promise<void>;
  me: NonNullable<Snapshot["me"]>;
  light: boolean;
  setLight: (light: boolean) => void;
  setPushNote: (text: string | null) => void;
  togglePush: () => void;
  pushOn: boolean;
  pushNote: string | null;
  setDemo: (on: boolean) => void;
  snap: Snapshot;
  signOut: () => void;
  onEditProfile: () => void;
  privacyReady: boolean;
  setPrivateMode: (on: boolean) => void;
};

export default function SettingsMenu({ settingsOpen, setSettingsOpen, checkPush, me, light, setLight, setPushNote, togglePush, pushOn, pushNote, setDemo, snap, signOut, onEditProfile, privacyReady, setPrivateMode }: Props) {
  return (
    <span className="relative">
      <button
        onClick={() => {
          if (!settingsOpen) void checkPush();
          setSettingsOpen(!settingsOpen);
        }}
        aria-label="Settings" aria-expanded={settingsOpen} title="Settings" className="rounded-full border border-white/30 p-2 text-white/90 hover:bg-white/10">
        <GearIcon />
      </button>
      {settingsOpen && (
        <>
          <button aria-label="Close settings" className="fixed inset-0 z-30 cursor-default" onClick={() => setSettingsOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-64 rounded-2xl bg-white p-3 text-equal-ink shadow-2xl">
            <div className={`${label} text-equal-ink/50`}>Signed in as</div>
            <div className="mt-1 truncate font-semibold">{me.name}</div>
            <div className="truncate text-xs text-equal-ink/60">{me.phone ?? me.email}</div>
            {me.about && <div className="mt-1 line-clamp-2 text-xs italic text-equal-ink/60">{me.about}</div>}
            <button onClick={onEditProfile} className="mt-2 w-full rounded-full border border-blue-200 px-3 py-1.5 text-sm font-medium text-equal-sky">
              Edit profile
            </button>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-blue-50 p-1 text-sm font-semibold" role="group" aria-label="Appearance">
              <button onClick={() => setLight(true)} aria-pressed={light} className={`rounded-full py-1.5 ${light ? "bg-equal-sky text-white" : "text-equal-ink/60"}`}>
                Light
              </button>
              <button onClick={() => setLight(false)} aria-pressed={!light} className={`rounded-full py-1.5 ${light ? "text-equal-ink/60" : "bg-equal-sky text-white"}`}>
                Dark
              </button>
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(window.location.origin).then(() => setPushNote("Invite link copied: " + window.location.origin))}
              className="mt-2 w-full rounded-full border border-blue-200 px-3 py-1.5 text-sm font-medium text-equal-sky"
            >
              Copy invite link
            </button>
            <button onClick={togglePush} aria-pressed={pushOn} className={`mt-3 w-full rounded-full px-3 py-1.5 text-sm font-semibold ${pushOn ? "bg-equal-lime text-equal-ink" : "bg-equal-sky text-white"}`}>
              {pushOn ? "Notifications are on" : "Turn on notifications"}
            </button>
            {pushNote && <p className="mt-1 text-[11px] leading-snug text-equal-ink/70">{pushNote}</p>}
            {/* End-to-end encryption. In beta while Equal learns to read private chats on the phone itself. */}
            <button
              onClick={() => setPrivateMode(!me.privateMode)}
              disabled={!privacyReady}
              aria-pressed={me.privateMode}
              className={`mt-2 w-full rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${me.privateMode ? "bg-equal-lime text-equal-ink" : "border border-blue-200 text-equal-sky"}`}
            >
              {me.privateMode ? "🔒 Private chats are on" : "Turn on private chats (beta)"}
            </button>
            <p className="mt-1 text-[11px] leading-snug text-equal-ink/70">
              {me.privateMode
                ? "Your texts with people on My Equal are locked on your phone. The server cannot read them, and for now Equal cannot either. Photos, files and voice notes are not locked yet."
                : privacyReady
                  ? "Lock your texts on your phone so only you and the other person can read them."
                  : "This browser cannot make a private key here."}
            </p>
            <a href="/api/export" download className="mt-2 block rounded-full border border-blue-200 px-3 py-1.5 text-center text-sm font-medium text-equal-sky">
              Export all my chats
            </a>
            {/* Shown only to an account that still carries made-up demo chats, so they can be cleared. There is no way to add them from here. */}
            {snap.demo && (
              <button onClick={() => setDemo(false)} className="mt-2 w-full rounded-full border border-blue-200 px-3 py-1.5 text-sm font-medium text-equal-sky">
                Remove the demo chats
              </button>
            )}
            <button onClick={signOut} className="mt-2 w-full rounded-full bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white">
              Sign out
            </button>
          </div>
        </>
      )}
    </span>
  );
}
