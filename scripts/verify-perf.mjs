// Is the real sidebar light and smooth? Launches the built browser on a throwaway profile, gives it ~150 pinned
// tabs in three spaces, and measures over CDP what a user would feel or a laptop battery would pay for:
//
//   idle      20 s with the window up: CPU of the sidebar's renderer, the GPU and browser processes, layouts and
//             style recalcs per second (the sky's endless animations must stay on the compositor)
//   scroll    wheeling the 150-row list down and back up: frame times, long tasks, long animation frames
//   switch    10 space switches (Ctrl+1..3 to the sidebar, 400 ms apart): frames, long tasks, input-to-paint, heap
//             and DOM growth after garbage collection
//   command   Ctrl+K opens the floating command bar (command.html); 12 characters typed at human speed: open
//             latency, input-to-paint per key, long tasks, frames
//
// Each scenario also reads Performance.getMetrics (JS heap, DOM nodes, LayoutCount, RecalcStyleCount and their
// durations, ScriptDuration, TaskDuration) for the sidebar, one normal tab (a local page) and, for `command`, the
// command bar. CPU % is cpuTime from SystemInfo.getProcessInfo over the scenario's wall time, in % of one core; the
// sidebar has no pid in /json/list, so its renderer is the one whose cpuTime jumps while a busy loop runs in it.
// The machine's total CPU (typeperf) is recorded for every scenario: other agents may be running Chromium here.
//
//   bun run verify:perf                         the build's own pages, 3 runs, median and spread
//   bun run verify:perf -- --webui=checkout     this checkout's sidebar and command bar in the built browser
//   bun run verify:perf -- --runs 5
//   bun run verify:perf -- --trace              also a Chrome trace and the sidebar's JS profile per scenario
//
// The binary is LOKA_CHROME, else C:\src\loka\dist\snapshot\chrome.exe; never out\Default. Exit 1 when a median is
// over its budget (BUDGETS below), 2 when it can't run. Evidence (perf.json, summary.txt, traces) goes to
// .agents/verify-runs/<time>-perf/. Traced runs pay for the tracing: judge budgets from untraced runs.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import { BUILD_DIR } from "./browser.mjs";
import {
	askExpression,
	buildActivity,
	connect,
	evaluate,
	launchBrowser,
	sleep,
	until,
	useCheckoutWebui,
} from "./browser-session.mjs";

/** @typedef {import("./browser-session.mjs").Session} Session */
/** @typedef {import("../prototype/src/features/sidebar/sidebar.logic").BrowserState} BrowserState */
/** @typedef {import("../prototype/src/features/sidebar/sidebar.logic").PinnedNode} PinnedNode */
/** @typedef {import("../prototype/src/features/sidebar/sidebar.logic").Space} Space */
/** @typedef {"idle" | "scroll" | "switch" | "command"} Scenario */

// ---- budgets ------------------------------------------------------------------------------------------------------

/**
 * Every limit, judged on the median of the runs. CPU is % of one core. Frame times are requestAnimationFrame
 * intervals on the page's main thread.
 * @type {{ scenario: Scenario, metric: string, max: number, why: string }[]}
 */
const BUDGETS = [
	{ scenario: "idle", metric: "sidebar.cpuPct", max: 2, why: "a still sidebar must not keep a laptop core awake" },
	{ scenario: "idle", metric: "gpu.cpuPct", max: 3, why: "Chrome with a static page idles near 0% GPU" },
	{ scenario: "idle", metric: "browser.cpuPct", max: 2, why: "the browser process has nothing to do while idle" },
	{ scenario: "idle", metric: "tab.cpuPct", max: 1, why: "a static page must stay asleep beside the sidebar" },
	{ scenario: "idle", metric: "sidebar.layoutsPerSec", max: 0.2, why: "nothing moves: layout only on change" },
	{ scenario: "idle", metric: "sidebar.styleRecalcsPerSec", max: 0.5, why: "compositor animations need no restyle" },
	{ scenario: "idle", metric: "sidebar.longTasks", max: 0, why: "a 50 ms task while idle delays the next click" },
	{ scenario: "idle", metric: "sidebar.heapMB", max: 30, why: "150 rows of plain data fit well inside 30 MB" },
	{ scenario: "idle", metric: "sidebar.nodes", max: 10000, why: "~30 nodes a row x 150 rows + the sidebar's chrome" },
	{ scenario: "scroll", metric: "sidebar.frames.p95Ms", max: 20, why: "60 Hz is 16.7 ms a frame, plus vsync jitter" },
	{ scenario: "scroll", metric: "sidebar.frames.over33", max: 2, why: "a frame over 33 ms is a dropped frame" },
	{ scenario: "scroll", metric: "sidebar.longTaskMaxMs", max: 50, why: "a long task (50 ms) is three missed frames" },
	{ scenario: "switch", metric: "sidebar.frames.p95Ms", max: 20, why: "the sky turn and list slide should hold 60 Hz" },
	{ scenario: "switch", metric: "sidebar.frames.over33", max: 10, why: "at most one dropped frame per switch" },
	{ scenario: "switch", metric: "sidebar.longTaskMaxMs", max: 100, why: "RAIL: a response under 100 ms feels instant" },
	{ scenario: "switch", metric: "sidebar.keyEventMaxMs", max: 100, why: "RAIL: key press to next paint under 100 ms" },
	{ scenario: "switch", metric: "sidebar.heapGrowthMB", max: 1, why: "after GC, ten switches must not leave memory" },
	{ scenario: "switch", metric: "sidebar.nodeGrowth", max: 50, why: "switching must not leave elements behind" },
	{ scenario: "command", metric: "command.openMs", max: 100, why: "RAIL: Ctrl+K to a painted bar under 100 ms" },
	{ scenario: "command", metric: "command.keyEventMaxMs", max: 50, why: "a key should paint within three frames" },
	{
		scenario: "command",
		metric: "command.longTaskMaxMs",
		max: 50,
		why: "a long task (50 ms) drops a keystroke's frame",
	},
	{ scenario: "command", metric: "command.frames.p95Ms", max: 20, why: "60 Hz is 16.7 ms a frame, plus vsync jitter" },
];
/** Other processes using more than this share of the machine (all cores) make a run noisy. */
const BUSY_MACHINE_PCT = 15;

