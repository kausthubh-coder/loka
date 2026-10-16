// Proves the real browser, not the prototype: launches the built chrome.exe on a throwaway profile and checks the
// first-run gate over raw CDP. The sidebar is a top-chrome WebUI page Playwright doesn't list, so this talks to
// /json/list and the targets' websockets directly.
//
//   bun run verify:browser                    binary from LOKA_CHROME, else the dev build, else the snapshot (testBinary)
//   bun run verify:browser -- --no-first-run  skip setup (Chrome's --no-first-run): no setup page may show at all
//
// The checks, in order:
//   first run   setup (chrome://setup) is the only page and "Welcome to Loka" the only window; any Helium or
//               Chromium in its text is a NOTE; "Use defaults" finishes it and no setup or helium:// page is left
//   setup frame the setup window has no title bar: its top strip answers Windows' hit test as page, its top edge
//               still resizes, the page draws Minimize and Close, and Minimize minimizes it
//   sidebar     the chrome://loka-sidebar target lists the opened tabs as rows
//   icons       a local page's icon reaches getTabs and its row (a cached icon is compared with the default globe)
//   sound       a playing <audio> tab is audible with a speaker on its row, and stops after pause
//   media       getMedia lists it playing; mediaAction pause and play switch it within 3 s
//   extensions  getExtensions has uBlock Origin, pinned, with its icon; the Extensions panel lists the same names
//   downloads   none on a fresh profile; a local file arrives complete and "downloads-changed" fires
//   scheme      setColorScheme light and dark reach prefers-color-scheme in a tab
//   pinning     setSidebarPinned false and true read back through getSidebarPinned, with a window picture each
//   suggest     suggest("example") answers with a search first
//   identity    the window is "<tab> - Loka", no title says Chromium or Helium, chrome.exe's ProductName is Loka
//   hit test    Windows' WM_NCHITTEST on the sidebar column answers "page" (real mouse input; CDP skips it)
//   real click  a click posted to the window (WM_LBUTTONDOWN/UP, Chromium's own Win32 input path) on a row switches tab
//   alpha       the sidebar's Import spaces (JSON) takes the 0.1.0 alpha's export, without its extension pages
// Evidence (PNGs, JSON, chrome.log) goes to .agents/verify-runs/<time>-browser. The run stops only the process tree
// it started, downloads into its own profile, and deletes that profile.

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { BUILD_DIR } from "./browser.mjs";
import {
	askExpression,
	chromePath,
	connect,
	evaluate,
	freePort,
	processes,
	RECORD_EVENTS,
	refuseWhileBuilding,
	sleep,
	stillRunning,
	toneWav,
	until,
	windows as windowsOf,
} from "./browser-session.mjs";

const repo = resolve(import.meta.dirname, "..");
const chrome = chromePath();
const noFirstRun = process.argv.includes("--no-first-run");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const evidence = join(repo, ".agents", "verify-runs", `${stamp}-browser`);
const profileRoot = join(BUILD_DIR, "profile-verify");
const profile = join(profileRoot, `run-${stamp}-${process.pid}`);
const SIDEBAR_URL = "chrome://loka-sidebar.top-chrome";
/** What the 0.1.0 alpha's "Export spaces (JSON)" wrote, captured from the alpha build. */
const ALPHA_EXPORT = join(repo, "prototype", "src", "features", "sidebar", "alpha-0.1.0-export.json");
const ALPHA_EXTENSION_ID = "kklllonkklkjgekkpeboddibgbjadkej";
/** uBlock Origin, which Helium installs and Loka keeps. */
const UBLOCK = "blockjmkbacgjkknlgpkjjiijinjdanf";

/** @typedef {import("./browser-session.mjs").Target} Target */
/** @typedef {{ id: number, url: string, title: string, favicon: string, loading: boolean, audible: boolean, active: boolean }} Tab */
/** @typedef {{ label: string, icon: string | null, sound: string | null }} Row */
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

