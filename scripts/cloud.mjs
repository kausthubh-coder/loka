// Makes a cloud session (Claude Code on the web, Codex Cloud) ready by itself. A cloud VM starts from a bare Linux
// clone: no global skills, no deps, no .claude/skills link.
//
//   Claude: the SessionStart hook in .claude/settings.json runs `node scripts/cloud.mjs`
//   Codex:  the environment's setup script is `CLOUD=1 node scripts/cloud.mjs`
//
// Local sessions don't set CLAUDE_CODE_REMOTE, CODEX_CI or CLOUD, so it exits at once there.
// stdout becomes the session's context, so only my rules and the last line go there; setup's output goes to stderr.
// The Chromium/Helium browser build is skipped on purpose: it's Windows-only, ~100 GB and hours. CI builds it.
// No dependency is imported at load time: this runs before the install.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

if (process.env.CLAUDE_CODE_REMOTE !== "true" && !process.env.CODEX_CI && process.env.CLOUD !== "1") process.exit(0);

const root = resolve(import.meta.dirname, "..");
/** @type {string[]} */
const problems = [];
/** @param {string} command @param {"inherit" | NodeJS.WriteStream} stdout */
const run = (command, stdout) =>
	spawnSync(command, { cwd: root, shell: true, stdio: ["ignore", stdout, "inherit"] }).status === 0;

// 1. My global skills and rules. Its stdout (the rules) passes through to the session.
if (!run("curl -fsSL https://raw.githubusercontent.com/kausthubh-coder/skills/main/cloud/session.sh | bash", "inherit"))
	problems.push("the global skills and rules didn't load");

// 2. bun, which setup and every repo script need. Claude's VM has it; other clouds may not.
const bunHome = join(homedir(), ".bun", "bin");
if (!run("bun --version", process.stderr)) {
	run("curl -fsSL https://bun.sh/install | bash", process.stderr);
	process.env.PATH = `${bunHome}:${process.env.PATH}`;
}
const bun = run("bun --version", process.stderr);
if (!bun) problems.push("bun isn't installed and installing it failed");

// 3. Setup: deps, port, skills link, then the doctor. Its output goes to stderr.
if (bun && !run("bun scripts/setup.mjs", process.stderr))
	problems.push("setup or the doctor failed (run bun run doctor)");

// 4. A browser for verify-loka. Deps are installed now, so the launcher can load playwright.
const { findBrowser } = existsSync(join(root, "node_modules", "playwright"))
	? await import("./test-browser.mjs")
	: { findBrowser: () => null };
if (!findBrowser() && !run("node node_modules/playwright/cli.js install chromium", process.stderr))
	problems.push("no browser for verify-loka, and installing Playwright's Chromium failed");

console.log(
	problems.length
		? `cloud: Loka NOT ready: ${problems.join("; ")}.`
		: "cloud: Loka prototype ready (deps, port, skills, browser); the Windows browser build is skipped here. See ## Cloud sessions in AGENTS.md.",
);