// ---- options ------------------------------------------------------------------------------------------------------

const repo = resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
/** @param {string} name */
const option = (name) => {
	const eq = argv.find((a) => a.startsWith(`--${name}=`));
	if (eq) return eq.slice(name.length + 3);
	const at = argv.indexOf(`--${name}`);
	return at === -1 ? undefined : argv[at + 1];
};
const webui = option("webui") ?? "build";
const runs = Number(option("runs") ?? 3);
const tracing = argv.includes("--trace");
if (!["build", "checkout"].includes(webui) || !Number.isInteger(runs) || runs < 1) {
	console.error("Usage: bun scripts/verify-perf.mjs [--webui=build|checkout] [--runs N] [--trace]");
	process.exit(2);
}
const chrome = resolve(process.env.LOKA_CHROME ?? join(BUILD_DIR, "dist", "snapshot", "chrome.exe"));
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const evidence = join(repo, ".agents", "verify-runs", `${stamp}-perf${webui === "checkout" ? "-checkout" : ""}`);
const CORES = cpus().length;

// ---- the local pages and the spaces -------------------------------------------------------------------------------

/** A normal tab to measure beside the sidebar, and pages for the pinned tabs' addresses (never loaded here). */
async function startPages() {
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? "/", "http://x").pathname;
		const name = path.split("/").at(-1) || "tab";
		const paragraphs = Array.from({ length: 30 }, (_, i) => `<p>Paragraph ${i + 1} of a plain local page.</p>`);
		res
			.writeHead(200, { "content-type": "text/html" })
			.end(`<!doctype html><title>Perf ${name}</title><h1>Perf ${name}</h1>${paragraphs.join("")}`);
	});
	await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
	const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
	return { server, host: `127.0.0.1:${port}` };
}

const TITLES = [
	"Pull request review",
	"Design notes for the new onboarding flow",
	"Docs",
	"Release checklist and the long list of things that must not be forgotten",
	"Inbox",
	"Calendar - week view",
	"Issue tracker",
	"Chromium code search",
];

/**
 * Three spaces like a heavy user's: "Build" (dark) with 150 pinned tabs, two folders open and one folder inside
 * another; "School" (light) and "Home" (dark) with a few each; four Essentials. Every tab is unloaded (rows only).
 * @param {string} host @returns {BrowserState}
 */
function perfState(host) {
	/** @type {BrowserState["tabs"]} */
	const tabs = {};
	let n = 0;
	/** @param {string} space @returns {PinnedNode} */
	const tab = (space) => {
		n++;
		const id = `perf-${n}`;
		tabs[id] = { id, title: `${TITLES[n % TITLES.length]} ${n}`, url: `http://${host}/${space}/${n}` };
		return { kind: "tab", id };
	};
	/** @param {string} space @param {number} count */
	const many = (space, count) => Array.from({ length: count }, () => tab(space));
	const essentials = many("essential", 4).map((t) => t.id);
	/** @type {PinnedNode[]} */
	const build = [
		{ kind: "folder", id: "perf-docs", name: "Docs", open: true, children: many("build", 12) },
		{
			kind: "folder",
			id: "perf-reading",
			name: "Reading",
			open: true,
			children: [
				...many("build", 12),
				{ kind: "folder", id: "perf-later", name: "Later", open: true, children: many("build", 6) },
			],
		},
		...many("build", 120),
	];
	/**
	 * @param {string} id @param {string} name @param {number} hue @param {Space["planet"]} planet
	 * @param {Space["scheme"]} scheme @param {PinnedNode[]} pinned @returns {Space}
	 */
	const space = (id, name, hue, planet, scheme, pinned) => ({
		id,
		name,
		hue,
		planet,
		scheme,
		pinned,
		open: [],
		activeTabId: null,
	});
	return {
		version: 1,
		tabs,
		essentials,
		spaces: [
			space("perf-build", "Build", 200, "ringed", "dark", build),
			space("perf-school", "School", 30, "banded", "light", many("school", 12)),
			space("perf-home", "Home", 150, "ocean", "dark", many("home", 8)),
		],
		activeSpaceId: "perf-build",
		archive: [],
	};
}
const BUILD_PINNED = 150;

// ---- in-page probes -----------------------------------------------------------------------------------------------

/** The sidebar's own elements, through loka-panel's and loka-sidebar's shadow roots. */
const SIDEBAR_ROOT = `document.querySelector("loka-panel")?.shadowRoot?.querySelector("loka-sidebar")?.shadowRoot`;

/**
 * Starts recording long tasks, long animation frames, slow events (Event Timing, 16 ms and up) and, with `frames`,
 * every requestAnimationFrame interval. The recorder only runs in active scenarios: in `idle` it would itself wake
 * the page every frame.
 * @param {boolean} frames
 */
