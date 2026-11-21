/**
 * Reading a WhatsApp "Export chat" text file. Exports differ by phone and by the phone's
 * language and region settings, so this accepts the shapes seen in the wild:
 *
 *   21/11/26, 5:48 pm - Haresh: hello            Android, 12-hour
 *   21/11/2026, 17:48 - Haresh: hello            Android, 24-hour
 *   [21/11/26, 5:48:10 PM] Haresh: hello         iPhone
 *   11/21/26, 5:48 PM - Haresh: hello            month first (US settings)
 *   21.11.26, 17:48 - Haresh: hello              dots or dashes in the date
 *   2026-11-21, 17:48 - Haresh: hello            year first
 *
 * Lines with a date but no "Name: " are WhatsApp's own notices (encryption, "X added Y") and are
 * dropped. Lines with no date continue the message above them.
 */

export type Imported = { sender: string; text: string; at: string };

// Invisible direction marks WhatsApp puts around names and times; and the narrow spaces before AM/PM.
const MARKS = /[‎‏‪-‮⁦-⁩﻿]/g;
const SPACES = /[   ]/g;

const LINE = /^\[?(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([AaPp])?\.?\s?[Mm]?\.?\]?\s*(?:[-–]\s+)?(.*)$/;

// Things that stand in for media or removed messages, in a text-only export.
const NOT_WORDS = /^(<.*omitted>|.*\bomitted|<attached: .*>|.*\(file attached\)|This message was deleted\.?|You deleted this message\.?|null|Missed (voice|video) call.*|Waiting for this message.*)$/i;

export function parseWhatsApp(text: string): Imported[] {
  type Row = { a: number; b: number; c: number; h: number; mi: number; ap: string; sender: string; body: string };
  const rows: Row[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(MARKS, "").replace(SPACES, " ").trim();
    if (!line) continue;
    const m = line.match(LINE);
    if (!m) {
      if (rows.length) rows[rows.length - 1].body += "\n" + line; // the same message, carried on
      continue;
    }
    const rest = m[7];
    const cut = rest.indexOf(": ");
    // A date with no "Name: " is a notice from WhatsApp itself, not something anyone said.
    if (cut <= 0 || cut > 60) continue;
    rows.push({ a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), h: Number(m[4]), mi: Number(m[5]), ap: (m[6] ?? "").toLowerCase(), sender: rest.slice(0, cut).trim(), body: rest.slice(cut + 2) });
  }

  // Which number is the day? Year-first is plain. Otherwise a value over 12 settles it; with no
  // such value anywhere, day-first, as phones in India write it.
  const yearFirst = rows.some((r) => r.a > 31);
  const monthFirst = !yearFirst && !rows.some((r) => r.a > 12) && rows.some((r) => r.b > 12);

  const out: Imported[] = [];
  const two = (n: number) => String(n).padStart(2, "0");
  for (const r of rows) {
    const body = r.body.trim();
    if (!body || NOT_WORDS.test(body)) continue;
    const [year, mo, d] = yearFirst ? [r.a, r.b, r.c] : monthFirst ? [r.c, r.a, r.b] : [r.c, r.b, r.a];
    const y = year < 100 ? year + 2000 : year;
    let hour = r.h;
    if (r.ap === "p" && hour < 12) hour += 12;
    if (r.ap === "a" && hour === 12) hour = 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hour > 23 || r.mi > 59) continue;
    // The times in an export are the phone's own; read them as Indian time, wherever the server runs.
    const at = new Date(`${y}-${two(mo)}-${two(d)}T${two(hour)}:${two(r.mi)}:00+05:30`);
    if (isNaN(at.getTime())) continue;
    out.push({ sender: r.sender, text: body, at: at.toISOString() });
  }
  return out;
}

/** Everyone who speaks in the export, most talkative first. */
export function sendersOf(messages: Imported[]): string[] {
  const count = new Map<string, number>();
  for (const m of messages) count.set(m.sender, (count.get(m.sender) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1);

/** Which sender is this person, judging by their name? Null when it is not clear. */
export function guessMe(senders: string[], myName: string): string | null {
  const mine = words(myName);
  if (!mine.length) return null;
  const exact = senders.filter((s) => s.trim().toLowerCase() === myName.trim().toLowerCase());
  if (exact.length === 1) return exact[0];
  // Otherwise: the one sender who shares a name-word with me ("Haresh" with "Haresh Gundela").
  const close = senders.filter((s) => words(s).some((w) => mine.includes(w)));
  return close.length === 1 ? close[0] : null;
}
