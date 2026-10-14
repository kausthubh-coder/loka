// Is this checkout healthy? Run it before trusting a failure.
//   bun run doctor            prototype checks (deps, port, git)
//   bun run doctor --browser  also the Windows toolchain needed to build Chromium

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statfsSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILD_DIR } from "./browser.mjs";
import { portIsFree, readPort, staleDependencies, worktrees } from "./setup.mjs";

const root = resolve(import.meta.dirname, "..");
let failures = 0;

/** @param {boolean} ok @param {string} label @param {string} [fix] */
function check(ok, label, fix) {
	console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok || !fix ? "" : `\n      fix: ${fix}`}`);
	if (!ok) failures++;
}

/** @param {string} label */
function info(label) {
	console.log(`      ${label}`);
}

/** @param {string} cmd @param {string[]} args */
function out(cmd, args) {
	const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
	return r.status === 0 ? r.stdout.trim() : "";
}

/** @param {string} key @param {string} name */
function registryValue(key, name) {
	const text = out("reg", ["query", key, "/v", name]);
	return text.match(/REG_\w+\s+(\S+)/)?.[1] ?? "";
}

// ---- prototype -------------------------------------------------------------

const stale = staleDependencies();
check(
	stale.length === 0,
	`dependencies match package.json${stale.length ? ` (stale: ${stale.join(", ")})` : ""}`,
	"bun install",
);

const port = readPort(root);
check(port !== null, `PORT claimed in .env.local${port ? ` (${port})` : ""}`, "bun run setup");
if (port !== null) {
	const others = worktrees().filter((dir) => dir.toLowerCase() !== root.toLowerCase() && readPort(dir) === port);
	check(
		others.length === 0,
		`PORT ${port} not claimed by another worktree`,
		"delete PORT from .env.local, then bun run setup",
	);
	info(
		`prototype port ${port} ${(await portIsFree(port)) ? "is free" : "is in use (a dev server may already be running)"}`,
	);
}
check(existsSync(join(root, ".claude", "skills")), ".claude/skills links to .agents/skills", "bun run setup");
info("no backend: the prototype keeps its data in localStorage for its own port");

const base = out("git", ["describe", "--tags", "--abbrev=0"]);
info(`Helium base: ${base || "unknown"}; branch ${out("git", ["branch", "--show-current"]) || "(detached)"}`);
if (out("git", ["remote"]).split("\n").includes("origin")) {
	const behind = out("git", ["rev-list", "--count", "HEAD..origin/main"]);
	info(`behind origin/main by ${behind || "?"} commits (as of the last fetch)`);
} else {
	info("no origin remote yet (the GitHub repo isn't connected)");
}

// ---- browser toolchain -----------------------------------------------------

if (process.argv.includes("--browser")) {
	console.log("\nBrowser toolchain (Chromium's Windows guide + Helium's README)");
	const vswhere = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";
	const vsVersions = existsSync(vswhere)
		? out(vswhere, ["-all", "-products", "*", "-property", "installationVersion"]).split(/\r?\n/).filter(Boolean)
		: [];
	check(
		vsVersions.some((v) => Number(v.split(".")[0]) >= 18),
		`Visual Studio 2026 (18.x) with C++ and ATL/MFC (found: ${vsVersions.join(", ") || "none"})`,
		"see docs/browser-build.md, step 1",
	);
	const sdkInclude = "C:\\Program Files (x86)\\Windows Kits\\10\\Include";
	const sdks = existsSync(sdkInclude) ? readdirSync(sdkInclude) : [];
	check(
		sdks.some((v) => v.startsWith("10.0.28000")),
		`Windows SDK 10.0.28000 (found: ${sdks.join(", ") || "none"})`,
		"docs/browser-build.md, step 1",
	);
	check(
		existsSync("C:\\Program Files (x86)\\Windows Kits\\10\\Debuggers\\x64\\cdb.exe"),
		"SDK Debugging Tools",
		"Windows SDK installer: tick Debugging Tools",
	);

	const py = out("python", ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"]);
	const [major, minor] = py.split(".").map(Number);
	check(
		(major ?? 0) === 3 && (minor ?? 0) >= 11,
		`Python 3.11+ on PATH (found: ${py || "none"})`,
		"winget install Python.Python.3.12",
	);
	check(
		out("python", ["-c", "import requests, PIL; print('ok')"]) === "ok",
		"Python packages requests and Pillow",
		"python -m pip install requests Pillow",
	);
	// build.py checks this only after unpacking and patching, ~25 minutes into a first build.
	check(out("where", ["clang-format"]) !== "", "clang-format on PATH", "python -m pip install clang-format");
	check(
		existsSync("C:\\Program Files\\7-Zip\\7z.exe") || out("where", ["7z"]) !== "",
		"7-Zip",
		"winget install 7zip.7zip",
	);
	check(
		registryValue("HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem", "LongPathsEnabled") === "0x1",
		"long paths enabled",
		"docs/browser-build.md, step 2 (admin)",
	);
	check(
		registryValue(
			"HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock",
			"AllowDevelopmentWithoutDevLicense",
		) === "0x1",
		"Windows Developer Mode (for symlinks)",
		"Settings > System > For developers > Developer Mode",
	);
	check(!BUILD_DIR.toLowerCase().includes("onedrive"), `build checkout outside OneDrive (${BUILD_DIR})`);
	const drive = `${BUILD_DIR.slice(0, 2)}\\`;
	const freeGb = (() => {
		try {
			const s = statfsSync(drive);
			return Math.round((s.bavail * s.bsize) / 1e9);
		} catch {
			return 0;
		}
	})();
	check(freeGb >= 100, `${freeGb} GB free on ${drive} (Chromium needs 100 GB)`, "free up space");
	info(
		existsSync(join(BUILD_DIR, "build", "src", "out", "Default", "chrome.exe"))
			? "a dev build exists: bun run browser:run"
			: existsSync(BUILD_DIR)
				? "build checkout exists, no finished build yet: bun run browser:build"
				: "no build checkout yet: bun run browser:setup",
	);
	info("Defender exclusion for the build folder can't be read without admin; see docs/browser-build.md, step 2.");
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
