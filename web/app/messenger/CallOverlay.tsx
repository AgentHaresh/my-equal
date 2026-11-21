// The full-screen call: ringing, connecting or connected, with the other person's
// picture behind it on a video call. Answer, decline and hang up live here.
//
// On a connected video call the name and the buttons fade away after a few seconds so the
// picture is clear, and come back when the screen is touched or the mouse moves.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CallUi } from "./useCalls";

type Props = {
  callUi: CallUi;
  linked: boolean;
  showTheirs: (el: HTMLVideoElement | null) => void;
  showMine: (el: HTMLVideoElement | null) => void;
  acceptCall: () => void;
  endCall: () => void;
};

/** How long the controls stay after the last touch or mouse move. */
const CONTROLS_STAY_MS = 3500;

export default function CallOverlay({ callUi, linked, showTheirs, showMine, acceptCall, endCall }: Props) {
  // "Immersive" is a connected video call: the only time the controls hide.
  const immersive = callUi.video && linked;
  const [awake, setAwake] = useState(true);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    setAwake(true);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => setAwake(false), CONTROLS_STAY_MS);
  }, []);

  useEffect(() => {
    if (!immersive) return;
    const first = setTimeout(wake, 0); // show them as the picture arrives, then let them fade
    return () => {
      clearTimeout(first);
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
    };
  }, [immersive, wake]);

  const controlsShown = !immersive || awake;
  const fade = `transition-opacity duration-300 ${controlsShown ? "opacity-100" : "pointer-events-none opacity-0"}`;

  return (
    <div
      onPointerMove={immersive ? wake : undefined}
      onPointerDown={immersive ? wake : undefined}
      className={`fixed inset-0 z-50 flex flex-col items-center gap-7 bg-equal-deep/95 px-8 text-center text-white backdrop-blur ${immersive ? "justify-end pb-10" : "justify-center"} ${immersive && !awake ? "cursor-none" : ""}`}
    >
      {callUi.video && (
        <>
          {/* Their picture fills the screen once connected; mine sits in the corner. Sound plays through the audio element. */}
          <video ref={showTheirs} autoPlay playsInline muted className={`absolute inset-0 -z-10 h-full w-full bg-equal-ink object-cover ${linked ? "" : "hidden"}`} />
          <video ref={showMine} autoPlay playsInline muted className="absolute right-4 top-4 h-40 w-28 -scale-x-100 rounded-2xl border-2 border-white/70 bg-equal-ink object-cover shadow-xl" />
        </>
      )}
      {!immersive && (
        <span className={`flex h-28 w-28 items-center justify-center rounded-full bg-equal-lime text-5xl font-bold text-equal-ink ${callUi.status === "ringing" ? "animate-pulse" : ""}`}>
          {callUi.name[0]?.toUpperCase()}
        </span>
      )}
      <div className={`${immersive ? "rounded-2xl bg-equal-ink/60 px-5 py-2" : ""} ${fade}`}>
        <div className={`font-display text-equal-lime ${immersive ? "text-2xl" : "text-4xl"}`}>{callUi.name}</div>
        <div className="mt-1 text-lg text-white/90">
          {callUi.status === "ringing" ? (callUi.role === "caller" ? (callUi.video ? "Video calling…" : "Calling…") : callUi.video ? "is video calling you" : "is calling you") : linked ? "Connected" : "Connecting…"}
        </div>
      </div>
      <div className={`flex gap-4 ${fade}`}>
        {callUi.role === "callee" && callUi.status === "ringing" && (
          <button onClick={acceptCall} className="rounded-full bg-equal-lime px-9 py-4 text-lg font-bold text-equal-ink shadow-xl">
            Answer
          </button>
        )}
        <button onClick={endCall} className="rounded-full bg-rose-500 px-9 py-4 text-lg font-bold text-white shadow-xl">
          {callUi.role === "callee" && callUi.status === "ringing" ? "Decline" : "Hang up"}
        </button>
      </div>
      <div className={`text-xs text-white/60 ${fade}`}>{callUi.video ? "Your call travels directly between your two phones." : "Your voices travel directly between your two phones."}</div>
    </div>
  );
}
