// Test of the scam shield against a running server. Usage: node scam-test.mjs <base-url>
const B = process.argv[2] ?? "http://localhost:3217";
const j = (r) => r.json();
const send = (contactId, text) => fetch(B + "/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId, from: "them", text }) }).then(j);
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const last = async (contactId, view) => {
  const s = await fetch(`${B}/api/state${view}`).then(j);
  return s.messages.filter((m) => m.contactId === contactId).at(-1);
};

await fetch(B + "/api/state", { method: "DELETE" });

// Genuine messages to the user's own number must not be flagged.
const genuine = [
  "Your Amazon order has been shipped and will arrive tomorrow by 9 PM.",
  "Hi, this is Dr. Rao's clinic. Your appointment is confirmed for Monday 10 AM.",
  "Rs 2,500.00 debited from A/c XX1234 on 21-Nov-26. Avl bal Rs 18,200. -HDFC Bank",
  "Hello, is this Suresh? Sorry, wrong number.",
  "Sir mee bike service aipoyindi, repu vachi teesukondi. - Sri Sai Motors",
];
for (const text of genuine) {
  const reply = await send("unknown-me", text);
  if (reply.error) console.log("      error:", reply.error);
  const m = await last("unknown-me", "");
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
  await fetch(B + "/api/state", { method: "DELETE" }); // each scam judged on its own
  const reply = await send("unknown-nanna", text);
  const m = await last("unknown-nanna", "?protected=unknown-nanna");
  check(`scam flagged: ${text.slice(0, 48)}`, Boolean(m.scam), m.scam ? `${m.scam.pattern} | ${m.scam.reason} | ${m.scam.advice}` : "not flagged");
  const mine = await fetch(B + "/api/state").then(j);
  const alert = mine.suggestions.find((s) => s.type === "guardian");
  check("  guardian alert raised for the user", Boolean(alert), alert?.title ?? "");
  check("  sender is not told it was flagged", !reply.messages.some((x) => x.scam));
  check("  the family thread is not in the user's own chats", !mine.contacts.some((c) => c.id === "unknown-nanna") && !mine.messages.some((x) => x.contactId === "unknown-nanna"));
}

// A scam sent to the user directly is flagged in their own chat, with no guardian alert.
await fetch(B + "/api/state", { method: "DELETE" });
await send("unknown-me", "Your electricity connection will be disconnected tonight at 9:30 PM as your bill is not updated. Call officer 98765xxxxx immediately and share the OTP.");
const own = await fetch(B + "/api/state").then(j);
const ownMsg = own.messages.filter((m) => m.contactId === "unknown-me").at(-1);
check("scam to the user is flagged in their own chat", Boolean(ownMsg.scam), ownMsg.scam?.pattern ?? "");
check("no guardian alert for the user's own thread", !own.suggestions.some((s) => s.type === "guardian"));
check("family phone page loads", (await fetch(`${B}/protected?c=unknown-nanna`)).status === 200);

await fetch(B + "/api/state", { method: "DELETE" });
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
