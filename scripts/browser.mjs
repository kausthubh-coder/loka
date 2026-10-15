// Builds and runs the real browser (Helium + Loka patches) from a checkout outside OneDrive.
//
//   bun run browser:setup   create or sync the build checkout (default C:\src\loka) to this commit
//   bun run browser:build   first build (hours), or an incremental rebuild once one exists
//   bun run browser:run     open the dev build with its own throwaway profile
//   bun run build:status    what the current or last incremental build is doing, and recent build times
//   bun run browser:build -- --stop-test-browsers   first stop throwaway test browsers that hold out\Default
//
// The build checkout is a git worktree of this repo, so patch work done there is committed like any branch. It is
// the one heavy resource every worktree shares: one build at a time (build.lock, written by build_log.py), and
// test runs use the packaged snapshot (dist\snapshot) while a build is writing out\Default.
// The browser builds on Windows only today; docs/cross-platform.md lists what macOS needs.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const BUILD_DIR = resolve(
	process.env.LOKA_BUILD_DIR ?? (process.platform === "win32" ? "C:\\src\\loka" : join(homedir(), "src", "loka")),
);
const repo = resolve(import.meta.dirname, "..");

/** Where this platform's build puts the browser, and the packaged copy tests use while a build runs. */
export const BUILT_BINARY = join(
	BUILD_DIR,
	"build",
	"src",
	"out",
	"Default",
	{ win32: "chrome.exe", darwin: join("Loka.app", "Contents", "MacOS", "Loka") }[String(process.platform)] ?? "chrome",
);
export const SNAPSHOT_BINARY = join(BUILD_DIR, "dist", "snapshot", "chrome.exe");

/** Off Windows there is no browser build yet: says so and exits 2 (skipped, not failed). @param {string} what */
export function requireWindowsBuild(what) {
	if (process.platform === "win32") return;
	console.error(
		`${what}: skipped. The browser builds and runs on Windows only today (${process.platform} here). ` +
			"docs/cross-platform.md lists what the macOS port needs; CI builds Windows (main.yml).",
	);
	process.exit(2);
}

/** @param {number} pid */
function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** Why out\Default is busy right now: a live build.lock, a compile.log with no exit line, a compiling status. */
export function buildRunning() {
	const reasons = [];
	const lock = join(BUILD_DIR, "build.lock");
	if (existsSync(lock)) {
		let held = null;
		try {
			held = JSON.parse(readFileSync(lock, "utf8"));
		} catch {}
		if (!held || alive(Number(held.pid))) reasons.push(`build.lock is held${held ? ` by pid ${held.pid}` : ""}`);
	}
	const log = join(BUILD_DIR, "compile.log");
	if (existsSync(log)) {
		const last = readFileSync(log, "utf8").trimEnd().split("\n").at(-1) ?? "";
		if (!last.includes("compile exited")) reasons.push("compile.log has no exit line yet");
	}
	const statusFile = join(BUILD_DIR, "build-status.json");
	if (existsSync(statusFile)) {
		const status = JSON.parse(readFileSync(statusFile, "utf8"));
		if (status.phase === "compiling" && alive(status.pid))
			reasons.push(`build-status.json says compiling (pid ${status.pid})`);
	}
	return reasons;
}

/**
 * The browser a test should drive, and why: LOKA_CHROME; else the dev build when no build is writing it; else the
 * packaged snapshot. `path` is "" when there is none.
 */
export function testBinary() {
	if (process.env.LOKA_CHROME) return { path: resolve(process.env.LOKA_CHROME), why: "LOKA_CHROME" };
	const busy = buildRunning();
	if (existsSync(BUILT_BINARY) && busy.length === 0)
		return { path: BUILT_BINARY, why: "the dev build (no build running)" };
	if (existsSync(SNAPSHOT_BINARY))
		return {
			path: SNAPSHOT_BINARY,
			why: busy.length ? `the snapshot, since a build is running (${busy.join("; ")})` : "the snapshot (no dev build)",
		};
	return {
		path: "",
		why: existsSync(BUILT_BINARY) ? `a build is running (${busy.join("; ")}) and there is no snapshot` : "no build",
	};
}

/**
 * Browsers running from out\Default (each tree's root process and its profile). They lock chrome.exe and its DLLs,
 * so the next build fails to link. Windows only.
 */
