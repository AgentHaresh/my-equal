// End-to-end test of call-around against a running server. Usage: node callaround-test.mjs <base-url>
const B = process.argv[2] ?? "http://localhost:3217";
const j = (r) => r.json();
const post = (path, body) => fetch(B + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(j);
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

await fetch(B + "/api/state", { method: "DELETE" });
let s = await post("/api/messages", { contactId: "ravi", from: "me", text: "My car broke down near Gachibowli and I need it fixed today, client meeting at 4" });
const offer = s.suggestions.find((x) => x.type === "intent" && x.status === "new");
check("butler offers help", Boolean(offer), offer?.title ?? s.error ?? "no offer");
if (!offer) process.exit(1);

s = await post("/api/suggestions", { id: offer.id, action: "accept" });
const job = s.jobs[0];
check("accepting starts a job with 3 calls", job?.calls.length === 3, job ? `brief: ${job.need}` : "");
console.log("      questions:", job.questions.join(" | "));

// accepting twice must not start a second job
s = await post("/api/suggestions", { id: offer.id, action: "accept" });
check("accepting twice does not duplicate the job", s.jobs.length === 1);

const scripts = [
  ["Yes, Sri Sai Motors here. We can help with that.", "Around 1200 rupees for towing and a check-up", "We can reach in 45 minutes", "ok thank you"],
  ["Raju Garage andi. Haa cheyochu, problem ledu", "800 avutundi, parts extra", "Oka ganta lo vastam", "sare"],
  ["No sir, we are closed today, cannot come", "ok bye"],
];
for (let i = 0; i < 3; i++) {
  const id = job.calls[i].id;
  let v = await fetch(`${B}/api/calls?id=${id}`).then(j);
  if (i === 0) {
    check("first line discloses it is an AI", /AI assistant/i.test(v.transcript[0].text), v.transcript[0].text);
  }
  for (const line of scripts[i]) {
    if (v.status === "done") break;
    v = await post("/api/calls", { id, text: line });
    if (v.error) console.log("      call error:", v.error);
    console.log(`      [${i + 1}] provider: ${line}\n          butler:   ${v.transcript.at(-1).text}`);
  }
  check(`call ${i + 1} ended on its own`, v.status === "done", `after ${v.transcript.length} lines`);
}

s = await fetch(B + "/api/state").then(j);
const jb = s.jobs[0];
for (const c of jb.calls) console.log(`      quote: ${c.label} | available: ${c.quote?.available} | ₹${c.quote?.price_inr} | ${c.quote?.eta_minutes} min | ${c.quote?.price_note ?? ""} | ${c.quote?.notes ?? ""}`);
check("job is ready", jb.status === "ready", jb.status);
const pick = jb.calls.find((c) => c.id === jb.recommendation?.callId);
check("a recommendation exists", Boolean(pick), pick ? `${pick.label}: ${jb.recommendation.reason}` : "");
check("closed provider is marked unavailable", jb.calls[2].quote?.available === false);
check("recommendation is not the closed provider", pick?.id !== jb.calls[2].id);

const bad = await fetch(B + "/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: jb.id, callId: "nope" }) });
check("booking an unknown provider is rejected", bad.status === 400);

s = await post("/api/jobs", { jobId: jb.id, callId: pick.id });
check("booking sets the job to booked", s.jobs[0].status === "booked");
const note = s.messages.filter((m) => m.from === "butler").at(-1);
check("confirmation note appears in the chat", Boolean(note), note?.text);

const outcomes = [];
for (const c of jb.calls) outcomes.push((await fetch(`${B}/api/calls?id=${c.id}`).then(j)).outcome);
check("providers see the right outcome", outcomes.filter((o) => o === "chosen").length === 1 && outcomes.filter((o) => o === "not_chosen").length === 2, outcomes.join(", "));

const friend = await fetch(`${B}/api/state?friend=ravi`).then(j);
check(
  "friend's side sees no butler notes, jobs, memories or offers",
  !friend.messages.some((m) => m.from === "butler") && friend.jobs.length === 0 && friend.memories.length === 0 && friend.suggestions.length === 0 && friend.contacts.length === 1
);
const callPage = await fetch(`${B}/call?id=${jb.calls[0].id}`);
check("call page loads", callPage.status === 200);
const invalid = await fetch(`${B}/api/calls?id=bogus`);
check("an invalid call link is rejected", invalid.status === 404);

await fetch(B + "/api/state", { method: "DELETE" });
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
