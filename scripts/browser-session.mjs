// What verify-browser.mjs and verify-flows.mjs share to drive the built browser over raw CDP: a websocket client,
// waiting on conditions, requests to LokaSidebarHandler from the sidebar page, the browser's process tree and
// pictures of its windows. The sidebar is a top-chrome WebUI page Playwright doesn't list, so everything goes through
// /json/list and each target's websocket.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { BUILD_DIR } from "./browser.mjs";

const repo = resolve(import.meta.dirname, "..");

/** @typedef {{ id: string, type: string, url: string, title: string, webSocketDebuggerUrl: string }} Target */
/** @typedef {Awaited<ReturnType<typeof connect>>} Session */

/** @param {number} ms */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The binary to test: LOKA_CHROME, else the dev build. */
export const chromePath = () =>
	resolve(process.env.LOKA_CHROME ?? join(BUILD_DIR, "build", "src", "out", "Default", "chrome.exe"));

/** Refuses to run a binary the build is writing: linking fails on a chrome.exe that's running. @param {string} chrome */
export function refuseWhileBuilding(chrome) {
	const out = join(BUILD_DIR, "build", "src", "out").toLowerCase();
	if (!chrome.toLowerCase().startsWith(out)) return;
	const reasons = buildActivity();
	if (reasons.length) {
		console.error(`A build is using ${chrome} (${reasons.join("; ")}). Wait for it, or set LOKA_CHROME to a copy.`);
		process.exit(2);
	}
}

/** Why the build checkout looks mid-build (build.lock, a compile.log with no exit line, build-status.json), or []. */
export function buildActivity() {
	/** @type {string[]} */
	const reasons = [];
	if (existsSync(join(BUILD_DIR, "build.lock"))) reasons.push("build.lock exists");
	const log = join(BUILD_DIR, "compile.log");
	if (existsSync(log)) {
		const last = readFileSync(log, "utf8").trimEnd().split("\n").at(-1) ?? "";
		if (!last.includes("compile exited")) reasons.push("compile.log has no exit line yet");
	}
	const statusFile = join(BUILD_DIR, "build-status.json");
	if (existsSync(statusFile)) {
		const status = JSON.parse(readFileSync(statusFile, "utf8"));
		let running = false;
		try {
			process.kill(status.pid, 0);
			running = true;
		} catch {}
		if (status.phase === "compiling" && running) reasons.push(`build-status.json says compiling (pid ${status.pid})`);
	}
	return reasons;
}

/** A free localhost port, from the OS. @returns {Promise<number>} */
export function freePort() {
	return new Promise((done) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
			server.close(() => done(port));
		});
	});
}

/** A quiet 220 Hz tone as a WAV file, so audio pages play without the network. @param {number} seconds */
export function toneWav(seconds = 6) {
	const rate = 8000;
	const samples = rate * seconds; // Chrome gives a media session only to media of 5 s or more
	const data = Buffer.alloc(samples * 2);
	for (let i = 0; i < samples; i++)
		data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 400), i * 2);
	const head = Buffer.alloc(44);
	head.write("RIFF", 0);
	head.writeUInt32LE(36 + data.length, 4);
	head.write("WAVEfmt ", 8);
	head.writeUInt32LE(16, 16);
	head.writeUInt16LE(1, 20);
	head.writeUInt16LE(1, 22);
	head.writeUInt32LE(rate, 24);
	head.writeUInt32LE(rate * 2, 28);
	head.writeUInt16LE(2, 32);
	head.writeUInt16LE(16, 34);
	head.write("data", 36);
	head.writeUInt32LE(data.length, 40);
	return Buffer.concat([head, data]);
}

