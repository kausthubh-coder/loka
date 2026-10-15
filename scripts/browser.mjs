// Builds and runs the real browser (Helium + Loka patches) from a checkout outside OneDrive.
//
//   bun run browser:setup   create or sync the build checkout (default C:\src\loka) to this commit
//   bun run browser:build   first build (hours), or an incremental rebuild once one exists
//   bun run browser:run     open the dev build with its own throwaway profile
//
// The build checkout is a git worktree of this repo, so patch work done there is committed like any branch.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
const INITIAL_PREFERENCES = {
	distribution: { skip_first_run_ui: true, suppress_first_run_default_browser_prompt: true },
	side_panel: { is_right_aligned: false },
	helium: {
		browser: {
			layout: 2,
			vertical_right_aligned: true,
			zen_mode: true,
			zen_mode_sidebar_pinned: false,
			zen_mode_top_chrome_pinned: true,
		},
	},
	vertical_tabs: { collapsed_state: true },
};

function launch() {
	const out = join(BUILD_DIR, "build", "src", "out", "Default");
	const chrome = join(out, "chrome.exe");
	if (!existsSync(chrome)) {
		console.error(`No build at ${chrome}. Run: bun run browser:build`);
		process.exit(1);
	}
	writeFileSync(join(out, "initial_preferences"), JSON.stringify(INITIAL_PREFERENCES, null, 2));
	// The Loka sidebar, from this checkout (`bun run ext:build` makes it). Until it's built into the browser as a
	// component, it loads as an unpacked extension; non-Google Chromium builds allow that.
	const extension = join(repo, "extension", "dist");
	if (!existsSync(join(extension, "manifest.json"))) {
		console.error("The Loka sidebar isn't built yet. Run: bun run ext:build");
		process.exit(1);
	}
	// A throwaway profile next to the build, never anyone's real browser profile.
	const profile = join(BUILD_DIR, "profile-dev");
	run(chrome, [`--user-data-dir=${profile}`, `--load-extension=${extension}`, ...process.argv.slice(3)]);
}

if (import.meta.main) {
	const command = process.argv[2];
	if (command === "setup") setup();
	else if (command === "build") build();
	else if (command === "run") launch();
	else {
		console.error("Usage: bun scripts/browser.mjs <setup|build|run>");
		process.exit(1);
	}
}