const startProbes = (frames) => `(() => {
	const p = (window.__perf = { longtasks: [], loaf: [], events: [], frames: [], observers: [], unsupported: [] });
	const watch = (type, options, sink) => {
		try {
			const o = new PerformanceObserver((list) => list.getEntries().forEach(sink));
			o.observe({ type, ...options });
			p.observers.push({ o, sink });
		} catch {
			p.unsupported.push(type);
		}
	};
	watch("longtask", {}, (e) => p.longtasks.push({ start: e.startTime, duration: e.duration }));
	watch("long-animation-frame", {}, (e) => {
		const end = e.startTime + e.duration;
		p.loaf.push({
			start: e.startTime,
			duration: e.duration,
			blocking: e.blockingDuration,
			styleLayout: e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0,
			render: e.renderStart ? end - e.renderStart : 0,
			scripts: e.scripts.map((s) => ({
				invoker: s.invoker,
				fn: s.sourceFunctionName,
				url: s.sourceURL,
				at: s.sourceCharPosition,
				duration: s.duration,
				forcedLayout: s.forcedStyleAndLayoutDuration,
			})),
		});
	});
	watch("event", { durationThreshold: 16 }, (e) =>
		p.events.push({ name: e.name, duration: e.duration, delay: e.processingStart - e.startTime, processing: e.processingEnd - e.processingStart }),
	);
	if (${frames}) {
		let last = 0;
		p.recording = true;
		const tick = (t) => {
			if (!p.recording) return;
			if (last) p.frames.push(t - last);
			last = t;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}
	return true;
})()`;

/** Stops the probes and hands back what they saw. */
const STOP_PROBES = `(() => {
	const p = window.__perf;
	if (!p) return null;
	p.recording = false;
	for (const { o, sink } of p.observers) {
		o.takeRecords().forEach(sink);
		o.disconnect();
	}
	const { observers, ...seen } = p;
	return seen;
})()`;

/** Spins the page's main thread, so its renderer's cpuTime jumps. */
const BUSY = `(() => { const end = performance.now() + 400; let x = 0; while (performance.now() < end) x++; return x > 0; })()`;

/** The focused element, through shadow roots. */
const DEEP_ACTIVE = `(() => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; })()`;

// ---- measuring ----------------------------------------------------------------------------------------------------

/** @typedef {{ type: string, id: number, cpuTime: number }} ProcessInfo */

/** @param {Session} browser @returns {Promise<ProcessInfo[]>} */
const processInfo = async (browser) => (await browser.call("SystemInfo.getProcessInfo")).processInfo;

/**
 * The renderer that runs `page`: the one whose cpuTime grows by most of a 400 ms busy loop run in it.
 * @param {Session} browser @param {Session} page
 */
async function rendererOf(browser, page) {
	for (let attempt = 0; attempt < 3; attempt++) {
		const before = new Map((await processInfo(browser)).map((p) => [p.id, p.cpuTime]));
		await evaluate(page, BUSY);
		const after = await processInfo(browser);
		const jumps = after
			.filter((p) => p.type === "renderer")
			.map((p) => ({ pid: p.id, grew: p.cpuTime - (before.get(p.id) ?? p.cpuTime) }))
			.sort((a, b) => b.grew - a.grew);
		const [top, next] = jumps;
		if (top && top.grew > 0.25 && (!next || next.grew < top.grew / 3)) return top.pid;
	}
	throw new Error("couldn't tell which renderer runs the page");
}

/** @param {Session} page @returns {Promise<Record<string, number>>} */
async function metrics(page) {
	const { metrics: list } = await page.call("Performance.getMetrics");
	return Object.fromEntries(list.map((/** @type {{ name: string, value: number }} */ m) => [m.name, m.value]));
}

/** Heap after a full garbage collection, in MB. @param {Session} page */
async function heapAfterGc(page) {
	await page.call("HeapProfiler.collectGarbage");
	return (await page.call("Runtime.getHeapUsage")).usedSize / 2 ** 20;
}

/**
 * The machine's total CPU % (all cores) once a second, from Windows' counters, until stop() is called.
 * @param {number} seconds the most samples it takes
 */
function machineLoad(seconds) {
	const run = spawn(
		"typeperf",
		["\\Processor(_Total)\\% Processor Time", "-si", "1", "-sc", String(Math.ceil(seconds) + 5)],
		{ stdio: ["ignore", "pipe", "ignore"] },
	);
	let out = "";
	run.stdout.on("data", (d) => {
		out += d;
	});
	return {
		/** @returns {number[]} */
		stop() {
			run.kill();
			return [...out.matchAll(/^"[^"]+","([\d.]+)"/gm)].map((m) => Number(m[1]));
		},
	};
}

/** @param {number[]} values @param {number} q 0..1 */
function quantile(values, q) {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}
/** @param {number[]} values */
const median = (values) => {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length / 2;
	return Number.isInteger(mid) ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[Math.floor(mid)] ?? 0);
};
/** @param {number} x @param {number} [digits] */
const round = (x, digits = 2) => Math.round(x * 10 ** digits) / 10 ** digits;

/**
 * @typedef {{ longtasks: { start: number, duration: number }[], loaf: any[], events: { name: string, duration: number,
 *   delay: number, processing: number }[], frames: number[], unsupported: string[] }} Probes
 */

/**
 * One page's numbers over a scenario: Performance.getMetrics deltas, the probes' long tasks, slow events and frames.
 * @param {string} prefix @param {Record<string, number>} m0 @param {Record<string, number>} m1 @param {Probes | null} probes
 * @param {number} seconds
 */
