// Runs every end-to-end suite against a running server, one after another, and reports.
// Usage: node tests/run-all.mjs [base-url]      (default http://localhost:3217)
// The server must have TEST_LOGIN_SECRET set, and this process the same value.
// Exit code is the number of suites that failed, so a pipeline can stop on it.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:3217";
const suites = readdirSync(here).filter((f) => f.endsWith("-test.mjs")).sort();

let failed = 0;
for (const suite of suites) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(here, suite), base], { encoding: "utf8", env: process.env });
  const output = `${run.stdout}\n${run.stderr}`;
  const passed = (output.match(/^PASS /gm) ?? []).length;
  const ok = run.status === 0 && /ALL PASSED/.test(output);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${suite.replace("-test.mjs", "").padEnd(12)} ${String(passed).padStart(3)} checks  ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (!ok) console.log(output.split("\n").filter((l) => /^FAIL|Error/.test(l)).slice(0, 8).join("\n"));
}
console.log(failed ? `\n${failed} of ${suites.length} suites failed` : `\nall ${suites.length} suites passed`);
process.exit(failed);
