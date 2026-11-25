// Unit tests for the reminders the Android phone shows by itself.
//   node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { alertId, daytime, planAlerts as plan_ } from "../../lib/local-alerts.ts";
import { inTouch } from "../../lib/touch.ts";
const planAlerts = (s, now) => plan_(s, (id) => inTouch(s, id).last, now);

const ist = (s) => Date.parse(`${s}+05:30`);
const NOW = ist("2026-11-25T08:00:00"); // a Wednesday morning in India
const hourOf = (t) => new Date(t + 5.5 * 3600000).toISOString().slice(0, 16).replace("T", " ");

const base = {
  contacts: [
    { id: "amma", name: "Amma", everyDays: 3, lastContactAt: "2026-11-01T00:00:00.000Z" },
    { id: "ravi", name: "Ravi", lastContactAt: "2026-11-24T00:00:00.000Z" },
    { id: "nanna-phone", name: "Stranger", owner: "nanna", everyDays: 1, lastContactAt: "2026-11-01T00:00:00.000Z" },
  ],
  messages: [{ contactId: "amma", from: "me", at: ist("2026-11-24T19:00:00") && new Date(ist("2026-11-24T19:00:00")).toISOString() }],
  touches: [],
  memories: [],
};

test("never at night: before 9 am waits for 9, after 9 pm moves to 9 the next morning", () => {
  assert.equal(hourOf(daytime(ist("2026-11-25T06:30:00"))), "2026-11-25 09:00");
  assert.equal(hourOf(daytime(ist("2026-11-25T22:15:00"))), "2026-11-26 09:00");
  assert.equal(hourOf(daytime(ist("2026-11-25T14:00:00"))), "2026-11-25 14:00");
});

test("a timed plan is half an hour before; an untimed one at 9 am that day; past and done ones are not shown", () => {
  const memories = [
    { id: "m1", contactId: "ravi", fact: "Take my sister out", when: new Date(ist("2026-11-29T18:00:00")).toISOString(), timed: true, status: "open" },
    { id: "m2", contactId: "ravi", fact: "Ravi's flight lands", when: new Date(ist("2026-11-27T00:00:00")).toISOString(), status: "open" },
    { id: "m3", contactId: "ravi", fact: "Old plan", when: new Date(ist("2026-11-20T10:00:00")).toISOString(), timed: true, status: "open" },
    { id: "m4", contactId: "ravi", fact: "Done plan", when: new Date(ist("2026-11-28T10:00:00")).toISOString(), timed: true, status: "done" },
    { id: "m5", contactId: "ravi", fact: "Far away", when: new Date(ist("2026-12-30T10:00:00")).toISOString(), timed: true, status: "open" },
  ];
  const plan = planAlerts({ ...base, contacts: base.contacts.map((c) => ({ ...c, everyDays: undefined })), memories }, NOW);
  assert.deepEqual(
    plan.map((a) => [hourOf(a.at), a.title, a.body]),
    [
      ["2026-11-27 09:00", "Today: don't forget", "Ravi's flight lands"],
      ["2026-11-29 17:30", "At 6:00 pm: don't forget", "Take my sister out (with Ravi)"],
    ],
  );
});

test("stay in touch every N days: 10 am on the day it is due, counted from the last time we spoke", () => {
  const plan = planAlerts(base, NOW);
  assert.equal(plan.length, 1); // the protected family member's phone is not mine
  assert.equal(plan[0].title, "Time to talk to Amma");
  assert.equal(hourOf(plan[0].at), "2026-11-27 10:00"); // spoke on the 24th, every 3 days
  assert.match(plan[0].body, /every 3 days\. You last spoke on Tuesday, 24 November/);
});

test("already overdue: the next daytime hour, not the middle of the night", () => {
  const overdue = { ...base, messages: [] }; // last contact 1 November
  assert.equal(hourOf(planAlerts(overdue, NOW)[0].at), "2026-11-25 10:00");
  assert.equal(hourOf(planAlerts(overdue, ist("2026-11-25T22:30:00"))[0].at), "2026-11-26 09:00");
});

test("the same reminder keeps the same number, so planning again replaces it instead of adding one", () => {
  assert.equal(planAlerts(base, NOW)[0].id, planAlerts(base, NOW + 60000)[0].id);
  assert.notEqual(alertId("memory:a"), alertId("memory:b"));
  assert.ok(alertId("x") > 0 && alertId("x") < 2 ** 31);
});