function pageNumbers(prefix, m0, m1, probes, seconds) {
	/** @param {string} name */
	const delta = (name) => (m1[name] ?? 0) - (m0[name] ?? 0);
	/** @type {Record<string, number>} */
	const out = {
		[`${prefix}.heapMB`]: round((m1.JSHeapUsedSize ?? 0) / 2 ** 20),
		[`${prefix}.nodes`]: m1.Nodes ?? 0,
		[`${prefix}.layouts`]: delta("LayoutCount"),
		[`${prefix}.layoutsPerSec`]: round(delta("LayoutCount") / seconds),
		[`${prefix}.layoutMs`]: round(delta("LayoutDuration") * 1000),
		[`${prefix}.styleRecalcs`]: delta("RecalcStyleCount"),
		[`${prefix}.styleRecalcsPerSec`]: round(delta("RecalcStyleCount") / seconds),
		[`${prefix}.styleMs`]: round(delta("RecalcStyleDuration") * 1000),
		[`${prefix}.scriptMs`]: round(delta("ScriptDuration") * 1000),
		[`${prefix}.taskMs`]: round(delta("TaskDuration") * 1000),
	};
	if (!probes) return out;
	out[`${prefix}.longTasks`] = probes.longtasks.length;
	out[`${prefix}.longTaskMaxMs`] = round(Math.max(0, ...probes.longtasks.map((t) => t.duration)));
	out[`${prefix}.loafs`] = probes.loaf.length;
	out[`${prefix}.loafMaxMs`] = round(Math.max(0, ...probes.loaf.map((l) => l.duration)));
	// Keys only: the pointer events Blink sends on its own when what's under a still cursor moves aren't input.
	const keys = probes.events.filter((e) => KEY_EVENTS.includes(e.name));
	out[`${prefix}.slowEvents`] = probes.events.length;
	out[`${prefix}.slowKeyEvents`] = keys.length;
	out[`${prefix}.keyEventMaxMs`] = round(Math.max(0, ...keys.map((e) => e.duration)));
	if (probes.frames.length) {
		out[`${prefix}.frames.count`] = probes.frames.length;
		out[`${prefix}.frames.p50Ms`] = round(quantile(probes.frames, 0.5));
		out[`${prefix}.frames.p95Ms`] = round(quantile(probes.frames, 0.95));
		out[`${prefix}.frames.maxMs`] = round(Math.max(...probes.frames));
		out[`${prefix}.frames.over33`] = probes.frames.filter((f) => f > 33.4).length;
	}
	return out;
}

const KEY_EVENTS = ["keydown", "keypress", "keyup", "beforeinput", "input"];

/** What took the time in the long animation frames: the slowest scripts by source. @param {any[]} loaf */
function loafScripts(loaf) {
	/** @type {Map<string, { total: number, count: number, forcedLayout: number }>} */
	const by = new Map();
	for (const frame of loaf)
		for (const s of frame.scripts) {
			const key = `${s.invoker} ${s.fn || "?"} ${String(s.url).split("/").at(-1)}:${s.at}`;
			const was = by.get(key) ?? { total: 0, count: 0, forcedLayout: 0 };
			by.set(key, {
				total: was.total + s.duration,
				count: was.count + 1,
				forcedLayout: was.forcedLayout + s.forcedLayout,
			});
		}
	return [...by]
		.sort((a, b) => b[1].total - a[1].total)
		.slice(0, 8)
		.map(([key, v]) => ({
			script: key,
			totalMs: round(v.total),
			count: v.count,
			forcedLayoutMs: round(v.forcedLayout),
		}));
}

// ---- tracing ------------------------------------------------------------------------------------------------------

const TRACE_CATEGORIES = [
	"-*",
	"devtools.timeline",
	"disabled-by-default-devtools.timeline",
	"disabled-by-default-devtools.timeline.frame",
	"blink.user_timing",
	"v8.execute",
	"cc",
	"gpu",
	"viz",
	"toplevel",
	"latencyInfo",
	"loading",
];

/** Starts a browser-wide trace; stop() saves it for DevTools and returns the events. @param {Session} browser */
async function startTrace(browser) {
	await browser.call("Tracing.start", {
		transferMode: "ReturnAsStream",
		traceConfig: { includedCategories: TRACE_CATEGORIES.filter((c) => c !== "-*"), excludedCategories: ["*"] },
	});
	return {
		/** @param {string} file @returns {Promise<any[]>} */
		async stop(file) {
			/** @type {Promise<string>} */
			const done = new Promise((ok) => browser.on("Tracing.tracingComplete", (p) => ok(p.stream)));
			await browser.call("Tracing.end");
			const stream = await done;
			let text = "";
			for (;;) {
				const chunk = await browser.call("IO.read", { handle: stream, size: 1 << 20 }, 60000);
				text += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString("utf8") : chunk.data;
				if (chunk.eof) break;
			}
			await browser.call("IO.close", { handle: stream });
			writeFileSync(file, text);
			const parsed = JSON.parse(text);
			return Array.isArray(parsed) ? parsed : (parsed.traceEvents ?? []);
		},
	};
}

/**
 * Where a trace spent its time, per process and thread: the top event names by summed duration (inclusive, so
 * nested events count in their parents too) and how often each ran.
 * @param {any[]} events @param {Record<string, number>} pids
 */
function traceSummary(events, pids) {
	/** @type {Map<string, string>} */
	const threads = new Map();
	for (const e of events)
		if (e.ph === "M" && e.name === "thread_name") threads.set(`${e.pid}:${e.tid}`, e.args?.name ?? "?");
	/** @type {Record<string, Record<string, { ms: number, count: number }>>} */
	const by = {};
	for (const e of events) {
		const who = Object.entries(pids).find(([, pid]) => pid === e.pid)?.[0];
		if (!who || (e.ph !== "X" && e.ph !== "I" && e.ph !== "i")) continue;
		const thread = `${who} ${threads.get(`${e.pid}:${e.tid}`) ?? e.tid}`;
		const names = by[thread] ?? {};
		by[thread] = names;
		const slot = names[e.name] ?? { ms: 0, count: 0 };
		names[e.name] = { ms: slot.ms + (e.dur ?? 0) / 1000, count: slot.count + 1 };
	}
	return Object.fromEntries(
		Object.entries(by).map(([thread, names]) => [
			thread,
			Object.entries(names)
				.sort((a, b) => b[1].ms - a[1].ms || b[1].count - a[1].count)
				.slice(0, 14)
				.map(([name, v]) => `${name}: ${round(v.ms, 1)} ms x${v.count}`),
		]),
	);
}

