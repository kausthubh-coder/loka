// Removes a worktree of this repo cleanly, on Windows, Linux and macOS:
//   bun run worktree:remove <path> [--force]
// Stops processes running from the worktree (its dev server and their children), deletes the .claude/skills link
// without following it, then runs `git worktree remove`. Refuses the main checkout and the build checkout.

import { spawnSync } from "node:child_process";
import { lstatSync, rmdirSync, unlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { BUILD_DIR } from "./browser.mjs";
import { worktrees } from "./setup.mjs";

const target = process.argv[2] ? resolve(process.argv[2]) : "";
const force = process.argv.includes("--force");
const all = worktrees();
const caseless = process.platform !== "linux";
const same = (/** @type {string} */ a, /** @type {string} */ b) =>
	caseless ? a.toLowerCase() === b.toLowerCase() : a === b;

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

// Processes running from inside the worktree (its dev server is node_modules/.bin/vite there). Matching by path
// rather than by port also catches servers bound only to ::1, which `netstat -p TCP` doesn't list.
const ours = new Set([process.pid, process.ppid]);
if (process.platform === "win32") {
	const query = `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and ($_.ExecutablePath -like '${target}\\*' -or $_.CommandLine -like '*${target}\\*') } | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`;
	const found = spawnSync("powershell", ["-NoProfile", "-Command", query], { encoding: "utf8" })
		.stdout.split(/\r?\n/)
		.map((l) => l.trim().split(" "))
		.filter(([pid]) => pid && !ours.has(Number(pid)));
	for (const [pid, name] of found) {
		console.log(`Stopping ${name} (PID ${pid}) and its children`);
		spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
	}
} else {
	// Dev servers started with setsid lead their own process group, so signalling the group stops their children.
	const group = (/** @type {number} */ pid) =>
		Number(spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim());
	const ownGroup = group(process.pid);
	const found = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" })
		.stdout.split("\n")
		.map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
		.filter((m) => m?.[2]?.includes(`${target}${sep}`) && !ours.has(Number(m[1])));
	for (const m of found) {
		const pid = Number(m?.[1]);
		const pgid = group(pid);
		console.log(
			`Stopping ${(m?.[2] ?? "").slice(0, 80)} (PID ${pid}${pgid && pgid !== ownGroup ? `, group ${pgid}` : ""})`,
		);
		try {
			process.kill(pgid && pgid !== ownGroup ? -pgid : pid, "SIGTERM");
		} catch {} // gone already, with its group
	}
}

// Remove the link itself; a recursive delete would follow it into the real .agents/skills. Windows makes it a
// junction (rmdir removes it), elsewhere it is a symlink (unlink).
const link = join(target, ".claude", "skills");
if (lstatSync(link, { throwIfNoEntry: false })) (process.platform === "win32" ? rmdirSync : unlinkSync)(link);

// git refuses to remove any worktree holding a submodule (helium-chromium) without --force, so the
// uncommitted-changes check that --force would skip happens above instead.
const result = spawnSync("git", ["worktree", "remove", "--force", target], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Removed ${target}`);
