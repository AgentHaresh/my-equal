// Test of the scam shield. Usage: node tests/scam-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const me = await signIn(B, "test-scam@example.com", "Scam Tester");
const link = anon(B);
const u = me.user.id;

// A stranger sends a message to one of the account's unknown-number threads.
const stranger = (contactId, text) => link.json("/api/messages", "POST", { contactId, from: "them", text, u });
const lastOf = (s, contactId) => s.messages.filter((m) => m.contactId === contactId).at(-1);

await me.json("/api/state", "DELETE");

// Genuine messages to the user's own number must not be flagged.
const genuine = [
  "Your Amazon order has been shipped and will arrive tomorrow by 9 PM.",
  "Hi, this is Dr. Rao's clinic. Your appointment is confirmed for Monday 10 AM.",
  "Rs 2,500.00 debited from A/c XX1234 on 21-Nov-26. Avl bal Rs 18,200. -HDFC Bank",
  "Hello, is this Suresh? Sorry, wrong number.",
  "Sir mee bike service aipoyindi, repu vachi teesukondi. - Sri Sai Motors",
];
for (const text of genuine) {
  await stranger("unknown-me", text);
  const m = lastOf(await me.json("/api/state"), "unknown-me");
  check(`genuine not flagged: ${text.slice(0, 48)}`, !m.scam, m.scam ? m.scam.pattern + ": " + m.scam.reason : "");
}

// Scam messages to the protected family member must be flagged.
const scams = [
  "This is Inspector Sharma from CBI Mumbai. A parcel in your name contains illegal drugs. You are under digital arrest. Do not disconnect or tell anyone. Transfer Rs 50,000 to the RBI safe account for verification.",
  "Dear customer aapka SBI account KYC expire ho gaya hai. Aaj raat tak account block ho jayega. Abhi is link par click karke update karein: http://sbi-kyc-update.in",
  "Nanna, nenu ra. Idi naa kotha number. Urgent ga 20,000 kavali, hospital lo unna. Ee number ki GPay cheyyi, evvariki cheppaku.",
  "Congratulations! You have been selected for a work-from-home job. Earn Rs 5,000 daily by liking videos. Pay Rs 999 registration fee to start.",
];
for (const text of scams) {
  await me.json("/api/state", "DELETE"); // each scam judged on its own
  const reply = await stranger("unknown-nanna", text);
  const m = lastOf(await link.json(`/api/state?protected=unknown-nanna&u=${u}`), "unknown-nanna");
  check(`scam flagged: ${text.slice(0, 48)}`, Boolean(m?.scam), m?.scam ? `${m.scam.pattern} | ${m.scam.reason}` : "not flagged");
  const mine = await me.json("/api/state");
  const alert = mine.suggestions.find((s) => s.type === "guardian");
  check("  guardian alert raised for the user", Boolean(alert), alert?.title ?? "");
  check("  sender is not told it was flagged", !reply.messages.some((x) => x.scam));
  check("  the family thread is not in the user's own chats", !mine.contacts.some((c) => c.id === "unknown-nanna") && !mine.messages.some((x) => x.contactId === "unknown-nanna"));
}

// A scam sent to the user directly is flagged in their own chat, with no guardian alert.
await me.json("/api/state", "DELETE");
await stranger("unknown-me", "Your electricity connection will be disconnected tonight at 9:30 PM as your bill is not updated. Call officer 98765xxxxx immediately and share the OTP.");
const own = await me.json("/api/state");
check("scam to the user is flagged in their own chat", Boolean(lastOf(own, "unknown-me").scam), lastOf(own, "unknown-me").scam?.pattern ?? "");
check("no guardian alert for the user's own thread", !own.suggestions.some((s) => s.type === "guardian"));
check("family phone page loads", (await link.call(`/protected?u=${u}&c=unknown-nanna`)).status === 200);
check("a link naming no account is rejected", (await link.call("/api/state?protected=unknown-nanna&u=nobody")).status === 404);

await me.json("/api/state", "DELETE");
finish();
