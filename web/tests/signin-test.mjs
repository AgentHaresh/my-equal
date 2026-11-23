// Test of sign-in while it is Google only: phone sign-in is switched off for real people.
// Usage: node tests/signin-test.mjs <base-url>
import { anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const SECRET = process.env.TEST_LOGIN_SECRET ?? "localtest";
const { check, finish } = checker();
const link = anon(B);

const info = await link.json("/api/auth");
check("the sign-in screen is told phone codes are off", info.sms === false);

let res = await link.call("/api/auth", "POST", { phone: "9876543210" });
check("asking for a phone code is refused", res.status === 400 && /Google/.test((await res.json()).error ?? ""));
res = await link.call("/api/auth", "POST", { phone: "9876543210", code: "123456" });
check("giving a phone code is refused", res.status === 400);

res = await link.call("/api/auth", "POST", { credential: "not-a-real-google-token" });
check("a fake Google token is refused", res.status === 401 || res.status === 503, String(res.status));
check("an empty sign-in asks for Google", (await link.call("/api/auth", "POST", {})).status === 400);

// The automated tests can still sign in (by number or address) with the server's secret.
const stamp = Date.now().toString(36);
res = await link.call("/api/auth", "POST", { phone: "9000000077", name: "Test Phone", secret: SECRET });
check("the test login by number still works", res.status === 200);
const cookie = res.headers.get("set-cookie")?.split(";")[0];
res = await fetch(B + "/api/chats", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ phone: "9000000078" }) });
check("starting a chat by phone number is refused", res.status === 400);
res = await link.call("/api/auth", "POST", { email: `t-${stamp}@example.com`, name: "Test Mail", secret: SECRET });
check("the test login by address still works", res.status === 200);

finish();
