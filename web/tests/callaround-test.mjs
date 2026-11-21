// End-to-end test of call-around. Usage: node tests/callaround-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const me = await signIn(B, "test-callaround@example.com", "Call Tester");
const link = anon(B); // providers and friends open links without signing in

await me.json("/api/state", "DELETE");
let s = await me.json("/api/messages", "POST", { contactId: "ravi", text: "My car broke down near Gachibowli and I need it fixed today, client meeting at 4" });
const offer = s.suggestions.find((x) => x.type === "intent" && x.status === "new");
check("Equal offers help", Boolean(offer), offer?.title ?? s.error ?? "no offer");
if (!offer) finish();

s = await me.json("/api/suggestions", "POST", { id: offer.id, action: "accept" });
const job = s.jobs[0];
check("accepting starts a job with 3 calls", job?.calls.length === 3, job ? `brief: ${job.need}` : "");
s = await me.json("/api/suggestions", "POST", { id: offer.id, action: "accept" });
check("accepting twice does not duplicate the job", s.jobs.length === 1);

const scripts = [
  ["Yes, Sri Sai Motors here. We can help with that.", "Around 1200 rupees for towing and a check-up", "We can reach in 45 minutes", "ok thank you"],
  ["Raju Garage andi. Haa cheyochu, problem ledu", "800 avutundi, parts extra", "Oka ganta lo vastam", "sare"],
  ["No sir, we are closed today, cannot come", "ok bye"],
];
for (let i = 0; i < 3; i++) {
  const id = job.calls[i].id;
  let v = await link.json(`/api/calls?id=${id}`);
  if (i === 0) check("first line discloses it is an AI", /AI assistant/i.test(v.transcript[0].text), v.transcript[0].text);
  for (const line of scripts[i]) {
    if (v.status === "done") break;
    v = await link.json("/api/calls", "POST", { id, text: line });
    if (v.error) console.log("      call error:", v.error);
  }
  if (v.status !== "done") console.log(v.transcript.map((t) => `        ${t.from}: ${t.text}`).join("\n"));
  check(`call ${i + 1} ended on its own`, v.status === "done", `after ${v.transcript.length} lines`);
}

s = await me.json("/api/state");
const jb = s.jobs[0];
for (const c of jb.calls) console.log(`      quote: ${c.label} | available: ${c.quote?.available} | ₹${c.quote?.price_inr} | ${c.quote?.eta_minutes} min`);
check("job is ready", jb.status === "ready", jb.status);
const pick = jb.calls.find((c) => c.id === jb.recommendation?.callId);
check("a recommendation exists", Boolean(pick), pick ? `${pick.label}: ${jb.recommendation.reason}` : "");
check("closed provider is marked unavailable", jb.calls[2].quote?.available === false);
check("recommendation is not the closed provider", pick?.id !== jb.calls[2].id);

check("booking an unknown provider is rejected", (await me.call("/api/jobs", "POST", { jobId: jb.id, callId: "nope" })).status === 400);
check("booking needs a signed-in user", (await link.call("/api/jobs", "POST", { jobId: jb.id, callId: pick.id })).status === 401);

s = await me.json("/api/jobs", "POST", { jobId: jb.id, callId: pick.id });
check("booking sets the job to booked", s.jobs[0].status === "booked");
const note = s.messages.filter((m) => m.from === "butler").at(-1);
check("confirmation note appears in the chat", Boolean(note), note?.text);

const outcomes = [];
for (const c of jb.calls) outcomes.push((await link.json(`/api/calls?id=${c.id}`)).outcome);
check("providers see the right outcome", outcomes.filter((o) => o === "chosen").length === 1 && outcomes.filter((o) => o === "not_chosen").length === 2, outcomes.join(", "));

const friend = await link.json(`/api/state?friend=ravi&u=${me.user.id}`);
check(
  "the other side sees no notes from Equal, jobs, memories or offers",
  !friend.messages.some((m) => m.from === "butler") && friend.jobs.length === 0 && friend.memories.length === 0 && friend.suggestions.length === 0 && friend.contacts.length === 1
);
check("call page loads", (await link.call(`/call?id=${jb.calls[0].id}`)).status === 200);
check("an invalid call link is rejected", (await link.call("/api/calls?id=bogus")).status === 404);

await me.json("/api/state", "DELETE");
finish();
