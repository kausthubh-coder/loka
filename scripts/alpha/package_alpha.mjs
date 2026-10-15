// Packages the built browser as the portable Windows alpha:
//
//   bun run browser:package
//
// makes <build checkout>\dist\Loka-<version>-windows-x64.zip and its .sha256. Inside: Loka.exe (the launcher),
// app\ (the browser's runtime files, with the Loka sidebar built in, and first-run defaults) and README.txt. Nothing
// is installed: unzip anywhere and run Loka.exe. The profile lives in %LOCALAPPDATA%\Loka\User Data.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILD_DIR, INITIAL_PREFERENCES } from "../browser.mjs";

export const VERSION = process.env.LOKA_VERSION ?? "0.1.0-alpha.1";

const repo = resolve(import.meta.dirname, "..", "..");
const src = join(BUILD_DIR, "build", "src");
const out = join(src, "out", "Default");
const dist = join(BUILD_DIR, "dist");
const name = `Loka-${VERSION}-windows-x64`;
const stage = join(dist, name);
const app = join(stage, "app");

/** @param {string} cmd @param {string[]} args @param {string} [cwd] @param {NodeJS.ProcessEnv} [env] */
function run(cmd, args, cwd = repo, env = process.env) {
	const result = spawnSync(cmd, args, { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	if (result.status !== 0) {
		console.error(`${cmd} ${args.join(" ")} failed (exit ${result.status})\n${result.stderr}`);
		process.exit(1);
	}
	return result.stdout;
}

/**
 * The files chrome.exe needs at run time, relative to the build's output folder, as GN knows them: the DLLs (this is
 * a component build), paks, locales, ICU data and V8 snapshots. Source-tree entries ("../"), test data and
 * debugging files aren't shipped.
 */
function runtimeFiles() {
	const gn = join(src, "buildtools", "win", "gn.exe");
	// GN runs the build's toolchain scripts, which need what build.py sets: the local Visual Studio, found with
	// vswhere.exe from the installer's folder.
	const installer = join(
		process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
		"Microsoft Visual Studio",
		"Installer",
	);
	const env = { ...process.env, DEPOT_TOOLS_WIN_TOOLCHAIN: "0", PATH: `${installer};${process.env.PATH}` };
	const listed = run(gn, ["desc", out, "//chrome:chrome", "runtime_deps"], src, env)
		.split(/\r?\n/)
		.map((line) => line.trim().replace(/^\.\//, ""))
		.filter((line) => line && !line.startsWith("../") && !/\.(pdb|lib|exp|ilk|TOC|info)$/i.test(line))
		// Test and debugging data GN lists too: DevTools' sources (the browser loads DevTools from resources.pak),
		// Python protobufs, and Vulkan's validation layer.
		.filter((line) => !/^(gen|pyproto)\//.test(line) && !/^VkLayer_khronos_validation\./.test(line));
	// Also needed beside chrome.exe, though GN doesn't list them: the side-by-side manifest chrome.exe binds to, and
	// the Start menu tile's files.
	const extra = readdirSync(out).filter(
		(f) => /\.manifest$/i.test(f) || /^(chrome\.VisualElementsManifest\.xml|Logo\.png|SmallLogo\.png)$/.test(f),
	);
	return [...new Set([...listed, ...extra])];
}

function readme() {
	return `Loka ${VERSION} for Windows (x64), portable alpha
https://github.com/kausthubh-coder/loka

Run Loka.exe. Nothing is installed; to remove Loka, delete this folder and
%LOCALAPPDATA%\\Loka.

This is an early alpha:
- It isn't signed, so Windows SmartScreen may warn you. Click "More info",
  then "Run anyway".
- It doesn't update itself. New builds come from the GitHub releases page.
- Some menus and pages still say Helium or Chromium; Loka is built on Helium.
- The Loka sidebar is the left column of every window. Ctrl+K opens the
  command bar.

Your profile (tabs, spaces, settings) is in %LOCALAPPDATA%\\Loka\\User Data,
separate from Helium, Chrome or Edge. Loka is free software under GPL-3.0.
`;
}

/** @param {string} file */
function sha256(file) {
	return new Promise((done) => {
		const hash = createHash("sha256");
		createReadStream(file)
			.on("data", (chunk) => hash.update(chunk))
			.on("end", () => done(hash.digest("hex")));
	});
}

if (!existsSync(join(out, "chrome.exe"))) {
	console.error(`No build at ${out}. Build it first: bun run browser:build`);
	process.exit(1);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(app, { recursive: true });

const files = runtimeFiles();
let bytes = 0;
for (const file of files) {
	const from = join(out, file);
	if (!existsSync(from)) continue;
	cpSync(from, join(app, file), { recursive: true });
	bytes += statSync(from).isFile() ? statSync(from).size : 0;
}
if (!existsSync(join(app, "chrome.exe"))) {
	console.error("chrome.exe wasn't among GN's runtime files; nothing to ship.");
	process.exit(1);
}
console.log(`${files.length} runtime entries, ${(bytes / 1024 ** 2).toFixed(0)} MB of files at the top level`);

writeFileSync(join(app, "initial_preferences"), JSON.stringify(INITIAL_PREFERENCES, null, 2));
writeFileSync(join(stage, "README.txt"), readme().replace(/\n/g, "\r\n"));

const csc = join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
run(csc, [
	"/nologo",
	"/target:winexe",
	"/optimize+",
	`/win32icon:${join(repo, "scripts", "alpha", "loka.ico")}`,
	`/out:${join(stage, "Loka.exe")}`,
	join(repo, "scripts", "alpha", "Loka.cs"),
]);

const zip = join(dist, `${name}.zip`);
rmSync(zip, { force: true });
run("7z", ["a", "-tzip", "-mx=7", zip, name], dist);
const digest = await sha256(zip);
writeFileSync(`${zip}.sha256`, `${digest}  ${name}.zip\n`);
console.log(`${zip}\n${(statSync(zip).size / 1024 ** 2).toFixed(0)} MB, sha256 ${digest}`);
