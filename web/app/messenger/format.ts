// The shared shapes and small pure helpers of the messenger screen: what a contact, a message
// and an offer look like, and how times, days and "last seen" are worded.
// Nothing here holds state or touches the network.

import type { Snapshot } from "@/lib/snapshot";

export type Suggestion = Snapshot["suggestions"][number];
export type Contact = Snapshot["contacts"][number];
export type Pane = "chats" | "chat" | "equal";
export type Msg = Snapshot["messages"][number];

/** Every call to my own server goes through this; it answers with the fresh state of my screen. */
export type Api = (url: string, method: string, body?: unknown) => Promise<Snapshot & { contactId?: string; imported?: number; reminderSaid?: string; reminderError?: string; same?: boolean; v?: string }>;

/** Equal ringing about a reminder: what it is about, and whether the call has been answered. */
export type Ringing = { id: string; what: string; at: string | null; answered: boolean; line?: string };

export const DAY = 86400000;

export function ago(iso: string, now: number) {
  const ms = now - new Date(iso).getTime();
  if (ms < 60000) return "now";
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  if (ms < DAY) return `${Math.floor(ms / 3600000)}h`;
  return `${Math.floor(ms / DAY)}d`;
}

/** The day a message belongs to, the way a messenger heads each day: Today, Yesterday, then the date. */
export function dayLabel(iso: string, now: number) {
  const d = new Date(iso);
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: d.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

/** When a chat last moved, as a chat list shows it: the time today, "Yesterday", then the date. */
export function listTime(iso: string, now: number) {
  const label = dayLabel(iso, now);
  if (label === "Today") return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (label === "Yesterday") return label;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "online", or how long ago someone was last here. */
export function presenceWords(seenAt: string | null | undefined, now: number) {
  if (!seenAt) return null;
  if (seenAt === "online") return "online";
  const ms = now - new Date(seenAt).getTime();
  if (ms < 8000) return "online";
  if (ms < 3600000) return `last seen ${Math.max(1, Math.floor(ms / 60000))} min ago`;
  if (ms < DAY) return `last seen at ${new Date(seenAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
  return `last seen ${new Date(seenAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const param = (name: string) => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(name) : null);

export const label = "text-[10px] font-semibold uppercase tracking-[0.18em]";