export function browsersHoldingBuild() {
	if (process.platform !== "win32") return [];
	const dir = join(BUILD_DIR, "build", "src", "out", "Default");
	const query = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.ExecutablePath -like '${dir}\\*' -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }`;
	return spawnSync("powershell", ["-NoProfile", "-Command", query], { encoding: "utf8" })
		.stdout.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => {
			const [pid = "", command = ""] = line.split(/\|(.*)/s);
			const profile = /--user-data-dir=("([^"]+)"|(\S+))/.exec(command);
			return { pid: Number(pid), profile: resolve(profile?.[2] ?? profile?.[3] ?? "(default profile)") };
		});
}

/** A profile some test made and deletes (profile-verify, profile-qa-<time>, profile-<name>-<time>), not profile-dev. @param {string} profile */
export const isTestProfile = (profile) => {
	const inBuild = resolve(profile).toLowerCase().startsWith(join(BUILD_DIR, "profile-").toLowerCase());
	return inBuild && !/[\\/]profile-dev$/i.test(profile);
};

/** @param {string} cmd @param {string[]} args @param {import("node:child_process").SpawnSyncOptions} [opts] */
function run(cmd, args, opts = {}) {
	const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
	if (result.status !== 0) {
		console.error(`\n${cmd} ${args.join(" ")} failed (exit ${result.status})`);
		process.exit(result.status ?? 1);
	}
}

/** @param {string} cmd @param {string[]} args @param {string} [cwd] */
function output(cmd, args, cwd = repo) {
	return spawnSync(cmd, args, { cwd, encoding: "utf8" }).stdout.trim();
}

function setup() {
	if (BUILD_DIR.toLowerCase().includes("onedrive")) {
		console.error(
			`${BUILD_DIR} is inside OneDrive. Chromium's tree is ~100 GB; set LOKA_BUILD_DIR to a folder outside it.`,
		);
		process.exit(1);
	}
	const busy = buildRunning();
	if (busy.length) {
		console.error(`Not syncing ${BUILD_DIR} under a running build (${busy.join("; ")}).`);
		process.exit(1);
	}
	// C++ edited in build\src but never exported lives only there; moving the checkout to a commit whose patches
	// don't have it is how it gets lost. Same check as `bun run patches:check`.
	if (existsSync(join(BUILD_DIR, "build", "src"))) {
		const check = spawnSync("python", [join(repo, "scripts", "patches_check.py")], {
			stdio: "inherit",
			env: { ...process.env, LOKA_BUILD_DIR: BUILD_DIR },
		});
		if (check.status !== 0) {
			console.error(`\nNot syncing ${BUILD_DIR}: export the edits above into patches/loka and commit them first.`);
			process.exit(1);
		}
	}
	const commit = output("git", ["rev-parse", "HEAD"]);
	if (!existsSync(BUILD_DIR)) {
		mkdirSync(resolve(BUILD_DIR, ".."), { recursive: true });
		run("git", ["worktree", "add", "--detach", BUILD_DIR, commit], { cwd: repo });
	} else {
		const dirty = output("git", ["status", "--porcelain", "--untracked-files=no"], BUILD_DIR);
		if (dirty) {
			console.error(`${BUILD_DIR} has uncommitted changes; commit or stash them before syncing.\n${dirty}`);
			process.exit(1);
		}
		run("git", ["checkout", "--detach", commit], { cwd: BUILD_DIR });
	}
	run("git", ["submodule", "update", "--init", "--recursive"], { cwd: BUILD_DIR });
	console.log(`\nBuild checkout ready at ${BUILD_DIR} (${commit.slice(0, 8)}). Next: bun run browser:build`);
}

function build() {
	if (!existsSync(BUILD_DIR)) {
		console.error("No build checkout yet. Run: bun run browser:setup");
		process.exit(1);
	}
	const busy = buildRunning();
	if (busy.length) {
		console.error(`A build is already running (${busy.join("; ")}). One build at a time: bun run build:status`);
		process.exit(1);
	}
	// A running chrome.exe from out\Default locks its files, and the link fails ~25 minutes in.
	const holding = browsersHoldingBuild();
	if (holding.length && process.argv.includes("--stop-test-browsers")) {
		for (const b of holding.filter((h) => isTestProfile(h.profile))) {
			console.log(`Stopping the test browser ${b.pid} (${b.profile}) and its children`);
			spawnSync("taskkill", ["/T", "/F", "/PID", String(b.pid)], { stdio: "ignore" });
		}
	}
	const left = browsersHoldingBuild();
	if (left.length) {
		console.error(
			`Not building: ${left.length} browser(s) run from out\\Default and would fail the link:\n${left
				.map((b) => `  pid ${b.pid}, profile ${b.profile}${isTestProfile(b.profile) ? " (a test profile)" : ""}`)
				.join("\n")}\n` +
				"Close them first. bun run browser:build -- --stop-test-browsers stops the test ones (never profile-dev).",
		);
		process.exit(1);
	}
	const firstBuild = !existsSync(join(BUILD_DIR, "build", "src", "BUILD.gn"));
	console.log(firstBuild ? "First build: downloads ~3.7 GB, then compiles for several hours." : "Incremental rebuild.");
	run("python", [join(BUILD_DIR, "scripts", "loka_build.py"), firstBuild ? "first" : "incremental"], {
		cwd: BUILD_DIR,
	});
}

