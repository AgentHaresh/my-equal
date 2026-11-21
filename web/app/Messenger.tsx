"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/snapshot";
import type { Answer } from "@/lib/ask";
import { RELATIONS } from "@/lib/relations";
import JobCard from "./JobCard";
import SignIn from "./SignIn";
import { BackIcon, ChatIcon, SparkIcon, TickIcon, ClipIcon, ClockIcon, FileIcon, GearIcon, MicIcon, PhoneIcon, SendIcon, StarIcon, StopIcon, VideoIcon } from "./Icons";

type Props = { role: "me" | "them" };
type Suggestion = Snapshot["suggestions"][number];
type Contact = Snapshot["contacts"][number];
type Pane = "chats" | "chat" | "equal";
type Msg = Snapshot["messages"][number];

const DAY = 86400000;

function ago(iso: string, now: number) {
  const ms = now - new Date(iso).getTime();
  if (ms < 60000) return "now";
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  if (ms < DAY) return `${Math.floor(ms / 3600000)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/** The day a message belongs to, the way a messenger heads each day: Today, Yesterday, then the date. */
function dayLabel(iso: string, now: number) {
  const d = new Date(iso);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: d.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

/** When a chat last moved, as a chat list shows it: the time today, "Yesterday", then the date. */
function listTime(iso: string, now: number) {
  const label = dayLabel(iso, now);
  if (label === "Today") return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (label === "Yesterday") return label;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "online", or how long ago someone was last here. */
function presenceWords(seenAt: string | null | undefined, now: number) {
  if (!seenAt) return null;
  if (seenAt === "online") return "online";
  const ms = now - new Date(seenAt).getTime();
  if (ms < 8000) return "online";
  if (ms < 3600000) return `last seen ${Math.max(1, Math.floor(ms / 60000))} min ago`;
  if (ms < DAY) return `last seen at ${new Date(seenAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
  return `last seen ${new Date(seenAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const param = (name: string) => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(name) : null);

/** The four-dot mark and wordmark, drawn in text so no logo file is needed. */
function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid grid-cols-2 gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[7px] w-[7px] rounded-full bg-equal-lime" />
        ))}
      </span>
      <span className="text-xl font-semibold tracking-tight text-white">Equal</span>
    </span>
  );
}

function Avatar({ name, picture, tone }: { name: string; picture?: string; tone?: string }) {
  if (picture)
    // A small profile photo served by Google; the image optimiser adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold ${tone ?? "bg-equal-lime text-equal-ink"}`}>{name[0]?.toUpperCase()}</span>
  );
}

const label = "text-[10px] font-semibold uppercase tracking-[0.18em]";

