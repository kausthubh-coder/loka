// One command for "does it work?": the fast checks, the prototype's recipes, then the built browser's suites when a
// browser binary is here. Prints one line per stage and exits 1 if any stage failed. A SKIP is not a pass: the
// summary names what didn't run and why.
//
//   bun run verify                      check, patches:check, every prototype recipe, verify:browser, verify:flows,
//                                       verify:perf (when this branch has it)
//   bun run verify -- --ux <feature>    one feature of the verify-loka map: its prototype recipes and browser checks
//   bun run verify -- --list            every feature and what proves it
//   bun run verify -- --fast            check and patches:check only
//
// The browser is testBinary() in scripts/browser.mjs (LOKA_CHROME, else the dev build when no build is writing it,
// else the snapshot). The prototype runs on this checkout's own dev server: one already running from here is reused,
// otherwise verify starts it and stops it (its process tree, by pid) at the end.
// Exit codes of the stages: 0 pass, 1 fail, 2 couldn't run (skipped).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUILD_DIR, testBinary } from "./browser.mjs";

const root = resolve(import.meta.dirname, "..");

/**
 * What proves each feature in .agents/skills/verify-loka/features/<id>.md:
 * `prototype` recipes in that skill's scripts/run.mjs, `browser` (all of verify:browser, ~30 s), and `flows` of
 * verify:flows (each runs after first run and what it builds on). `gap` says what nothing proves in the browser yet.
 * @type {Record<string, { prototype?: string[], browser?: boolean, flows?: string[], patches?: boolean, gap?: string }>}
 */
export const UX = {
	folders: { prototype: ["folders", "make-folders"], flows: ["pinning"] },
	spaces: { prototype: ["spaces"], flows: ["spaces"] },
	tabs: { prototype: ["tabs"], browser: true, flows: ["tabs"] },
	essentials: { prototype: ["essentials"], flows: ["pinning"] },
	"export-import": { prototype: ["export-import"], browser: true },
	"command-bar": { prototype: ["command-bar"], browser: true, flows: ["tabs", "spaces", "new-tab"] },
	"space-editor": { prototype: ["space-editor"], flows: ["spaces"] },
	theme: { prototype: ["theme"], browser: true, flows: ["spaces"] },
	layout: { prototype: ["layout"], browser: true, flows: ["states", "settings"] },
	extensions: { prototype: ["extensions"], browser: true, flows: ["extensions"] },
	history: { prototype: ["history"], flows: ["settings"] },
	library: { prototype: ["library"], flows: ["settings"] },
	onboarding: { prototype: ["onboarding"], browser: true, flows: ["first-run"] },
	archive: { prototype: ["archive"], flows: ["panels", "settings", "sleep"] },
	"search-and-keys": { prototype: ["search-and-keys"], flows: ["panels", "tabs"] },
	import: {
		prototype: ["import"],
		gap: "Chrome, Edge and Arc import have no browser check; only the alpha's JSON import does (export-import)",
	},
	media: { prototype: ["media"], browser: true, flows: ["panels"] },
	sound: { prototype: ["sound"], browser: true, flows: ["settings"] },
	"native-sidebar": { browser: true, flows: ["restart"] },
	"browser-build": { browser: true, patches: true },
};

/** @typedef {{ name: string, status: "PASS" | "FAIL" | "SKIP" | "WARN", detail: string, evidence: string[], seconds: number }} Stage */
/** @type {Stage[]} */
const stages = [];

/**
 * Runs one stage as a child process with its output shown as it comes, and records PASS/FAIL/SKIP from its exit
 * code (2 = couldn't run) and its evidence folders from lines that say "evidence: <path>".
 * @param {string} name @param {string} cmd @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, detail?: (out: string, code: number) => string, warnOnFail?: boolean }} [opts]
 */
