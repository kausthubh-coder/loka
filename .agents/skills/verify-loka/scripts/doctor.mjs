// Is the running prototype worth driving? Read-only.
//   node .agents/skills/verify-loka/scripts/doctor.mjs
// Checks: this checkout's PORT answers, it serves the Loka prototype, and the process listening on it was started
// from this checkout (not another worktree's server on a reused port).

import { spawnSync } from "node:child_process";
import { prototypePort, ROOT } from "./loka.mjs";

const port = prototypePort();
let ok = true;
const report = (/** @type {boolean} */ pass, /** @type {string} */ line) => {
	console.log(`${pass ? "ok  " : "FAIL"}  ${line}`);
	ok &&= pass;
};

const html = await fetch(`http://localhost:${port}/`)
	.then((r) => r.text())
	.catch(() => "");
report(html.includes("<title>Loka prototype</title>"), `http://localhost:${port}/ serves the Loka prototype`);

const owner = spawnSync(
	"powershell",
	[
		"-NoProfile",
		"-Command",
		`Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)").CommandLine } | Select-Object -First 1`,
	],
	{ encoding: "utf8" },
).stdout.trim();
report(owner.toLowerCase().includes(ROOT.toLowerCase()), `port ${port} is owned by this checkout's server`);
if (!ok) {
	console.log(`      listener: ${owner || "none"}`);
	console.log("      fix: start it with `bun run dev` from this checkout (see verify-loka, Launch)");
}
process.exit(ok ? 0 : 1);