/**
 * The page's animations as the trace saw them, and why any of them couldn't run on the compositor (Blink's
 * compositeFailed bits and unsupportedProperties): those tick on the main thread every frame.
 * @param {any[]} events @param {number} pid
 */
function animationSummary(events, pid) {
	/** @type {Map<string, number>} */
	const by = new Map();
	for (const e of events) {
		if (e.pid !== pid || e.name !== "Animation") continue;
		const data = e.args?.data ?? e.args?.args?.data;
		if (!data || data.compositeFailed === undefined) continue;
		const key = `${data.name || data.id || "?"}: compositeFailed ${data.compositeFailed}${data.unsupportedProperties?.length ? `, unsupported ${data.unsupportedProperties.join(" ")}` : ""}`;
		by.set(key, (by.get(key) ?? 0) + 1);
	}
	return [...by].sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} (x${count})`);
}

/** Self time per function in a JS CPU profile, top first. @param {any} profile */
function profileSummary(profile) {
	/** @type {Map<number, any>} */
	const nodes = new Map(profile.nodes.map((/** @type {any} */ n) => [n.id, n]));
	/** @type {Map<string, number>} */
	const self = new Map();
	profile.samples.forEach((/** @type {number} */ id, /** @type {number} */ i) => {
		const frame = nodes.get(id)?.callFrame;
		if (!frame) return;
		const key = `${frame.functionName || "(anonymous)"} ${String(frame.url).split("/").at(-1)}:${frame.lineNumber + 1}`;
		self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
	});
	return [...self]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 15)
		.map(([key, ms]) => `${key}: ${round(ms, 1)} ms`);
}

// ---- one run ------------------------------------------------------------------------------------------------------

/**
 * Launches the browser, loads the spaces, runs the four scenarios and closes it.
 * @param {number} run @param {string} host
 */
async function oneRun(run, host) {
	const b = await launchBrowser({ name: "perf", chrome, url: `http://${host}/tab` });
	/** @type {Record<string, Record<string, number>>} */
	const results = {};
	/** @type {Record<string, any>} */
	const details = {};
	try {
		const sidebar = await b.sidebar();
		await sidebar.call("Page.enable");
		if (webui === "checkout") await useCheckoutWebui(sidebar, "sidebar");
		const tabTarget = await b.target((t) => t.type === "page" && t.url === `http://${host}/tab`);
		const tab = await connect(tabTarget.webSocketDebuggerUrl);

		// The spaces go into the profile's store, then the sidebar reloads and reads them like at startup.
		await sleep(1500);
		const json = JSON.stringify(perfState(host));
		await evaluate(sidebar, `(chrome.send("setStore", ["state.v1", ${JSON.stringify(json)}]), true)`);
		await sleep(500);
		await sidebar.call("Page.reload", {});
		await sleep(500);
		const rows = await until(
			() =>
				evaluate(
					sidebar,
					`(${webui === "checkout"} ? Boolean(window.__lokaCheckoutWebui) : true) && (${SIDEBAR_ROOT}?.querySelectorAll('[role="treeitem"]').length ?? 0)`,
				).catch(() => 0),
			15000,
		);
		await sleep(1000);
		const shownRows = await evaluate(sidebar, `${SIDEBAR_ROOT}?.querySelectorAll('[role="treeitem"]').length ?? 0`);
		if (shownRows < BUILD_PINNED)
			throw new Error(`the sidebar shows ${shownRows} rows, not ${BUILD_PINNED}+ (${rows})`);
		const store = await evaluate(sidebar, askExpression("getStore"));
		const saved = JSON.parse(store["state.v1"] ?? "null");
		if (saved?.spaces?.length !== 3) throw new Error("the profile doesn't have the three spaces");
		details.rows = shownRows;

		for (const s of [sidebar, tab]) {
			await s.call("Performance.enable");
			await s.call("Runtime.enable");
		}
		const pids = {
			sidebar: await rendererOf(b.browser, sidebar),
			tab: await rendererOf(b.browser, tab),
			browser: (await processInfo(b.browser)).find((p) => p.type === "browser")?.id ?? 0,
			gpu: (await processInfo(b.browser)).find((p) => /gpu/i.test(p.type))?.id ?? 0,
		};

		// The command bar's window: opened once and closed, so the scenario measures the bar as a user meets it
		// every time after the first (the browser keeps the page and only shows it).
		const coldStart = Date.now();
		await evaluate(sidebar, `(chrome.send("openCommandBar", ["new-tab"]), true)`);
		const commandTarget = await b.target((t) => t.url.includes("command.html"), 10000);
		const command = await connect(commandTarget.webSocketDebuggerUrl);
		await command.call("Runtime.enable");
		await command.call("Page.enable");
		const coldOpen = await until(
			() => evaluate(command, `${DEEP_ACTIVE}?.tagName === "INPUT"`).catch(() => false),
			8000,
		);
		details.commandColdOpenMs = coldOpen ? Date.now() - coldStart : null;
		if (webui === "checkout") await useCheckoutWebui(command, "command");
		await command.call("Performance.enable");
		await evaluate(command, `(chrome.send("closeCommandBar", []), true)`);
		if (!(await until(() => evaluate(command, `document.visibilityState === "hidden"`), 5000)))
			throw new Error("the command bar didn't hide after closeCommandBar");
		/** @type {Record<string, number>} */
		const allPids = { ...pids, command: await rendererOf(b.browser, command) };
		details.pids = allPids;
		if (allPids.command === allPids.sidebar)
			details.sharedRenderer = "the sidebar and the command bar share a renderer";
		await sleep(3000);

		/**
		 * Runs one scenario with every probe around it.
		 * @param {Scenario} name @param {{ frames: boolean, pages: [string, Session][] }} how
		 * @param {() => Promise<Record<string, number>>} act
		 */
		const scenario = async (name, how, act) => {
			for (const [, s] of how.pages) await s.call("HeapProfiler.enable");
			/** @type {Record<string, number>} */
			const heap0 = {};
			/** @type {Record<string, number>} */
			const nodes0 = {};
			for (const [who, s] of how.pages) {
				heap0[who] = await heapAfterGc(s);
				nodes0[who] = (await metrics(s)).Nodes ?? 0;
			}
			// The mouse rests outside the page, so hover can't change under it.
			await sidebar.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5000, y: 5000 });
			for (const [, s] of how.pages) await evaluate(s, startProbes(how.frames && s !== tab));
			const trace = tracing ? await startTrace(b.browser) : null;
			if (tracing) {
				await sidebar.call("Profiler.enable");
				await sidebar.call("Profiler.setSamplingInterval", { interval: 200 });
				await sidebar.call("Profiler.start");
			}
			const visible = await evaluate(sidebar, "document.visibilityState");
			const m0 = await Promise.all(how.pages.map(([, s]) => metrics(s)));
			const load = machineLoad(30);
			const cpu0 = await processInfo(b.browser);
			const t0 = performance.now();
			const extra = await act();
			const seconds = (performance.now() - t0) / 1000;
			const cpu1 = await processInfo(b.browser);
			const loadSamples = load.stop();
			const m1 = await Promise.all(how.pages.map(([, s]) => metrics(s)));
			/** @type {Record<string, Probes | null>} */
			const probes = {};
			for (const [who, s] of how.pages) probes[who] = await evaluate(s, STOP_PROBES);
			/** @type {Record<string, any>} */
			const detail = { visible, loadSamples };
			if (trace) {
				const base = join(evidence, `run${run}-${name}`);
				const { profile } = await sidebar.call("Profiler.stop");
				writeFileSync(`${base}.sidebar.cpuprofile`, JSON.stringify(profile));
				detail.sidebarProfile = profileSummary(profile);
				const events = await trace.stop(`${base}.trace.json`);
				detail.trace = traceSummary(events, allPids);
				detail.animations = animationSummary(events, pids.sidebar);
				detail.traceFile = `${base}.trace.json`;
			}
			/** @type {Record<string, number>} */
			const out = { seconds: round(seconds), ...extra };
			how.pages.forEach(([who], i) => {
				Object.assign(out, pageNumbers(who, m0[i] ?? {}, m1[i] ?? {}, probes[who] ?? null, seconds));
			});
			const before = new Map(cpu0.map((p) => [p.id, p.cpuTime]));
			/** @param {number} pid */
			const pct = (pid) => {
				const now = cpu1.find((p) => p.id === pid);
				return now ? round(((now.cpuTime - (before.get(pid) ?? now.cpuTime)) / seconds) * 100, 1) : 0;
			};
			for (const [who, pid] of Object.entries(allPids)) out[`${who}.cpuPct`] = pct(pid);
			const loka = cpu1.reduce((sum, p) => sum + (p.cpuTime - (before.get(p.id) ?? p.cpuTime)), 0);
			out["loka.cpuPct"] = round((loka / seconds) * 100, 1);
			out["loka.processes"] = cpu1.length;
			const total = loadSamples.length ? loadSamples.reduce((a, x) => a + x, 0) / loadSamples.length : -1;
			out["machine.cpuPct"] = round(total, 1);
			out["machine.othersPct"] = total < 0 ? -1 : round(Math.max(0, total - out["loka.cpuPct"] / CORES), 1);
			for (const [who, s] of how.pages) {
				const after = await heapAfterGc(s);
				out[`${who}.heapAfterGcMB`] = round(after);
				out[`${who}.heapGrowthMB`] = round(after - (heap0[who] ?? after));
				out[`${who}.nodeGrowth`] = ((await metrics(s)).Nodes ?? 0) - (nodes0[who] ?? 0);
			}
			for (const [who, p] of Object.entries(probes)) {
				if (!p) continue;
				detail[`${who}.longtasks`] = p.longtasks.map((t) => round(t.duration));
				detail[`${who}.loafScripts`] = loafScripts(p.loaf);
				detail[`${who}.loafWorst`] = p.loaf
					.sort((x, y) => y.duration - x.duration)
					.slice(0, 5)
					.map((l) => ({
						duration: round(l.duration),
						blocking: round(l.blocking),
						styleLayout: round(l.styleLayout),
					}));
				detail[`${who}.slowEvents`] = p.events.map((e) => `${e.name} ${e.duration}ms (delay ${round(e.delay)})`);
				if (p.unsupported.length) detail[`${who}.unsupported`] = p.unsupported;
			}
			results[name] = out;
			details[name] = detail;
			const busy = out["machine.othersPct"] > BUSY_MACHINE_PCT ? " (busy machine)" : "";
			console.log(
				`  run ${run} ${name}: sidebar ${out["sidebar.cpuPct"]}% cpu, gpu ${out["gpu.cpuPct"]}%, machine ${out["machine.cpuPct"]}% (others ${out["machine.othersPct"]}%)${busy}`,
			);
			await sleep(2000);
		};

		const pages = /** @type {[string, Session][]} */ ([
			["sidebar", sidebar],
			["tab", tab],
		]);

		// (a) idle: nothing touches the page; the window stays up.
		await scenario("idle", { frames: false, pages }, async () => {
			await sleep(20000);
			return {};
		});

		// (b) scroll: the wheel over the list, down to the end and back up.
		const box = await evaluate(
			sidebar,
			`(() => { const r = ${SIDEBAR_ROOT}.querySelector(".scroll").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, height: r.height }; })()`,
		);
		await scenario("scroll", { frames: true, pages }, async () => {
			let deepest = 0;
			for (const dy of [120, -120])
				for (let i = 0; i < 40; i++) {
					await sidebar.call("Input.dispatchMouseEvent", {
						type: "mouseWheel",
						x: box.x,
						y: box.y,
						deltaX: 0,
						deltaY: dy,
					});
					await sleep(60);
					if (i % 8 === 7)
						deepest = Math.max(deepest, await evaluate(sidebar, `${SIDEBAR_ROOT}.querySelector(".scroll").scrollTop`));
				}
			await sleep(800);
			const top = await evaluate(sidebar, `${SIDEBAR_ROOT}.querySelector(".scroll").scrollTop`);
			return { "scroll.deepestPx": Math.round(deepest), "scroll.endPx": Math.round(top) };
		});
		// (c) space switches: Ctrl+digit to the sidebar, which handles those keys itself. Each switch adds a fading
		// copy of the old sky; counting those proves the switches happened.
		await evaluate(
			sidebar,
			`(() => {
				window.__perfSwitches = 0;
				const sky = document.querySelector("loka-panel").shadowRoot.querySelector(".sky");
				new MutationObserver((records) => {
					for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains("sky-was")) window.__perfSwitches++;
				}).observe(sky, { childList: true });
				return true;
			})()`,
		);
		await scenario("switch", { frames: true, pages }, async () => {
			for (const digit of [2, 1, 3, 1, 2, 1, 3, 1, 2, 1]) {
				const key = { key: String(digit), code: `Digit${digit}`, windowsVirtualKeyCode: 48 + digit, modifiers: 2 };
				await sidebar.call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
				await sidebar.call("Input.dispatchKeyEvent", { type: "keyUp", ...key });
				await sleep(400);
			}
			await sleep(1500);
			return { "switch.seen": await evaluate(sidebar, "window.__perfSwitches") };
		});
		const space = JSON.parse((await evaluate(sidebar, askExpression("getStore")))["state.v1"]).activeSpaceId;
		if (space !== "perf-build") throw new Error(`after the switches the sidebar shows ${space}, not Build`);

		// (d) the command bar: Ctrl+K in the sidebar, then 12 characters at about 150 ms each. Open is the first
		// frame (rAF start, epoch ms) of the shown window with a new bar (the page counts opens) and its input focused,
		// from the sidebar's keydown.
		await evaluate(
			sidebar,
			`(window.addEventListener("keydown", (e) => { if (e.ctrlKey && e.key === "k") window.__perfKeyAt = performance.timeOrigin + e.timeStamp; }, { capture: true }), true)`,
		);
		await evaluate(
			command,
			`(() => {
				window.__perfOpenAt = 0;
				const page = document.querySelector("loka-command-page");
				const before = page.opened;
				const look = (t) => {
					if (page.opened > before && ${DEEP_ACTIVE}?.tagName === "INPUT" && document.visibilityState === "visible")
						window.__perfOpenAt = performance.timeOrigin + t;
					else requestAnimationFrame(look);
				};
				requestAnimationFrame(look);
				return true;
			})()`,
		);
		const typed = "loka browser";
		await scenario(
			"command",
			{
				frames: false,
				pages: [
					["sidebar", sidebar],
					["command", command],
				],
			},
			async () => {
				if ((await evaluate(command, "document.visibilityState")) !== "hidden")
					throw new Error("the command bar was already showing before Ctrl+K");
				const k = { key: "k", code: "KeyK", windowsVirtualKeyCode: 75, modifiers: 2 };
				await sidebar.call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...k });
				await sidebar.call("Input.dispatchKeyEvent", { type: "keyUp", ...k });
				const opened = await until(() => evaluate(command, "window.__perfOpenAt"), 5000);
				if (!opened) throw new Error("the command bar never opened");
				// Frames from here: the window was hidden until now, and rAF doesn't run in a hidden page.
				await evaluate(
					command,
					`(() => { const p = window.__perf; let last = 0; p.recording = true; const tick = (t) => { if (!p.recording) return; if (last) p.frames.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); return true; })()`,
				);
				for (const ch of typed) {
					const key =
						ch === " "
							? { key: " ", code: "Space", windowsVirtualKeyCode: 32 }
							: { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) };
					await command.call("Input.dispatchKeyEvent", { type: "keyDown", text: ch, ...key });
					await command.call("Input.dispatchKeyEvent", { type: "keyUp", ...key });
					await sleep(150);
				}
				await sleep(800);
				const keyAt = await evaluate(sidebar, "window.__perfKeyAt ?? 0");
				const value = await evaluate(command, `${DEEP_ACTIVE}?.value ?? ""`);
				return {
					"command.openMs": round(opened - keyAt, 1),
					"command.typedRight": value === typed ? 1 : 0,
				};
			},
		);
		await evaluate(command, `(chrome.send("closeCommandBar", []), true)`);
	} finally {
		await b.close();
	}
	return { results, details };
}