async function stage(name, cmd, args, opts = {}) {
	console.log(`\n== ${name}: ${cmd} ${args.join(" ")}`);
	const started = Date.now();
	const child = spawn(cmd, args, { cwd: root, env: opts.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
	let out = "";
	child.stdout.on("data", (d) => {
		out += d;
		process.stdout.write(d);
	});
	child.stderr.on("data", (d) => {
		out += d;
		process.stderr.write(d);
	});
	const code = await new Promise((done) => child.on("close", (c) => done(c ?? 1)));
	const evidence = [...out.matchAll(/evidence: (\S.*?)\s*$/gim)].map((m) => (m[1] ?? "").trim());
	const status = code === 0 ? "PASS" : code === 2 ? "SKIP" : opts.warnOnFail ? "WARN" : "FAIL";
	const lastLine = out.trim().split(/\r?\n/).at(-1) ?? "";
	stages.push({
		name,
		status,
		detail: opts.detail ? opts.detail(out, code) : lastLine.slice(0, 160),
		evidence,
		seconds: Math.round((Date.now() - started) / 1000),
	});
	return code;
}

/** @param {string} name @param {string} why */
const skip = (name, why) => stages.push({ name, status: "SKIP", detail: why, evidence: [], seconds: 0 });

function readPort() {
	const match = existsSync(join(root, ".env.local"))
		? readFileSync(join(root, ".env.local"), "utf8").match(/^PORT=(\d+)/m)
		: null;
	return match ? Number(match[1]) : null;
}

const prototypeDoctor = () =>
	spawnSync("node", [join(root, ".agents", "skills", "verify-loka", "scripts", "doctor.mjs")], { encoding: "utf8" });

/**
 * This checkout's dev server: the one already running from here, or a new one that `stop()` ends with its children.
 * @returns {Promise<{ stop: () => void, note: string } | { error: string }>}
 */
async function devServer() {
	const port = readPort();
	if (port === null) return { error: "no PORT in .env.local: run bun run setup" };
	if (prototypeDoctor().status === 0) return { stop: () => {}, note: `reused the dev server on ${port}` };
	const answering = await fetch(`http://localhost:${port}/`).then(
		() => true,
		() => false,
	);
	if (answering) return { error: `port ${port} answers but isn't this checkout's dev server (verify-loka doctor)` };
	const logDir = join(root, ".agents", "verify-runs");
	mkdirSync(logDir, { recursive: true });
	const log = openSync(join(logDir, "verify-dev-server.log"), "w");
	// Its own process group off Windows, so stopping the group stops vite too; taskkill /T does that on Windows.
	const child = spawn("bun", ["run", "dev"], {
		cwd: root,
		detached: process.platform !== "win32",
		stdio: ["ignore", log, log],
	});
	const stop = () => {
		if (!child.pid) return;
		if (process.platform === "win32")
			spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
		else
			try {
				process.kill(-child.pid, "SIGTERM");
			} catch {}
	};
	const end = Date.now() + 30000;
	while (Date.now() < end) {
		if (prototypeDoctor().status === 0) return { stop, note: `started the dev server on ${port} (pid ${child.pid})` };
		await new Promise((r) => setTimeout(r, 500));
	}
	stop();
	return { error: `the dev server didn't come up on ${port} in 30 s (.agents/verify-runs/verify-dev-server.log)` };
}

/** @param {string[]} recipes */
async function prototype(recipes) {
	const server = await devServer();
	if ("error" in server) {
		stages.push({ name: "prototype", status: "FAIL", detail: server.error, evidence: [], seconds: 0 });
		return;
	}
	console.log(`\n${server.note}`);
	try {
		const runner = join(".agents", "skills", "verify-loka", "scripts", "run.mjs");
		for (const recipe of recipes)
			await stage(`prototype ${recipe}`, "node", [runner, recipe], {
				detail: (out) => {
					const lines = out.split(/\r?\n/).filter((l) => /^(PASS|FAIL)\s/.test(l));
					const failed = lines.filter((l) => l.startsWith("FAIL"));
					return failed.length
						? failed.map((l) => l.split(/\s+evidence:/)[0]).join("; ")
						: `${lines.length} recipe(s) passed`;
				},
			});
	} finally {
		server.stop();
	}
}

/** The last "PASS: 33/34 checks" line of a browser suite. @param {string} out */
const checksLine = (out) => /(PASS|FAIL): (\d+\/\d+ checks)/.exec(out)?.[0] ?? out.trim().split(/\r?\n/).at(-1) ?? "";

/** @param {{ browser?: boolean, flows?: string[] | "all", perf?: boolean }} which */
async function browserSuites(which) {
	const names = [
		...(which.browser ? ["verify:browser"] : []),
		...(which.flows ? ["verify:flows"] : []),
		...(which.perf ? ["verify:perf"] : []),
	];
	if (!names.length) return;
	const binary = testBinary();
	if (process.platform !== "win32" || !binary.path || !existsSync(binary.path)) {
		const why =
			process.platform !== "win32"
				? `the browser builds and runs on Windows only today (${process.platform} here)`
				: `no browser binary: ${binary.why}${binary.path ? ` (${binary.path} is missing)` : ""}`;
		for (const name of names) skip(name, why);
		return;
	}
	console.log(`\nBrowser: ${binary.path} (${binary.why})`);
	const env = { ...process.env, LOKA_CHROME: binary.path };
	if (which.browser) await stage("verify:browser", "bun", ["scripts/verify-browser.mjs"], { env, detail: checksLine });
	if (which.flows) {
		const only = which.flows === "all" ? [] : ["--only", which.flows.join(",")];
		await stage(`verify:flows${only.length ? ` ${only[1]}` : ""}`, "bun", ["scripts/verify-flows.mjs", ...only], {
			env,
			detail: checksLine,
		});
	}
	if (which.perf) {
		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		if (!pkg.scripts?.["verify:perf"]) skip("verify:perf", "this branch has no verify:perf script yet");
		// verify:perf picks its own binary (never out\Default), unless LOKA_CHROME was set by hand.
		else
			await stage("verify:perf", "bun", ["run", "verify:perf"], {
				detail: (out) => out.trim().split(/\r?\n/).at(-1) ?? "",
			});
	}
}

async function patchesCheck() {
	if (process.platform !== "win32" || !existsSync(join(BUILD_DIR, "build", "src"))) {
		skip("patches:check", `no Chromium source tree at ${join(BUILD_DIR, "build", "src")}`);
		return;
	}
	await stage("patches:check", "python", ["scripts/patches_check.py"], {
		warnOnFail: true,
		detail: (out, code) =>
			code === 0
				? "build\\src matches patches/loka"
				: `${out.split(/\r?\n/)[0] ?? ""} (edits in progress in the build checkout; export them before shipping patches/)`,
	});
}

function list() {
	const features = join(root, ".agents", "skills", "verify-loka", "features");
	for (const [id, how] of Object.entries(UX)) {
		const parts = [
			how.prototype ? `prototype ${how.prototype.join(", ")}` : "",
			how.browser ? "verify:browser" : "",
			how.flows ? `verify:flows ${how.flows.join(", ")}` : "",
			how.patches ? "patches:check" : "",
		].filter(Boolean);
		console.log(`${id.padEnd(16)} ${parts.join(" + ")}${how.gap ? `\n${"".padEnd(16)} gap: ${how.gap}` : ""}`);
	}
	console.log(`\nRecipes and gotchas per feature: ${features}${process.platform === "win32" ? "\\" : "/"}<id>.md`);
}

function summary() {
	console.log("\nverify: summary");
	for (const s of stages)
		console.log(`${s.status.padEnd(5)} ${s.name.padEnd(28)} ${s.detail}${s.seconds ? ` (${s.seconds} s)` : ""}`);
	const evidence = stages.flatMap((s) => s.evidence);
	if (evidence.length) console.log(`\nEvidence:\n  ${evidence.join("\n  ")}`);
	const failed = stages.filter((s) => s.status === "FAIL");
	const skipped = stages.filter((s) => s.status === "SKIP");
	const warned = stages.filter((s) => s.status === "WARN");
	console.log(
		`\nverify: ${failed.length ? `FAIL (${failed.map((s) => s.name).join(", ")})` : "PASS"}${
			skipped.length ? `; not run: ${skipped.map((s) => s.name).join(", ")}` : ""
		}${warned.length ? `; look at: ${warned.map((s) => s.name).join(", ")}` : ""}`,
	);
	return failed.length ? 1 : 0;
}

if (import.meta.main) {
	const argv = process.argv.slice(2);
	const uxAt = argv.indexOf("--ux");
	if (argv.includes("--list")) {
		list();
		process.exit(0);
	}
	if (uxAt >= 0) {
		const id = argv[uxAt + 1] ?? "";
		const how = UX[id];
		if (!how) {
			console.error(`--ux takes a feature of the verify-loka map: ${Object.keys(UX).join(", ")}`);
			process.exit(1);
		}
		if (how.patches) await patchesCheck();
		if (how.prototype) await prototype(how.prototype);
		await browserSuites({ browser: how.browser, flows: how.flows });
		if (how.gap) skip(`${id} in the browser`, how.gap);
	} else {
		await stage("check", "bun", ["run", "check"], {
			detail: (out, code) => {
				const tests = /Ran (\d+) tests/.exec(out)?.[1];
				if (code === 0) return `lint, types, ${tests ?? "all"} tests, both builds`;
				// The failing tests, type errors or lint count, not bun's closing "exited with code 1".
				const why = out
					.split(/\r?\n/)
					.filter((l) => /^\(fail\) |error TS\d+|^Found \d+ errors?\./.test(l))
					.map((l) => l.replace(/ \[[\d.]+ms\]$/, ""));
				return why.slice(0, 4).join("; ") || (out.trim().split(/\r?\n/).at(-1) ?? "");
			},
		});
		await patchesCheck();
		if (!argv.includes("--fast")) {
			await prototype(["all"]);
			await browserSuites({ browser: true, flows: "all", perf: true });
		}
	}
	process.exit(summary());
}
