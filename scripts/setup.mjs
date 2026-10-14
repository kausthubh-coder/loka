// Prepares any checkout or worktree of this repo. Safe to rerun; finishes in seconds when nothing is missing.
//   1. installs deps if they're missing or don't match package.json
//   2. copies .env.local from the main checkout if this one has none
//   3. claims a PORT for the prototype that no other worktree has claimed
//   4. links .claude/skills to .agents/skills
//   5. runs the doctor
// The prototype has no backend: it saves to localStorage, which the browser keys by origin, so a different
// port is all a worktree needs to keep its own data.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export const GITHUB_REPO = "kausthubh-coder/loka";
const PORT_BASE = 5200;
const PORT_RANGE = 400;

/** @param {number} port @param {string} host @returns {Promise<boolean>} */
function freeOn(port, host) {
	return new Promise((done) => {
		const server = createServer();
		server.once("error", (/** @type {NodeJS.ErrnoException} */ e) => done(e.code === "EADDRNOTAVAIL"));
		server.listen(port, host, () => server.close(() => done(true)));
	});
}

/** Nothing answers on this port over IPv4 or IPv6. @param {number} port */
export async function portIsFree(port) {
	return (await freeOn(port, "127.0.0.1")) && (await freeOn(port, "::1"));
}

/** @param {string} dir */
export function readPort(dir) {
	const file = join(dir, ".env.local");
	if (!existsSync(file)) return null;
	const match = readFileSync(file, "utf8").match(/^PORT=(\d+)/m);
	return match ? Number(match[1]) : null;
}

/** Every checkout of this repo (main, worktrees, the build checkout). */
export function worktrees() {
	const text = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: root, encoding: "utf8" }).stdout;
	return text
		.split(/\r?\n/)
		.filter((l) => l.startsWith("worktree "))
		.map((l) => resolve(l.slice("worktree ".length)));
}

/** Packages whose installed version doesn't satisfy package.json. */
export function staleDependencies() {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	return Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
		.filter(([name, range]) => {
			const file = join(root, "node_modules", name, "package.json");
			if (!existsSync(file)) return true;
			return !Bun.semver.satisfies(JSON.parse(readFileSync(file, "utf8")).version, String(range));
		})
		.map(([name]) => name);
}

/** A stable starting port from the checkout path, so a worktree gets the same port every time. @param {string} dir */
function hashPort(dir) {
	let hash = 0;
	for (const char of dir.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) % PORT_RANGE;
	return PORT_BASE + hash;
}

async function claimPort() {
	const claimed = new Set(
		worktrees()
			.filter((dir) => dir.toLowerCase() !== root.toLowerCase())
			.map(readPort)
			.filter((p) => p !== null),
	);
	const current = readPort(root);
	if (current !== null && !claimed.has(current)) return current;
	const start = hashPort(root);
	for (let i = 0; i < PORT_RANGE; i++) {
		const port = PORT_BASE + ((start - PORT_BASE + i) % PORT_RANGE);
		if (!claimed.has(port) && (await portIsFree(port))) return port;
	}
	throw new Error(`no free port in ${PORT_BASE}-${PORT_BASE + PORT_RANGE - 1}`);
}

if (import.meta.main) {
	const steps = [];

	if (staleDependencies().length > 0) {
		const install = spawnSync("bun", ["install", "--frozen-lockfile"], { cwd: root, stdio: "inherit" });
		if (install.status !== 0) process.exit(install.status ?? 1);
		steps.push("installed deps");
	}

	const envFile = join(root, ".env.local");
	const commonDir = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
		cwd: root,
		encoding: "utf8",
	}).stdout.trim();
	const mainEnv = commonDir ? join(dirname(commonDir), ".env.local") : "";
	if (!existsSync(envFile) && mainEnv && resolve(mainEnv) !== resolve(envFile) && existsSync(mainEnv)) {
		const lines = readFileSync(mainEnv, "utf8").split(/\r?\n/);
		// The main checkout's port belongs to the main checkout; only copy the rest.
		writeFileSync(envFile, `${lines.filter((l) => l && !l.startsWith("PORT=")).join("\n")}\n`);
		steps.push("copied .env.local from the main checkout");
	}

	const port = await claimPort();
	if (readPort(root) !== port) {
		const lines = existsSync(envFile) ? readFileSync(envFile, "utf8").split(/\r?\n/).filter(Boolean) : [];
		writeFileSync(envFile, `${[...lines.filter((l) => !l.startsWith("PORT=")), `PORT=${port}`].join("\n")}\n`);
		steps.push(`claimed PORT=${port}`);
	}

	const link = join(root, ".claude", "skills");
	if (!existsSync(link)) {
		spawnSync("cmd", ["/c", "mkdir", join(root, ".claude")], { stdio: "ignore" });
		symlinkSync(join(root, ".agents", "skills"), link, "junction");
		steps.push("linked .claude/skills");
	}

	if (!existsSync(join(root, "helium-chromium", "flags.gn"))) {
		spawnSync("git", ["submodule", "update", "--init", "--recursive"], { cwd: root, stdio: "inherit" });
		steps.push("fetched the helium-chromium submodule");
	}

	// With both `origin` and `upstream` remotes, gh can resolve to imputnet/helium-windows and open PRs there.
	const ghDefault = spawnSync("gh", ["repo", "set-default", "--view"], { cwd: root, encoding: "utf8" });
	// No default set exits non-zero; only a missing gh (spawn error) skips this.
	if (!ghDefault.error && ghDefault.stdout.trim() !== GITHUB_REPO) {
		const set = spawnSync("gh", ["repo", "set-default", GITHUB_REPO], { cwd: root, stdio: "ignore" });
		if (set.status === 0) steps.push(`pointed gh at ${GITHUB_REPO}`);
	}

	const doctor = spawnSync("bun", ["scripts/doctor.mjs"], { cwd: root, stdio: "inherit" });
	console.log(
		`\nsetup: ${steps.length ? steps.join(", ") : "nothing to do"}. Prototype: bun run dev -> http://localhost:${port}/`,
	);
	process.exit(doctor.status ?? 1);
}