export default function Messenger({ role }: Props) {
  const isMe = role === "me";
  const [owner] = useState(() => param("u") ?? ""); // on the link-opened "other side", whose account the chat belongs to
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [auth, setAuth] = useState<{ checked: boolean; clientId: string; signedIn: boolean }>({ checked: !isMe, clientId: "", signedIn: !isMe });
  const [selected, setSelected] = useState(() => param("c") ?? "");
  // The first screen is the Equal home; a link straight to a chat opens that chat.
  const [pane, setPane] = useState<Pane>(() => (isMe ? (param("c") ? "chat" : "equal") : "chat"));
  const [newNumber, setNewNumber] = useState("");
  const [numberNote, setNumberNote] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<string | null>(null); // a number that is not on Equal yet
  const [inviteSms, setInviteSms] = useState<string | null>(null); // a link that opens the phone's own messages app
  // The person whose details are open on the home screen, and what is typed to find or add to them.
  const [personId, setPersonId] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState("");
  const [personFact, setPersonFact] = useState("");
  // Day or night. Remembered on this device.
  const [light, setLight] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("equal-theme") === "light");
  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
    window.localStorage.setItem("equal-theme", light ? "light" : "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f1f5fc" : "#050816");
  }, [light]);
  const [now, setNow] = useState(0); // refreshed with every poll, so rendering never reads the clock itself
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [reply, setReply] = useState<(Answer & { question: string }) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [recording, setRecording] = useState(false);
  const mic = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
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
  // Message actions: the open menu, the message being answered or edited, and a search result to jump to.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [starredOnly, setStarredOnly] = useState(false);
  const [inEnglish, setInEnglish] = useState<string[]>([]); // voice notes currently shown in English instead of the original
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reading = useRef(false);
  const version = useRef(""); // which version of my state this screen already holds
  const [forwarding, setForwarding] = useState<Msg | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  // Send later: the sheet for choosing when.
  const [laterOpen, setLaterOpen] = useState(false);
  const [laterWhen, setLaterWhen] = useState("");
  const [laterError, setLaterError] = useState<string | null>(null);
  // Setting a reminder, and Equal ringing about one.
  const [remindFor, setRemindFor] = useState<null | { id?: string; text: string }>(null);
  const [remindWhen, setRemindWhen] = useState("");
  const [remindCall, setRemindCall] = useState(true);
  const [remindBusy, setRemindBusy] = useState(false);
  const [remindMsg, setRemindMsg] = useState<null | { ok: boolean; text: string }>(null);
  const [ringing, setRinging] = useState<null | { id: string; what: string; at: string | null; answered: boolean; line?: string }>(null);
  const rung = useRef(new Set<string>());
  const reminderAudio = useRef<HTMLAudioElement>(null);

  const api = useCallback(
    async (url: string, method: string, body?: unknown): Promise<Snapshot & { contactId?: string; imported?: number; reminderSaid?: string; reminderError?: string; same?: boolean; v?: string }> => {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401 && isMe) setAuth((a) => ({ ...a, signedIn: false }));
      return res.json();
    },
    [isMe]
  );

  const checkAuth = useCallback(async () => {
    const a = await fetch("/api/auth").then((r) => r.json());
    setAuth({ checked: true, clientId: a.clientId ?? "", signedIn: Boolean(a.user) });
    if (a.user?.name) setMyName((n) => n || a.user.name);
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

  const refresh = useCallback(async () => {
    if (busy.current) return; // don't overwrite a send that is in flight
    try {
      const next = await api(isMe ? `/api/state?v=${version.current}` : `/api/state?friend=${encodeURIComponent(selected)}&u=${encodeURIComponent(owner)}`, "GET");
      if (next.same) return setNow(Date.now()); // nothing new: the server sent a few bytes, not the whole history
      if (next.contacts) {
        version.current = next.v ?? "";
        setSnap(next);
        setNow(Date.now());
        if (isMe) void syncCall(next.call);
        // A reminder is due: Equal rings, once.
        const due = isMe ? next.reminderCall : null;
        if (due && !rung.current.has(due.id)) {
          rung.current.add(due.id);
          setRinging({ ...due, answered: false });
        }
      }
    } catch {
      /* server restarting; the next poll will recover */
    }
  }, [api, isMe, selected, owner, syncCall]);

  useEffect(() => {
    if (!isMe) return;
    const t = setTimeout(checkAuth, 0);
    return () => clearTimeout(t);
  }, [isMe, checkAuth]);

  useEffect(() => {
    if (!auth.signedIn) return;
    const first = setTimeout(refresh, 0); // first load, then poll
    const t = setInterval(refresh, 1500);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh, auth.signedIn]);

  useEffect(() => {
    if (!isMe || !auth.signedIn || typeof EventSource === "undefined") return;
    const live = new EventSource("/api/live");
    live.onmessage = () => void refresh();
    return () => live.close();
  }, [isMe, auth.signedIn, refresh]);

  // Most recent conversation first, as any messenger lists them.
  const ordered = snap ? [...snap.contacts].sort((a, b) => b.lastContactAt.localeCompare(a.lastContactAt)) : [];
  const current = selected || ordered[0]?.id || "";
  const contact = snap?.contacts.find((c) => c.id === current);
  const thread = snap?.messages.filter((m) => m.contactId === current) ?? [];
  // Messages waiting to be sent sit below the thread, so they count towards where the chat rests.
  const threadLength = thread.length + (snap?.scheduled?.filter((x) => x.contactId === current).length ?? 0);

  useEffect(() => {
    // A search result is shown where it stands; otherwise the chat rests on its newest message.
    if (focusId) document.getElementById(`m-${focusId}`)?.scrollIntoView({ block: "center" });
    else endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadLength, current, pane, focusId]);

  // Having a chat open and in view marks it read: my unread count clears and their ticks turn.
  const openContact = snap?.contacts.find((c) => c.id === current);
  const unreadHere = isMe && openContact?.readAt ? (snap?.messages.filter((m) => m.contactId === current && m.from === "them" && m.at > (openContact.readAt ?? "")).length ?? 0) : 0;
  useEffect(() => {
    if (!unreadHere || reading.current) return;
    const inView = pane === "chat" && document.visibilityState === "visible";
    if (!inView) return;
    reading.current = true;
    const t = setTimeout(() => {
      api("/api/read", "POST", { contactId: current })
        .then((next) => {
          if (next.contacts) setSnap(next);
        })
        .catch(() => {})
        .finally(() => {
          reading.current = false;
        });
    }, 0);
    return () => {
      clearTimeout(t);
      reading.current = false;
    };
  }, [unreadHere, pane, current, api]);

  function open(id: string, focus: string | null = null) {
    // A half-typed message and a passing notice belong to the chat they were written in.
    if (id !== current) {
      setDraft("");
      setNotice(null);
      setReplyTo(null);
      setEditing(null);
    }
    setMenuFor(null);
    setFocusId(focus);
    setSelected(id);
    setPane("chat");
  }

  function startEdit(m: Msg) {
    setMenuFor(null);
    setReplyTo(null);
    setEditing(m.id);
    setDraft(m.text);
  }

  async function saveEdit() {
    const text = draft.trim();
    const id = editing;
    if (!text || !id || sending) return;
    setSending(true);
    busy.current = true;
    try {
      const next = await api("/api/messages", "PATCH", { id, text });
      if (next.contacts) setSnap(next);
      setNotice(next.contacts ? (next.error ? `Saved. Equal could not read it: ${next.error}` : null) : next.error ?? "Could not save the change.");
      setEditing(null);
      setDraft("");
    } catch {
      setNotice("Could not save the change. Check your connection.");
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  /** Send a photo or file. Whatever is typed in the box goes with it as the caption. */
  async function attach(file: File) {
    if (!current || sending) return;
    if (file.size > 8 * 1024 * 1024) return setNotice("That file is larger than 8 MB.");
    const caption = draft.trim();
    setSending(true);
    busy.current = true;
    setNotice(`Sending ${file.name}…`);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("contactId", current);
      form.set("caption", caption);
      const res = await fetch("/api/files", { method: "POST", body: form });
      const next = await res.json();
      if (next.contacts) {
        setSnap(next);
        setDraft("");
        setNotice(next.error ? `Sent. Equal could not read the caption: ${next.error}` : null);
      } else setNotice(next.error ?? "Could not send the file.");
    } catch {
      setNotice("Could not send the file. Check your connection.");
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  async function reactTo(m: Msg, emoji: string) {
    setMenuFor(null);
    const next = await api("/api/messages", "PATCH", { id: m.id, reaction: emoji });
    if (next.contacts) setSnap(next);
  }

  async function forwardTo(contactId: string) {
    const m = forwarding;
    if (!m) return;
    setForwarding(null);
    const next = await api("/api/messages", "POST", { forwardOf: m.id, contactId });
    if (next.contacts) {
      setSnap(next);
      open(contactId);
    } else setNotice(next.error ?? "Could not forward it.");
  }

  /** Is this browser already set to receive notifications? */
  async function checkPush() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      setPushOn(Boolean(await reg?.pushManager.getSubscription()));
    } catch {
      setPushOn(false);
    }
  }

  /** Turn notifications on or off for this browser. The browser asks the person first. */
  async function togglePush() {
    setPushNote(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ off: existing.endpoint }) });
        await existing.unsubscribe();
        return setPushOn(false);
      }
      if ((await Notification.requestPermission()) !== "granted") return setPushNote("Notifications are blocked for this site. Allow them in your browser's site settings.");
      const { key } = await (await fetch("/api/push")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!res.ok) throw new Error("refused");
      setPushOn(true);
      setPushNote("On. You will be told about messages, calls and reminders when My Equal is closed.");
    } catch {
      setPushNote("This browser cannot receive notifications here. On an iPhone, add My Equal to the Home Screen first, then try again.");
    }
  }

  async function starPerson(c: Contact) {
    const next = await api("/api/contacts", "POST", { contactId: c.id, starred: !c.starred });
    if (next.contacts) setSnap(next);
  }

  async function star(m: Msg) {
    setMenuFor(null);
    const next = await api("/api/messages", "PATCH", { id: m.id, starred: !m.starred });
    if (next.contacts) setSnap(next);
  }

  /** Write now, send at the chosen time. */
  async function sendLater(when: string) {
    const text = draft.trim();
    if (!text || !current) return;
    setLaterError(null);
    const next = await api("/api/scheduled", "POST", { action: "set", contactId: current, text, when });
    if (!next.contacts) return setLaterError(next.error ?? "Could not schedule it.");
    setSnap(next);
    setDraft("");
    setLaterOpen(false);
    setLaterWhen("");
  }

  async function cancelLater(id: string) {
    const next = await api("/api/scheduled", "POST", { action: "cancel", id });
    if (next.contacts) setSnap(next);
    else setNotice(next.error ?? "Could not cancel it.");
  }

  async function removeMessage(id: string) {
    setMenuFor(null);
    if (editing === id) {
      setEditing(null);
      setDraft("");
    }
    if (replyTo?.id === id) setReplyTo(null);
    const next = await api("/api/messages", "DELETE", { id });
    if (next.contacts) setSnap(next);
    else setNotice(next.error ?? "Could not delete it.");
  }

  function askReminder(target: { id?: string; text: string }) {
    setMenuFor(null);
    setRemindMsg(null);
    setRemindWhen("");
    setRemindFor(target);
  }

  /** Set the reminder. With no time given, Equal reads the words to find it. */
  async function setReminder(when?: string) {
    if (!remindFor || remindBusy) return;
    if (!remindFor.id && !remindFor.text.trim()) return setRemindMsg({ ok: false, text: "Say what to remind you about." });
    setRemindBusy(true);
    setRemindMsg(null);
    try {
      const next = await api("/api/remind", "POST", { action: "set", messageId: remindFor.id, text: remindFor.id ? undefined : remindFor.text, when, callMe: remindCall });
      if (next.contacts) setSnap(next);
      setRemindMsg(next.reminderSaid ? { ok: true, text: next.reminderSaid } : { ok: false, text: next.reminderError ?? next.error ?? "Could not set it." });
    } catch {
      setRemindMsg({ ok: false, text: "Could not set it. Check your connection." });
    } finally {
      setRemindBusy(false);
    }
  }

  /** Answer Equal's reminder call: it says the reminder aloud, and shows the words too. */
  async function answerReminder() {
    if (!ringing) return;
    const r = ringing;
    setRinging({ ...r, answered: true, line: `A reminder: ${r.what}${r.at ? `, at ${r.at}` : ""}.` });
    void api("/api/remind", "POST", { action: "rang", id: r.id });
    try {
      const res = await fetch(`/api/remind?id=${encodeURIComponent(r.id)}`);
      if (!res.ok) return;
      const line = decodeURIComponent(res.headers.get("X-Line") ?? "");
      if (line) setRinging((x) => (x && x.id === r.id ? { ...x, line } : x));
      const el = reminderAudio.current;
      if (el) {
        el.src = URL.createObjectURL(await res.blob());
        await el.play();
      }
    } catch {
      /* the words are on screen even if the voice could not play */
    }
  }

  function closeReminder() {
    if (ringing && !ringing.answered) void api("/api/remind", "POST", { action: "rang", id: ringing.id });
    reminderAudio.current?.pause();
    setRinging(null);
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending || !current) return;
    setSending(true);
    busy.current = true;
    setDraft("");
    // Show the message at once; Equal's reading of it arrives with the server's reply.
    const answering = replyTo?.id;
    setReplyTo(null);
    setFocusId(null);
    const pending = { id: `pending-${Date.now()}`, contactId: current, from: role, text, at: new Date().toISOString(), replyTo: answering };
    setSnap((s) => (s ? { ...s, messages: [...s.messages, pending] } : s));
    try {
      const next = await api("/api/messages", "POST", { contactId: current, from: role, text, u: owner, replyTo: answering });
      if (next.contacts) setSnap(next);
      setNotice(next.error && isMe ? `Message sent. Equal could not read it: ${next.error}` : null);
    } catch {
      setNotice("Could not send. Check your connection.");
      setDraft(text);
    } finally {
      busy.current = false;
      setSending(false);
    }
  }

  async function answer(s: Suggestion, action: "accept" | "dismiss") {
    const next = await api("/api/suggestions", "POST", { id: s.id, action });
    if (next.contacts) setSnap(next);
    if (action === "accept" && (s.type === "keep_close" || s.type === "follow_up")) open(s.contactId);
  }

  async function bookProvider(jobId: string, callId: string) {
    const next = await api("/api/jobs", "POST", { jobId, callId });
    if (next.contacts) setSnap(next);
  }

  async function startChat(userId: string) {
    const next = await api("/api/chats", "POST", { userId });
    if (next.contacts) setSnap(next);
    if (next.contactId) open(next.contactId);
  }

  /** Start a chat with someone by their phone number, if they are on My Equal. */
  async function startByNumber() {
    setNumberNote(null);
    const res = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: newNumber }) });
    const next = await res.json();
    setInviteSms(null);
    setInviteFor(res.status === 404 ? newNumber : null);
    if (!res.ok) return setNumberNote(res.status === 404 ? "That number is not on Equal yet. Invite them?" : (next.error ?? "Could not start that chat."));
    setSnap(next);
    setNewNumber("");
    if (next.contactId) open(next.contactId);
  }

  /** Tell Equal a fact about someone, typed by hand. */
  async function addFact(contactId: string) {
    const fact = personFact.trim();
    if (!fact) return;
    const next = await api("/api/memories", "POST", { action: "add", contactId, fact });
    if (next.contacts) {
      setSnap(next);
      setPersonFact("");
    }
  }

  /** Text the invitation to that number. If the server cannot, offer to send it from this phone. */
  async function sendInvite() {
    if (!inviteFor) return;
    setNumberNote("Sending the invitation…");
    try {
      const res = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: inviteFor }) });
      const r = await res.json();
      if (res.ok) {
        setInviteFor(null);
        setNewNumber("");
        return setNumberNote(`Invitation sent by text to ${r.phone}.`);
      }
      setNumberNote(r.error ?? "Could not send it.");
      if (r.phone && r.message) setInviteSms(`sms:${r.phone}?body=${encodeURIComponent(r.message)}`);
    } catch {
      setNumberNote("Could not send it. Check your connection.");
    }
  }

  const copyInvite = () => navigator.clipboard?.writeText(window.location.origin).then(() => setNumberNote("Invite link copied. Send it to them: " + window.location.origin));

  async function importChat(file: File) {
    if (!myName.trim()) return setNotice("Enter your name as it appears in the export first.");
    setNotice("Reading the chat…");
    const next = await api("/api/import", "POST", { text: await file.text(), myName });
    if (next.contacts) setSnap(next);
    if (next.contactId) open(next.contactId);
    setNotice(next.imported ? `Imported ${next.imported} messages.${next.error ? ` Equal could not read them: ${next.error}` : ""}` : next.error);
  }

  async function askQuestion() {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const answer = await res.json();
      setReply({ ...answer, question: q });
      setQuestion("");
      if (answer.remembered) void refresh();
    } finally {
      setAsking(false);
    }
  }

  /** Voice note: tap to start, tap again to send. It is transcribed and then treated like a typed message. */
  async function toggleVoice() {
    if (recording) return recorder.current?.stop();
    if (!current) return;
    try {
      if (!mic.current) mic.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setNotice("The microphone is blocked. Allow it in your browser to send voice notes.");
    }
    chunks.current = [];
    const rec = new MediaRecorder(mic.current);
    const to = current;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = async () => {
      setRecording(false);
      setSending(true);
      busy.current = true;
      setNotice("Sending your voice note…");
      try {
        const type = (rec.mimeType || "audio/webm").split(";")[0];
        const form = new FormData();
        form.append("contactId", to);
        form.append("audio", new Blob(chunks.current, { type }), `note.${type.split("/")[1] ?? "webm"}`);
        const res = await fetch("/api/voicenote", { method: "POST", body: form });
        const next = await res.json();
        if (next.contacts) setSnap(next);
        setNotice(next.contacts ? (next.error ? `Voice note sent. Equal could not read it: ${next.error}` : null) : next.error ?? "Could not send the voice note.");
      } catch {
        setNotice("Could not send the voice note. Check your connection.");
      } finally {
        busy.current = false;
        setSending(false);
      }
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    setNotice("Recording… tap the red button to send.");
  }

  /** Put a draft in the message box, written the way I write. I still edit and send it myself. */
  async function draftFor(s: Suggestion) {
    open(s.contactId);
    setNotice("Drafting something you could say…");
    const res = await fetch("/api/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: s.contactId, about: s.detail }) });
    const d = await res.json();
    if (d.draft) setDraft(d.draft);
    setNotice(d.draft ? "A draft is in the box. Edit it and send it yourself." : d.error ?? "Could not write a draft.");
  }

  async function forget(id: string) {
    const next = await api("/api/memories", "POST", { id });
    if (next.contacts) setSnap(next);
  }

  /** Shrink a photo in the browser before sending it, so uploads are quick on a phone. */
  async function shrink(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
  }

  async function addPhoto(file: File) {
    setNotice("Reading the photo…");
    try {
      const form = new FormData();
      form.append("image", await shrink(file), "photo.jpg");
      const res = await fetch("/api/photo", { method: "POST", body: form });
      const next = await res.json();
      if (next.contacts) setSnap(next);
      if (next.photo?.error) return setNotice(next.photo.error);
      if (next.contactId) open(next.contactId);
      setNotice(`Saved "${next.photo.title}". ${next.photo.added} thing${next.photo.added === 1 ? "" : "s"} to remember.`);
    } catch {
      setNotice("Could not read that photo. Please try again.");
    }
  }

  async function describe(contactId: string, change: { relation?: string; close?: boolean }) {
    const next = await api("/api/contacts", "POST", { contactId, ...change });
    if (next.contacts) setSnap(next);
  }

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

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    setSnap(null);
    setAuth((a) => ({ ...a, signedIn: false }));
  }

  if (!auth.checked) return <div className="flex h-screen items-center justify-center text-white/80">Loading…</div>;
  if (!auth.signedIn) return <SignIn clientId={auth.clientId} onDone={checkAuth} />;
  if (!snap) return <div className="flex h-screen items-center justify-center text-white/80">Loading…</div>;
  if (!isMe && !contact) return <div className="flex h-screen items-center justify-center px-6 text-center text-white/80">This link is not valid.</div>;

  const me = snap.me;
  const offers = snap.suggestions.filter((s) => s.status === "new");
  const reminders = offers.filter((s) => s.type === "reminder");
  const rank: Record<string, number> = { guardian: 0, intent: 1, keep_close: 2, follow_up: 3 };
  const others = offers.filter((s) => s.type !== "reminder").sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9));
  // An offer waiting for an answer, a call-around in progress or a family alert is "right now" and leads the panel.
  const urgent = snap.jobs.some((j) => j.status !== "booked") || others.some((s) => s.type === "guardian" || s.type === "intent");
  const inlineOffer = offers.find((s) => s.type === "intent" && s.contactId === current);
  const quiet = new Map(snap.gateLog.filter((g) => !g.spoke).map((g) => [g.messageId, g.reason]));
  const known = new Set(snap.contacts.map((c) => c.userId).filter(Boolean));
  const strangers = snap.people.filter((p) => !known.has(p.id));
  const panel = "border-white/10 bg-equal-card/70 backdrop-blur-xl md:rounded-3xl md:border md:shadow-2xl md:shadow-black/40";
  const hour = new Date(now).getHours();
  const greeting = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const show = (p: Pane) => (pane === p ? "flex" : "hidden");
  const side = (c: Contact) => `/friend?u=${me?.id ?? ""}&c=${c.id}`;
  const nameOf = (id: string) => snap.contacts.find((c) => c.id === id)?.name ?? "";
  // People on the home screen: found by typing a name or number; the open chat's person by default.
  const people = ordered.filter((c) => c.id !== "self");
  const personNeedle = personQuery.trim().toLowerCase().replace(/\s+/g, " ");
  const digits = personNeedle.replace(/\D/g, "");
  const peopleShown = personNeedle ? people.filter((c) => c.name.toLowerCase().includes(personNeedle) || (digits.length >= 4 && c.name.replace(/\D/g, "").includes(digits))).slice(0, 12) : people.slice(0, 8);
  const person = people.find((c) => c.id === personId) ?? people.find((c) => c.id === current) ?? null;
  const personMemories = person ? snap.memories.filter((m) => m.contactId === person.id && m.status === "open") : [];
  const unreadOf = (c: Contact) => (c.readAt ? snap.messages.filter((m) => m.contactId === c.id && m.from === "them" && !m.deleted && m.at > (c.readAt ?? "")).length : 0);
  const unreadTotal = snap.contacts.reduce((n, c) => n + unreadOf(c), 0);
  const status = contact?.userId ? presenceWords(snap.presence[contact.id], now) : null;
  const setDemo = async (on: boolean) => {
    setSettingsOpen(false);
    const next = await api("/api/demo", "POST", { on });
    if (next.contacts) setSnap(next);
  };
  const waiting = snap.scheduled.filter((x) => x.contactId === current).sort((a, b) => a.at.localeCompare(b.at));
  const canSchedule = isMe && Boolean(contact) && !contact?.unknown && contact?.id !== "self";
  const whenWords = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  // Search runs over every chat on this device: people by name, messages by their words.
  const needle = search.trim().toLowerCase();
  const searching = needle.length >= 2 || starredOnly;
  const foundPeople = searching ? ordered.filter((c) => (!starredOnly || c.starred) && (needle.length < 2 || c.name.toLowerCase().includes(needle))) : [];
  const foundMessages = searching
    ? snap.messages
        .filter((m) => m.from !== "butler" && !m.deleted && (!starredOnly || m.starred) && (needle.length < 2 || `${m.text} ${m.file?.name ?? ""}`.toLowerCase().includes(needle)))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 40)
    : [];

  return (
    <div className="flex h-dvh w-full flex-col text-white md:gap-3 md:p-4">
      <audio ref={remoteAudio} autoPlay className="hidden" />
      {callUi && (
        <div className={`fixed inset-0 z-50 flex flex-col items-center gap-7 bg-equal-deep/95 px-8 text-center text-white backdrop-blur ${callUi.video && linked ? "justify-end pb-10" : "justify-center"}`}>
          {callUi.video && (
            <>
              {/* Their picture fills the screen once connected; mine sits in the corner. Sound plays through the audio element. */}
              <video ref={showTheirs} autoPlay playsInline muted className={`absolute inset-0 -z-10 h-full w-full bg-equal-ink object-cover ${linked ? "" : "hidden"}`} />
              <video ref={showMine} autoPlay playsInline muted className="absolute right-4 top-4 h-40 w-28 -scale-x-100 rounded-2xl border-2 border-white/70 bg-equal-ink object-cover shadow-xl" />
            </>
          )}
          {!(callUi.video && linked) && (
            <span className={`flex h-28 w-28 items-center justify-center rounded-full bg-equal-lime text-5xl font-bold text-equal-ink ${callUi.status === "ringing" ? "animate-pulse" : ""}`}>
              {callUi.name[0]?.toUpperCase()}
            </span>
          )}
          <div className={callUi.video && linked ? "rounded-2xl bg-equal-ink/60 px-5 py-2" : ""}>
            <div className={`font-display text-equal-lime ${callUi.video && linked ? "text-2xl" : "text-4xl"}`}>{callUi.name}</div>
            <div className="mt-1 text-lg text-white/90">
              {callUi.status === "ringing" ? (callUi.role === "caller" ? (callUi.video ? "Video calling…" : "Calling…") : callUi.video ? "is video calling you" : "is calling you") : linked ? "Connected" : "Connecting…"}
            </div>
          </div>
          <div className="flex gap-4">
            {callUi.role === "callee" && callUi.status === "ringing" && (
              <button onClick={acceptCall} className="rounded-full bg-equal-lime px-9 py-4 text-lg font-bold text-equal-ink shadow-xl">
                Answer
              </button>
            )}
            <button onClick={endCall} className="rounded-full bg-rose-500 px-9 py-4 text-lg font-bold text-white shadow-xl">
              {callUi.role === "callee" && callUi.status === "ringing" ? "Decline" : "Hang up"}
            </button>
          </div>
          <div className="text-xs text-white/60">{callUi.video ? "Your call travels directly between your two phones." : "Your voices travel directly between your two phones."}</div>
        </div>
      )}
      <audio ref={reminderAudio} className="hidden" />
      {ringing && !callUi && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-equal-deep/95 px-8 text-center text-white backdrop-blur">
          <span className={`flex h-28 w-28 items-center justify-center rounded-full bg-equal-lime font-display text-6xl text-equal-ink ${ringing.answered ? "" : "animate-pulse"}`}>e</span>
          <div>
            <div className="font-display text-4xl text-equal-lime">Your Equal</div>
            <div className="mt-2 text-lg text-white/90">{ringing.answered ? "Reminder call" : "is calling you with a reminder"}</div>
          </div>
          {ringing.answered && <div className="max-w-sm rounded-2xl bg-white px-5 py-4 text-lg font-medium text-equal-ink shadow-xl">{ringing.line}</div>}
          <div className="flex gap-4">
            {!ringing.answered && (
              <button onClick={answerReminder} className="rounded-full bg-equal-lime px-9 py-4 text-lg font-bold text-equal-ink shadow-xl">
                Answer
              </button>
            )}
            <button onClick={closeReminder} className={`rounded-full px-9 py-4 text-lg font-bold shadow-xl ${ringing.answered ? "bg-equal-lime text-equal-ink" : "bg-rose-500 text-white"}`}>
              {ringing.answered ? "Got it" : "Dismiss"}
            </button>
          </div>
          <div className="text-xs text-white/60">An AI voice. It rings while My Equal is open.</div>
        </div>
      )}
      {forwarding && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-equal-ink/60 p-3 sm:items-center" onClick={() => setForwarding(null)}>
          <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-3xl bg-white p-5 text-equal-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-2xl text-equal-deep">Forward to</div>
            <div className="mt-2 line-clamp-2 rounded-xl border-l-4 border-equal-sky bg-blue-50 px-3 py-2 text-sm">{forwarding.text || forwarding.file?.name}</div>
            <ul className="mt-3 flex-1 overflow-y-auto">
              {ordered
                .filter((c) => !c.unknown && c.id !== forwarding.contactId)
                .map((c) => (
                  <li key={c.id}>
                    <button onClick={() => forwardTo(c.id)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-blue-50">
                      <Avatar name={c.name} picture={c.picture} />
                      <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    </button>
                  </li>
                ))}
              {ordered.filter((c) => !c.unknown && c.id !== forwarding.contactId).length === 0 && <li className="py-4 text-center text-sm text-equal-ink/60">You have no other chats yet.</li>}
            </ul>
            <button onClick={() => setForwarding(null)} className="mt-2 w-full py-1 text-sm text-equal-ink/60">
              Cancel
            </button>
          </div>
        </div>
      )}
      {laterOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-equal-ink/60 p-3 sm:items-center" onClick={() => setLaterOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 text-equal-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-2xl text-equal-deep">Send later</div>
            <div className="mt-2 line-clamp-3 rounded-xl border-l-4 border-equal-sky bg-blue-50 px-3 py-2 text-sm">{draft}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["In 1 minute", 1],
                  ["In 1 hour", 60],
                  ["In 3 hours", 180],
                  ["This time tomorrow", 1440],
                ] as const
              ).map(([name, mins]) => (
                <button key={name} onClick={() => sendLater(new Date(Date.now() + mins * 60000).toISOString())} className="rounded-full border border-blue-200 px-3 py-1.5 text-sm font-medium text-equal-sky">
                  {name}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input type="datetime-local" value={laterWhen} onChange={(e) => setLaterWhen(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-blue-200 px-3 py-1.5 text-sm" />
              <button disabled={!laterWhen} onClick={() => sendLater(new Date(laterWhen).toISOString())} className="rounded-full bg-equal-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                Set
              </button>
            </div>
            {laterError && <div className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-800">{laterError}</div>}
            <p className="mt-3 text-xs text-equal-ink/60">It goes out at that time even if My Equal is closed. Until then you can cancel it from the chat.</p>
            <button onClick={() => setLaterOpen(false)} className="mt-2 w-full py-1 text-sm text-equal-ink/60">
              Cancel
            </button>
          </div>
        </div>
      )}
      {remindFor && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-equal-ink/60 p-3 sm:items-center" onClick={() => setRemindFor(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 text-equal-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-2xl text-equal-deep">Remind me</div>
            {remindFor.id ? (
              <div className="mt-2 line-clamp-3 rounded-xl border-l-4 border-equal-sky bg-blue-50 px-3 py-2 text-sm">{remindFor.text}</div>
            ) : (
              <input
                autoFocus
                value={remindFor.text}
                onChange={(e) => setRemindFor({ text: e.target.value })}
                placeholder="Flight to Delhi tomorrow 7:15 pm"
                className="mt-2 w-full rounded-xl border border-blue-200 px-3 py-2 text-sm outline-none focus:border-equal-sky"
              />
            )}
            {remindMsg?.ok ? (
              <>
                <div className="mt-3 rounded-xl bg-equal-lime px-3 py-2.5 text-sm font-medium">{remindMsg.text}</div>
                <button onClick={() => setRemindFor(null)} className="mt-3 w-full rounded-full bg-equal-sky py-2.5 font-semibold text-white">
                  Done
                </button>
              </>
            ) : (
              <>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={remindCall} onChange={(e) => setRemindCall(e.target.checked)} className="h-4 w-4 accent-[#0c63d0]" />
                  Have Equal call me, well before time
                </label>
                <button onClick={() => setReminder()} disabled={remindBusy} className="mt-3 w-full rounded-full bg-equal-sky py-2.5 font-semibold text-white disabled:opacity-50">
                  {remindBusy ? "Working it out…" : "Need AI help: let Equal work out when"}
                </button>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-equal-ink/50">Or pick the time yourself</div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(
                    [
                      ["In 1 minute", 1],
                      ["In 1 hour", 60],
                      ["In 3 hours", 180],
                      ["This time tomorrow", 1440],
                    ] as const
                  ).map(([name, mins]) => (
                    <button key={name} disabled={remindBusy} onClick={() => setReminder(new Date(Date.now() + mins * 60000).toISOString())} className="rounded-full border border-blue-200 px-3 py-1.5 text-sm font-medium text-equal-sky disabled:opacity-50">
                      {name}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input type="datetime-local" value={remindWhen} onChange={(e) => setRemindWhen(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-blue-200 px-3 py-1.5 text-sm" />
                  <button disabled={remindBusy || !remindWhen} onClick={() => setReminder(new Date(remindWhen).toISOString())} className="rounded-full bg-equal-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                    Set
                  </button>
                </div>
                {remindMsg && <div className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-800">{remindMsg.text}</div>}
                <button onClick={() => setRemindFor(null)} className="mt-3 w-full py-1 text-sm text-equal-ink/60">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <header className={`safe-top items-center justify-between px-4 py-2.5 md:flex md:px-2 md:py-0 ${isMe && pane === "chat" ? "hidden" : "flex"}`}>
        <Wordmark />
        {isMe && me ? (
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
                  <a href="/api/export" download className="mt-2 block rounded-full border border-blue-200 px-3 py-1.5 text-center text-sm font-medium text-equal-sky">
                    Export all my chats
                  </a>
                  <button onClick={() => setDemo(!snap.demo)} className="mt-2 w-full rounded-full border border-blue-200 px-3 py-1.5 text-sm font-medium text-equal-sky">
                    {snap.demo ? "Remove the demo chats" : "Try it with demo chats"}
                  </button>
                  <p className="mt-1 text-[11px] leading-snug text-equal-ink/55">{snap.demo ? "Demo chats are made-up people, marked DEMO. Your real chats are separate." : "Adds a few made-up people, marked DEMO, so you can try every feature."}</p>
                  <button onClick={signOut} className="mt-2 w-full rounded-full bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white">
                    Sign out
                  </button>
                </div>
              </>
            )}
          </span>
        ) : (
          <span className={`${label} rounded-full bg-equal-lime px-3 py-1 text-equal-ink`}>Builders 2026</span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 md:gap-3">
        {isMe && (
          <aside className={`${panel} ${show("chats")} w-full shrink-0 flex-col overflow-hidden md:flex md:w-80`}>
            <div className="hidden px-3 pt-3 md:block">
              <button onClick={() => setPane("equal")} aria-current={pane !== "chat"} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold transition ${pane !== "chat" ? "bg-white/10 text-equal-lime" : "text-white/85 hover:bg-white/5"}`}>
                <SparkIcon />
                My Equal
                {offers.length > 0 && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-equal-lime px-1.5 text-[11px] font-bold text-equal-ink">{offers.length}</span>}
              </button>
            </div>
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <span className="font-display text-2xl text-equal-lime">Chats</span>
              {unreadTotal > 0 && <span className="rounded-full bg-equal-lime px-2 py-0.5 text-xs font-bold text-equal-ink">{unreadTotal} new</span>}
            </div>
            <div className="flex gap-2 px-3 pb-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people and messages"
                aria-label="Search people and messages"
                className="min-w-0 flex-1 rounded-full border border-white/30 bg-white/10 px-3.5 py-2 text-sm outline-none placeholder:text-white/55 focus:border-equal-lime"
              />
              <button
                onClick={() => setStarredOnly(!starredOnly)}
                aria-pressed={starredOnly}
                aria-label="Starred people and messages"
                title="Starred"
                className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold ${starredOnly ? "bg-equal-lime text-equal-ink" : "border border-white/30 text-white/85"}`}
              >
                <StarIcon filled={starredOnly} className="h-[18px] w-[18px]" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                startByNumber();
              }}
              className="flex gap-2 px-3 pb-2"
            >
              <input
                type="tel"
                inputMode="tel"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="New chat: phone number"
                aria-label="Start a chat by phone number"
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm outline-none placeholder:text-white/45 focus:border-equal-lime"
              />
              <button disabled={newNumber.replace(/\D/g, "").length < 10} aria-label="Start chat" className="shrink-0 rounded-full bg-equal-lime px-3.5 py-2 text-sm font-bold text-equal-ink disabled:opacity-30">
                +
              </button>
            </form>
            {numberNote && (
              <div className="px-5 pb-2 text-xs text-amber-200">
                <p className="break-words">{numberNote}</p>
                {inviteFor && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <button onClick={sendInvite} className="rounded-full bg-equal-lime px-3 py-1 text-xs font-bold text-equal-ink">
                      Text them the invite
                    </button>
                    {inviteSms && (
                      <a href={inviteSms} className="rounded-full bg-equal-sky px-3 py-1 text-xs font-bold text-white">
                        Send from my phone
                      </a>
                    )}
                    <button onClick={copyInvite} className="rounded-full border border-white/30 px-3 py-1 text-xs font-semibold text-white/90">
                      Copy link
                    </button>
                  </div>
                )}
              </div>
            )}
            {searching && (
              <ul className="flex-1 overflow-y-auto px-2 pb-2">
                {foundPeople.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => { setSearch(""); open(c.id); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-white/10">
                      <Avatar name={c.unknown ? "?" : c.name} picture={c.picture} />
                      <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    </button>
                  </li>
                ))}
                {foundMessages.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => open(m.contactId, m.id)} className="block w-full rounded-2xl px-3 py-2 text-left hover:bg-white/10">
                      <span className="flex items-baseline justify-between gap-2 text-xs text-white/65">
                        <span className="truncate font-semibold text-equal-lime">{m.from === "me" ? `You, to ${nameOf(m.contactId)}` : nameOf(m.contactId)}</span>
                        <span className="shrink-0">{new Date(m.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      </span>
                      <span className="line-clamp-2 text-sm text-white/90">{m.text || m.file?.name}</span>
                    </button>
                  </li>
                ))}
                {foundPeople.length + foundMessages.length === 0 && (
                  <li className="px-3 py-4 text-sm text-white/70">{starredOnly && needle.length < 2 ? "Nothing starred yet. Open a chat and tap the star at the top to star a person, or tap a message and choose Star." : <>Nothing found for &ldquo;{search.trim()}&rdquo;.</>}</li>
                )}
              </ul>
            )}
            <ul className={`flex-1 overflow-y-auto px-2 pb-2 ${searching ? "hidden" : ""}`}>
              {ordered.length === 0 && (
                <li className="px-3 pb-3 pt-2">
                  <div className="rounded-3xl bg-white/10 p-5">
                    <div className="font-display text-2xl text-equal-lime">Welcome{me ? `, ${me.name.split(/\s+/)[0]}` : ""}</div>
                    <p className="mt-2 text-sm leading-relaxed text-white/90">This is your messenger, with a second you inside it. Start a chat and your Equal begins remembering what matters, reminding you, and keeping you close to your people.</p>
                    <ol className="mt-4 space-y-2.5 text-sm text-white/90">
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-equal-lime text-xs font-bold text-equal-ink">1</span>
                        <span>{strangers.length ? "Pick someone below to start a chat." : "Ask a friend to open this page and sign in. They will appear here."}</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-equal-lime text-xs font-bold text-equal-ink">2</span>
                        <span>
                          Bring in a chat you already have, from the{" "}
                          <button onClick={() => setPane("equal")} className="font-semibold text-equal-lime underline">
                            Equal tab
                          </button>
                          .
                        </span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-equal-lime text-xs font-bold text-equal-ink">3</span>
                        <span>
                          Or{" "}
                          <button onClick={() => setDemo(true)} className="font-semibold text-equal-lime underline">
                            try it with demo chats
                          </button>{" "}
                          first.
                        </span>
                      </li>
                    </ol>
                    <button
                      onClick={() => navigator.clipboard?.writeText(window.location.origin).then(() => setNotice("Link copied. Send it to a friend."))}
                      className="mt-4 w-full rounded-full bg-equal-lime py-2.5 text-sm font-bold text-equal-ink"
                    >
                      Copy invite link
                    </button>
                  </div>
                </li>
              )}
              {ordered.map((c) => {
                const last = snap.messages.filter((m) => m.contactId === c.id && m.from !== "butler").at(-1);
                const drifting = c.close && now - new Date(c.lastContactAt).getTime() > 14 * DAY;
                const active = c.id === current;
                const flagged = snap.messages.some((m) => m.contactId === c.id && m.scam);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => open(c.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${active ? "bg-white/15 md:bg-white/20" : "hover:bg-white/10"}`}
                    >
                      <Avatar
                        name={c.unknown ? "?" : c.name}
                        picture={c.picture}
                        tone={flagged ? "bg-rose-500 text-white" : c.unknown ? "bg-white/25 text-white" : undefined}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">
                            {c.starred && <span className="mr-1 text-equal-lime">★</span>}
                            {c.name}
                            {c.sample && <span className="ml-1.5 rounded bg-white/15 px-1 text-[9px] font-normal uppercase tracking-wider text-white/70">demo</span>}
                          </span>
                          <span className={`shrink-0 text-xs ${unreadOf(c) || drifting ? "font-semibold text-equal-lime" : "text-white/60"}`}>{drifting ? `${ago(c.lastContactAt, now)} quiet` : listTime(c.lastContactAt, now)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          {!flagged && last?.from === "me" && !last.deleted && <TickIcon double={Boolean(last.readAt)} className={`shrink-0 ${last.readAt ? "text-equal-lime" : "text-white/55"}`} />}
                          <span className={`min-w-0 flex-1 truncate text-sm ${flagged ? "font-semibold text-rose-200" : unreadOf(c) ? "font-medium text-white" : "text-white/70"}`}>
                            {flagged ? "Looks like a scam" : last?.deleted ? "Message deleted" : last ? (last.voice ? "Voice note: " : "") + (last.text || (last.file ? `Sent a file: ${last.file.name}` : "")) : c.relation}
                          </span>
                          {unreadOf(c) > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-equal-lime px-1.5 text-[11px] font-bold text-equal-ink">{unreadOf(c)}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {strangers.length > 0 && (
                <li className="mt-3 px-3">
                  <div className={`${label} mb-1 text-white/60`}>People here</div>
                </li>
              )}
              {strangers.map((p) => (
                <li key={p.id}>
                  <button onClick={() => startChat(p.id)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-white/10">
                    <Avatar name={p.name} picture={p.picture} tone="bg-white/25 text-white" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="rounded-full bg-equal-lime px-2.5 py-0.5 text-xs font-semibold text-equal-ink">Chat</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <main className={`night ${show("chat")} min-w-0 flex-1 flex-col overflow-hidden md:rounded-3xl md:border md:border-white/10 md:shadow-2xl md:shadow-black/40`}>
          <header className="safe-top flex items-center justify-between gap-2 border-b border-blue-100 bg-white px-2 py-2 md:px-4 md:py-3">
            <div className="flex min-w-0 items-center gap-2">
              {isMe && (
                <button onClick={() => setPane("chats")} className="relative rounded-full p-2 text-equal-sky md:hidden" aria-label="Back to chats">
                  <BackIcon />
                  {unreadTotal - unreadHere > 0 && <span className="absolute -right-0.5 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-equal-sky px-1 text-[10px] font-bold text-white">{unreadTotal - unreadHere}</span>}
                </button>
              )}
              {contact && <Avatar name={contact.unknown ? "?" : contact.name} picture={contact.picture} tone={contact.unknown ? "bg-blue-100 text-equal-sky" : undefined} />}
              <div className="min-w-0">
                <div className="truncate font-semibold leading-tight">{isMe ? contact?.name ?? "My Equal" : `You are ${contact?.name}`}</div>
                <div className={`truncate text-xs ${status === "online" ? "font-medium text-emerald-600" : "text-equal-ink/60"}`}>{isMe ? status ?? contact?.relation ?? "Pick a chat to begin" : "Your side of the chat. Equal is not visible here."}</div>
              </div>
            </div>
            {isMe && contact?.sample && (
              <a href={side(contact)} target="_blank" className="shrink-0 text-xs font-medium text-equal-sky underline">
                Open their side
              </a>
            )}
            {isMe && contact && !contact.unknown && (
              <span className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => starPerson(contact)} aria-label={contact.starred ? `Remove ${contact.name} from Starred` : `Add ${contact.name} to Starred`} aria-pressed={Boolean(contact.starred)} title="Star" className={`rounded-full p-2 ${contact.starred ? "text-amber-500" : "text-equal-ink/40 hover:text-equal-sky"}`}>
                  <StarIcon filled={Boolean(contact.starred)} />
                </button>
                {contact.userId && (
                  <>
                    <button onClick={() => placeCall(contact)} aria-label={`Call ${contact.name}`} title="Call" className="rounded-full bg-equal-sky p-2 text-white">
                      <PhoneIcon />
                    </button>
                    <button onClick={() => placeCall(contact, true)} aria-label={`Video call ${contact.name}`} title="Video call" className="rounded-full border border-equal-sky p-2 text-equal-sky">
                      <VideoIcon />
                    </button>
                  </>
                )}
              </span>
            )}
          </header>

          <div className="chat-ground flex-1 space-y-1.5 overflow-y-auto px-3 py-4 md:px-5">
            {!contact && (
              <div className="mx-auto mt-16 max-w-xs text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-equal-sky text-white">
                  <ChatIcon className="h-8 w-8" />
                </div>
                <div className="mt-4 font-display text-2xl text-equal-deep">Your chats live here</div>
                <p className="mt-2 text-sm text-equal-ink/60">Pick a person to start. Everything your Equal learns stays private to you.</p>
              </div>
            )}
            {contact && thread.length === 0 && (
              <div className="mx-auto mt-10 max-w-xs rounded-2xl bg-white/80 px-4 py-3 text-center text-sm text-equal-ink/60 shadow-sm">No messages yet. Say hello to {contact.name}.</div>
            )}
            {thread.map((m, index) => {
              const heading = index === 0 || dayLabel(thread[index - 1].at, now) !== dayLabel(m.at, now) ? dayLabel(m.at, now) : null;
              const body = (() => {
              if (m.from === "butler")
                return (
                  <div key={m.id} className="flex justify-center">
                    <div className="max-w-[85%] rounded-2xl bg-equal-lime px-3.5 py-2 text-center text-sm text-equal-ink shadow-sm">
                      <span className="font-semibold">Equal · only you see this.</span> {m.text}
                    </div>
                  </div>
                );
              const mine = m.from === role;
              if (m.deleted)
                return (
                  <div key={m.id} id={`m-${m.id}`} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div className="rounded-2xl border border-dashed border-equal-ink/20 px-3.5 py-2 text-sm italic text-equal-ink/50">{mine ? "You deleted this message" : "This message was deleted"}</div>
                  </div>
                );
              const quoted = m.replyTo ? thread.find((x) => x.id === m.replyTo) : undefined;
              const canAct = isMe && !m.id.startsWith("pending-");
              return (
                <div key={m.id} id={`m-${m.id}`} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <div
                    onClick={
                      canAct
                        ? (e) => {
                            const row = e.currentTarget.parentElement;
                            setMenuFor(menuFor === m.id ? null : m.id);
                            setTimeout(() => row?.scrollIntoView({ block: "nearest" }), 60); // keep the menu in view
                          }
                        : undefined
                    }
                    className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-sm ${mine ? "rounded-br-md bg-equal-sky text-white" : "rounded-bl-md bg-white"} ${canAct ? "cursor-pointer" : ""} ${focusId === m.id ? "ring-4 ring-equal-lime" : ""}`}
                  >
                    {m.forwarded && <span className={`mb-0.5 block text-[11px] italic ${mine ? "text-white/75" : "text-equal-ink/50"}`}>Forwarded</span>}
                    {m.replyTo && (
                      <span className={`mb-1 block rounded-lg border-l-4 px-2 py-1 text-[13px] ${mine ? "border-equal-lime bg-white/15 text-white/90" : "border-equal-sky bg-blue-50 text-equal-ink/75"}`}>
                        <span className="block text-[11px] font-semibold">{quoted ? (quoted.from === role ? "You" : isMe ? contact?.name : "Them") : "Message"}</span>
                        <span className="line-clamp-2">{!quoted ? "Not available" : quoted.deleted ? "Deleted message" : quoted.text}</span>
                      </span>
                    )}
                    {m.voice && (
                      <span className={`mb-0.5 block text-[10px] font-semibold uppercase tracking-wider ${mine ? "text-white/75" : "text-equal-sky"}`}>
                        Voice note{m.voice.language ? ` · ${m.voice.language}` : ""}
                      </span>
                    )}
                    {m.file &&
                      (/^image\/(png|jpeg|gif|webp)$/.test(m.file.type) ? (
                        <a href={`/api/files?id=${m.file.id}`} target="_blank" onClick={(e) => e.stopPropagation()} className="mb-1 block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/files?id=${m.file.id}`} alt={m.file.name} className="max-h-72 rounded-xl" />
                        </a>
                      ) : (
                        <a href={`/api/files?id=${m.file.id}`} download={m.file.name} onClick={(e) => e.stopPropagation()} className={`mb-1 flex items-center gap-2 rounded-xl px-2.5 py-2 ${mine ? "bg-white/15" : "bg-blue-50"}`}>
                          <FileIcon className="shrink-0" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{m.file.name}</span>
                            <span className="block text-[11px] opacity-70">{m.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(m.file.size / 1024))} KB` : `${(m.file.size / 1024 / 1024).toFixed(1)} MB`} · tap to download</span>
                          </span>
                        </a>
                      ))}
                    {m.voice?.english && inEnglish.includes(m.id) ? m.voice.english : m.text}
                    <span className={`ml-2 whitespace-nowrap text-[10px] ${mine ? "text-white/70" : "text-equal-ink/40"}`}>
                      {m.starred ? "★ " : ""}
                      {m.editedAt ? "edited · " : ""}
                      {new Date(m.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                      {mine && isMe && <TickIcon double={Boolean(m.readAt)} className={`ml-1 inline-block align-[-3px] ${m.readAt ? "text-equal-lime" : "text-white/70"}`} />}
                    </span>
                    {m.voice?.english && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInEnglish(inEnglish.includes(m.id) ? inEnglish.filter((x) => x !== m.id) : [...inEnglish, m.id]);
                        }}
                        className={`mt-1 block text-[12px] font-semibold underline ${mine ? "text-white/85" : "text-equal-sky"}`}
                      >
                        {inEnglish.includes(m.id) ? "Show original" : "Translate to English"}
                      </button>
                    )}
                  </div>
                  {(m.reactions?.me || m.reactions?.them) && (
                    <div className={`-mt-1.5 flex gap-0.5 rounded-full border border-blue-100 bg-white px-1.5 py-0.5 text-sm shadow-sm ${mine ? "mr-2" : "ml-2"}`} aria-label="Reactions">
                      {m.reactions.them && <span>{m.reactions.them}</span>}
                      {m.reactions.me && m.reactions.me !== m.reactions.them && <span>{m.reactions.me}</span>}
                      {m.reactions.me && m.reactions.me === m.reactions.them && <span className="text-[11px] font-semibold text-equal-ink/60">2</span>}
                    </div>
                  )}
                  {canAct && menuFor === m.id && (
                    <div className="mt-1 flex gap-1 rounded-full bg-white px-2 py-1 shadow">
                      {REACTIONS.map((e) => (
                        <button key={e} onClick={() => reactTo(m, e)} aria-label={`React ${e}`} className={`rounded-full px-1.5 text-xl leading-8 transition hover:scale-125 ${m.reactions?.me === e ? "bg-blue-100" : ""}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                  {canAct && menuFor === m.id && (
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
                      <button onClick={() => { setMenuFor(null); setEditing(null); setReplyTo(m); }} className="rounded-full bg-white px-3 py-1 text-equal-sky shadow">
                        Reply
                      </button>
                      {mine && !m.voice && (
                        <button onClick={() => startEdit(m)} className="rounded-full bg-white px-3 py-1 text-equal-sky shadow">
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setMenuFor(null);
                          setForwarding(m);
                        }}
                        className="rounded-full bg-white px-3 py-1 text-equal-sky shadow"
                      >
                        Forward
                      </button>
                      <button onClick={() => star(m)} className="rounded-full bg-white px-3 py-1 text-equal-sky shadow">
                        {m.starred ? "Unstar" : "Star"}
                      </button>
                      <button onClick={() => askReminder({ id: m.id, text: m.text })} className="rounded-full bg-equal-lime px-3 py-1 text-equal-ink shadow">
                        Remind me
                      </button>
                      <button onClick={() => removeMessage(m.id)} className="rounded-full bg-white px-3 py-1 text-rose-600 shadow">
                        {mine ? "Delete for everyone" : "Delete for me"}
                      </button>
                    </div>
                  )}
                  {isMe && m.scam && (
                    <div className="mt-1.5 max-w-[80%] rounded-2xl bg-rose-600 px-4 py-3 text-white shadow">
                      <div className="font-bold">Equal: this looks like a scam ({m.scam.pattern})</div>
                      <div className="mt-1 text-sm">{m.scam.reason}</div>
                      <div className="mt-2 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">{m.scam.advice}</div>
                    </div>
                  )}
                  {isMe && quiet.has(m.id) && <div className="mt-0.5 max-w-[80%] text-[11px] italic text-equal-ink/50">Equal stayed quiet: {quiet.get(m.id)}</div>}
                </div>
              );
              })();
              return (
                <div key={m.id} className="space-y-1.5">
                  {heading && (
                    <div className="flex justify-center py-1.5">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-equal-ink/60 shadow-sm">{heading}</span>
                    </div>
                  )}
                  {body}
                </div>
              );
            })}
            {isMe &&
              waiting.map((w) => (
                <div key={w.id} className="flex flex-col items-end">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl border-2 border-dashed border-equal-sky bg-white px-3.5 py-2 text-[15px] text-equal-ink">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-equal-sky">Sends {whenWords(w.at)}</span>
                    {w.text}
                  </div>
                  <button onClick={() => cancelLater(w.id)} className="mt-0.5 text-xs font-semibold text-rose-600">
                    Cancel
                  </button>
                </div>
              ))}
            <div ref={endRef} />
          </div>

          {isMe && inlineOffer && (
            <div className="mx-3 mb-2 mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-equal-lime px-4 py-2.5 text-equal-ink shadow-sm">
              <span className="min-w-0 flex-1 basis-48 text-sm">
                <span className="font-semibold">Equal · only you see this.</span> {inlineOffer.title}
              </span>
              <span className="flex shrink-0 gap-2">
                <button onClick={() => { answer(inlineOffer, "accept"); setPane("equal"); }} className="rounded-full bg-equal-ink px-4 py-1.5 text-sm font-semibold text-white">
                  Yes, please
                </button>
                <button onClick={() => answer(inlineOffer, "dismiss")} className="rounded-full px-3 py-1.5 text-sm font-medium hover:bg-black/10">
                  Not now
                </button>
              </span>
            </div>
          )}

          {notice && <div className="mx-3 mb-2 rounded-xl bg-blue-100 px-3 py-2 text-xs text-equal-ink">{notice}</div>}

          {(replyTo || editing) && (
            <div className="mx-3 mb-1 flex items-center gap-2 rounded-xl border-l-4 border-equal-sky bg-blue-50 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-equal-sky">{editing ? "Editing your message" : `Replying to ${replyTo?.from === role ? "yourself" : contact?.name ?? "them"}`}</span>
                {replyTo && <span className="line-clamp-1 text-equal-ink/70">{replyTo.text}</span>}
              </span>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => {
                  if (editing) setDraft("");
                  setEditing(null);
                  setReplyTo(null);
                }}
                className="shrink-0 rounded-full px-2 text-lg text-equal-ink/60"
              >
                ×
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) saveEdit();
              else send();
            }}
            className="flex items-center gap-1.5 border-t border-blue-100 px-3 py-3"
          >
            {isMe && contact && !editing && (
              <label aria-label="Attach a photo or file" title="Attach a photo or file" className={`shrink-0 cursor-pointer rounded-full p-2 text-equal-sky hover:bg-blue-50 ${sending ? "pointer-events-none opacity-40" : ""}`}>
                <ClipIcon />
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) attach(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={contact ? `Message ${isMe ? contact.name : "back"}` : "Pick a chat first"}
              disabled={!contact}
              className="min-w-0 flex-1 rounded-full border border-blue-200 bg-white px-4 py-2 outline-none placeholder:text-equal-ink/40 focus:border-equal-sky"
            />
            {isMe && contact && (
              <button
                type="button"
                onClick={toggleVoice}
                disabled={sending && !recording}
                aria-label={recording ? "Stop and send voice note" : "Record a voice note"}
                title={recording ? "Stop and send" : "Voice note"}
                className={`shrink-0 rounded-full p-2 disabled:opacity-40 ${recording ? "animate-pulse bg-rose-500 text-white" : "border border-blue-200 text-equal-sky"}`}
              >
                {recording ? <StopIcon /> : <MicIcon />}
              </button>
            )}
            {canSchedule && !editing && draft.trim() && (
              <button
                type="button"
                onClick={() => {
                  setLaterError(null);
                  setLaterOpen(true);
                }}
                aria-label="Send later"
                title="Send later"
                className="shrink-0 rounded-full border border-blue-200 p-2 text-equal-sky"
              >
                <ClockIcon />
              </button>
            )}
            <button disabled={sending || !draft.trim() || !contact} aria-label={editing ? "Save the change" : "Send"} title={editing ? "Save" : "Send"} className="shrink-0 rounded-full bg-equal-sky p-2.5 text-white disabled:opacity-40">
              {sending ? <span className="block h-5 w-5 text-center leading-5">…</span> : editing ? <span className="block h-5 w-5 text-center text-lg font-bold leading-5">✓</span> : <SendIcon />}
            </button>
          </form>
        </main>

        {isMe && (
          <aside className={`${pane === "chat" ? "hidden" : pane === "equal" ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-6 pt-2 md:px-8`}>
           <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            <div className="pt-2 md:pt-[8vh]">
              <span title={snap.butler} className={`${label} inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${snap.butler === "online" ? "bg-white/10 text-equal-lime" : "bg-rose-500 text-white"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${snap.butler === "online" ? "animate-pulse bg-equal-lime" : "bg-white"}`} />
                {snap.butler === "online" ? "Your Equal is listening" : "Your Equal is offline"}
              </span>
              <h1 className="hero-text mt-3 font-display text-4xl leading-tight md:text-6xl">
                {greeting}
                {me ? `, ${me.name.split(/\s+/)[0]}` : ""}.
              </h1>
              <p className="mt-2 text-lg text-white/65 md:text-xl">
                {reminders.length ? `You have ${reminders.length} thing${reminders.length === 1 ? "" : "s"} not to forget` : "Nothing is slipping today"}
                {unreadTotal ? ` and ${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}.` : "."}
              </p>
            </div>
            {snap.butler !== "online" && <p className="-mt-3 text-xs text-rose-200">{snap.butler}</p>}

            <section className="order-1 space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  askQuestion();
                }}
                className="ask-glow flex items-center gap-2 rounded-[2rem] bg-white/[0.07] p-2 pl-3"
              >
                <SparkIcon className="shrink-0 text-equal-lime" />
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask me anything, or tell me what to remember"
                  className="min-w-0 flex-1 bg-transparent px-1 py-3 text-lg outline-none placeholder:text-white/50"
                />
                <button disabled={asking || !question.trim()} className="rounded-full bg-equal-lime px-6 py-3 text-base font-bold text-equal-ink disabled:opacity-40">
                  {asking ? "…" : "Ask"}
                </button>
              </form>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-white/40 px-3 py-2 text-sm text-white/90 hover:bg-white/10">
                <span className="font-semibold text-equal-lime">+ Photo to remember</span>
                <span className="text-xs text-white/60">prescription, bill, invitation</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) addPhoto(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button onClick={() => askReminder({ text: "" })} className="flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-white/40 px-3 py-2 text-sm text-white/90 hover:bg-white/10">
                <span className="font-semibold text-equal-lime">+ Remind me</span>
                <span className="text-xs text-white/60">a flight, a film, a meeting</span>
              </button>
              {reply && (
                <div className="rounded-2xl bg-white p-3 text-equal-ink shadow-lg">
                  <div className="text-xs text-equal-ink/60">{reply.question}</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm font-medium">{reply.error ? `I could not answer: ${reply.error}` : reply.answer}</div>
                  {reply.remembered && <div className="mt-2 rounded-lg bg-equal-lime px-2.5 py-1.5 text-xs font-semibold text-equal-ink">Saved about {reply.remembered.about}: {reply.remembered.fact}</div>}
                  {reply.sources?.map((src, i) => (
                    <div key={i} className="mt-2 border-l-2 border-equal-sky pl-2 text-xs text-equal-ink/70">
                      <span className="font-semibold">
                        {src.from} · chat with {src.who} · {new Date(src.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                      <div className="line-clamp-2">{src.text}</div>
                    </div>
                  ))}
                  <button onClick={() => setReply(null)} className="mt-2 text-xs text-equal-sky underline">
                    Close
                  </button>
                </div>
              )}
            </section>

            {reminders.length > 0 && (
              <section className="order-3 grid gap-2 md:grid-cols-2">
                <h2 className={`${label} text-white/70 md:col-span-2`}>Don&apos;t forget</h2>
                {reminders.map((s) => (
                  <div key={s.id} className="rounded-2xl border-l-4 border-equal-lime bg-white/10 p-3">
                    <div className="text-sm font-semibold">
                      {s.important && <span className={`${label} mr-1.5 rounded bg-equal-lime px-1.5 py-0.5 text-equal-ink`}>Important</span>}
                      {s.title}
                    </div>
                    <div className="text-xs text-white/75">{s.detail}</div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => answer(s, "accept")} className="rounded-full bg-equal-lime px-3.5 py-1 text-sm font-semibold text-equal-ink">
                        Done
                      </button>
                      <button onClick={() => answer(s, "dismiss")} className="rounded-full px-3 py-1 text-sm text-white/85 hover:bg-white/10">
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className={`flex flex-col gap-2 ${urgent ? "order-2" : "order-4"}`}>
              <h2 className={`order-[-10000] ${label} ${urgent ? "text-equal-lime" : "text-white/70"}`}>{urgent ? "Right now" : "For you"}</h2>
              {others.length === 0 && snap.jobs.length === 0 && <p className="text-sm text-white/70">Nothing needs you right now.</p>}
              {[...snap.jobs].reverse().map((j) => (
                <JobCard key={j.id} job={j} onBook={bookProvider} />
              ))}
              {others.map((s) => (
                <div key={s.id} className={`rounded-2xl border p-3 ${s.type === "guardian" ? "border-rose-300 bg-rose-600" : "border-white/20 bg-white/10"} ${s.type === "guardian" || s.type === "intent" ? "order-first" : ""}`}>
                  <div className={`${label} ${s.type === "guardian" ? "text-white" : "text-equal-lime"}`}>
                    {s.type === "guardian" ? "Family alert" : s.type === "intent" ? "Can help now" : s.type === "keep_close" ? "Stay close" : "Follow up"}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{s.title}</div>
                  <div className="text-sm text-white/85">{s.detail}</div>
                  <div className="mt-2.5 flex flex-wrap gap-2 whitespace-nowrap">
                    <button onClick={() => answer(s, "accept")} className="rounded-full bg-equal-lime px-3.5 py-1 text-sm font-semibold text-equal-ink hover:brightness-95">
                      {s.type === "guardian" ? "I'll call them" : s.type === "intent" ? "Yes, please" : "Open chat"}
                    </button>
                    {(s.type === "keep_close" || s.type === "follow_up") && (
                      <button onClick={() => draftFor(s)} className="rounded-full border border-equal-lime px-3 py-1 text-sm font-medium text-equal-lime hover:bg-white/10">
                        Draft a message
                      </button>
                    )}
                    {s.type === "keep_close" &&
                      snap.contacts
                        .filter((c) => c.id === s.contactId && c.userId)
                        .map((c) => (
                          <button key={c.id} onClick={() => placeCall(c)} className="rounded-full border border-equal-lime px-3 py-1 text-sm font-medium text-equal-lime hover:bg-white/10">
                            Call
                          </button>
                        ))}
                    <button onClick={() => answer(s, "dismiss")} className="rounded-full px-3 py-1 text-sm text-white/85 hover:bg-white/10">
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </section>

            {people.length > 0 && (
              <section className="order-5 space-y-2">
                <h2 className={`${label} text-white/70`}>People your Equal knows</h2>
                <input
                  value={personQuery}
                  onChange={(e) => setPersonQuery(e.target.value)}
                  placeholder="Type a name or number"
                  aria-label="Find a person"
                  className="w-full rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-white/50 focus:border-equal-lime"
                />
                <div className="flex flex-wrap gap-1.5">
                  {peopleShown.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setPersonId(c.id);
                        setPersonQuery("");
                        setPersonFact("");
                      }}
                      aria-pressed={person?.id === c.id}
                      className={`rounded-full px-3 py-1 text-sm font-medium ${person?.id === c.id ? "bg-equal-lime text-equal-ink" : "border border-white/20 text-white/85 hover:bg-white/10"}`}
                    >
                      {c.name}
                    </button>
                  ))}
                  {personQuery.trim() && peopleShown.length === 0 && <span className="text-sm text-white/60">No one by that name yet. Start a chat with them from the box above your chats.</span>}
                </div>
                {person && (
                  <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={person.unknown ? "?" : person.name} picture={person.picture} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{person.name}</div>
                        <div className="text-xs text-white/60">
                          {personMemories.length} thing{personMemories.length === 1 ? "" : "s"} remembered · last spoke {listTime(person.lastContactAt, now)}
                        </div>
                      </div>
                      <button onClick={() => open(person.id)} className="shrink-0 rounded-full bg-equal-sky px-3.5 py-1.5 text-sm font-semibold text-white">
                        Open chat
                      </button>
                    </div>
                    {!person.unknown && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="text-white/75">{person.name} is your</span>
                        <select
                          value={(RELATIONS as readonly string[]).includes(person.relation) ? person.relation : ""}
                          onChange={(e) => describe(person.id, { relation: e.target.value })}
                          className="rounded-full border border-white/30 bg-equal-card px-2 py-1 text-sm text-white outline-none"
                        >
                          <option value="" disabled>
                            {person.relation}
                          </option>
                          {RELATIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-white/75">
                          <input type="checkbox" checked={person.close} onChange={(e) => describe(person.id, { close: e.target.checked })} className="accent-[#cef82c]" />
                          keep close
                        </label>
                      </div>
                    )}
                    {person.relationSource === "inferred" && person.relationWhy && <div className="mt-1 text-xs text-white/60">Worked out from your chat: {person.relationWhy}</div>}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        addFact(person.id);
                      }}
                      className="mt-3 flex gap-2"
                    >
                      <input
                        value={personFact}
                        onChange={(e) => setPersonFact(e.target.value)}
                        placeholder={`Tell me something about ${person.name}`}
                        aria-label={`Something to remember about ${person.name}`}
                        className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-3.5 py-2 text-sm outline-none placeholder:text-white/50 focus:border-equal-lime"
                      />
                      <button disabled={!personFact.trim()} className="shrink-0 rounded-full bg-equal-lime px-4 py-2 text-sm font-bold text-equal-ink disabled:opacity-40">
                        Remember
                      </button>
                    </form>
                    <div className="mt-3 space-y-1.5">
                      {personMemories.length === 0 && <p className="text-sm text-white/70">Nothing yet. It fills up as you chat, or tell me above.</p>}
                      {personMemories.map((m) => (
                        <div key={m.id} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm">
                          <button onClick={() => forget(m.id)} title="Forget this" className="float-right ml-2 rounded-full px-1.5 text-xs text-white/50 hover:bg-white/15 hover:text-white">
                            Forget
                          </button>
                          {m.fact}
                          <span className="ml-2 text-xs text-white/60">
                            {m.when ? new Date(m.when).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : m.kind}
                            {m.sample ? " · demo" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="order-6 space-y-2 border-t border-white/20 pt-4">
              <h2 className={`${label} text-white/70`}>Bring in a WhatsApp chat</h2>
              <p className="text-xs text-white/70">In WhatsApp: open a chat, then More, Export chat, Without media. Choose the .txt file here.</p>
              <input
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                placeholder="Your name as WhatsApp shows it"
                className="w-full rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-sm outline-none placeholder:text-white/50 focus:border-equal-lime"
              />
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importChat(f);
                  e.target.value = "";
                }}
                className="w-full text-xs text-white/70 file:mr-2 file:rounded-full file:border-0 file:bg-equal-lime file:px-3 file:py-1.5 file:font-semibold file:text-equal-ink"
              />
              <h2 className={`${label} pt-2 text-white/70`}>Take your chats with you</h2>
              <div className="flex flex-wrap gap-2 text-sm">
                {contact && (
                  <a href={`/api/export?contactId=${encodeURIComponent(contact.id)}`} download className="rounded-full border border-white/40 px-3 py-1 font-medium text-white/90 hover:bg-white/10">
                    Export chat with {contact.name}
                  </a>
                )}
                <a href="/api/export" download className="rounded-full border border-white/40 px-3 py-1 font-medium text-white/90 hover:bg-white/10">
                  Export everything
                </a>
              </div>
            </section>

            <section className={`order-7 mt-auto space-y-1.5 border-t border-white/20 pt-4 text-xs text-white/70 ${snap.demo ? "" : "hidden"}`}>
              <h2 className={`${label} text-white/70`}>Try the family scam shield</h2>
              <a href={`/ring?u=${me?.id ?? ""}&c=unknown-nanna`} target="_blank" className="block underline">
                Call Nanna as a stranger
              </a>
              <a href={`/friend?u=${me?.id ?? ""}&c=unknown-nanna`} target="_blank" className="block underline">
                Message Nanna as a stranger
              </a>
              <a href={`/protected?u=${me?.id ?? ""}&c=unknown-nanna`} target="_blank" className="block underline">
                See Nanna&apos;s phone
              </a>
              <button
                onClick={async () => {
                  const next = await api("/api/state", "DELETE");
                  if (next.contacts) setSnap(next);
                  setNotice("Sample chats reset. Your real chats were kept.");
                }}
                className="pt-1 underline"
              >
                Reset the sample chats
              </button>
            </section>
           </div>
          </aside>
        )}
      </div>

      {isMe && (
        <nav className={`safe-bottom grid-cols-2 border-t border-white/15 bg-equal-card md:hidden ${pane === "chat" ? "hidden" : "grid"}`}>
          {(["chats", "equal"] as Pane[]).map((p) => {
            const count = p === "chats" ? unreadTotal : offers.length;
            return (
              <button key={p} onClick={() => setPane(p)} aria-current={pane === p} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${pane === p ? "text-equal-lime" : "text-white/70"}`}>
                <span className={`relative rounded-full px-5 py-1 ${pane === p ? "bg-white/15" : ""}`}>
                  {p === "chats" ? <ChatIcon /> : <SparkIcon />}
                  {count > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-equal-lime px-1 text-[10px] font-bold text-equal-ink">{count}</span>}
                </span>
                {p === "chats" ? "Chats" : "My Equal"}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
