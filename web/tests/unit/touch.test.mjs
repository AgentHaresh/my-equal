// Unit tests for who reached out to whom: history, last contact, unanswered messages and rhythms.
//   node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { daysSince, historyOf, inTouch, lastPhrase, rhythmStatus } from "../../lib/touch.ts";

const DAY = 86400000;
// Noon in India, so "days ago" never straddles midnight.
const now = Date.parse("2026-11-24T12:00:00+05:30");
const at = (daysAgo, hour = 12) => new Date(now - daysAgo * DAY + (hour - 12) * 3600000).toISOString();
const msg = (id, from, daysAgo, hour = 12) => ({ id, contactId: "amma", from, text: `m${id}`, at: at(daysAgo, hour) });

test("texts in a row from one side are one history item; calls sit between them", () => {
  const src = {
    messages: [msg("1", "them", 3, 9), { ...msg("2", "them", 3, 9), at: new Date(Date.parse(at(3, 9)) + 5 * 60000).toISOString() }, msg("3", "me", 3, 10), msg("4", "butler", 3, 10)],
    touches: [{ id: "t", contactId: "amma", kind: "call", dir: "out", at: at(1), mins: 12 }],
  };
  const h = historyOf(src, "amma");
  assert.deepEqual(
    h.map((x) => [x.kind, x.dir, x.count ?? x.mins]),
    [
      ["call", "out", 12],
      ["text", "out", 1],
      ["text", "in", 2],
    ],
  );
});

test("being in touch means I wrote or we talked; their message alone is waiting for me", () => {
  const src = { messages: [msg("1", "me", 5), msg("2", "them", 1)], touches: [] };
  const s = inTouch(src, "amma");
  assert.equal(s.last, Date.parse(at(5)));
  assert.equal(s.unanswered?.id, "2");
  // A call after their message answers it.
  const called = inTouch({ ...src, touches: [{ id: "t", contactId: "amma", kind: "logged_call", dir: "out", at: at(0) }] }, "amma");
  assert.equal(called.unanswered, null);
  assert.equal(called.last, Date.parse(at(0)));
  // A missed call is not being in touch.
  const missed = inTouch({ ...src, touches: [{ id: "t", contactId: "amma", kind: "missed", dir: "out", at: at(0) }] }, "amma");
  assert.equal(missed.last, Date.parse(at(5)));
});

test("the rhythm says when someone is due", () => {
  const src = { messages: [msg("1", "me", 3)], touches: [] };
  const s = inTouch(src, "amma");
  assert.deepEqual(rhythmStatus({ everyDays: 2, lastContactAt: at(3) }, s, now), { days: 3, dueIn: -1 });
  assert.deepEqual(rhythmStatus({ everyDays: 7, lastContactAt: at(3) }, s, now), { days: 3, dueIn: 4 });
  assert.equal(rhythmStatus({ lastContactAt: at(3) }, s, now), null);
});

test("days are counted in Indian calendar days", () => {
  // 11:50 pm yesterday to 12:10 am today is one day, though only 20 minutes apart.
  const late = Date.parse("2026-11-23T23:50:00+05:30");
  const early = Date.parse("2026-11-24T00:10:00+05:30");
  assert.equal(daysSince(late, early), 1);
  assert.equal(daysSince(early, early), 0);
});

test("the last contact is said plainly", () => {
  const s = inTouch({ messages: [msg("1", "me", 4)], touches: [{ id: "t", contactId: "amma", kind: "call", dir: "in", at: at(1), mins: 9 }] }, "amma");
  assert.equal(lastPhrase({ name: "Amma" }, s, now), "Last time: Amma called you yesterday (9 min).");
  const none = inTouch({ messages: [], touches: [] }, "amma");
  assert.match(lastPhrase({ name: "Amma" }, none, now), /haven't talked to Amma/);
});
