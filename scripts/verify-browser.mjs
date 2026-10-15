// Proves the real browser, not the prototype: launches the built chrome.exe on a throwaway profile and checks the
// first-run gate over raw CDP. The sidebar is a top-chrome WebUI page Playwright doesn't list, so this talks to
// /json/list and the targets' websockets directly.
//
//   bun run verify:browser                    binary from LOKA_CHROME, else C:\src\loka\build\src\out\Default\chrome.exe
//   bun run verify:browser -- --no-first-run  skip setup (Chrome's --no-first-run): no setup page may show at all
//
// A first run shows Loka's setup (chrome://setup) in its own window and no browser window. The run lists any mention
// of Helium or Chromium in setup as a note, then picks "Use defaults" like a user would. After that: no setup or
// helium:// page left, no "Chromium" or "Helium" in any window title, the sidebar target lists real tab rows, a loaded tab with an
// icon shows that icon instead of the default, and the audible state follows a playing tab. Saves the sidebar and
// the window as PNGs in .agents/verify-runs/<time>-browser. Stops only the process tree it started and deletes its
// profile.

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { BUILD_DIR } from "./browser.mjs";

const repo = resolve(import.meta.dirname, "..");
const chrome = resolve(process.env.LOKA_CHROME ?? join(BUILD_DIR, "build", "src", "out", "Default", "chrome.exe"));
const noFirstRun = process.argv.includes("--no-first-run");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const evidence = join(repo, ".agents", "verify-runs", `${stamp}-browser`);
const profileRoot = join(BUILD_DIR, "profile-verify");
const profile = join(profileRoot, `run-${stamp}-${process.pid}`);
const SIDEBAR_URL = "chrome://loka-sidebar.top-chrome";

/** @typedef {{ id: string, type: string, url: string, title: string, webSocketDebuggerUrl: string }} Target */
/** @typedef {{ id: number, url: string, title: string, favicon: string, loading: boolean, audible: boolean }} Tab */
/** @typedef {{ label: string, icon: string | null, sound: string | null }} Row */
/** @typedef {Awaited<ReturnType<typeof connect>>} Session */

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** @type {{ name: string, ok: boolean, detail: string }[]} */
const checks = [];
/** @param {string} name @param {unknown} ok @param {string} detail */
function check(name, ok, detail) {
	checks.push({ name, ok: Boolean(ok), detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
}
/** @type {{ name: string, detail: string }[]} */
const notes = [];
/** Something a person should look at that doesn't fail the run. @param {string} name @param {string} detail */
function note(name, detail) {
	notes.push({ name, detail });
	console.log(`NOTE  ${name}: ${detail}`);
}

/** Refuses to run a binary the build is writing: linking fails on a chrome.exe that's running. */
function refuseWhileBuilding() {
	const out = join(BUILD_DIR, "build", "src", "out").toLowerCase();
	if (!chrome.toLowerCase().startsWith(out)) return;
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
		let alive = false;
		try {
			process.kill(status.pid, 0);
			alive = true;
		} catch {}
		if (status.phase === "compiling" && alive) reasons.push(`build-status.json says compiling (pid ${status.pid})`);
	}
	if (reasons.length) {
		console.error(`A build is using ${chrome} (${reasons.join("; ")}). Wait for it, or set LOKA_CHROME to a copy.`);
		process.exit(2);
	}
}

/** A free localhost port, from the OS. */
function freePort() {
	return new Promise((done) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
			server.close(() => done(port));
		});
	});
}

/** A quiet one-second tone as a WAV file, so the audio page plays without the network. */
function toneWav() {
	const rate = 8000;
	const samples = rate;
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

/** Two local pages: one with its own icon, one with an <audio> element. */
async function startPages() {
	const icon = readFileSync(join(repo, "extension", "public", "icons", "32.png"));
	const wav = toneWav();
	/** @type {Record<string, string>} */
	const pages = {
		"/icon": `<!doctype html><title>Loka verify: icon</title><link rel="icon" href="/icon.png"><h1>Has an icon</h1>`,
		"/audio": `<!doctype html><title>Loka verify: audio</title><audio id="a" src="/tone.wav" loop></audio><h1>Plays a tone</h1>`,
	};
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? "/", "http://x").pathname;
		if (path === "/icon.png") res.writeHead(200, { "content-type": "image/png" }).end(icon);
		else if (path === "/tone.wav") res.writeHead(200, { "content-type": "audio/wav" }).end(wav);
		else if (pages[path]) res.writeHead(200, { "content-type": "text/html" }).end(pages[path]);
		else res.writeHead(404).end();
	});
	await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
	const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
	return { server, origin: `http://127.0.0.1:${port}` };
}

