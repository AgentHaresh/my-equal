// Shared helpers for the end-to-end tests. Tests sign in through the server's test-only login,
// which needs TEST_LOGIN_SECRET to match the server's.
const SECRET = process.env.TEST_LOGIN_SECRET ?? "localtest";

const send = (B, cookie) => (path, method = "GET", body) =>
  fetch(B + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

/** Sign in as a test person. Returns their account and request helpers that carry their session. */
export async function signIn(B, email, name) {
  const res = await send(B)("/api/auth", "POST", { secret: SECRET, email, name });
  if (!res.ok) throw new Error(`test sign-in failed: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const { user } = await res.json();
  const call = send(B, cookie);
  return { user, cookie, call, json: (path, method, body) => call(path, method, body).then((r) => r.json()) };
}

/** Requests with no session, as a link-opened page would make them. */
export function anon(B) {
  const call = send(B);
  return { call, json: (path, method, body) => call(path, method, body).then((r) => r.json()) };
}

export function checker() {
  let fails = 0;
  const check = (name, ok, extra = "") => {
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  };
  const finish = () => {
    console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
    process.exit(fails ? 1 : 0);
  };
  return { check, finish };
}