/** One CDP websocket with request/response by id. @param {string} wsUrl */
export async function connect(wsUrl) {
	const ws = new WebSocket(wsUrl);
	await new Promise((ok, fail) => {
		ws.addEventListener("open", ok, { once: true });
		ws.addEventListener("error", fail, { once: true });
	});
	let next = 0;
	/** @type {Map<number, (msg: { error?: { message: string }, result?: any }) => void>} */
	const waiting = new Map();
	/** @type {Map<string, (params: any) => void>} */
	const handlers = new Map();
	ws.addEventListener("message", (e) => {
		const msg = JSON.parse(String(e.data));
		if (msg.method) handlers.get(msg.method)?.(msg.params);
		const done = waiting.get(msg.id);
		if (!done) return;
		waiting.delete(msg.id);
		done(msg);
	});
	return {
		/** @param {string} method @param {object} [params] @param {number} [timeout] @returns {Promise<any>} */
		call(method, params = {}, timeout = 15000) {
			const id = ++next;
			return new Promise((ok, fail) => {
				const timer = setTimeout(() => fail(new Error(`${method} timed out`)), timeout);
				waiting.set(id, (msg) => {
					clearTimeout(timer);
					if (msg.error) fail(new Error(`${method}: ${msg.error.message}`));
					else ok(msg.result);
				});
				ws.send(JSON.stringify({ id, method, params }));
			});
		},
		/** Calls back on a CDP event (one handler per event). @param {string} method @param {(params: any) => void} handler */
		on: (method, handler) => handlers.set(method, handler),
		close: () => ws.close(),
	};
}

/**
 * Evaluates an expression in a page and returns its value.
 * @param {Session} session @param {string} expression @param {boolean} [userGesture]
 * @returns {Promise<any>}
 */
export async function evaluate(session, expression, userGesture = false) {
	const r = await session.call("Runtime.evaluate", {
		expression,
		awaitPromise: true,
		returnByValue: true,
		userGesture,
	});
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
	return r.result.value;
}

/**
 * Waits until `probe` returns something truthy, or gives up after `ms` and returns the last value.
 * @template T @param {() => Promise<T>} probe @param {number} ms @returns {Promise<T>}
 */
export async function until(probe, ms) {
	const end = Date.now() + ms;
	let value = await probe();
	while (!value && Date.now() < end) {
		await sleep(250);
		value = await probe();
	}
	return value;
}

/**
 * In the sidebar page (or any page LokaSidebarHandler answers): one request through chrome.send, and its answer
 * ("no answer" after 5 s).
 * @param {string} message @param {unknown[]} [args]
 */
export const askExpression = (message, args = []) => `new Promise((resolve) => {
	// One wrapper for every request in flight, so requests asked at the same time each get their own answer.
	if (!window.__verifyWaiting) {
		window.__verifyWaiting = new Map();
		const original = window.cr.webUIResponse;
		window.cr.webUIResponse = function (callbackId, ok, value) {
			const waiting = window.__verifyWaiting.get(callbackId);
			if (!waiting) return original.call(this, callbackId, ok, value);
			window.__verifyWaiting.delete(callbackId);
			waiting(value);
		};
	}
	const id = "verify-" + Math.random();
	const timer = setTimeout(() => { window.__verifyWaiting.delete(id); resolve("no answer"); }, 5000);
	window.__verifyWaiting.set(id, (value) => { clearTimeout(timer); resolve(value); });
	chrome.send(${JSON.stringify(message)}, [id, ...${JSON.stringify(args)}]);
})`;

/** In the sidebar page: keeps every event the handler pushes (cr.webUIListenerCallback) in window.__verifyEvents. */
export const RECORD_EVENTS = `(() => {
	if (window.__verifyEvents) return true;
	window.__verifyEvents = [];
	const original = window.cr.webUIListenerCallback;
	window.cr.webUIListenerCallback = function (event, ...args) {
		window.__verifyEvents.push({ event, args });
		return original.call(this, event, ...args);
	};
	return true;
})()`;

/**
 * One process: its pid, parent, when it started (so a pid Windows has handed to a new process isn't mistaken for
 * it) and its Chromium --type ("browser" for the main one).
 * @typedef {{ pid: number, parent: number, started: string, type: string }} Proc
 */

