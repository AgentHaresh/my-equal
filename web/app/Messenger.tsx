"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/snapshot";
import type { Answer } from "@/lib/ask";
import SignIn from "./SignIn";
import { ChatIcon, SparkIcon } from "./Icons";
import { label, param, presenceWords, type Contact, type Msg, type Pane, type Suggestion } from "./messenger/format";
import { Wordmark } from "./messenger/parts";
import { useCalls } from "./messenger/useCalls";
import CallOverlay from "./messenger/CallOverlay";
import ReminderCallOverlay from "./messenger/ReminderCallOverlay";
import { ForwardSheet, RemindSheet, SendLaterSheet } from "./messenger/Sheets";
import SettingsMenu from "./messenger/SettingsMenu";
import ProfileSetup from "./messenger/ProfileSetup";
import ChatList from "./messenger/ChatList";
import Conversation from "./messenger/Conversation";
import Home from "./messenger/Home";

type Props = { role: "me" | "them" };

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
  // Bringing in a WhatsApp chat: what is happening, and, when it is not clear, who speaks in the file.
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<null | { ok: boolean; text: string }>(null);
  const [importWho, setImportWho] = useState<string[]>([]);
  const importText = useRef("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [reply, setReply] = useState<(Answer & { question: string }) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [recording, setRecording] = useState(false);
  const mic = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
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
  const [editingProfile, setEditingProfile] = useState(false);
  const lastCall = useRef<Snapshot["call"]>(null); // the call the server last reported for me, if any
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
  }, []);

  // Voice and video calls: what is on screen, and the live connection behind it.
  const { callUi, linked, remoteAudio, showTheirs, showMine, syncCall, placeCall, acceptCall, endCall } = useCalls(api, setSnap, setNotice);

  const refresh = useCallback(async () => {
    if (busy.current) return; // don't overwrite a send that is in flight
    try {
      const next = await api(isMe ? `/api/state?v=${version.current}` : `/api/state?friend=${encodeURIComponent(selected)}&u=${encodeURIComponent(owner)}`, "GET");
      if (next.same) {
        // Nothing new: the server sent a few bytes, not the whole history. The call on screen is
        // still checked against what the server last said, so a call that ended in its first
        // seconds (when "ended" is briefly ignored as possibly stale) is cleared at the next check.
        setNow(Date.now());
        if (isMe) void syncCall(lastCall.current);
        return;
      }
      if (next.contacts) {
        version.current = next.v ?? "";
        lastCall.current = next.call;
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

  /** Start a chat with someone by their phone number, if they are on My Equal. */
  async function startByNumber() {
    setNumberNote(null);
    // Letters mean a username (with or without the @); otherwise it is a phone number.
    const byUsername = /[a-z]/i.test(newNumber);
    const res = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(byUsername ? { username: newNumber } : { phone: newNumber }) });
    const next = await res.json();
    setInviteSms(null);
    // An invitation can be texted to a number; a username that is not found gets no invite.
    setInviteFor(res.status === 404 && !byUsername ? newNumber : null);
    if (!res.ok) return setNumberNote(res.status === 404 && !byUsername ? "That number is not on Equal yet. Invite them?" : (next.error ?? "Could not start that chat."));
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

  /** The words of an exported chat: a .txt as it is, or the .txt inside the .zip an iPhone makes. */
  async function exportedText(file: File): Promise<string> {
    const zipped = /\.zip$/i.test(file.name) || file.type.includes("zip");
    if (!zipped) return file.text();
    const { unzipSync, strFromU8 } = await import("fflate");
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => /\.txt$/i.test(f.name) });
    const names = Object.keys(entries);
    const chat = names.find((n) => /_chat\.txt$/i.test(n)) ?? names[0];
    if (!chat) throw new Error("There is no chat text inside that .zip.");
    return strFromU8(entries[chat]);
  }

  /** Bring in a WhatsApp export. If it is not clear which speaker is the user, ask. */
  async function importChat(file: File | null, me?: string) {
    if (importing) return;
    setImporting(true);
    setImportWho([]);
    setImportNote({ ok: true, text: "Reading the chat…" });
    try {
      if (file) importText.current = await exportedText(file);
      const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: importText.current, me }) });
      const next = await res.json();
      if (next.choose) {
        setImportWho(next.choose);
        return setImportNote({ ok: true, text: `Found ${next.count} messages. Which of these is you?` });
      }
      if (!res.ok) return setImportNote({ ok: false, text: next.error ?? "Could not bring that chat in." });
      if (next.contacts) setSnap(next);
      importText.current = "";
      setImportNote({
        ok: true,
        text: next.already
          ? `That chat with ${next.title} is already here. Nothing new was added.`
          : `Brought in ${next.imported} messages with ${next.title}.${next.error ? ` Equal could not read them yet: ${next.error}` : " Equal has read the latest ones."}`,
      });
      if (next.contactId) setPersonId(next.contactId);
    } catch (e) {
      setImportNote({ ok: false, text: e instanceof Error && e.message ? e.message : "Could not read that file." });
    } finally {
      setImporting(false);
    }
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
      if (answer.remembered || answer.errand) void refresh();
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

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    setSnap(null);
    setAuth((a) => ({ ...a, signedIn: false }));
  }

  if (!auth.checked) return <div className="flex h-screen items-center justify-center text-white/80">Loading…</div>;
  if (!auth.signedIn) return <SignIn clientId={auth.clientId} onDone={checkAuth} />;
  if (!snap) return <div className="flex h-screen items-center justify-center text-white/80">Loading…</div>;
  // A new account sets up its profile before anything else.
  if (isMe && snap.me?.needsSetup) return <ProfileSetup me={snap.me} onDone={(next) => setSnap(next)} />;
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
      {editingProfile && me && (
        <ProfileSetup
          me={me}
          editing
          onClose={() => setEditingProfile(false)}
          onDone={(next) => {
            setSnap(next);
            setEditingProfile(false);
          }}
        />
      )}
      {callUi && <CallOverlay {...{ callUi, linked, showTheirs, showMine, acceptCall, endCall }} />}
      <audio ref={reminderAudio} className="hidden" />
      {ringing && !callUi && <ReminderCallOverlay {...{ ringing, answerReminder, closeReminder }} />}
      {forwarding && <ForwardSheet {...{ forwarding, setForwarding, ordered, forwardTo }} />}
      {laterOpen && <SendLaterSheet {...{ setLaterOpen, draft, sendLater, laterWhen, setLaterWhen, laterError }} />}
      {remindFor && <RemindSheet {...{ remindFor, setRemindFor, remindMsg, remindCall, setRemindCall, setReminder, remindBusy, remindWhen, setRemindWhen }} />}
      <header className={`safe-top items-center justify-between px-4 py-2.5 md:flex md:px-2 md:py-0 ${isMe && pane === "chat" ? "hidden" : "flex"}`}>
        <Wordmark />
        {isMe && me ? (
          <SettingsMenu
            {...{ settingsOpen, setSettingsOpen, checkPush, me, light, setLight, setPushNote, togglePush, pushOn, pushNote, setDemo, snap, signOut }}
            onEditProfile={() => {
              setSettingsOpen(false);
              setEditingProfile(true);
            }}
          />
        ) : (
          <span className={`${label} rounded-full bg-equal-lime px-3 py-1 text-equal-ink`}>Builders 2026</span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 md:gap-3">
        {isMe && (
          <ChatList
            {...{ panel, show, pane, setPane, offers, unreadTotal, search, setSearch, starredOnly, setStarredOnly, startByNumber, newNumber, setNewNumber, numberNote, inviteFor, sendInvite, inviteSms, copyInvite }}
            {...{ searching, foundPeople, foundMessages, open, nameOf, needle, ordered, me, setNotice, snap, now, current, unreadOf }}
          />
        )}

        <Conversation
          {...{ role, isMe, show, setPane, unreadTotal, unreadHere, contact, status, side, starPerson, placeCall, thread, now, menuFor, setMenuFor, focusId, inEnglish, setInEnglish, reactTo }}
          {...{ editing, setEditing, replyTo, setReplyTo, startEdit, setForwarding, star, askReminder, removeMessage, quiet, waiting, whenWords, cancelLater, endRef, inlineOffer, answer, notice }}
          {...{ draft, setDraft, saveEdit, send, sending, attach, toggleVoice, recording, canSchedule, setLaterError, setLaterOpen }}
        />

        {isMe && (
          <Home
            {...{ pane, snap, me, now, greeting, reminders, unreadTotal, askQuestion, question, setQuestion, asking, addPhoto, askReminder, reply, setReply, answer, urgent, others, bookProvider, draftFor, placeCall }}
            {...{ people, peopleShown, person, personMemories, personQuery, setPersonQuery, setPersonId, personFact, setPersonFact, open, describe, addFact, forget }}
            {...{ importing, importChat, importNote, importWho, contact, api, setSnap, setNotice }}
          />
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
