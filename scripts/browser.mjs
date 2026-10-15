// Builds and runs the real browser (Helium + Loka patches) from a checkout outside OneDrive.
//
//   bun run browser:setup   create or sync the build checkout (default C:\src\loka) to this commit
//   bun run browser:build   first build (hours), or an incremental rebuild once one exists
//   bun run browser:run     open the dev build with its own throwaway profile
//   bun run build:status    what the current or last incremental build is doing, and recent build times
//
// The build checkout is a git worktree of this repo, so patch work done there is committed like any branch.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const BUILD_DIR = resolve(process.env.LOKA_BUILD_DIR ?? "C:\\src\\loka");
const repo = resolve(import.meta.dirname, "..");

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
	const chrome = join(out, "chrome.exe");
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
}

if (import.meta.main) {
	const command = process.argv[2];
	if (command === "setup") setup();
	else if (command === "build") build();
	else if (command === "run") launch();
	else if (command === "status") status();
	else {
		console.error("Usage: bun scripts/browser.mjs <setup|build|run|status>");
		process.exit(1);
	}
}