// First-run defaults for a new profile, read by Chromium from `initial_preferences` beside chrome.exe. Loka's
// sidebar is the side panel, on the left. Helium's own vertical tabs would list the same tabs again, so they go on
// the right under Helium's Zen mode, which hides them until the pointer reaches that edge; the toolbar stays pinned.
export const INITIAL_PREFERENCES = {
	distribution: { skip_first_run_ui: true, suppress_first_run_default_browser_prompt: true },
	side_panel: { is_right_aligned: false },
	helium: {
		browser: {
			// Vertical layout on the left, where the organizer panel shows the Loka sidebar. Zen mode with the top
			// chrome unpinned hides the toolbar row; the sidebar has its own back, forward, reload and address.
			layout: 2,
			vertical_right_aligned: false,
			zen_mode: true,
			zen_mode_sidebar_pinned: true,
			zen_mode_top_chrome_pinned: false,
		},
	},
	vertical_tabs: { collapsed_state: false },
};

function launch() {
	const out = join(BUILD_DIR, "build", "src", "out", "Default");
	const chrome = BUILT_BINARY;
	if (!existsSync(chrome)) {
		console.error(`No build at ${chrome}. Run: bun run browser:build`);
		process.exit(1);
	}
	writeFileSync(join(out, "initial_preferences"), JSON.stringify(INITIAL_PREFERENCES, null, 2));
	// The Loka sidebar is part of the build (components/loka_sidebar; `bun run webui:build` refreshes it).
	// A throwaway profile next to the build, never anyone's real browser profile.
	const profile = join(BUILD_DIR, "profile-dev");
	run(chrome, [`--user-data-dir=${profile}`, ...process.argv.slice(3)]);
}

/** Prints build-status.json and the last build times (both written by scripts/build_log.py). */
function status() {
	const statusFile = join(BUILD_DIR, "build-status.json");
	if (!existsSync(statusFile)) {
		console.log(`No ${statusFile} yet: no incremental build has run since build_log.py was added.`);
	} else {
		const s = JSON.parse(readFileSync(statusFile, "utf8"));
		let alive = false;
		try {
			process.kill(s.pid, 0);
			alive = true;
		} catch {}
		if (s.phase === "compiling") {
			const minutes = Math.round((Date.now() - new Date(s.started).getTime()) / 60000);
			const state = alive
				? `running for ${minutes} min (pid ${s.pid})`
				: `stopped without finishing (pid ${s.pid} is gone)`;
			console.log(`Build: ${s.mode}, -j ${s.jobs}, started ${s.started}, ${state}`);
		} else {
			console.log(
				`Last build: ${s.mode}, -j ${s.jobs}, ${s.phase} (exit ${s.exit}) at ${s.ended} after ${s.seconds} s`,
			);
		}
		console.log(`Last error: ${s.last_error ?? "none"}`);
	}
	const times = join(BUILD_DIR, "build-times.log");
	if (existsSync(times)) {
		console.log("\nRecent builds (build-times.log):");
		for (const line of readFileSync(times, "utf8").trim().split("\n").slice(-5)) console.log(`  ${line}`);
	}
	// compile.bat's own log, whose last line reads "compile exited with N" once its build is over.
	const compileLog = join(BUILD_DIR, "compile.log");
	if (existsSync(compileLog)) {
		const last = readFileSync(compileLog, "utf8").trimEnd().split("\n").at(-1) ?? "";
		console.log(`\ncompile.log: ${last.includes("compile exited") ? last.trim() : "still running (no exit line yet)"}`);
	}
	const lock = join(BUILD_DIR, "build.lock");
	if (existsSync(lock)) console.log(`\nbuild.lock: ${readFileSync(lock, "utf8").trim()}`);
	const holding = browsersHoldingBuild();
	if (holding.length)
		console.log(
			`\nBrowsers running from out\\Default (the next build can't link until they close):\n${holding
				.map((b) => `  pid ${b.pid}, profile ${b.profile}${isTestProfile(b.profile) ? " (a test profile)" : ""}`)
				.join("\n")}`,
		);
	const test = testBinary();
	console.log(`\nTests drive: ${test.path || "nothing"} (${test.why})`);
}

if (import.meta.main) {
	const command = process.argv[2];
	if (command === "setup" || command === "build" || command === "run") requireWindowsBuild(`browser:${command}`);
	if (command === "setup") setup();
	else if (command === "build") build();
	else if (command === "run") launch();
	else if (command === "status") status();
	else {
		console.error("Usage: bun scripts/browser.mjs <setup|build|run|status>");
		process.exit(1);
	}
}
