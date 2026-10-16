// Publishes a packaged alpha as a GitHub pre-release. Without --publish it only checks and prints what it would do.
//
//   bun run release:alpha -- --version 0.1.0-alpha.4              dry run: checks, then the commands it would run
//   bun run release:alpha -- --version 0.1.0-alpha.4 --publish    creates tag v<version> and the pre-release
//
// Before anything leaves the machine it checks that:
//   - dist\Loka-<version>-windows-x64.zip and its .sha256 exist (bun run browser:package made them) and match;
//   - this checkout is clean and its commit is on origin: the tag points at it, and the source must be public (GPL);
//   - patches:check passes and the build's pages are this commit's webui/, so the binary is built from that commit;
//   - tag v<version> isn't on origin yet.
// After publishing it reads the release back and checks it is a pre-release with both files at their sizes.
// Publishing needs my go in the conversation; .claude/settings.json makes Claude Code ask before --publish runs.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILD_DIR, requireWindowsBuild } from "../browser.mjs";

const repo = resolve(import.meta.dirname, "..", "..");
const argv = process.argv.slice(2);
const version = argv[argv.indexOf("--version") + 1] ?? "";
const publish = argv.includes("--publish");

/** @param {string} cmd @param {string[]} args @param {string} [cwd] */
const run = (cmd, args, cwd = repo) => spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 1 << 26 });

/** @type {string[]} */
const problems = [];
requireWindowsBuild("release:alpha");
if (!argv.includes("--version") || !/^\d+\.\d+\.\d+-alpha\.\d+$/.test(version)) {
	console.error("Usage: bun run release:alpha -- --version <x.y.z-alpha.n> [--publish]");
	process.exit(1);
}

const name = `Loka-${version}-windows-x64`;
const zip = join(BUILD_DIR, "dist", `${name}.zip`);
const sumFile = `${zip}.sha256`;
const tag = `v${version}`;

if (!existsSync(zip) || !existsSync(sumFile)) {
	problems.push(`${zip} or its .sha256 is missing: run LOKA_VERSION=${version} bun run browser:package`);
} else {
	const digest = createHash("sha256").update(readFileSync(zip)).digest("hex");
	if (!readFileSync(sumFile, "utf8").startsWith(digest)) problems.push(`${sumFile} doesn't match the zip (${digest})`);
}

// The tag points at this checkout's commit: patches:check and the page compare below prove the build's source is
// this commit's patches/loka and webui/, whatever commit the build checkout itself has checked out.
const commit = run("git", ["rev-parse", "HEAD"]).stdout.trim();
run("git", ["fetch", "--quiet", "origin"]);
const onOrigin = run("git", ["branch", "-r", "--contains", commit]).stdout.trim();
if (run("git", ["status", "--porcelain"]).stdout.trim()) problems.push("this checkout has uncommitted changes");
if (!onOrigin) problems.push(`this checkout's commit ${commit.slice(0, 8)} isn't on origin: merge and push it first`);

const patches = run("python", [join(repo, "scripts", "patches_check.py")]);
if (patches.status !== 0)
	problems.push(
		`patches:check fails, so the build has C++ that this commit's patches don't hold:\n${patches.stdout.trim()}`,
	);

// Loka's pages aren't patches: the build packs whatever `bun run webui:build` last copied in. Build this commit's
// and compare file by file.
const pageDir = join(BUILD_DIR, "build", "src", "components", "loka_sidebar", "dist");
const fresh = join(repo, ".agents", "verify-runs", "release-webui");
const built = run("bunx", ["vite", "build", "--config", "webui/vite.config.ts", "--outDir", fresh, "--emptyOutDir"]);
const pageFiles = built.status === 0 && existsSync(pageDir) ? readdirSync(fresh, { recursive: true }) : [];
const differ = pageFiles
	.map(String)
	.filter((f) => statSync(join(fresh, f)).isFile())
	.filter((f) => !existsSync(join(pageDir, f)) || !readFileSync(join(pageDir, f)).equals(readFileSync(join(fresh, f))));
if (built.status !== 0) problems.push(`building this commit's webui failed:\n${built.stderr.trim()}`);
else if (!existsSync(pageDir)) problems.push(`${pageDir} is missing`);
else if (differ.length)
	problems.push(
		`the build's pages aren't this commit's webui (${differ.join(", ")}): bun run webui:build, then browser:build`,
	);

if (run("git", ["ls-remote", "--tags", "origin", tag]).stdout.trim()) problems.push(`${tag} is already on origin`);

const notes = join(BUILD_DIR, "dist", `${name}.notes.md`);
const sha = existsSync(sumFile) ? readFileSync(sumFile, "utf8").split(/\s/)[0] : "";
writeFileSync(
	notes,
	`Loka ${version}, a portable alpha for Windows x64, built from ${commit.slice(0, 12)}.

Unzip it anywhere and run Loka.exe. Nothing is installed, and your profile lives in %LOCALAPPDATA%\\Loka.

- It isn't signed yet, so Windows SmartScreen warns. Choose "More info", then "Run anyway".
- It doesn't update itself. New builds appear on this page.

sha256 of the zip: \`${sha}\`
`,
);

const create = [
	"release",
	"create",
	tag,
	zip,
	sumFile,
	"--prerelease",
	"--target",
	commit,
	"--title",
	`Loka ${version}`,
	"--notes-file",
	notes,
];
console.log(`release:alpha ${version}${publish ? "" : " (dry run)"}
  zip      ${zip}${existsSync(zip) ? ` (${(statSync(zip).size / 1024 ** 2).toFixed(0)} MB)` : ""}
  commit   ${commit.slice(0, 12)} ${onOrigin ? `(on ${onOrigin.split(/\s+/)[0]})` : "(not on origin)"}
  patches  ${patches.status === 0 ? "build\\src matches patches/loka" : "differ"}
  pages    ${built.status === 0 && existsSync(pageDir) && !differ.length ? "the build's pages are this commit's webui" : "differ"}
  notes    ${notes}
  command  gh ${create.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);

if (problems.length) {
	console.error(`\nNot releasing:\n- ${problems.join("\n- ")}`);
	process.exit(1);
}
if (!publish) {
	console.log("\nAll checks pass. Run again with --publish on my go.");
	process.exit(0);
}

const made = spawnSync("gh", create, { cwd: repo, stdio: "inherit" });
if (made.status !== 0) process.exit(made.status ?? 1);
const view = JSON.parse(
	run("gh", ["release", "view", tag, "--json", "tagName,isPrerelease,url,assets"]).stdout || "{}",
);
/** @type {{ name: string, size: number }[]} */
const assets = view.assets ?? [];
const ok =
	view.isPrerelease === true &&
	assets.some((a) => a.name === `${name}.zip` && a.size === statSync(zip).size) &&
	assets.some((a) => a.name === `${name}.zip.sha256`);
console.log(
	`${ok ? "PASS" : "FAIL"}  ${view.url ?? tag}: pre-release ${view.isPrerelease}, ${assets.map((a) => `${a.name} ${a.size}`).join(", ")}`,
);
process.exit(ok ? 0 : 1);
