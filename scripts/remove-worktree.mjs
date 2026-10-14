// Removes a worktree of this repo cleanly on Windows:
//   bun scripts/remove-worktree.mjs <path> [--force]
// Stops the dev server on the worktree's PORT (and its child processes), deletes the .claude\skills junction
// without following it, then runs `git worktree remove`. Refuses the main checkout and the build checkout.

import { spawnSync } from "node:child_process";
import { existsSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILD_DIR } from "./browser.mjs";
import { readPort, worktrees } from "./setup.mjs";

const target = process.argv[2] ? resolve(process.argv[2]) : "";
const force = process.argv.includes("--force");
const all = worktrees();
const same = (/** @type {string} */ a, /** @type {string} */ b) => a.toLowerCase() === b.toLowerCase();

if (!target || !all.some((dir) => same(dir, target))) {
	console.error(`Not a worktree of this repo: ${target || "(none given)"}\nWorktrees:\n  ${all.join("\n  ")}`);
	process.exit(1);
}
if (same(target, all[0] ?? "")) {
	console.error("That is the main checkout. It is never removed.");
	process.exit(1);
}
if (same(target, BUILD_DIR)) {
	console.error(
		`That is the build checkout (${BUILD_DIR}, ~100 GB and hours to rebuild). Remove it by hand if you mean it.`,
	);
	process.exit(1);
}

const port = readPort(target);
if (port !== null) {
	// netstat lines look like: "  TCP    127.0.0.1:5203    0.0.0.0:0    LISTENING    12345"
	const netstat = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).stdout;
	const pids = new Set(
		netstat
			.split(/\r?\n/)
			.filter((l) => l.includes("LISTENING") && new RegExp(`:${port}\\s`).test(l))
			.map((l) => l.trim().split(/\s+/).at(-1))
			.filter((pid) => pid && pid !== "0"),
	);
	for (const pid of pids) {
		console.log(`Stopping the process tree on port ${port} (PID ${pid})`);
		spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "inherit" });
	}
}

const junction = join(target, ".claude", "skills");
// rmdir removes the junction itself; a recursive delete would follow it into the real .agents\skills.
if (existsSync(junction)) rmdirSync(junction);

const result = spawnSync("git", ["worktree", "remove", ...(force ? ["--force"] : []), target], { stdio: "inherit" });
if (result.status !== 0) {
	console.error("git worktree remove failed. Uncommitted changes? Commit them, or pass --force to discard them.");
	process.exit(result.status ?? 1);
}
console.log(`Removed ${target}`);