/** Two local pages: one with its own icon, one with an <audio> element. */
async function startPages() {
	const icon = readFileSync(join(repo, "resources", "loka", "branding", "product_logo_22_mono.png"));
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
		else if (path === "/loka-verify.txt")
			res
				.writeHead(200, { "content-type": "text/plain", "content-disposition": "attachment; filename=loka-verify.txt" })
				.end("Loka verify download");
		else if (pages[path]) res.writeHead(200, { "content-type": "text/html" }).end(pages[path]);
		else res.writeHead(404).end();
	});
	await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
	const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
	return { server, origin: `http://127.0.0.1:${port}` };
}

const GET_TABS = askExpression("getTabs");

/** In the sidebar page: clicks the first button (any shadow root) whose label or text is `name`. @param {string} name */
const clickExpression = (name) => `(() => {
	const find = (root) => {
		for (const el of root.querySelectorAll("button, [role=button], [role=menuitem]")) {
			const label = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim();
			if (label === ${JSON.stringify(name)}) return el;
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

// In the sidebar page: the extension names its Extensions panel shows, read from their Pin/Unpin buttons.
const EXTENSION_ROWS = `(() => {
	const names = [];
	const walk = (root) => {
		for (const el of root.querySelectorAll("button")) {
			const m = /^(Pin|Unpin) (.+)$/.exec(el.getAttribute("aria-label") ?? "");
			if (m) names.push(m[2]);
		}
		for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
	};
	walk(document);
	return [...new Set(names)];
})()`;

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

// In the setup page: the labels of the window buttons it draws, in order.
const SETUP_WINDOW_CONTROLS = `[...document.querySelectorAll(".window-controls button")]
	.map((b) => b.getAttribute("aria-label")).join()`;

// In the setup page: its width and scale, and how far above it the window starts (no title bar: about 1 px).
const SETUP_FRAME = `({
	w: innerWidth,
	dpr: devicePixelRatio,
	top: (outerHeight - innerHeight) - (outerWidth - innerWidth) / 2,
})`;

/** Windows' answers to WM_NCHITTEST (winuser.h). */
const HIT = { page: "1", top: "12" };

/** What Windows' WM_NCHITTEST answers at each client point ("x,y", physical px) of `pid`'s main window. @param {number} pid @param {string[]} points */
function hitTest(pid, points) {
	const run = spawnSync(
		"powershell",
		[
			"-NoProfile",
			"-File",
			join(repo, "scripts", "window-hittest.ps1"),
			"-ProcId",
			String(pid),
			"-Points",
			points.join(";"),
		],
		{ encoding: "utf8" },
	);
	return run.stdout
		.trim()
		.split(/\r?\n/)
		.map((h) => h.trim());
}

// In the sidebar page: keeps the last trusted mouse events (where the page saw them) in window.__verifyMouse.
const RECORD_MOUSE = `(() => {
	if (window.__verifyMouse) return true;
	window.__verifyMouse = [];
	for (const type of ["mousemove", "mousedown", "click"])
		document.addEventListener(type, (e) => {
			if (e.isTrusted) window.__verifyMouse.push({ type, x: e.clientX, y: e.clientY });
		}, true);
	return true;
})()`;

/** In the sidebar page: the middle of the tab row labelled `label`, in the page's CSS px. @param {string} label */
const rowCenterExpression = (label) => `(() => {
	const walk = (root) => {
		for (const el of root.querySelectorAll("[role=treeitem]")) {
			const text = (el.querySelector(".label")?.textContent ?? "").trim();
			if (text === ${JSON.stringify(label)}) { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
		}
		for (const el of root.querySelectorAll("*")) { const inner = el.shadowRoot && walk(el.shadowRoot); if (inner) return inner; }
		return null;
	};
	return walk(document);
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

async function main() {
	if (!existsSync(chrome)) {
		console.error(`No browser at ${chrome}. Build it (bun run browser:build) or set LOKA_CHROME.`);
		process.exit(2);
	}
	refuseWhileBuilding(chrome);
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
			// Test browsers stay silent: audio plays to a fake device, so tabs still count as audible but nothing is heard.
			"--disable-audio-output",
			// Off every screen, so the pointer of whoever is using the computer never moves over it mid-check.
			"--window-position=-4000,0",
			"--disable-features=CalculateNativeWinOcclusion",
			// The audio page starts itself, so the media checks don't depend on a gesture.
			"--autoplay-policy=no-user-gesture-required",
			...(noFirstRun ? ["--no-first-run"] : []),
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	browserProcess.stdout.pipe(log);
	browserProcess.stderr.pipe(log);
	const pid = browserProcess.pid ?? 0;
	console.log(`Started ${chrome} (pid ${pid}), CDP on ${port}, profile ${profile}`);
	const http = `http://127.0.0.1:${port}`;
	// The browser process by pid and start time, so cleanup never stops a process that took its pid later.
	let tree = processes(pid).slice(0, 1);
	/** @type {Awaited<ReturnType<typeof connect>>[]} */
	const sessions = [];
	/** The browser's visible window titles, and with `shot` a PNG of the first one titled like `match`. */
	const windows = (/** @type {string} */ shot = "", match = "") => windowsOf(pid, shot && join(evidence, shot), match);

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
		tree = stillRunning(tree);

		// 1. First run: Loka's setup alone, in its own window, never saying Helium; "Use defaults" finishes it.
		/** @param {Target} t */
		const isSetup = (t) => t.type === "page" && /^(chrome:\/\/setup|helium:)/.test(t.url);
		const setupPages = startup.filter(isSetup);
		const described = setupPages.map((t) => `${t.url} "${t.title}"`).join(", ");
		if (noFirstRun) {
			check("no setup page with --no-first-run", setupPages.length === 0, described || "none");
		} else {
			const setup = setupPages.length === 1 ? setupPages[0] : undefined;
			// Extension background pages aside, setup is the only page and its window the only window.
			const pages = startup.filter((t) => t.type === "page").map((t) => t.url);
			check("first run opens only Loka's setup", pages.join() === "chrome://setup/", pages.join(", ") || "no page");
			const setupWindows = windows().titles;
			check(
				'the only window is "Welcome to Loka"',
				setupWindows.join() === "Welcome to Loka",
				setupWindows.map((t) => `"${t}"`).join(", ") || "no window",
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

				// The setup window has no title bar: the page fills it and draws its own Minimize and Close.
				const controls = await until(() => evaluate(page, SETUP_WINDOW_CONTROLS), 5000);
				check(
					"setup draws its own Minimize and Close",
					controls === "Minimize,Close",
					controls || 'none (getWindowFrame didn\'t answer "page")',
				);
				// Windows asks the window what's under the mouse before every real mouse event. Across where the title
				// bar was (its caption buttons included) the answer must be the page, not the title bar or a caption
				// button; the window's top edge still resizes.
				/** @type {{ w: number, dpr: number, top: number }} */
				const frame = await evaluate(page, SETUP_FRAME);
				const strip = [0.05, 0.35, 0.65, 0.97].map(
					(f) => `${Math.round(frame.w * f * frame.dpr)},${Math.round(16 * frame.dpr)}`,
				);
				const edge = `${Math.round((frame.w / 2) * frame.dpr)},0`;
				const hits = hitTest(pid, [...strip, edge]);
				check(
					"the setup window has no title bar (its top strip answers Windows' hit test as page)",
					hits.slice(0, strip.length).every((h) => h === HIT.page),
					strip.map((p, i) => `${p}=${hits[i]}`).join(" "),
				);
				check(
					"the setup window's top edge still resizes",
					hits[strip.length] === HIT.top,
					`${edge}=${hits[strip.length]}`,
				);
				// What the page sees: the window's height over its own, less the side border (the bottom one is as wide).
				check("the setup page reaches the window's top", frame.top <= 2, `${frame.top} px above the page`);
				windows("setup-window.png", "Welcome to Loka");
				// Minimize goes through windowAction; a minimized window's page is hidden. Setup finishes from there.
				await evaluate(page, `(document.querySelector('button[aria-label="Minimize"]')?.click(), true)`);
				const minimized = await until(() => evaluate(page, "document.visibilityState === 'hidden'"), 5000);
				check("setup's Minimize minimizes the window", minimized, minimized ? "page hidden" : "page still visible");

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
		await evaluate(sidebar, RECORD_EVENTS);
		/** A request to the handler and its answer. @param {string} message @param {unknown[]} args */
		const ask = (message, ...args) => evaluate(sidebar, askExpression(message, args));
		/** A message with no answer. @param {string} message @param {unknown[]} args */
		const tell = (message, ...args) =>
			evaluate(sidebar, `(chrome.send(${JSON.stringify(message)}, ${JSON.stringify(args)}), true)`);
		/** @param {string} name @returns {Promise<{ event: string, args: any[] }[]>} */
		const events = (name) =>
			evaluate(sidebar, `window.__verifyEvents.filter((e) => e.event === ${JSON.stringify(name)})`);
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

		// 6. Media session: the playing tab is in getMedia, and mediaAction pauses and plays it like its own controls.
		const audioTabId = audioTab(await evaluate(sidebar, GET_TABS))?.id;
		await evaluate(page, "document.getElementById('a').play().then(() => true)");
		/** @param {boolean} want @param {number} ms */
		const mediaPlaying = (want, ms) =>
			until(async () => {
				/** @type {{ tabId: number, playing: boolean }[] | string} */
				const media = await ask("getMedia");
				return Array.isArray(media) && media.some((m) => m.tabId === audioTabId && m.playing === want);
			}, ms);
		check("getMedia lists the playing tab", await mediaPlaying(true, 10000), `tab ${audioTabId}`);
		await tell("mediaAction", audioTabId, "pause");
		check("mediaAction pause stops it within 3 s", await mediaPlaying(false, 3000), "getMedia playing=false");
		await tell("mediaAction", audioTabId, "play");
		check("mediaAction play starts it again", await mediaPlaying(true, 3000), "getMedia playing=true");

		// What the page says it plays (navigator.mediaSession) is what the card shows, and it follows the page: a new
		// title replaces the old one (a site moving to the next episode without changing the tab's title), and the
		// track buttons come and go with the page's own handlers.
		/** @param {(m: { title: string, artist: string, canNext: boolean, canPrevious: boolean }) => boolean} test */
		const mediaWhere = (test) =>
			until(async () => {
				/** @type {any[] | string} */
				const media = await ask("getMedia");
				const mine = Array.isArray(media) ? media.find((m) => m.tabId === audioTabId) : undefined;
				return mine && test(mine) ? mine : null;
			}, 4000);
		await evaluate(
			page,
			`(navigator.mediaSession.metadata = new MediaMetadata({ title: "Episode one", artist: "Loka verify" }), true)`,
		);
		const episodeOne = await mediaWhere((m) => m.title === "Episode one" && m.artist === "Loka verify");
		check("the card takes the page's own title and artist", Boolean(episodeOne), JSON.stringify(episodeOne));
		await evaluate(page, `(navigator.mediaSession.metadata = new MediaMetadata({ title: "Episode two" }), true)`);
		const episodeTwo = await mediaWhere((m) => m.title === "Episode two");
		check("a new title from the page replaces the old one", Boolean(episodeTwo), JSON.stringify(episodeTwo));
		const noTrackButtons = await mediaWhere((m) => !m.canNext && !m.canPrevious);
		check("no next or previous until the page handles them", Boolean(noTrackButtons), JSON.stringify(noTrackButtons));
		await evaluate(page, `(navigator.mediaSession.setActionHandler("nexttrack", () => {}), true)`);
		const withNext = await mediaWhere((m) => m.canNext && !m.canPrevious);
		check("next appears once the page handles it", Boolean(withNext), JSON.stringify(withNext));
		await evaluate(page, "(document.getElementById('a').pause(), true)");

		// 7. Extensions: the installed ones, as their toolbar buttons would show, and the same list in the sidebar.
		/** @type {{ id: string, name: string, icon: string, pinned: boolean }[] | string} */
		const extensions = await ask("getExtensions");
		writeFileSync(join(evidence, "extensions.json"), JSON.stringify(extensions, null, 2));
		const ublock = Array.isArray(extensions) ? extensions.find((x) => x.id === UBLOCK) : undefined;
		check(
			"getExtensions has uBlock Origin, pinned, with its icon",
			ublock?.icon === `chrome://extension-icon/${UBLOCK}/32/1` && ublock.pinned === true,
			ublock ? JSON.stringify(ublock) : JSON.stringify(extensions).slice(0, 200),
		);
		await evaluate(sidebar, clickExpression("Extensions"));
		await sleep(800);
		/** @type {string[]} */
		const listed = await evaluate(sidebar, EXTENSION_ROWS);
		writeFileSync(join(evidence, "extensions-panel.txt"), await evaluate(sidebar, ALL_TEXT));
		const installed = Array.isArray(extensions) ? extensions.map((x) => x.name).sort() : [];
		check(
			"the sidebar's Extensions panel lists exactly those",
			listed.length > 0 && JSON.stringify([...listed].sort()) === JSON.stringify(installed),
			`panel: ${listed.join(", ") || "nothing"}; installed: ${installed.join(", ")}`,
		);
		await sidebar.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });

		// 8. Downloads: none on a fresh profile; a small local file arrives complete, and the handler says so.
		/** @type {{ name: string, state: string }[] | string} */
		const before = await ask("getDownloads");
		check("getDownloads is empty on a fresh profile", JSON.stringify(before) === "[]", JSON.stringify(before));
		// Into the throwaway profile, never the user's Downloads folder.
		await browserSession.call("Browser.setDownloadBehavior", {
			behavior: "allow",
			downloadPath: join(profile, "downloads"),
		});
		await browserSession.call("Target.createTarget", { url: `${origin}/loka-verify.txt` });
		const downloaded = await until(async () => {
			/** @type {{ name: string, state: string }[] | string} */
			const list = await ask("getDownloads");
			return Array.isArray(list) && list.find((d) => d.name === "loka-verify.txt" && d.state === "complete");
		}, 15000);
		check("a download arrives complete", Boolean(downloaded), downloaded ? JSON.stringify(downloaded) : "not listed");
		// The browser batches download updates every quarter second, so the event can trail the list.
		await until(async () => (await events("downloads-changed")).length > 0, 3000);
		const downloadEvents = (await events("downloads-changed")).length;
		check('"downloads-changed" fired', downloadEvents > 0, `${downloadEvents} events`);

		// 9. Color scheme: light and dark reach the pages that follow the browser.
		const iconTarget = (await targets()).find((t) => t.url === `${origin}/icon`);
		if (!iconTarget) throw new Error("the icon tab has no target");
		const iconPage = await connect(iconTarget.webSocketDebuggerUrl);
		sessions.push(iconPage);
		for (const scheme of ["light", "dark"]) {
			await tell("setColorScheme", scheme);
			const follows = await until(
				() => evaluate(iconPage, `matchMedia("(prefers-color-scheme: ${scheme})").matches`),
				5000,
			);
			check(`setColorScheme("${scheme}") reaches pages`, follows, `prefers-color-scheme: ${scheme} is ${follows}`);
		}
		await tell("setColorScheme", "system");

		// 10. Pinned sidebar: off and on, read back, with a picture of each.
		for (const pinned of [false, true]) {
			await tell("setSidebarPinned", pinned);
			await sleep(800);
			const now = await ask("getSidebarPinned");
			const picture = windows(`sidebar-pinned-${pinned}.png`, " - Loka");
			check(`setSidebarPinned(${pinned}) reads back`, now === pinned, `getSidebarPinned=${now}; ${picture.shot}`);
		}

		// 11. Suggestions: the browser's own autocomplete answers, searching first for plain words.
		await tell("suggest", "example");
		/** @type {{ event: string, args: any[] }[]} */
		const answered = await until(async () => {
			const got = await events("suggestions");
			const full = got.filter((e) => e.args[0] === "example" && Array.isArray(e.args[1]) && e.args[1].length > 0);
			return full.length ? full : null;
		}, 10000).then((got) => got ?? []);
		const first = answered.at(-1)?.args[1]?.[0];
		check(
			'suggest("example") answers, a search first',
			first?.kind === "search",
			first ? `${answered.at(-1)?.args[1].length} suggestions, first ${JSON.stringify(first)}` : "no suggestions event",
		);

		// 12. Evidence: the sidebar page and the whole window, whose titles are Loka's, as is chrome.exe itself.
		try {
			const shot = await sidebar.call("Page.captureScreenshot", { format: "png" }, 20000);
			writeFileSync(join(evidence, "sidebar.png"), Buffer.from(shot.data, "base64"));
			check("sidebar screenshot", true, join(evidence, "sidebar.png"));
		} catch (e) {
			check("sidebar screenshot", false, String(e));
		}
		const win = windows("window.png", "Loka verify");
		const shown = `${(await evaluate(sidebar, GET_TABS)).find((/** @type {Tab} */ t) => t.active)?.title} - Loka`;
		check(
			'the window is titled "<tab> - Loka"',
			win.titles.includes(shown),
			win.titles.length ? win.titles.map((t) => `"${t}"`).join(", ") : `no window (${win.error})`,
		);
		check(
			"no window title says Chromium or Helium",
			!win.titles.some((t) => /chromium|helium/i.test(t)),
			win.titles.map((t) => `"${t}"`).join(", "),
		);
		const others = win.titles.filter((t) => t !== shown);
		if (others.length) note("other visible windows", others.map((t) => `"${t}"`).join(", "));
		check("window screenshot", existsSync(join(evidence, "window.png")), win.shot || "not saved");

		// Windows asks the window what's under the mouse before it sends any real mouse event. Every point on the
		// sidebar below its top row must be the page: "title bar" there means no hover and clicks that drag the
		// window, which CDP input (it skips this step) can't see.
		/** @type {{ w: number, h: number, dpr: number }} */
		const size = await evaluate(sidebar, "({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })");
		// Down to the bottom row: the planets of the space switcher sit in the last few pixels.
		const points = [0.12, 0.25, 0.38, 0.5, 0.62, 0.74, 0.86, 0.97].map(
			(f) => `${Math.round((size.w / 2) * size.dpr)},${Math.round(size.h * f * size.dpr)}`,
		);
		const hits = hitTest(pid, points);
		check(
			"the sidebar answers Windows' hit test as page, not title bar",
			hits.length === points.length && hits.every((h) => h === HIT.page),
			points.map((p, i) => `${p}=${hits[i]}`).join(" "),
		);

		// Real mouse input on top of the hit test: a click posted to the window as WM_LBUTTONDOWN/UP goes through
		// Chromium's own Win32 input path, which CDP's Input domain skips. A posted move first finds where the
		// sidebar sits in the window (posted coordinates are client DIPs).
		/** @param {string} kind @param {number} x @param {number} y */
		const post = (kind, x, y) =>
			spawnSync(
				"powershell",
				[
					"-NoProfile",
					"-File",
					join(repo, "scripts", "window-input.ps1"),
					"-ProcId",
					String(pid),
					"-Kind",
					kind,
					"-X",
					String(Math.round(x)),
					"-Y",
					String(Math.round(y)),
				],
				{ encoding: "utf8" },
			).stdout.trim();
		await evaluate(sidebar, RECORD_MOUSE);
		const probe = { x: Math.round(size.w / 2), y: Math.round(size.h * 0.6) };
		post("move", probe.x, probe.y);
		/** @type {{ type: string, x: number, y: number } | undefined} */
		const seen = await until(async () => (await evaluate(sidebar, "window.__verifyMouse")).at(-1), 3000);
		const target = (await evaluate(sidebar, GET_TABS)).find((/** @type {Tab} */ t) => !t.active && t.title);
		const center = target && seen ? await evaluate(sidebar, rowCenterExpression(target.title)) : null;
		if (seen && center) post("click", center.x + probe.x - seen.x, center.y + probe.y - seen.y);
		const switched =
			target && center
				? await until(
						async () => (await evaluate(sidebar, GET_TABS)).find((/** @type {Tab} */ t) => t.active)?.id === target.id,
						4000,
					)
				: false;
		check(
			"a real click (posted WM_LBUTTONDOWN/UP) on a tab's row switches to it",
			switched,
			!seen
				? "the page never saw the posted mouse move"
				: !center
					? `no row for "${target?.title ?? "a background tab"}"`
					: `sidebar at client ${probe.x - seen.x},${probe.y - seen.y}; clicked "${target?.title}" at ${Math.round(center.x)},${Math.round(center.y)}`,
		);

		// The hidden sidebar, as in Zen: the window's edge brings it back at once, the strip between it and the edge
		// keeps it, leaving it closes it after a moment, and the sidebar page can hold it open. Moves are posted to
		// the window, so they reach the browser's own hover tracking.
		await tell("setSidebarPinned", false);
		await sleep(600);
		const away = { x: Math.round(size.w + 400), y: Math.round(size.h / 2) };
		const sidebarShows = async () => (await evaluate(sidebar, "document.visibilityState")) === "visible";
		const sidebarGone = () => until(async () => !(await sidebarShows()), 1500);
		post("move", away.x, away.y);
		const hidOnUnpin = await sidebarGone();
		check("unpinned, the sidebar hides when the pointer is on the page", hidOnUnpin, `visible=${!hidOnUnpin}`);
		post("move", 2, away.y);
		const shownAt = Date.now();
		const revealed = await until(sidebarShows, 1500);
		check(
			"the window's left edge brings the hidden sidebar back",
			revealed,
			revealed ? `visible after ${Date.now() - shownAt} ms` : "never showed",
		);
		post("move", Math.round(size.w / 2), away.y);
		await sleep(300);
		post("move", 3, away.y);
		await sleep(600);
		check(
			"moving from the sidebar onto the edge strip keeps it open (no flicker)",
			await sidebarShows(),
			"visible 600 ms after reaching the edge strip",
		);
		await tell("holdSidebar", true);
		post("move", away.x, away.y);
		await sleep(700);
		const held = await sidebarShows();
		await tell("holdSidebar", false);
		const released = await sidebarGone();
		check(
			"holdSidebar keeps it open off the sidebar; releasing it lets it hide",
			held && released,
			`held: visible=${held}; released: hidden=${released}`,
		);
		await tell("setSidebarPinned", true);
		await sleep(600);

		const product = spawnSync(
			"powershell",
			["-NoProfile", "-Command", `(Get-Item -LiteralPath '${chrome}').VersionInfo.ProductName`],
			{ encoding: "utf8" },
		).stdout.trim();
		check('chrome.exe ProductName is "Loka"', product === "Loka", `"${product}"`);

		// 13. The alpha's spaces: the sidebar's own Import takes the file the 0.1.0 alpha exported. Last, since it
		// replaces this profile's spaces.
		await sidebar.call("Page.enable");
		await sidebar.call("Page.setInterceptFileChooserDialog", { enabled: true });
		// The import reports a bad file with alert(), which would stall the page: record and dismiss it.
		/** @type {string[]} */
		const alerts = [];
		sidebar.on("Page.javascriptDialogOpening", (/** @type {{ message: string }} */ d) => {
			alerts.push(d.message);
			void sidebar.call("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
		});
		/** @type {Promise<{ backendNodeId: number } | null>} */
		const chooser = new Promise((resolve) => sidebar.on("Page.fileChooserOpened", resolve));
		await evaluate(sidebar, clickExpression("More"));
		await sleep(400);
		// A file input opens its picker only from a user gesture. The click's evaluate can wait until the picker is
		// answered, so it isn't awaited before the chooser event.
		const picking = evaluate(sidebar, clickExpression("Import spaces (JSON)"), true).catch(() => false);
		const opened = await Promise.race([chooser, sleep(5000).then(() => null)]);
		if (opened)
			await sidebar.call("DOM.setFileInputFiles", { files: [ALPHA_EXPORT], backendNodeId: opened.backendNodeId });
		const picked = await Promise.race([picking, sleep(5000).then(() => "still waiting")]);
		/** @type {{ spaces: { name: string }[], tabs: Record<string, { url: string }> } | null} */
		const imported = await until(async () => {
			/** @type {Record<string, string> | string} */
			const store = await ask("getStore");
			const saved = typeof store === "object" ? store["state.v1"] : undefined;
			const state = saved ? JSON.parse(saved) : null;
			const urls = state ? Object.values(state.tabs).map((/** @type {{ url: string }} */ t) => t.url) : [];
			return urls.includes("https://example.com/") && urls.includes("https://www.wikipedia.org/") ? state : null;
		}, 10000);
		check(
			"Import spaces (JSON) takes the alpha's export",
			Boolean(imported),
			imported
				? `state.v1 now has ${imported.spaces.map((x) => x.name).join(", ")} with the alpha's sites`
				: `menu item ${picked}, file chooser ${opened ? "answered" : "never opened"}, alerts: ${alerts.join(" | ") || "none"}`,
		);
		const deadPages = imported ? Object.values(imported.tabs).filter((t) => t.url.includes(ALPHA_EXTENSION_ID)) : [];
		check(
			"the alpha's own extension pages are left out",
			imported !== null && deadPages.length === 0,
			deadPages.length ? deadPages.map((t) => t.url).join(", ") : imported ? "none" : "nothing imported",
		);
	} catch (e) {
		const after = checks.at(-1)?.name ?? "the start";
		check("run finished", false, `${e instanceof Error ? e.message : e} (after "${after}")`);
	} finally {
		// Those still running, with any they started since.
		tree = stillRunning(tree);
		for (const s of sessions) s.close();
		await fetch(`http://127.0.0.1:${port}/json/version`)
			.then((r) => r.json())
			.then(async (v) => {
				const s = await connect(v.webSocketDebuggerUrl);
				await s.call("Browser.close", {}, 5000).catch(() => {});
				s.close();
			})
			.catch(() => {});
		await until(async () => stillRunning(tree).length === 0, 10000);
		const left = stillRunning(tree);
		// Only processes this run started (the browser and its children, by pid and start time), never anything
		// found by name. No /T: Windows finds a tree by parent pid, which can lead to a stranger's process.
		for (const p of left) spawnSync("taskkill", ["/F", "/PID", String(p.pid)], { stdio: "ignore" });
		server.close();
		log.end();
		await sleep(500);
		rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
		if (existsSync(profileRoot) && readdirSync(profileRoot).length === 0) rmSync(profileRoot, { recursive: true });
		const profileGone = !existsSync(profile);
		check(
			"cleanup",
			profileGone && stillRunning(tree).length === 0,
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
