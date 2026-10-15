// What verify-browser.mjs and verify-flows.mjs share to drive the built browser over raw CDP: a websocket client,
// waiting on conditions, requests to LokaSidebarHandler from the sidebar page, the browser's process tree and
// pictures of its windows. The sidebar is a top-chrome WebUI page Playwright doesn't list, so everything goes through
// /json/list and each target's websocket.

import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { BUILD_DIR, BUILT_BINARY, buildRunning, requireWindowsBuild, testBinary } from "./browser.mjs";

const repo = resolve(import.meta.dirname, "..");

/** @typedef {{ id: string, type: string, url: string, title: string, webSocketDebuggerUrl: string }} Target */
/** @typedef {Awaited<ReturnType<typeof connect>>} Session */

/** @param {number} ms */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The binary to test: LOKA_CHROME, else the dev build when no build is writing it, else the packaged snapshot. */
export const chromePath = () => testBinary().path || BUILT_BINARY;

/**
 * Refuses to run a binary the build is writing (linking fails on a chrome.exe that's running), and anything off
 * Windows, where these drives can't run yet (window.ps1, WM_NCHITTEST, taskkill). Exits 2: skipped, not failed.
 * @param {string} chrome
 */
export function refuseWhileBuilding(chrome) {
	requireWindowsBuild("Driving the built browser");
	const out = join(BUILD_DIR, "build", "src", "out").toLowerCase();
	if (!chrome.toLowerCase().startsWith(out)) return;
	const reasons = buildRunning();
	if (reasons.length) {
		console.error(`A build is using ${chrome} (${reasons.join("; ")}). Wait for it, or set LOKA_CHROME to a copy.`);
		process.exit(2);
	}
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

/** Every pid in the tree under `root`, from Windows' process table. @param {number} root @returns {number[]} */
export function processTree(root) {
	const ps = spawnSync(
		"powershell",
		[
			"-NoProfile",
			"-Command",
			'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }',
		],
		{ encoding: "utf8" },
	);
	/** @type {Map<number, number[]>} */
	const children = new Map();
	for (const line of ps.stdout.split(/\r?\n/)) {
		const [pid = 0, parent = 0] = line.trim().split(" ").map(Number);
		if (!pid) continue;
		children.set(parent, [...(children.get(parent) ?? []), pid]);
	}
	const tree = [root];
	for (const at of tree) tree.push(...(children.get(at) ?? []));
	return tree;
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
