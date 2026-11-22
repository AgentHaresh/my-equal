// Test of two things a real account gets: a scam warning when a stranger writes, and an errand
// started by asking Equal directly. Usage: node tests/stranger-test.mjs <base-url>
import { signIn, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const stamp = Date.now().toString(36);

const me = await signIn(B, `me-${stamp}@example.com`, "Meera");
const stranger = await signIn(B, `stranger-${stamp}@example.com`, "Inspector Sharma");
const friend = await signIn(B, `friend-${stamp}@example.com`, "Farah");

// --- A stranger writes first with a classic "digital arrest" scam.
const toMe = (await stranger.json("/api/chats", "POST", { userId: me.user.id })).contactId;
await stranger.json("/api/messages", "POST", {
  contactId: toMe,
  text: "This is Inspector Sharma from CBI. A parcel in your name has illegal items. You are under digital arrest. Do not tell anyone. Transfer Rs 50,000 to the RBI safe account now to verify.",
});
let flagged;
for (let i = 0; i < 30 && !flagged; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await me.json("/api/state");
  const c = s.contacts.find((x) => x.userId === stranger.user.id);
  flagged = s.messages.find((m) => m.contactId === c?.id && m.from === "them" && m.scam);
}
check("a scam from someone I never wrote to is flagged in my chat", Boolean(flagged), flagged?.scam?.pattern ?? "not flagged");

// --- Someone I already talk to is not scam-checked (their messages are read as usual).
const toFriend = (await me.json("/api/chats", "POST", { userId: friend.user.id })).contactId;
await me.json("/api/messages", "POST", { contactId: toFriend, text: "Hi Farah, lunch on Sunday?" });
const fromFriendSide = (await friend.json("/api/state")).contacts.find((c) => c.userId === me.user.id)?.id;
await friend.json("/api/messages", "POST", { contactId: fromFriendSide, text: "Yes! Send me the address." });
await new Promise((r) => setTimeout(r, 3000));
const s = await me.json("/api/state");
check("a friend's ordinary reply is not flagged", !s.messages.some((m) => m.contactId === toFriend && m.scam));

// --- Asking Equal directly for an errand starts the call-around straight away.
const ans = await me.json("/api/ask", "POST", { question: "My car broke down near Gachibowli, find me a mechanic today" });
check("asking for a mechanic starts an errand", Boolean(ans.errand?.jobId), ans.error ?? ans.answer);
const after = await me.json("/api/state");
const job = after.jobs.find((j) => j.id === ans.errand?.jobId);
check("the call-around is running, with nothing booked", job?.status === "calling" && !job?.bookedCallId);
// Telling Equal the problem in Telugu-English works the same way; asking again while it is still
// calling says so instead of promising a second search.
const again = await me.json("/api/ask", "POST", { question: "bro naa bandi kaarab ayindi! I need to get it repaired!" });
check("asking again while calling points at the running one", again.errand?.jobId === ans.errand?.jobId && again.errand?.already === true, again.answer);
// The user can stop and remove a call-around; asking afterwards starts a fresh one.
const removed = await me.call("/api/jobs", "DELETE", { jobId: ans.errand?.jobId });
const afterRemove = await removed.json();
check("a call-around can be stopped and removed", removed.status === 200 && !afterRemove.jobs.some((j) => j.id === ans.errand?.jobId));
check("a removed call-around's provider link no longer works", (await me.call(`/api/calls?id=${job?.calls?.[0]?.id}`)).status >= 400);
const fresh = await me.json("/api/ask", "POST", { question: "bro naa bandi kaarab ayindi! I need to get it repaired!" });
check("after removing, the same request starts a new call-around", Boolean(fresh.errand?.jobId) && fresh.errand.jobId !== ans.errand?.jobId && !fresh.errand.already, fresh.answer);
check("an ordinary question starts no errand", !(await me.json("/api/ask", "POST", { question: "When is Farah's lunch?" })).errand);

finish();