/** One CDP websocket with request/response by id. @param {string} wsUrl */
async function connect(wsUrl) {
	const ws = new WebSocket(wsUrl);
	await new Promise((ok, fail) => {
		ws.addEventListener("open", ok, { once: true });
		ws.addEventListener("error", fail, { once: true });
	});
	let next = 0;
	/** @type {Map<number, (msg: { error?: { message: string }, result?: any }) => void>} */
	const waiting = new Map();
	ws.addEventListener("message", (e) => {
		const msg = JSON.parse(String(e.data));
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
		close: () => ws.close(),
	};
}

/**
 * Evaluates an expression in a page and returns its value.
 * @param {Session} session @param {string} expression @param {boolean} [userGesture]
 * @returns {Promise<any>}
 */
async function evaluate(session, expression, userGesture = false) {
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
async function until(probe, ms) {
	const end = Date.now() + ms;
	let value = await probe();
	while (!value && Date.now() < end) {
		await sleep(300);
		value = await probe();
	}
	return value;
}

// In the sidebar page: the browser's tab list straight from LokaSidebarHandler, through chrome.send.
const GET_TABS = `new Promise((resolve) => {
	const id = "verify-" + Math.random();
	const original = window.cr.webUIResponse;
	window.cr.webUIResponse = function (callbackId, ok, value) {
		if (callbackId !== id) return original.call(this, callbackId, ok, value);
		window.cr.webUIResponse = original;
		resolve(value);
	};
	chrome.send("getTabs", [id]);
})`;

// In any page: its text, including what's inside shadow roots.
const ALL_TEXT = `(() => {
	const parts = [document.body ? document.body.innerText : ""];
	const walk = (root) => {
		for (const el of root.querySelectorAll("*")) {
			if (el.shadowRoot) {
				parts.push(el.shadowRoot.textContent ?? "");
				walk(el.shadowRoot);
			}
		}
	};
	walk(document);
	return parts.join("\\n");
})()`;

// In the setup page: clicks "Use defaults" as a user would, wherever it is.
const CLICK_USE_DEFAULTS = `(() => {
	const find = (root) => {
		for (const el of root.querySelectorAll("button, [role=button]")) {
			if ((el.textContent ?? "").trim() === "Use defaults") return el;
		}
		for (const el of root.querySelectorAll("*")) {
			const inner = el.shadowRoot && find(el.shadowRoot);
			if (inner) return inner;
		}
		return null;
	};
	const button = find(document);
	if (!button) return false;
	button.click();
	return true;
})()`;

// In the sidebar page: every tab row in every shadow root, as the user sees it.
const ROWS = `(() => {
	const rows = [];
	const walk = (root) => {
		for (const el of root.querySelectorAll("*")) {
			if (el.getAttribute("role") === "treeitem" && !el.classList.contains("folder")) {
				const img = el.querySelector(".fav img");
				const sound = el.querySelector("button.sound");
				rows.push({
					label: (el.querySelector(".label")?.textContent ?? el.textContent ?? "").trim(),
					icon: img ? img.getAttribute("src") : null,
					sound: sound ? sound.getAttribute("aria-label") : null,
				});
			}
			if (el.shadowRoot) walk(el.shadowRoot);
		}
	};
	walk(document);
	return rows;
})()`;

/** Every pid in the tree under `root`, from Windows' process table. @param {number} root @returns {number[]} */
function processTree(root) {
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
const alive = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

async function main() {
	if (!existsSync(chrome)) {
		console.error(`No browser at ${chrome}. Build it (bun run browser:build) or set LOKA_CHROME.`);
		process.exit(2);
	}
	refuseWhileBuilding();
	mkdirSync(evidence, { recursive: true });
	mkdirSync(profile, { recursive: true });
	const port = await freePort();
	const { server, origin } = await startPages();
	const log = createWriteStream(join(evidence, "chrome.log"));
	const browserProcess = spawn(
		chrome,
		[
			`--user-data-dir=${profile}`,
			`--remote-debugging-port=${port}`,
			"--disable-features=CalculateNativeWinOcclusion",
			...(noFirstRun ? ["--no-first-run"] : []),
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	browserProcess.stdout.pipe(log);
	browserProcess.stderr.pipe(log);
	const pid = browserProcess.pid ?? 0;
	console.log(`Started ${chrome} (pid ${pid}), CDP on ${port}, profile ${profile}`);
	const http = `http://127.0.0.1:${port}`;
	let tree = [pid];
	/** @type {Awaited<ReturnType<typeof connect>>[]} */
	const sessions = [];

	try {
		const version = await until(
			() =>
				fetch(`${http}/json/version`).then(
					(r) => r.json(),
					() => null,
				),
			30000,
		);
		if (!version) throw new Error("the browser never opened its debugging port");
		writeFileSync(join(evidence, "version.json"), JSON.stringify(version, null, 2));
		/** @returns {Promise<Target[]>} */
		const targets = () => fetch(`${http}/json/list`).then((r) => r.json());
		await sleep(5000); // let first-run pages open
		const startup = await targets();
		writeFileSync(join(evidence, "startup-targets.json"), JSON.stringify(startup, null, 2));
		tree = processTree(pid);

		// 1. First run: Loka's setup alone, in its own window, never saying Helium; "Use defaults" finishes it.
		/** @param {Target} t */
		const isSetup = (t) => t.type === "page" && /^(chrome:\/\/setup|helium:)/.test(t.url);
		const setupPages = startup.filter(isSetup);
		const described = setupPages.map((t) => `${t.url} "${t.title}"`).join(", ");
		if (noFirstRun) {
			check("no setup page with --no-first-run", setupPages.length === 0, described || "none");
		} else {
			const setup = setupPages.length === 1 ? setupPages[0] : undefined;
			check("first run opens Loka's setup", setup?.url.startsWith("chrome://setup"), described || "no setup page");
			check(
				"no browser window until setup is done",
				!startup.some((t) => t.url.startsWith(SIDEBAR_URL)),
				startup.map((t) => t.url).join(", "),
			);
			if (setup) {
				const page = await connect(setup.webSocketDebuggerUrl);
				sessions.push(page);
				await until(() => evaluate(page, "document.readyState === 'complete'"), 10000);
				await sleep(1000);
				/** @type {string} */
				const text = await evaluate(page, ALL_TEXT);
				const leftovers = [...text.matchAll(/[^.\n]*\b(helium|chromium)\b[^.\n]*/gi)].map((m) => m[0].trim());
				if (/helium|chromium/i.test(setup.title)) leftovers.unshift(`title "${setup.title}"`);
				// Setup credits Helium on purpose today, so its mentions are listed for a person to judge, not failed.
				note("setup mentions Helium or Chromium", leftovers.join(" | ") || "none");
				const shot = await page.call("Page.captureScreenshot", { format: "png" }, 20000).catch(() => null);
				if (shot) writeFileSync(join(evidence, "setup.png"), Buffer.from(shot.data, "base64"));
				const clicked = await evaluate(page, CLICK_USE_DEFAULTS, true);
				check('"Use defaults" finishes setup', clicked, clicked ? "clicked" : 'no "Use defaults" button');
			}
		}

		// 2. Real tabs: a page with an icon and one that plays sound. The sidebar is made with the first normal tab.
		const browserSession = await connect(version.webSocketDebuggerUrl);
		sessions.push(browserSession);
		await browserSession.call("Target.createTarget", { url: `${origin}/icon` });
		const { targetId: audioId } = await browserSession.call("Target.createTarget", { url: `${origin}/audio` });

		// 3. The sidebar is the native page.
		const sidebarTarget = await until(async () => (await targets()).find((t) => t.url.startsWith(SIDEBAR_URL)), 20000);
		check(
			"sidebar target",
			Boolean(sidebarTarget),
			sidebarTarget ? `${sidebarTarget.type} ${sidebarTarget.url}` : "no chrome://loka-sidebar target",
		);
		if (!sidebarTarget) throw new Error("no sidebar to check");
		const sidebar = await connect(sidebarTarget.webSocketDebuggerUrl);
		sessions.push(sidebar);
		await sidebar.call("Runtime.enable");
		await until(() => evaluate(sidebar, "Boolean(window.cr && document.querySelector('loka-panel'))"), 10000);
		const leftover = (await targets()).filter(isSetup);
		check("no setup or helium:// page left", leftover.length === 0, leftover.map((t) => t.url).join(", ") || "none");

		const iconTab = await until(async () => {
			/** @type {Tab[]} */
			const tabs = await evaluate(sidebar, GET_TABS);
			return tabs.find((t) => t.url === `${origin}/icon` && !t.loading && t.favicon);
		}, 15000);
		const rows = await until(async () => {
			/** @type {Row[]} */
			const r = await evaluate(sidebar, ROWS);
			return r.some((row) => row.label === "Loka verify: icon") && r;
		}, 15000);
		/** @type {Row[]} */
		const allRows = rows || (await evaluate(sidebar, ROWS));
		writeFileSync(join(evidence, "rows.json"), JSON.stringify(allRows, null, 2));
		check(
			"sidebar lists real tabs",
			Boolean(rows),
			`${allRows.length} rows: ${allRows.map((r) => r.label).join(" | ")}`,
		);

		// 4. The loaded tab's own icon, not the default globe.
		const favicon = iconTab?.favicon ?? "";
		check(
			"tab favicon from the browser",
			favicon.startsWith("data:image/"),
			favicon ? `${favicon.slice(0, 40)}...` : "empty",
		);
		// The row draws either the tab's own icon (a data: URL) or the browser's favicon cache (chrome://favicon2). The
		// cache answers with the default globe when it has nothing, so compare its picture with the cache's answer for
		// a page that has no icon. A tab showing the image can read it through a canvas (same origin, not tainted).
		const iconRow = allRows.find((r) => r.label === "Loka verify: icon");
		const drawn = iconRow?.icon ?? "";
		let iconDetail = iconRow ? `${drawn.slice(0, 50)}...` : "no row";
		let realIcon = drawn.startsWith("data:image/");
		if (drawn.startsWith("chrome://favicon2/")) {
			const noIcon = new URL(drawn);
			noIcon.searchParams.set("pageUrl", `${origin}/no-icon-here`);
			const { targetId } = await browserSession.call("Target.createTarget", { url: noIcon.toString() });
			const cacheTab = (await targets()).find((t) => t.id === targetId);
			if (cacheTab) {
				const cache = await connect(cacheTab.webSocketDebuggerUrl);
				await until(() => evaluate(cache, "document.readyState === 'complete'"), 10000);
				await cache.call("Page.enable");
				/** @param {string} url @returns {Promise<string>} */
				const picture = async (url) => {
					await cache.call("Page.navigate", { url });
					await sleep(1000);
					return evaluate(
						cache,
						`(() => { const i = document.querySelector("img"); const c = document.createElement("canvas");
						c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext("2d").drawImage(i, 0, 0);
						return c.toDataURL(); })()`,
					);
				};
				const fallback = await picture(noIcon.toString());
				const shown = await picture(drawn);
				realIcon = shown.startsWith("data:image/") && shown !== fallback;
				iconDetail = `favicon cache: ${realIcon ? "a real icon" : "the default icon"} (${drawn.slice(0, 50)}...)`;
				cache.close();
			}
			await browserSession.call("Target.closeTarget", { targetId });
		}
		check("sidebar row shows that icon, not the default", realIcon, iconDetail);

		// 5. Sound: play the tone and the tab turns audible, in the browser's data and on its row; pause and it stops.
		const audioTarget = (await targets()).find((t) => t.id === audioId);
		if (!audioTarget) throw new Error("the audio tab has no target");
		const page = await connect(audioTarget.webSocketDebuggerUrl);
		sessions.push(page);
		await until(() => evaluate(page, "document.readyState === 'complete'"), 10000);
		await evaluate(page, "document.getElementById('a').play().then(() => true)", true);
		/** @param {Tab[]} tabs */
		const audioTab = (tabs) => tabs.find((t) => t.url === `${origin}/audio`);
		const playing = await until(async () => audioTab(await evaluate(sidebar, GET_TABS))?.audible, 10000);
		const playingRow = await until(async () => {
			/** @type {Row[]} */
			const now = await evaluate(sidebar, ROWS);
			const row = now.find((r) => r.label === "Loka verify: audio");
			return row?.sound && row;
		}, 10000);
		check("playing tab is audible", Boolean(playing), playing ? "getTabs audible=true" : "never audible");
		check(
			"its row shows the speaker",
			Boolean(playingRow),
			playingRow ? `"${playingRow.sound}"` : "no speaker on the row",
		);
		await evaluate(page, "(document.getElementById('a').pause(), true)");
		// Chrome keeps a tab audible for about two seconds after the sound stops.
		const stopped = await until(async () => audioTab(await evaluate(sidebar, GET_TABS))?.audible === false, 10000);
		check(
			"paused tab stops being audible",
			Boolean(stopped),
			stopped ? "getTabs audible=false" : "still audible after 10 s",
		);

		// 6. Evidence: the sidebar page and the whole window.
		try {
			const shot = await sidebar.call("Page.captureScreenshot", { format: "png" }, 20000);
			writeFileSync(join(evidence, "sidebar.png"), Buffer.from(shot.data, "base64"));
			check("sidebar screenshot", true, join(evidence, "sidebar.png"));
		} catch (e) {
			check("sidebar screenshot", false, String(e));
		}
		const win = spawnSync(
			"powershell",
			[
				"-NoProfile",
				"-File",
				join(repo, "scripts", "window.ps1"),
				"-ProcId",
				String(pid),
				"-Out",
				join(evidence, "window.png"),
				"-Match",
				"Loka verify",
			],
			{ encoding: "utf8" },
		);
		const titles = [...win.stdout.matchAll(/WINDOW:(.*)/g)].map((m) => (m[1] ?? "").trim());
		check(
			"window titles are Loka's",
			titles.length > 0 && !titles.some((t) => /chromium|helium/i.test(t)),
			titles.length ? titles.map((t) => `"${t}"`).join(", ") : `no window (${win.stdout.trim() || win.stderr.trim()})`,
		);
		check(
			"window screenshot",
			existsSync(join(evidence, "window.png")),
			/SHOT:(.*)/.exec(win.stdout)?.[1] ?? "not saved",
		);
	} catch (e) {
		check("run finished", false, String(e instanceof Error ? e.message : e));
	} finally {
		tree = [...new Set([...tree, ...processTree(pid)])];
		for (const s of sessions) s.close();
		await fetch(`http://127.0.0.1:${port}/json/version`)
			.then((r) => r.json())
			.then(async (v) => {
				const s = await connect(v.webSocketDebuggerUrl);
				await s.call("Browser.close", {}, 5000).catch(() => {});
				s.close();
			})
			.catch(() => {});
		await until(async () => !alive(pid), 10000);
		const left = tree.filter(alive);
		// Only pids this run started (the browser and its children), never anything found by name.
		for (const p of left) spawnSync("taskkill", ["/T", "/F", "/PID", String(p)], { stdio: "ignore" });
		server.close();
		log.end();
		await sleep(500);
		rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
		if (existsSync(profileRoot) && readdirSync(profileRoot).length === 0) rmSync(profileRoot, { recursive: true });
		const profileGone = !existsSync(profile);
		check(
			"cleanup",
			profileGone && !tree.some(alive),
			`${left.length} of ${tree.length} processes needed taskkill; profile ${profileGone ? "deleted" : "still there"}`,
		);
		writeFileSync(join(evidence, "checks.json"), JSON.stringify({ chrome, noFirstRun, checks, notes }, null, 2));
	}
	const failed = checks.filter((c) => !c.ok);
	console.log(
		`\n${failed.length ? "FAIL" : "PASS"}: ${checks.length - failed.length}/${checks.length} checks. Evidence: ${evidence}`,
	);
	process.exit(failed.length ? 1 : 0);
}

await main();
