// Removes a worktree of this repo cleanly on Windows:
//   bun scripts/remove-worktree.mjs <path> [--force]
// Stops processes running from the worktree (its dev server and their children), deletes the .claude\skills junction
// without following it, then runs `git worktree remove`. Refuses the main checkout and the build checkout.

import { spawnSync } from "node:child_process";
import { existsSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILD_DIR } from "./browser.mjs";
import { worktrees } from "./setup.mjs";

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

const dirty = spawnSync("git", ["status", "--porcelain", "--ignore-submodules=none"], {
	cwd: target,
	encoding: "utf8",
}).stdout.trim();
if (dirty && !force) {
	console.error(`${target} has uncommitted changes. Commit them, or pass --force to discard them.\n${dirty}`);
	process.exit(1);
}

// Processes running from inside the worktree (its dev server is node_modules\.bin\vite.exe there). Matching by path
// rather than by port also catches servers bound only to ::1, which `netstat -p TCP` doesn't list.
const query = `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '${target}\\*' -or $_.CommandLine -like '*${target}\\*' } | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`;
const ours = new Set([String(process.pid), String(process.ppid)]);
const found = spawnSync("powershell", ["-NoProfile", "-Command", query], { encoding: "utf8" })
	.stdout.split(/\r?\n/)
	.map((l) => l.trim().split(" "))
	.filter(([pid]) => pid && !ours.has(pid));
for (const [pid, name] of found) {
	console.log(`Stopping ${name} (PID ${pid}) and its children`);
	spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
}

const junction = join(target, ".claude", "skills");
// rmdir removes the junction itself; a recursive delete would follow it into the real .agents\skills.
if (existsSync(junction)) rmdirSync(junction);

// git refuses to remove any worktree holding a submodule (helium-chromium) without --force, so the
// uncommitted-changes check that --force would skip happens above instead.
const result = spawnSync("git", ["worktree", "remove", "--force", target], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Removed ${target}`);