// ---- main ---------------------------------------------------------------------------------------------------------

/** Checks a run did the work it measured; a scenario that didn't happen is a failure, not a fast number. @param {Record<string, Record<string, number>>} r */
function happened(r) {
	/** @type {string[]} */
	const wrong = [];
	if ((r.scroll?.["scroll.deepestPx"] ?? 0) < 1000)
		wrong.push(`scroll reached only ${r.scroll?.["scroll.deepestPx"]} px`);
	if (r.switch?.["switch.seen"] !== 10) wrong.push(`${r.switch?.["switch.seen"]} of 10 space switches happened`);
	if (r.command?.["command.typedRight"] !== 1) wrong.push("the command bar didn't get the typed text");
	return wrong;
}

async function main() {
	if (!existsSync(chrome)) {
		console.error(`No browser at ${chrome}. Set LOKA_CHROME to a built chrome.exe.`);
		process.exit(2);
	}
	if (chrome.toLowerCase().startsWith(join(BUILD_DIR, "build", "src", "out").toLowerCase())) {
		console.error("verify:perf runs a copy (dist\\snapshot), never the build's own out\\ binary.");
		process.exit(2);
	}
	const building = buildActivity();
	if (building.length) {
		console.error(`A build is running (${building.join("; ")}): it would starve the browser. Try again after it.`);
		process.exit(2);
	}
	mkdirSync(evidence, { recursive: true });
	const status = spawnSync("bun", ["scripts/browser.mjs", "status"], { cwd: repo, encoding: "utf8" });
	console.log(`verify:perf  ${chrome}\n  webui: ${webui}, runs: ${runs}${tracing ? ", traced" : ""}, ${CORES} cores`);
	const { server, host } = await startPages();
	/** @type {{ results: Record<string, Record<string, number>>, details: Record<string, any> }[]} */
	const all = [];
	/** @type {string[]} */
	const problems = [];
	try {
		for (let run = 1; run <= runs; run++) {
			console.log(`\nrun ${run} of ${runs}`);
			try {
				const r = await oneRun(run, host);
				const wrong = happened(r.results);
				if (wrong.length) problems.push(`run ${run}: ${wrong.join("; ")}`);
				all.push(r);
			} catch (e) {
				problems.push(`run ${run}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
				console.log(`  run ${run} stopped: ${e instanceof Error ? e.message : e}`);
			}
		}
	} finally {
		server.close();
	}

	/** @type {string[]} */
	const lines = [];
	/** @type {Record<string, Record<string, { median: number, min: number, max: number, runs: number[] }>>} */
	const summary = {};
	for (const name of ["idle", "scroll", "switch", "command"]) {
		const keys = [...new Set(all.flatMap((r) => Object.keys(r.results[name] ?? {})))];
		summary[name] = {};
		for (const key of keys) {
			const values = all.map((r) => r.results[name]?.[key]).filter((v) => typeof v === "number");
			summary[name][key] = {
				median: round(median(values)),
				min: round(Math.min(...values)),
				max: round(Math.max(...values)),
				runs: values,
			};
		}
	}
	let failed = 0;
	lines.push(`\nBudgets (median of ${all.length} run${all.length === 1 ? "" : "s"}, min-max):`);
	for (const b of BUDGETS) {
		const s = summary[b.scenario]?.[b.metric];
		if (!s) {
			failed++;
			lines.push(`FAIL  ${b.scenario} ${b.metric}: not measured`);
			continue;
		}
		const ok = s.median <= b.max;
		if (!ok) failed++;
		lines.push(
			`${ok ? "PASS" : "FAIL"}  ${b.scenario} ${b.metric}: ${s.median} (${s.min}-${s.max}) <= ${b.max}  ${b.why}`,
		);
	}
	lines.push("\nOther numbers (median, min-max):");
	for (const [name, metricsOf] of Object.entries(summary)) {
		const shown = Object.entries(metricsOf)
			.filter(([key]) => !BUDGETS.some((b) => b.scenario === name && b.metric === key))
			.map(([key, s]) => `${key} ${s.median} (${s.min}-${s.max})`);
		lines.push(`  ${name}: ${shown.join(", ")}`);
	}
	const others = Object.values(summary).map((m) => m["machine.othersPct"]?.max ?? 0);
	const busiest = Math.max(0, ...others);
	lines.push(
		`\nMachine: other processes used up to ${busiest}% of all ${CORES} cores during a scenario${busiest > BUSY_MACHINE_PCT ? ` - HIGH (over ${BUSY_MACHINE_PCT}%): the numbers are noisy, run again when it's quiet` : ""}.`,
	);
	const cold = all.map((r) => r.details.commandColdOpenMs).filter((v) => typeof v === "number");
	if (cold.length) lines.push(`Command bar's first open (a new window and page, coarse): ${cold.join(", ")} ms.`);
	const shared = all.find((r) => r.details.sharedRenderer)?.details.sharedRenderer;
	if (shared) lines.push(`Note: ${shared}; their CPU numbers are the same process.`);
	if (tracing) lines.push("Traced: these runs paid for tracing and profiling. Judge budgets from an untraced run.");
	for (const p of problems) lines.push(`PROBLEM ${p}`);
	const verdict = problems.length || failed || !all.length ? "FAIL" : "PASS";
	lines.push(`\n${verdict}: ${BUDGETS.length - failed}/${BUDGETS.length} budgets. Evidence: ${evidence}`);
	const text = lines.join("\n");
	console.log(text);
	writeFileSync(join(evidence, "summary.txt"), text);
	writeFileSync(
		join(evidence, "perf.json"),
		JSON.stringify(
			{
				chrome,
				webui,
				runs,
				tracing,
				cores: CORES,
				buildStatus: status.stdout?.trim(),
				budgets: BUDGETS,
				summary,
				problems,
				runsDetail: all,
			},
			null,
			2,
		),
	);
	process.exit(verdict === "PASS" ? 0 : 1);
}

await main();