/** Windows' process table, by pid. @returns {Map<number, Proc>} */
function processTable() {
	const ps = spawnSync(
		"powershell",
		[
			"-NoProfile",
			"-Command",
			'Get-CimInstance Win32_Process | ForEach-Object { $t = if ($_.CommandLine -match "--type=([\\w-]+)") { $Matches[1] } else { "browser" }; "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.ToFileTimeUtc()) $t" }',
		],
		{ encoding: "utf8" },
	);
	/** @type {Map<number, Proc>} */
	const table = new Map();
	for (const line of ps.stdout.split(/\r?\n/)) {
		const [pid = "", parent = "", started = "", type = ""] = line.trim().split(" ");
		if (Number(pid)) table.set(Number(pid), { pid: Number(pid), parent: Number(parent), started, type });
	}
	return table;
}

/**
 * The processes of `tree` that still run, plus any they started since. Running means both: the pid answers, and
 * Windows' table has it with the same start time. The pid alone isn't enough, since Windows hands a freed pid to a
 * new process within seconds; the table alone isn't either, since it keeps listing an exited process for a second or
 * two while something holds a handle to it. A child counts only if it started after its parent, since Windows keeps
 * a dead parent's pid in its children.
 * @param {Proc[]} tree @returns {Proc[]}
 */
export function stillRunning(tree) {
	const table = processTable();
	const running = (/** @type {Proc} */ p) => table.get(p.pid)?.started === p.started && alive(p.pid);
	const left = tree.filter(running);
	for (const at of left)
		for (const p of table.values())
			if (p.parent === at.pid && p.started >= at.started && !left.some((l) => l.pid === p.pid) && running(p))
				left.push(p);
	return left;
}

/** Every process in the tree under `root`, root first. @param {number} root @returns {Proc[]} */
export function processes(root) {
	const top = processTable().get(root);
	return top ? stillRunning([top]) : [];
}

/**
 * Starts the built browser on a throwaway profile (`C:\src\loka\profile-<name>-<time>`) with CDP on a free port,
 * setup skipped, and one normal tab so the sidebar exists. `close()` stops only this process tree and deletes the
 * profile.
 * @param {{ name: string, chrome?: string, args?: string[], url?: string }} options
 */
export async function launchBrowser({ name, chrome = chromePath(), args = [], url = "about:blank" }) {
	const { spawn } = await import("node:child_process");
	const { mkdirSync, rmSync } = await import("node:fs");
	refuseWhileBuilding(chrome);
	const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
	const profile = join(BUILD_DIR, `profile-${name}-${stamp}-${process.pid}`);
	mkdirSync(profile, { recursive: true });
	const port = await freePort();
	const child = spawn(
		chrome,
		[
			`--user-data-dir=${profile}`,
			`--remote-debugging-port=${port}`,
			"--disable-features=CalculateNativeWinOcclusion",
			"--no-first-run",
			...args,
			url,
		],
		{ stdio: "ignore" },
	);
	const pid = child.pid ?? 0;
	const http = `http://127.0.0.1:${port}`;
	/** @returns {Promise<Target[]>} */
	const targets = () => fetch(`${http}/json/list`).then((r) => r.json());
	const version = await until(
		() =>
			fetch(`${http}/json/version`).then(
				(r) => r.json(),
				() => null,
			),
		30000,
	);
	if (!version) throw new Error("the browser never opened its debugging port");
	// The browser process as it is now (pid and start time), so close() never stops a process that took its pid later.
	const root = processes(pid).slice(0, 1);
	const browser = await connect(version.webSocketDebuggerUrl);
	/** @param {(t: Target) => boolean} match @param {number} [ms] */
	const target = async (match, ms = 20000) => {
		const found = await until(async () => (await targets()).find(match), ms);
		if (!found) throw new Error("no such target");
		return found;
	};
	return {
		pid,
		profile,
		http,
		browser,
		targets,
		target,
		/** The window's sidebar page. */
		sidebar: async () => {
			const t = await target((x) => x.url.startsWith("chrome://loka-sidebar.top-chrome"));
			const session = await connect(t.webSocketDebuggerUrl);
			await until(() => evaluate(session, "Boolean(document.querySelector('loka-panel'))").catch(() => false), 10000);
			return session;
		},
		async close() {
			const tree = stillRunning(root);
			browser.close();
			for (const p of tree) spawnSync("taskkill", ["/F", "/PID", String(p.pid)], { stdio: "ignore" });
			await until(async () => stillRunning(tree).length === 0, 5000);
			for (const p of stillRunning(tree)) spawnSync("taskkill", ["/F", "/PID", String(p.pid)], { stdio: "ignore" });
			rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
		},
	};
}

