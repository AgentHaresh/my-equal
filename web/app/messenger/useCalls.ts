// Voice and video calls between two people on My Equal.
// This hook owns what the call screen shows and the live connection behind it:
// placing a call, answering one, hanging up, and keeping in step with the server.

import { useCallback, useRef, useState } from "react";
import type { Snapshot } from "@/lib/snapshot";
import type { Api, Contact } from "./format";

export type CallUi = { id: string; role: "caller" | "callee"; status: "ringing" | "active"; name: string; offer?: string; video: boolean };

export function useCalls(api: Api, setSnap: (s: Snapshot) => void, setNotice: (text: string | null) => void) {
  // A voice call: what is on screen, and the live connection behind it.
  const [callUi, setCallUi] = useState<null | { id: string; role: "caller" | "callee"; status: "ringing" | "active"; name: string; offer?: string; video: boolean }>(null);
  const [linked, setLinked] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callStream = useRef<MediaStream | null>(null);
  const callId = useRef<string | null>(null);
  const callSince = useRef(0);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  // Video calls: the other person's picture, and the screens showing theirs and mine.
  const remoteStream = useRef<MediaStream | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const showTheirs = useCallback((el: HTMLVideoElement | null) => {
    remoteVideo.current = el;
    if (el && remoteStream.current) el.srcObject = remoteStream.current;
  }, []);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const showMine = useCallback((el: HTMLVideoElement | null) => {
    localVideo.current = el;
    if (el && callStream.current) el.srcObject = callStream.current;
  }, []);

  const hangUpLocal = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    callStream.current?.getTracks().forEach((t) => t.stop());
    callStream.current = null;
    remoteStream.current = null;
    callId.current = null;
    setLinked(false);
    setCallUi(null);
  }, []);

  /** Keep the call on screen in step with the server: an incoming ring, the answer arriving, the other side hanging up. */
  const syncCall = useCallback(
    async (call: Snapshot["call"]) => {
      if (!call) {
        // The other side ended it. (Ignore a stale reply from just before the call began.)
        if (callId.current && Date.now() - callSince.current > 3000) hangUpLocal();
        return;
      }
      if (call.role === "callee" && call.status === "ringing" && !callId.current) {
        callId.current = call.id;
        callSince.current = Date.now();
        setCallUi({ id: call.id, role: "callee", status: "ringing", name: call.withName, offer: call.offer, video: call.video });
      }
      const pc = pcRef.current;
      if (call.role === "caller" && call.answer && pc && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription({ type: "answer", sdp: call.answer });
        setCallUi((u) => (u ? { ...u, status: "active" } : u));
      }
    },
    [hangUpLocal]
  );

  /** One side of the connection: my microphone out, their voice in. */
  function newPeer(stream: MediaStream) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      remoteStream.current = e.streams[0];
      if (remoteAudio.current) remoteAudio.current.srcObject = e.streams[0];
      if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => setLinked(pc.connectionState === "connected");
    pcRef.current = pc;
    callStream.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream; // the answering side's screen is already up
    return pc;
  }

  /** Wait until the browser has worked out how the other side can reach it. */
  const gathered = (pc: RTCPeerConnection) =>
    new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && resolve());
      setTimeout(resolve, 2500);
    });

  const microphone = async (video = false) => {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false });
    } catch {
      setNotice(video ? "The camera or microphone is blocked. Allow them in your browser to make video calls." : "The microphone is blocked. Allow it in your browser to make calls.");
      return null;
    }
  };

  async function placeCall(c: Contact, video = false) {
    if (callId.current) return;
    const stream = await microphone(video);
    if (!stream) return;
    callId.current = "starting";
    callSince.current = Date.now();
    setCallUi({ id: "", role: "caller", status: "ringing", name: c.name, video });
    try {
      const pc = newPeer(stream);
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const res = await fetch("/api/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", contactId: c.id, offer: pc.localDescription?.sdp, video }) });
      const r = await res.json();
      if (!res.ok || !r.id) {
        hangUpLocal();
        return setNotice(r.error ?? "Could not place the call.");
      }
      callId.current = r.id;
      callSince.current = Date.now();
      setCallUi((u) => (u ? { ...u, id: r.id } : u));
    } catch {
      hangUpLocal();
      setNotice("Could not place the call.");
    }
  }

  async function acceptCall() {
    if (!callUi?.offer) return;
    const stream = await microphone(callUi.video);
    if (!stream) return;
    try {
      const pc = newPeer(stream);
      await pc.setRemoteDescription({ type: "offer", sdp: callUi.offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      const res = await fetch("/api/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "answer", id: callUi.id, answer: pc.localDescription?.sdp }) });
      if (!res.ok) {
        hangUpLocal();
        return setNotice("That call is no longer ringing.");
      }
      callSince.current = Date.now();
      setCallUi((u) => (u ? { ...u, status: "active" } : u));
    } catch {
      hangUpLocal();
      setNotice("Could not answer the call.");
    }
  }

  async function endCall() {
    const id = callUi?.id;
    hangUpLocal();
    if (id) {
      const next = await api("/api/rtc", "POST", { action: "end", id });
      if (next.contacts) setSnap(next);
    }
  }

  return { callUi, linked, remoteAudio, showTheirs, showMine, syncCall, placeCall, acceptCall, endCall };
}