/** Which webui/src module each of Loka's built-in pages starts from. */
const WEBUI_ENTRIES = { sidebar: "main.ts", history: "history.ts", command: "command.ts", settings: "settings.ts" };

/**
 * Runs this checkout's webui in one page of the built browser, without rebuilding the browser: the page's own entry
 * is built here as one classic script, the page's own module scripts are stopped before they run (the parser gives
 * a MutationObserver its turn before it starts a script), and the page reloads. The browser's handler, window and
 * hit testing stay the real ones; only the page's code is this checkout's. chrome.send is installed after the
 * document starts, so the code waits for DOMContentLoaded.
 * @param {Session} session a page's target session @param {keyof typeof WEBUI_ENTRIES} page
 */
export async function useCheckoutWebui(session, page) {
	const { build } = await import("vite");
	const outDir = join(repo, ".agents", "verify-runs", "webui-inject", page);
	await build({
		configFile: false,
		root: join(repo, "webui"),
		logLevel: "warn",
		publicDir: false,
		build: {
			outDir,
			emptyOutDir: true,
			target: "chrome140",
			minify: false,
			lib: {
				entry: join(repo, "webui", "src", WEBUI_ENTRIES[page]),
				formats: ["iife"],
				name: "lokaCheckout",
				fileName: () => "page.js",
			},
		},
	});
	const code = readFileSync(join(outDir, "page.js"), "utf8");
	const css = readFileSync(join(repo, "webui", "src", "page.css"), "utf8");
	const source = `(() => {
	new MutationObserver((records) => {
		for (const record of records)
			for (const node of record.addedNodes) {
				if (node.tagName === "SCRIPT" && node.type === "module") {
					node.type = "text/plain";
					node.remove();
				}
			}
	}).observe(document, { childList: true, subtree: true });
	window.__lokaCheckoutWebui = ${JSON.stringify(page)};
	document.addEventListener("DOMContentLoaded", () => {
		document.head.append(Object.assign(document.createElement("style"), { textContent: ${JSON.stringify(css)} }));
		${code}
	});
})();
//# sourceURL=loka-checkout-${page}.js`;
	await session.call("Page.enable");
	await session.call("Page.addScriptToEvaluateOnNewDocument", { source });
	// Marks the document that's there now, so only the reloaded one counts as started.
	await evaluate(session, "(window.__lokaBeforeReload = true)");
	await session.call("Page.reload", {});
	const ready = await until(
		() =>
			evaluate(
				session,
				"!window.__lokaBeforeReload && document.readyState === 'complete' && window.__lokaCheckoutWebui",
			).catch(() => false),
		15000,
	);
	if (!ready) throw new Error(`this checkout's ${page} page never started in the browser`);
}

/** @param {number} pid */
export const alive = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

/**
 * The visible window titles of process `pid`, and with `out` a PNG (PrintWindow, so it works behind other windows)
 * of the first one whose title contains `match`.
 * @param {number} pid @param {string} [out] @param {string} [match]
 */
export function windows(pid, out = "", match = "") {
	const args = ["-NoProfile", "-File", join(repo, "scripts", "window.ps1"), "-ProcId", String(pid)];
	if (out) args.push("-Out", out, ...(match ? ["-Match", match] : []));
	const run = spawnSync("powershell", args, { encoding: "utf8" });
	const titles = [...run.stdout.matchAll(/WINDOW:(.*)/g)].map((m) => (m[1] ?? "").trim());
	return { titles, shot: /SHOT:(.*)/.exec(run.stdout)?.[1] ?? "", error: run.stderr.trim() };
}
