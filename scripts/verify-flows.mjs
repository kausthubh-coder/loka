// The user flows, end to end in the built browser: what a person does in the sidebar, and what the browser then
// actually did. Each flow drives the real UI (mouse, keyboard, drags, menus over CDP Input) and checks both the
// sidebar (its rows, its saved spaces) and the browser (its tabs, tab groups, pages).
//
//   bun run verify:flows      binary from LOKA_CHROME, else the dev build, else the snapshot (testBinary)
//   bun run verify:flows -- --only tabs   one flow, after first run and the flows it builds on (NEEDS below)
//   bun run verify:flows -- --webui=checkout
//                             the same flows with this checkout's webui in the browser's pages (no browser build)
//
// One throwaway profile (C:\src\loka\profile-qa-<time>) goes through the flows in order, since each builds on the
// last; the last one quits and starts the browser again on it. A tiny unpacked extension with a popup and a badge is
// loaded next to uBlock Origin. Pages come from a local server, so nothing needs the network.
//   1 first run    setup's Spaces step makes three spaces; the sidebar has exactly those, the first one showing
//   2 spaces       make, edit (name, color, planet, light/dark), delete; switch by planet, Ctrl+1..9, command bar;
//                  each space's tabs are a tab group, folded away while another space shows
//   3 tabs         open pages from the command bar, switch by row, close by x and middle click, reorder by drag,
//                  move to a space, search words, Ctrl+L, back, forward, reload
//   4 states       hover and press change rows, buttons, planets and the address field; Tab shows a focus ring
//   5 pinning      pin by menu and drag, unpin, folders two deep, unload a pinned tab and load it back, Essentials
//   6 extensions   the panel lists them; pin and unpin reach the address field; the icon opens its popup; badges
//   7 panels       Downloads with a real download, the media card on a playing page, Archive and Search
//   8 settings     each setting changes what it says; History search, delete and clear today
//   9 restart      quit and start again: spaces, pinned, folders, Essentials, extension pins and settings stay
// Evidence (a sidebar picture per step, window pictures, checks.json, chrome.log) goes to
// .agents/verify-runs/<time>-flows. The run stops only the process tree it started and deletes its profile.

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
	useCheckoutWebui,
	windows,
} from "./browser-session.mjs";

/** @typedef {import("./browser-session.mjs").Target} Target */
/** @typedef {import("./browser-session.mjs").Session} Session */
/** @typedef {import("../prototype/src/features/sidebar/sidebar.logic").BrowserState} BrowserState */
/** @typedef {import("../prototype/src/features/sidebar/sidebar.logic").Space} Space */
/** @typedef {import("../prototype/src/features/sidebar/sidebar.logic").PinnedNode} PinnedNode */
/** @typedef {import("../webui/src/bridge").NativeTab} NativeTab */
/** @typedef {import("../webui/src/bridge").NativeGroup} NativeGroup */
/** @typedef {import("../webui/src/bridge").NativeExtension} NativeExtension */
/** @typedef {{ label: string, level: number, selected: boolean, expanded: string | null, tree: string }} Row */

const repo = resolve(import.meta.dirname, "..");
const chrome = chromePath();
/** --webui=checkout: the sidebar, command bar, Settings and History run this checkout's webui (see useCheckoutWebui). */
const webui = process.argv.find((a) => a.startsWith("--webui="))?.slice("--webui=".length) ?? "build";
if (webui !== "build" && webui !== "checkout") {
	console.error(
		`--webui=${webui}: use --webui=checkout (this checkout's webui) or leave it out (the build's own pages).`,
	);
	process.exit(2);
}
const checkoutWebui = webui === "checkout";
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const evidence = join(repo, ".agents", "verify-runs", `${stamp}-flows`);
const profile = join(BUILD_DIR, `profile-qa-${stamp}`);
const extensionDir = join(BUILD_DIR, `profile-qa-${stamp}-extension`);
const SIDEBAR_URL = "chrome://loka-sidebar.top-chrome/";
/** In the sidebar page: the sidebar component's shadow root. */
const SIDEBAR_ROOT = `document.querySelector("loka-panel")?.shadowRoot?.querySelector("loka-sidebar")?.shadowRoot`;
const UBLOCK = "blockjmkbacgjkknlgpkjjiijinjdanf";
const QA_EXTENSION = "Loka QA popup";
/** What setup makes: name, the planet's and color's names on the Spaces step, and what the sidebar stores. */
const SETUP_SPACES = [
	{ name: "Research", planet: "Ocean", color: "Green", kind: "ocean", hue: 150 },
	{ name: "Play", planet: "Cratered", color: "Pink", kind: "cratered", hue: 330 },
	{ name: "Code Lab", planet: "Banded", color: "Violet", kind: "banded", hue: 260 },
];

// ---- results ------------------------------------------------------------------------------------------------------

/** @type {{ flow: string, name: string, ok: boolean, detail: string }[]} */
const checks = [];
/** @type {{ flow: string, name: string, detail: string }[]} */
const notes = [];
let flow = "setup";
let stepNumber = 0;
/** @param {string} name @param {unknown} ok @param {string} detail */
function check(name, ok, detail) {
	checks.push({ flow, name, ok: Boolean(ok), detail });
	console.log(`${ok ? "PASS" : "FAIL"}  [${flow}] ${name}: ${detail}`);
	return Boolean(ok);
}
/** Something to look at that doesn't fail the run. @param {string} name @param {string} detail */
function note(name, detail) {
	notes.push({ flow, name, detail });
	console.log(`NOTE  [${flow}] ${name}: ${detail}`);
}
/** @param {unknown} value */
const show = (value) => JSON.stringify(value) ?? String(value);

// ---- pages and the test extension ---------------------------------------------------------------------------------

/** Local pages: a few sites with icons, a playing page with a media session, a download, a page that reads its scheme. */
async function startPages() {
	const icon = readFileSync(join(repo, "resources", "loka", "branding", "product_logo_22_mono.png"));
	const wav = toneWav(8);
	/** @param {string} title @param {string} [body] */
	const page = (title, body = "") =>
		`<!doctype html><title>${title}</title><link rel="icon" href="/icon.png"><h1>${title}</h1>${body}`;
	const audio = `<!doctype html><title>QA Tune</title><link rel="icon" href="/icon.png"><h1>QA Tune</h1>
		<audio id="a" src="/tone.wav" loop></audio>
		<script>
			navigator.mediaSession.metadata = new MediaMetadata({ title: "QA Tune", artist: "Loka QA" });
			document.body.dataset.next = "0";
			document.body.dataset.previous = "0";
			navigator.mediaSession.setActionHandler("nexttrack", () => { document.body.dataset.next = String(Number(document.body.dataset.next) + 1); });
			navigator.mediaSession.setActionHandler("previoustrack", () => { document.body.dataset.previous = String(Number(document.body.dataset.previous) + 1); });
		</script>`;
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? "/", "http://x").pathname;
		if (path === "/icon.png") res.writeHead(200, { "content-type": "image/png" }).end(icon);
		else if (path === "/tone.wav") res.writeHead(200, { "content-type": "audio/wav" }).end(wav);
		else if (path === "/audio") res.writeHead(200, { "content-type": "text/html" }).end(audio);
		else if (path === "/qa-download.txt")
			res
				.writeHead(200, { "content-type": "text/plain", "content-disposition": "attachment; filename=qa-download.txt" })
				.end("Loka QA download");
		else if (path.startsWith("/site/")) {
			const name = path.slice(6);
			const title = `QA ${name[0]?.toUpperCase()}${name.slice(1)}`;
			res
				.writeHead(200, { "content-type": "text/html" })
				.end(page(title, `<a id="next" href="/site/${name}-next">next</a>`));
		} else res.writeHead(404).end();
	});
	await new Promise((done) => server.listen(0, "127.0.0.1", () => done(undefined)));
	const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
	return { server, host: `127.0.0.1:${port}` };
}

/** An unpacked MV3 extension with a popup and a badge, to sit next to uBlock Origin. */
function writeExtension() {
	mkdirSync(extensionDir, { recursive: true });
	const icon = readFileSync(join(repo, "resources", "loka", "branding", "product_logo_22_mono.png"));
	writeFileSync(join(extensionDir, "icon.png"), icon);
	writeFileSync(
		join(extensionDir, "manifest.json"),
		JSON.stringify({
			manifest_version: 3,
			name: QA_EXTENSION,
			version: "1.0",
			action: { default_popup: "popup.html", default_icon: "icon.png", default_title: QA_EXTENSION },
			background: { service_worker: "worker.js" },
			icons: { 32: "icon.png" },
		}),
	);
	writeFileSync(
		join(extensionDir, "worker.js"),
		`const badge = () => { chrome.action.setBadgeText({ text: "7" }); chrome.action.setBadgeBackgroundColor({ color: "#d33" }); };
chrome.runtime.onInstalled.addListener(badge);
chrome.runtime.onStartup.addListener(badge);
badge();`,
	);
	writeFileSync(
		join(extensionDir, "popup.html"),
		`<!doctype html><title>QA popup</title><body style="width:200px">QA popup</body>`,
	);
}

// ---- the browser --------------------------------------------------------------------------------------------------

const log = { stream: /** @type {import("node:fs").WriteStream | null} */ (null) };

/** Starts chrome.exe on the profile, and waits for its debugging port. */
async function launch() {
	const port = await freePort();
	const child = spawn(
		chrome,
		[
			`--user-data-dir=${profile}`,
			`--remote-debugging-port=${port}`,
			// Test browsers stay silent: pages and the sidebar's sound cues still play, unheard.
			"--mute-audio",
			// Pictures work behind other windows; Chromium 137+ only takes --load-extension with this feature off.
			"--disable-features=CalculateNativeWinOcclusion,DisableLoadExtensionCommandLineSwitch",
			`--load-extension=${extensionDir}`,
			"--autoplay-policy=no-user-gesture-required",
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	child.stdout.pipe(/** @type {import("node:fs").WriteStream} */ (log.stream), { end: false });
	child.stderr.pipe(/** @type {import("node:fs").WriteStream} */ (log.stream), { end: false });
	const pid = child.pid ?? 0;
	// The browser process by pid and start time, so a quit never stops a process that took its pid later.
	const root = processes(pid).slice(0, 1);
	const http = `http://127.0.0.1:${port}`;
	const version = await until(
		() =>
			fetch(`${http}/json/version`).then(
				(r) => r.json(),
				() => null,
			),
		30000,
	);
	if (!version) throw new Error("the browser never opened its debugging port");
	const browserSession = await connect(version.webSocketDebuggerUrl);
	console.log(`Started ${chrome} (pid ${pid}), CDP on ${port}, profile ${profile}`);
	return {
		pid,
		root,
		http,
		browserSession,
		/** @returns {Promise<Target[]>} */
		targets: () => fetch(`${http}/json/list`).then((r) => r.json()),
	};
}
/** @typedef {Awaited<ReturnType<typeof launch>>} Browser */

/**
 * Quits the browser as the app's Exit does (CDP's Browser.close) and waits until every one of its processes has
 * ended: they all go within 2 s of it here (0.6 to 2 s, 26 quits). Whatever is still running after 30 s is
 * stopped by pid and reported. "Its processes" are the browser's tree by pid and start time, never anything found by
 * name, and never a process that took a pid the browser's had (see stillRunning).
 * @param {Browser} b
 */
async function quit(b) {
	const tree = stillRunning(b.root);
	const asked = Date.now();
	await b.browserSession.call("Browser.close", {}, 5000).catch(() => {});
	b.browserSession.close();
	let left = tree;
	const ended = await until(async () => {
		left = stillRunning(left);
		return left.length === 0;
	}, 30000);
	const waited = Date.now() - asked;
	// No /T: Windows finds a tree by parent pid, which can lead to a stranger's process. `left` has the whole tree.
	for (const p of left) spawnSync("taskkill", ["/F", "/PID", String(p.pid)], { stdio: "ignore" });
	return { ended, waited, tree: tree.length, killed: left.length, left: left.map((p) => `${p.type} ${p.pid}`) };
}

// ---- driving a page -----------------------------------------------------------------------------------------------

// In a page: window.__qa finds elements by accessible name through every shadow root, the way a user reads them.
const HELPERS = `window.__qa ??= (() => {
	const walk = (root, out) => {
		for (const el of root.querySelectorAll("*")) { out.push(el); if (el.shadowRoot) walk(el.shadowRoot, out); }
		return out;
	};
	const up = (n) => n.parentElement ?? (n.parentNode instanceof ShadowRoot ? n.parentNode.host : null);
	const leaving = (el) => { for (let n = el; n; n = up(n)) if (n.inert || n.classList?.contains("leaving")) return true; return false; };
	const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !leaving(el); };
	const name = (el) => {
		if (el.getAttribute("role") === "treeitem") return (el.querySelector(".label, input")?.textContent ?? el.querySelector("input")?.value ?? "").trim();
		return (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\\s+/g, " ").trim();
	};
	const PICKABLE = "button, [role=button], [role=menuitem], [role=treeitem], [role=listitem], [role=option], [role=switch], [role=radio], [role=checkbox], input, select, a, [role=dialog], [role=alertdialog], section[aria-label]";
	const all = () => walk(document, []);
	const find = (label, role) => all().find((el) => el.matches(role || PICKABLE) && shown(el) && (typeof label === "string" ? name(el) === label : new RegExp(label.re).test(name(el))));
	const style = (el) => { const s = getComputedStyle(el); return { background: s.backgroundColor, color: s.color, transform: s.transform, opacity: s.opacity, outline: s.outlineStyle + " " + s.outlineWidth + " " + s.outlineColor, shadow: s.boxShadow, border: s.borderColor, filter: s.filter, scale: s.scale }; };
	const deepActive = () => { let el = document.activeElement; while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement; return el; };
	return {
		find, name, all, style, deepActive,
		box(label, role) {
			const el = find(label, role); if (!el) return null;
			el.scrollIntoView({ block: "nearest" });
			const r = el.getBoundingClientRect();
			// Aim at the part that's on screen: the big planet runs off the bottom of the window.
			const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight), left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
			return { x: (left + right) / 2, y: (top + bottom) / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width };
		},
		has(label, role) { return Boolean(find(label, role)); },
		names(role) { return all().filter((el) => el.matches(role) && shown(el)).map(name); },
		rows() { return all().filter((el) => el.getAttribute("role") === "treeitem" && shown(el)).map((el) => ({ label: name(el), level: Number(el.getAttribute("aria-level")), selected: el.getAttribute("aria-selected") === "true", expanded: el.getAttribute("aria-expanded"), tree: el.closest("[role=tree]")?.getAttribute("aria-label") ?? "" })); },
		styleOf(label, role) { const el = find(label, role); return el ? style(el) : null; },
		// After two frames, so a transition the last input started has begun.
		still(label, role) { return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => { const el = find(label, role); done(Boolean(el) && el.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity)); }))); },
		focused() { const el = deepActive(); return el ? { label: name(el), tag: el.tagName, ...style(el) } : null; },
		text() { return all().map((el) => el.shadowRoot ? el.shadowRoot.textContent : "").join(" ") + " " + document.body.innerText; },
	};
})(), true`;

/**
 * A page to drive: evaluate in it, find things by name, and use the real mouse and keyboard on it.
 * @param {Session} s
 */
function driver(s) {
	/** @param {string} expression @param {boolean} [gesture] */
	const run = (expression, gesture = false) => evaluate(s, `(${HELPERS}, ${expression})`, gesture);
	/** @typedef {string | { re: string }} Label */
	/** @param {Label} label @param {string} [role] @returns {Promise<{ x: number, y: number, top: number, bottom: number, left: number, right: number, height: number, width: number } | null>} */
	const box = (label, role = "") => run(`window.__qa.box(${JSON.stringify(label)}, ${JSON.stringify(role)})`);
	/**
	 * Where it is once it stops moving: rows slide and fade when the list changes, and hints open above them.
	 * @param {Label} label @param {string} [role]
	 */
	const steady = async (label, role = "") => {
		let last = await until(() => box(label, role), 6000);
		for (let i = 0; i < 30 && last; i++) {
			await sleep(70);
			const now = await box(label, role);
			if (now && Math.abs(now.top - last.top) < 0.5 && Math.abs(now.left - last.left) < 0.5) return now;
			last = now ?? last;
		}
		return last;
	};
	/** @param {string} type @param {number} x @param {number} y @param {"none" | "left" | "middle" | "right"} [button] */
	const mouse = (type, x, y, button = "none") =>
		s.call("Input.dispatchMouseEvent", {
			type,
			x,
			y,
			button,
			buttons: button === "left" ? 1 : button === "right" ? 2 : button === "middle" ? 4 : 0,
			clickCount: type === "mouseMoved" ? 0 : 1,
		});
	const KEYS = /** @type {Record<string, [string, number]>} */ ({
		Enter: ["Enter", 13],
		Escape: ["Escape", 27],
		Tab: ["Tab", 9],
		ArrowDown: ["ArrowDown", 40],
		ArrowUp: ["ArrowUp", 38],
		Backspace: ["Backspace", 8],
		Delete: ["Delete", 46],
	});
	return {
		s,
		run,
		box,
		/** @param {Label} label @param {string} [role] */
		has: (label, role = "") => run(`window.__qa.has(${JSON.stringify(label)}, ${JSON.stringify(role)})`),
		/** @param {string} role @returns {Promise<string[]>} */
		names: (role) => run(`window.__qa.names(${JSON.stringify(role)})`),
		/** @returns {Promise<Row[]>} */
		rows: () => run("window.__qa.rows()"),
		/** @param {Label} label @param {string} [role] @returns {Promise<Record<string, string> | null>} */
		styleOf: (label, role = "") => run(`window.__qa.styleOf(${JSON.stringify(label)}, ${JSON.stringify(role)})`),
		/** Waits until its own transitions have finished, so its look can be read. @param {Label} label @param {string} [role] */
		settled: (label, role = "") =>
			until(() => run(`window.__qa.still(${JSON.stringify(label)}, ${JSON.stringify(role)})`), 3000),
		/** @returns {Promise<Record<string, string> | null>} */
		focused: () => run("window.__qa.focused()"),
		/** @returns {Promise<string>} */
		text: () => run("window.__qa.text()"),
		/** Waits for something with this name, then clicks its middle. @param {Label} label @param {{ role?: string, button?: "left" | "middle" | "right", at?: number }} [opts] */
		async click(label, opts = {}) {
			const at = await steady(label, opts.role);
			if (!at) throw new Error(`nothing named ${show(label)} to click`);
			const button = opts.button ?? "left";
			const y = opts.at === undefined ? at.y : at.top + at.height * opts.at;
			await mouse("mouseMoved", at.x, y);
			await mouse("mousePressed", at.x, y, button);
			await mouse("mouseReleased", at.x, y, button);
			return at;
		},
		/** @param {Label} label @param {string} [role] */
		async hover(label, role = "") {
			const at = await steady(label, role);
			if (!at) throw new Error(`nothing named ${show(label)} to hover`);
			await mouse("mouseMoved", at.x, at.y);
			return at;
		},
		mouse,
		/** Moves the mouse off everything. */
		away: () => mouse("mouseMoved", 1, 1),
		/** @param {string} key @param {{ ctrl?: boolean, shift?: boolean, alt?: boolean }} [mods] */
		async key(key, mods = {}) {
			const modifiers = (mods.alt ? 1 : 0) | (mods.ctrl ? 2 : 0) | (mods.shift ? 8 : 0);
			const named = KEYS[key];
			const code = named ? named[0] : /^\d$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`;
			const vk = named ? named[1] : key.toUpperCase().charCodeAt(0);
			const text = named || mods.ctrl || mods.alt ? undefined : key;
			await s.call("Input.dispatchKeyEvent", {
				type: text ? "keyDown" : "rawKeyDown",
				key,
				code,
				modifiers,
				windowsVirtualKeyCode: vk,
				text,
			});
			await s.call("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers, windowsVirtualKeyCode: vk });
		},
		/** @param {string} text */
		type: (text) => s.call("Input.insertText", { text }),
		/**
		 * A drag the way a mouse does it: press on `from`, move past the 5 px threshold, and let go on `to` at `at` (0
		 * top edge .. 1 bottom edge). The sidebar drags with pointer events (a copy of the row, .drag-ghost, follows the
		 * pointer). A build whose sidebar still uses HTML5 drag and drop gets that instead: the browser hands the drag
		 * back to CDP (Input.setInterceptDrags) so it never becomes an OS drag.
		 * @param {Label} from @param {Label} to @param {number} at @param {string} [toRole]
		 */
		async drag(from, to, at, toRole = "") {
			const a = await until(() => box(from), 6000);
			const b = await until(() => box(to, toRole), 6000);
			if (!a || !b) throw new Error(`can't drag ${show(from)} to ${show(to)}`);
			const held = (/** @type {number} */ x, /** @type {number} */ y) =>
				s.call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
			const ghost = () => evaluate(s, `Boolean(${SIDEBAR_ROOT}?.querySelector(".drag-ghost"))`);
			await s.call("Input.setInterceptDrags", { enabled: true });
			/** @type {Promise<any>} */
			const intercepted = new Promise((done) => s.on("Input.dragIntercepted", (p) => done(p.data)));
			await mouse("mouseMoved", a.x, a.y);
			await mouse("mousePressed", a.x, a.y, "left");
			await held(a.x, a.y + 6);
			await held(b.x, b.y);
			const started = await Promise.race([
				intercepted.then((data) => ({ html5: data })),
				until(ghost, 3000).then((on) => (on ? { pointer: true } : null)),
			]);
			if (!started) {
				await mouse("mouseReleased", b.x, b.y, "left");
				await s.call("Input.setInterceptDrags", { enabled: false });
				throw new Error(`dragging ${show(from)} never started`);
			}
			// Starting a drag opens drop zones (the Essentials tray) that ease in and move the target: wait until it
			// stays put, then aim.
			/** @type {Awaited<ReturnType<typeof box>>} */
			let target = b;
			for (let i = 0; i < 20; i++) {
				await sleep(80);
				const now = await box(to, toRole);
				if (now && target && Math.abs(now.top - target.top) < 0.5) break;
				target = now ?? target;
			}
			if (!target) throw new Error(`${show(to)} went away during the drag`);
			const ty = target.top + target.height * at;
			if ("pointer" in started) {
				await held(target.x, ty - 2);
				await held(target.x, ty);
				await sleep(60);
			} else {
				for (const type of ["dragEnter", "dragOver", "dragOver", "drop"]) {
					await s.call("Input.dispatchDragEvent", { type, x: target.x, y: ty, data: started.html5 });
					if (type === "dragOver") await sleep(60);
				}
			}
			await mouse("mouseReleased", target.x, ty, "left");
			await s.call("Input.setInterceptDrags", { enabled: false });
		},
		/** @param {string} file */
		async picture(file) {
			const shot = await s.call("Page.captureScreenshot", { format: "png" }, 20000).catch(() => null);
			if (shot) writeFileSync(file, Buffer.from(shot.data, "base64"));
			return Boolean(shot);
		},
	};
}
/** @typedef {ReturnType<typeof driver>} Driver */

/** The sidebar of the browser's window, with requests to its handler and its saved spaces. @param {Browser} b */
async function attachSidebar(b) {
	const target = await until(async () => (await b.targets()).find((t) => t.url === SIDEBAR_URL), 30000);
	if (!target) throw new Error("no chrome://loka-sidebar target");
	const s = await connect(target.webSocketDebuggerUrl);
	await s.call("Runtime.enable");
	await s.call("Page.enable");
	const panel = () => evaluate(s, "Boolean(window.cr && document.querySelector('loka-panel')?.shadowRoot)");
	await until(panel, 15000);
	if (checkoutWebui) {
		await useCheckoutWebui(s, "sidebar");
		if (!(await until(panel, 15000))) throw new Error("this checkout's sidebar never drew its panel");
	}
	await evaluate(s, RECORD_EVENTS);
	const d = driver(s);
	/** @param {string} message @param {unknown[]} args */
	const ask = (message, ...args) => evaluate(s, askExpression(message, args));
	/** @returns {Promise<BrowserState>} */
	const state = async () => {
		const store = await ask("getStore");
		return JSON.parse(store["state.v1"] ?? "null");
	};
	return {
		...d,
		ask,
		/** @param {string} message @param {unknown[]} args */
		tell: (message, ...args) => evaluate(s, `(chrome.send(${JSON.stringify(message)}, ${JSON.stringify(args)}), true)`),
		state,
		/** @returns {Promise<Record<string, any>>} */
		ui: async () => JSON.parse((await ask("getStore"))["ui.v1"] ?? "{}"),
		/** @returns {Promise<NativeTab[]>} */
		tabs: () => ask("getTabs"),
		/** @returns {Promise<NativeGroup[]>} */
		groups: () => ask("getGroups"),
		/** @returns {Promise<NativeExtension[]>} */
		extensions: () => ask("getExtensions"),
	};
}
/** @typedef {Awaited<ReturnType<typeof attachSidebar>>} Sidebar */

// ---- reading the spaces -------------------------------------------------------------------------------------------

/** @param {BrowserState} st @param {string} name */
const spaceNamed = (st, name) => st.spaces.find((x) => x.name === name);
/** @param {BrowserState} st */
const shownSpace = (st) => st.spaces.find((x) => x.id === st.activeSpaceId);
/** @param {PinnedNode[]} nodes @returns {string[]} */
const pinnedIds = (nodes) => nodes.flatMap((n) => (n.kind === "tab" ? [n.id] : pinnedIds(n.children)));
/** Where the sidebar keeps a page: its space's name, "Essentials", or "nowhere". @param {BrowserState} st @param {string} url */
const homeIn = (st, url) =>
	st.essentials.some((id) => st.tabs[id]?.url === url)
		? "Essentials"
		: (st.spaces.find((x) => [...x.open, ...pinnedIds(x.pinned)].some((id) => st.tabs[id]?.url === url))?.name ??
			"nowhere");
/** Titles of a space's open tabs, top first. @param {BrowserState} st @param {string} name */
const openTitles = (st, name) => (spaceNamed(st, name)?.open ?? []).map((id) => st.tabs[id]?.title ?? "?");
/** The pinned tree as "depth:name" lines. @param {BrowserState} st @param {PinnedNode[]} nodes @param {number} [depth] @returns {string[]} */
const pinnedLines = (st, nodes, depth = 0) =>
	nodes.flatMap((n) =>
		n.kind === "tab"
			? [`${depth}:${st.tabs[n.id]?.title ?? "?"}`]
			: [`${depth}:[${n.name}${n.open ? "" : " closed"}]`, ...pinnedLines(st, n.children, depth + 1)],
	);
/** The Loka tab with this title, wherever it is. @param {BrowserState} st @param {string} title */
const tabTitled = (st, title) => Object.values(st.tabs).find((t) => t.title === title);

/**
 * Whether the browser shows the space the sidebar shows: the browser's active tab is in that space's tab group,
 * which is open, and every other space's group is folded away.
 * @param {Sidebar} sb
 */
async function browserFollows(sb) {
	const [st, tabs, groups] = await Promise.all([sb.state(), sb.tabs(), sb.groups()]);
	const space = shownSpace(st);
	const active = tabs.find((t) => t.active);
	const group = groups.find((g) => g.id === active?.groupId);
	const others = groups.filter((g) => g.title !== space?.name);
	const ok =
		Boolean(space && active) &&
		(st.essentials.some((id) => st.tabs[id]?.url === active?.url) ||
			(group?.title === space?.name && !group?.collapsed)) &&
		others.every((g) => g.collapsed);
	const detail = `sidebar "${space?.name}"; browser shows "${active?.title}" in group "${group?.title ?? "none"}"; groups ${groups.map((g) => `${g.title}${g.collapsed ? " (folded)" : ""}`).join(", ")}`;
	return { ok, detail };
}

// ---- the run ------------------------------------------------------------------------------------------------------

/** @type {{ browser: Browser, sidebar: Sidebar, host: string }} */
let ctx;

/** A picture of the sidebar for this step, and with `whole` one of the window. @param {string} name @param {boolean} [whole] */
async function step(name, whole = false) {
	const dir = join(evidence, flow);
	mkdirSync(dir, { recursive: true });
	const base = join(dir, `${String(++stepNumber).padStart(2, "0")}-${name}`);
	// Let fades and slides finish first (the sky's endless drift aside), so the picture shows where things settle.
	await evaluate(
		ctx.sidebar.s,
		`Promise.race([Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1500))]).then(() => true)`,
	);
	await ctx.sidebar.picture(`${base}.png`);
	writeFileSync(`${base}.state.json`, JSON.stringify(await ctx.sidebar.state(), null, 2));
	if (whole) windows(ctx.browser.pid, `${base}.window.png`, " - Loka");
}

/** The floating command bar's page, once the browser has made it. */
async function commandBar() {
	const target = await until(
		async () => (await ctx.browser.targets()).find((t) => t.url.includes("command.html")),
		8000,
	);
	if (!target) throw new Error("no command bar page");
	const s = await connect(target.webSocketDebuggerUrl);
	await s.call("Runtime.enable");
	return driver(s);
}
/** @type {Driver | null} */
let bar = null;

/**
 * With --webui=checkout, after each launch: the browser makes the command bar's page the first time the bar opens,
 * and a reload loses the command it opened with, so open it once, swap in this checkout's page, and close it again.
 */
async function checkoutCommandBar() {
	await ctx.sidebar.tell("openCommandBar", "new-tab");
	const b = await commandBar();
	await useCheckoutWebui(b.s, "command");
	await ctx.sidebar.tell("closeCommandBar");
	const hidden = await until(() => b.run(`document.visibilityState === "hidden"`), 4000);
	if (!hidden) throw new Error("this checkout's command bar didn't close");
	bar = b;
}

/**
 * Opens the floating command bar from the sidebar (by clicking `opener`, or as Ctrl+T does) and waits until it shows,
 * focused, with `query` in it.
 * @param {string | null} opener @param {string} [query]
 */
async function openBar(opener, query = "") {
	if (opener) await ctx.sidebar.click(opener);
	// The browser's Ctrl+T and Ctrl+L call this same handler (DispatchCommand). CDP's synthetic keys skip the
	// browser's own shortcuts, so a run can't press those two.
	else await ctx.sidebar.tell("openCommandBar", "new-tab");
	bar ??= await commandBar();
	const b = bar;
	const ready = await until(
		() =>
			b.run(
				`document.visibilityState === "visible" && (() => { const i = window.__qa.deepActive(); return i && i.tagName === "INPUT" && i.value === ${JSON.stringify(query)}; })()`,
			),
		6000,
	);
	if (!ready) throw new Error(`the command bar didn't open with ${show(query)}`);
	return b;
}

/** Types into the open command bar, waits for a result named `pick` to be first (or chosen), and presses Enter. @param {string} text @param {string | { re: string }} pick */
async function barPick(text, pick) {
	const b = /** @type {Driver} */ (bar);
	await b.type(text);
	const first = await until(async () => {
		/** @type {string[]} */
		const options = await b.run(
			`window.__qa.all().filter((el) => el.getAttribute("role") === "option").map((el) => el.querySelector(".label, b, strong")?.textContent?.trim() ?? el.textContent.replace(/\\s+/g, " ").trim())`,
		);
		const index = options.findIndex((o) => (typeof pick === "string" ? o === pick : new RegExp(pick.re).test(o)));
		return index === -1 ? null : { index, options };
	}, 8000);
	if (!first) {
		/** @type {string[]} */
		const options = await b.names("[role=option]");
		throw new Error(`no ${show(pick)} among ${options.join(" | ")}`);
	}
	for (let i = 0; i < first.index; i++) await b.key("ArrowDown");
	await b.key("Enter");
	await until(() => b.run(`document.visibilityState === "hidden"`), 4000);
}

/** Opens a local page in a new tab through the command bar and waits for the browser and sidebar to have it. @param {string} name */
async function openSite(name) {
	const url = `http://${ctx.host}/site/${name}`;
	await openBar("New tab");
	await barPick(`${ctx.host}/site/${name}`, { re: `^Go to ${ctx.host.replace(/\./g, "\\.")}/site/${name}$` });
	const title = `QA ${name[0]?.toUpperCase()}${name.slice(1)}`;
	const loaded = await until(async () => {
		const tabs = await ctx.sidebar.tabs();
		const tab = tabs.find((t) => t.url === url && t.title === title && !t.loading);
		const st = await ctx.sidebar.state();
		return tab?.active && tabTitled(st, title) ? tab : null;
	}, 10000);
	if (!loaded) throw new Error(`${url} never opened`);
	return loaded;
}

// ---- flows --------------------------------------------------------------------------------------------------------

async function firstRun() {
	const b = ctx.browser;
	const setupTarget = await until(
		async () => (await b.targets()).find((t) => t.url.startsWith("chrome://setup")),
		20000,
	);
	if (!check("first run opens setup", setupTarget, setupTarget?.url ?? "no chrome://setup page")) return false;
	const setup = driver(await connect(/** @type {Target} */ (setupTarget).webSocketDebuggerUrl));
	await until(() => setup.run(`document.readyState === "complete" && window.__qa.has("Set up Loka")`), 15000);
	const dir = join(evidence, flow);
	mkdirSync(dir, { recursive: true });
	await setup.picture(join(dir, "00-welcome.png"));
	await setup.click("Set up Loka");
	await until(() => setup.has("Create space"), 8000);
	for (const space of SETUP_SPACES) {
		await setup.run(
			`(() => { const i = window.__qa.all().find((el) => el.tagName === "INPUT"); i.focus(); i.select(); return true; })()`,
		);
		await setup.type(space.name);
		await setup.click(space.planet);
		await setup.click(space.color);
		await setup.click("Create space");
		await until(() => setup.has(`Edit ${space.name}`), 5000);
	}
	await setup.picture(join(dir, "01-spaces-step.png"));
	const orbit = await setup.names("button");
	check(
		"setup's orbit shows the three spaces",
		SETUP_SPACES.every((x) => orbit.includes(`Edit ${x.name}`)),
		orbit.filter((n) => n.startsWith("Edit ")).join(", "),
	);
	// The rest of setup as it comes; never "Make Loka my default browser".
	for (let i = 0; i < 10 && !(await setup.has("Open Loka")); i++) {
		const page = await setup.text();
		await setup.click("Next");
		// The next step is in once the page says something else; only then is it time to look for its Next.
		await until(async () => (await setup.text()) !== page, 5000);
	}
	await setup.picture(join(dir, "02-finish.png"));
	await setup.click("Open Loka");
	setup.s.close();

	ctx.sidebar = await attachSidebar(b);
	if (checkoutWebui) await checkoutCommandBar();
	const st = await until(async () => {
		const now = await ctx.sidebar.state();
		return now?.spaces.length === SETUP_SPACES.length && now.spaces[0]?.name === SETUP_SPACES[0]?.name ? now : null;
	}, 10000);
	const saved = st ?? (await ctx.sidebar.state());
	await step("sidebar-after-setup", true);
	check(
		"the sidebar has exactly setup's spaces",
		saved?.spaces.map((x) => x.name).join() === SETUP_SPACES.map((x) => x.name).join(),
		saved?.spaces.map((x) => x.name).join(", ") ?? "no spaces saved",
	);
	check(
		"with setup's colors and planets",
		show(saved?.spaces.map((x) => [x.hue, x.planet])) === show(SETUP_SPACES.map((x) => [x.hue, x.kind])),
		show(saved?.spaces.map((x) => [x.name, x.hue, x.planet])),
	);
	check(
		"the first one is showing",
		saved && shownSpace(saved)?.name === "Research",
		`showing ${saved && shownSpace(saved)?.name}`,
	);
	const tabs = await ctx.sidebar.tabs();
	const inFirst = saved ? (spaceNamed(saved, "Research")?.open.length ?? 0) : 0;
	check(
		"the window's tab is in it",
		tabs.length > 0 && inFirst === tabs.length,
		`${inFirst} of ${tabs.length} tabs in Research`,
	);
	const horizon = await ctx.sidebar.names("button");
	check(
		"the switcher shows Research with its neighbours",
		horizon.includes("Spaces: Research") && horizon.includes("Play (Ctrl 2)") && horizon.includes("Code Lab (Ctrl 3)"),
		horizon.filter((n) => n.startsWith("Spaces:") || /\(Ctrl \d\)$/.test(n)).join(", "),
	);
	const follows = await until(async () => {
		const f = await browserFollows(ctx.sidebar);
		return f.ok ? f : null;
	}, 6000);
	check(
		"its tab is in a tab group named Research",
		follows,
		follows?.detail ?? (await browserFollows(ctx.sidebar)).detail,
	);
	return true;
}

async function spaces() {
	const sb = ctx.sidebar;
	// Make one from the + at the bottom.
	await sb.click("New");
	await sb.click("New space", { role: "[role=menuitem]" });
	await until(() => sb.has("Space name"), 4000);
	await sb.run(`(() => { const i = window.__qa.find("Space name"); i.focus(); i.select(); return true; })()`);
	await sb.type("Work");
	await sb.click("Hue 30");
	await sb.click("Ringed");
	await sb.click("Dark");
	await step("new-space-editor");
	await sb.click("Create space");
	let st = await until(async () => {
		const now = await sb.state();
		return spaceNamed(now, "Work") && shownSpace(now)?.name === "Work" ? now : null;
	}, 6000);
	const work = st && spaceNamed(st, "Work");
	check(
		"New space makes Work, with its look, and shows it",
		work && work.hue === 30 && work.planet === "ringed" && work.scheme === "dark",
		show(work && [work.name, work.hue, work.planet, work.scheme, st && shownSpace(st)?.name]),
	);
	const newTab = await until(async () => {
		const [now, tabs] = await Promise.all([sb.state(), sb.tabs()]);
		const w = spaceNamed(now, "Work");
		const active = tabs.find((t) => t.active);
		return w?.open.length === 1 && active?.url === "chrome://newtab/" ? { now, active } : null;
	}, 8000);
	check(
		"switching to the empty space opens a new tab in it",
		newTab,
		newTab ? `Work open: ${openTitles(newTab.now, "Work")}` : show(openTitles(await sb.state(), "Work")),
	);
	let follows = await until(async () => {
		const f = await browserFollows(sb);
		return f.ok ? f : null;
	}, 6000);
	check(
		"the browser shows Work's tab group, the rest folded",
		follows,
		follows?.detail ?? (await browserFollows(sb)).detail,
	);
	await step("work-made", true);

	// Its new tab follows the space's dark scheme.
	const page = await pageOf("chrome://newtab/");
	const dark = page && (await until(() => evaluate(page, `matchMedia("(prefers-color-scheme: dark)").matches`), 5000));
	check("pages in a dark space are dark", dark, `prefers-color-scheme: dark is ${dark}`);
	page?.close();

	// Edit it: name, color, planet, light.
	await sb.click("Spaces: Work");
	await sb.click("Edit this space", { role: "[role=menuitem]" });
	await until(() => sb.has("Space name"), 4000);
	await sb.run(`(() => { const i = window.__qa.find("Space name"); i.focus(); i.select(); return true; })()`);
	await sb.type("Work Stuff");
	await sb.click("Hue 175");
	await sb.click("Moon");
	await sb.click("Light");
	await sb.click("Save");
	st = await until(async () => {
		const now = await sb.state();
		return spaceNamed(now, "Work Stuff") ? now : null;
	}, 6000);
	const edited = st && spaceNamed(st, "Work Stuff");
	check(
		"Edit this space renames, recolors, changes the planet and the scheme",
		edited &&
			edited.hue === 175 &&
			edited.planet === "cratered" &&
			edited.scheme === "light" &&
			edited.open.length === 1,
		show(edited && [edited.name, edited.hue, edited.planet, edited.scheme, edited.open.length]),
	);
	const regrouped = await until(async () => (await sb.groups()).some((g) => g.title === "Work Stuff"), 5000);
	check("its tab group takes the new name", regrouped, show((await sb.groups()).map((g) => g.title)));
	const lightPage = await pageOf("chrome://newtab/");
	const light =
		lightPage && (await until(() => evaluate(lightPage, `matchMedia("(prefers-color-scheme: light)").matches`), 5000));
	check("and its pages turn light", light, `prefers-color-scheme: light is ${light}`);
	lightPage?.close();
	await step("work-edited");

	// Delete it: its tab goes with it and the next space shows.
	const workTab = (await sb.tabs()).find((t) => t.active)?.id;
	await sb.click("Spaces: Work Stuff");
	await sb.click("Edit this space", { role: "[role=menuitem]" });
	const canDelete = await until(() => sb.has("Delete space"), 4000);
	if (check("the editor offers Delete space", canDelete, canDelete ? "yes" : "no Delete space button")) {
		await sb.click("Delete space");
		await sb.click("Delete it and its tabs");
		const gone = await until(async () => {
			const [now, tabs] = await Promise.all([sb.state(), sb.tabs()]);
			return !spaceNamed(now, "Work Stuff") && !tabs.some((t) => t.id === workTab) ? now : null;
		}, 6000);
		check(
			"deleting it removes the space and closes its tab",
			gone,
			gone ? `spaces ${gone.spaces.map((x) => x.name).join(", ")}, showing ${shownSpace(gone)?.name}` : "still there",
		);
	} else await sb.key("Escape");
	await step("work-deleted");

	// Switch by the planets on the horizon, Ctrl+number and the command bar.
	await sb.click("Play (Ctrl 2)");
	st = await until(async () => {
		const now = await sb.state();
		return shownSpace(now)?.name === "Play" ? now : null;
	}, 5000);
	check("clicking Play's planet shows Play", st, `showing ${st ? "Play" : shownSpace(await sb.state())?.name}`);
	follows = await until(async () => {
		const f = await browserFollows(sb);
		return f.ok ? f : null;
	}, 6000);
	check("the browser follows to Play", follows, follows?.detail ?? (await browserFollows(sb)).detail);
	await step("play-by-planet", true);
	for (const [n, name] of /** @type {[string, string][]} */ ([
		["3", "Code Lab"],
		["1", "Research"],
	])) {
		await sb.key(n, { ctrl: true });
		const shown = await until(async () => shownSpace(await sb.state())?.name === name, 5000);
		check(`Ctrl+${n} shows ${name}`, shown, `showing ${shownSpace(await sb.state())?.name}`);
		const f = await until(async () => {
			const r = await browserFollows(sb);
			return r.ok ? r : null;
		}, 6000);
		check(`the browser follows to ${name}`, f, f?.detail ?? (await browserFollows(sb)).detail);
	}
	await openBar(null);
	await barPick("Code", "Code Lab");
	const byBar = await until(async () => shownSpace(await sb.state())?.name === "Code Lab", 5000);
	check("picking Code Lab in the command bar shows it", byBar, `showing ${shownSpace(await sb.state())?.name}`);
	await sb.key("1", { ctrl: true });
	await until(async () => shownSpace(await sb.state())?.name === "Research", 5000);
	await step("back-in-research");
}

/** Shows Research (Ctrl+1), where each flow starts, whatever the last one left showing. */
async function inResearch() {
	await ctx.sidebar.key("Escape");
	if (shownSpace(await ctx.sidebar.state())?.name === "Research") return;
	await ctx.sidebar.key("1", { ctrl: true });
	await until(async () => shownSpace(await ctx.sidebar.state())?.name === "Research", 5000);
}

/** A session on the browser tab showing `url` (the first one). @param {string} url */
async function pageOf(url) {
	const target = await until(
		async () => (await ctx.browser.targets()).find((t) => t.type === "page" && t.url === url),
		5000,
	);
	return target ? connect(target.webSocketDebuggerUrl) : null;
}

async function tabs() {
	const sb = ctx.sidebar;
	await inResearch();
	for (const name of ["alpha", "bravo", "charlie", "delta"]) await openSite(name);
	const opened = await sb.state();
	check(
		"pages opened from the command bar land in Research, newest first",
		show(openTitles(opened, "Research").slice(0, 4)) === show(["QA Delta", "QA Charlie", "QA Bravo", "QA Alpha"]),
		show(openTitles(opened, "Research")),
	);
	/** @type {BrowserState | null} */
	let st = opened;
	const rows = await sb.rows();
	check(
		"the sidebar lists them",
		["QA Alpha", "QA Bravo", "QA Charlie", "QA Delta"].every((t) => rows.some((r) => r.label === t)),
		rows.map((r) => r.label).join(" | "),
	);
	await step("four-sites", true);

	// Clicking a row shows its page.
	await sb.click("QA Bravo", { role: "[role=treeitem]" });
	const shown = await until(async () => (await sb.tabs()).find((t) => t.active)?.title === "QA Bravo", 5000);
	check(
		"clicking a row makes it the browser's tab",
		shown,
		`browser shows ${(await sb.tabs()).find((t) => t.active)?.title}`,
	);
	const selected = (await sb.rows()).find((r) => r.selected)?.label;
	check("and the row is the selected one", selected === "QA Bravo", `selected ${selected}`);

	// Close by the x and by a middle click.
	await sb.hover("QA Delta", "[role=treeitem]");
	await sb.click("Close QA Delta");
	const closed = await until(async () => !(await sb.tabs()).some((t) => t.title === "QA Delta"), 5000);
	check("x closes the tab in the browser", closed, show((await sb.tabs()).map((t) => t.title)));
	check("and its row goes", !(await sb.rows()).some((r) => r.label === "QA Delta"), "row gone");
	await sb.click("QA Charlie", { role: "[role=treeitem]", button: "middle" });
	const middle = await until(async () => !(await sb.tabs()).some((t) => t.title === "QA Charlie"), 5000);
	check("a middle click closes a tab", middle, show((await sb.tabs()).map((t) => t.title)));
	await step("closed-two");

	// Reorder: Alpha above Bravo.
	await sb.drag({ re: "^QA Alpha$" }, { re: "^QA Bravo$" }, 0.15, "[role=treeitem]");
	st = await until(async () => {
		const now = await sb.state();
		const open = openTitles(now, "Research");
		return open.indexOf("QA Alpha") < open.indexOf("QA Bravo") ? now : null;
	}, 5000);
	check("dragging a row above another reorders them", st, show(openTitles(st ?? (await sb.state()), "Research")));
	await step("reordered");

	// Move one to another space from its menu.
	await sb.click("QA Bravo", { role: "[role=treeitem]", button: "right" });
	// The menu has "Move to space" opening its spaces under it; a build's older sidebar lists "Move to Play" itself.
	if ((await sb.names("[role=menuitem]")).some((n) => n.startsWith("Move to space"))) {
		await sb.click("Move to space", { role: "[role=menuitem]" });
		await sb.click("Play", { role: "[role=menuitem]" });
	} else await sb.click("Move to Play", { role: "[role=menuitem]" });
	st = await until(async () => {
		const now = await sb.state();
		return openTitles(now, "Play").includes("QA Bravo") ? now : null;
	}, 5000);
	check("Move to Play moves the tab there", st, `Play: ${show(openTitles(st ?? (await sb.state()), "Play"))}`);
	const moved = await until(async () => {
		const [tabsNow, groups] = await Promise.all([sb.tabs(), sb.groups()]);
		const tab = tabsNow.find((t) => t.title === "QA Bravo");
		return groups.find((g) => g.id === tab?.groupId)?.title === "Play";
	}, 5000);
	check("and into Play's tab group in the browser", moved, show((await sb.groups()).map((g) => g.title)));

	// Words search with the browser's engine; Ctrl+L changes the shown tab's address.
	const tabsBefore = new Set((await sb.tabs()).map((t) => t.id));
	await openBar("New tab");
	await barPick("loka qa words", { re: "^loka qa words$" });
	// getTabs has a tab's committed address, which for a search waits on the search engine's servers (0.3 s here,
	// over 6 s in the runs that failed); until then it says about:blank. The browser's own target list has where the
	// tab is going from the start. So: a new tab, shown, going to the search (committed, or still on its way there).
	const isSearch = (/** @type {string} */ url) => /[?&]q=loka(\+|%20)qa(\+|%20)words/.test(url);
	const searchedSince = Date.now();
	const searched = await until(async () => {
		const [tabsNow, targets] = await Promise.all([sb.tabs(), ctx.browser.targets()]);
		const tab = tabsNow.find((t) => !tabsBefore.has(t.id) && t.active);
		const going = targets.find((t) => t.type === "page" && isSearch(t.url))?.url;
		if (!tab) return null;
		if (isSearch(tab.url)) return { id: tab.id, url: tab.url, how: "committed" };
		return (tab.url === "about:blank" || tab.url === "") && going
			? { id: tab.id, url: going, how: "on its way" }
			: null;
	}, 10000);
	const searchWaited = Date.now() - searchedSince;
	check(
		"words in the command bar search the web in a new tab",
		searched,
		searched
			? `${searched.url} (${searched.how}, after ${searchWaited} ms)`
			: `tabs ${show((await sb.tabs()).map((t) => [t.url, t.active]))}; targets ${show((await ctx.browser.targets()).map((t) => t.url))}`,
	);
	// It needs the network to load; only where it went matters here.
	if (searched) await sb.tell("closeTab", searched.id);
	await sb.click("QA Alpha", { role: "[role=treeitem]" });
	await until(async () => (await sb.tabs()).find((t) => t.active)?.title === "QA Alpha", 5000);
	const alphaId = (await sb.tabs()).find((t) => t.active)?.id;
	await sb.key("l", { ctrl: true });
	bar ??= await commandBar();
	const b = bar;
	const prefilled = await until(
		() => b.run(`document.visibilityState === "visible" && window.__qa.deepActive()?.value`),
		5000,
	);
	check("Ctrl+L opens the bar on the shown address", prefilled === `http://${ctx.host}/site/alpha`, show(prefilled));
	await b.run(`(window.__qa.deepActive().select(), true)`);
	await barPick(`${ctx.host}/site/echo`, { re: `^Go to ${ctx.host.replace(/\./g, "\\.")}/site/echo$` });
	const navigated = await until(async () => {
		const tab = (await sb.tabs()).find((t) => t.id === alphaId);
		return tab?.title === "QA Echo" ? tab : null;
	}, 6000);
	check("and Enter goes there in the same tab", navigated, show((await sb.tabs()).find((t) => t.id === alphaId)));
	await step("ctrl-l");

	// Back, forward, reload.
	await sb.click("Back");
	const back = await until(async () => (await sb.tabs()).find((t) => t.id === alphaId)?.title === "QA Alpha", 6000);
	check("Back goes back", back, show((await sb.tabs()).find((t) => t.id === alphaId)?.url));
	await sb.click("Forward");
	const forward = await until(async () => (await sb.tabs()).find((t) => t.id === alphaId)?.title === "QA Echo", 6000);
	check("Forward goes forward", forward, show((await sb.tabs()).find((t) => t.id === alphaId)?.url));
	const echo = await pageOf(`http://${ctx.host}/site/echo`);
	if (echo) {
		await evaluate(echo, `(window.__beforeReload = true, true)`);
		await sb.click("Reload");
		const reloaded = await until(
			() =>
				evaluate(
					echo,
					`!window.__beforeReload && performance.getEntriesByType("navigation")[0]?.type === "reload"`,
				).catch(() => false),
			6000,
		);
		check(
			"Reload reloads the page",
			reloaded,
			`navigation type ${await evaluate(echo, `performance.getEntriesByType("navigation")[0]?.type`).catch(() => "?")}`,
		);
		echo.close();
	}
	await step("nav-buttons");
}

async function states() {
	const sb = ctx.sidebar;
	await inResearch();
	/** @param {string} what @param {string | { re: string }} label @param {string} role @param {string[]} props */
	const hoverChanges = async (what, label, role, props) => {
		await sb.away();
		await sb.settled(label, role);
		const before = await sb.styleOf(label, role);
		await sb.hover(label, role);
		// Hover transitions run about 120 ms.
		const after = await until(async () => {
			const now = await sb.styleOf(label, role);
			return now && props.some((p) => now[p] !== before?.[p]) ? now : null;
		}, 1500);
		check(
			`hovering ${what} changes how it looks`,
			after,
			after
				? props
						.filter((p) => after[p] !== before?.[p])
						.map((p) => `${p}: ${before?.[p]} -> ${after[p]}`)
						.join("; ")
				: `no change in ${props.join(", ")}`,
		);
		return after;
	};
	// A row that isn't the one showing: the shown row keeps its own background under the mouse.
	const quiet = (await sb.rows()).find((r) => !r.selected && r.expanded === null)?.label ?? "QA Alpha";
	await hoverChanges("a tab row", quiet, "[role=treeitem]", ["background", "color", "shadow"]);
	await hoverChanges("the New tab row", "New tab", "button", ["background", "color"]);
	await hoverChanges("the More button", "More", "button", ["background", "color"]);
	await hoverChanges("a neighbour planet", "Play (Ctrl 2)", "button", ["transform", "scale", "filter", "opacity"]);
	await hoverChanges("the address field", { re: "" }, ".url", ["background", "color", "shadow", "border"]);
	await step("hovered");
	// Press: the button held down.
	const more = await sb.box("More", "button");
	if (more) {
		await sb.away();
		await sb.settled("More", "button");
		await sb.mouse("mouseMoved", more.x, more.y);
		await sb.settled("More", "button");
		const hovered = await sb.styleOf("More", "button");
		await sb.mouse("mousePressed", more.x, more.y, "left");
		const pressed = await until(async () => {
			const now = await sb.styleOf("More", "button");
			return now &&
				(now.transform !== hovered?.transform || now.background !== hovered?.background || now.scale !== hovered?.scale)
				? now
				: null;
		}, 1000);
		check(
			"pressing a button changes it",
			pressed,
			pressed
				? `transform ${hovered?.transform} -> ${pressed.transform}, background ${hovered?.background} -> ${pressed.background}`
				: "no change while held",
		);
		await sb.mouse("mouseReleased", more.x, more.y, "left");
		await sb.key("Escape");
	}
	const row = await sb.box(quiet, "[role=treeitem]");
	if (row) {
		await sb.mouse("mouseMoved", row.x, row.y);
		await sb.settled(quiet, "[role=treeitem]");
		const hovered = await sb.styleOf(quiet, "[role=treeitem]");
		await sb.mouse("mousePressed", row.x, row.y, "left");
		const pressed = await until(async () => {
			const now = await sb.styleOf(quiet, "[role=treeitem]");
			return now &&
				(now.transform !== hovered?.transform || now.background !== hovered?.background || now.scale !== hovered?.scale)
				? now
				: null;
		}, 800);
		if (!pressed)
			note("a tab row has no pressed look", "background and transform stay the same while the mouse is down");
		await sb.mouse("mouseReleased", row.x, row.y, "left");
	}
	// Focus rings with Tab.
	await sb.away();
	await sb.run(`(window.__qa.deepActive()?.blur?.(), true)`);
	/** @type {string[]} */
	const ringless = [];
	let ringed = 0;
	for (let i = 0; i < 6; i++) {
		await sb.key("Tab");
		const f = await sb.focused();
		// Past the last control focus leaves the page for the browser, then comes back to the first.
		if (!f || f.tag === "BODY") continue;
		const ring = !/^none/.test(f.outline ?? "none") || (f.shadow ?? "none") !== "none";
		if (ring) ringed++;
		else ringless.push(f.label || f.tag || "?");
	}
	check(
		"Tab moves focus with a visible ring",
		ringed > 0 && ringless.length === 0,
		`${ringed} with a ring; without: ${ringless.join(", ") || "none"}`,
	);
	await step("focus-ring");
}

async function pinning() {
	const sb = ctx.sidebar;
	await inResearch();
	// The pages this flow uses: Alpha (showing Echo after the nav flow) and two fresh ones.
	await openSite("foxtrot");
	await openSite("golf");
	await openSite("hotel");
	// Pin by menu.
	await sb.click("QA Foxtrot", { role: "[role=treeitem]", button: "right" });
	await sb.click("Pin to space", { role: "[role=menuitem]" });
	let st = await until(async () => {
		const now = await sb.state();
		return pinnedLines(now, spaceNamed(now, "Research")?.pinned ?? []).includes("0:QA Foxtrot") ? now : null;
	}, 5000);
	check(
		"Pin to space pins it",
		st,
		show(pinnedLines(st ?? (await sb.state()), spaceNamed(st ?? (await sb.state()), "Research")?.pinned ?? [])),
	);
	const pinnedRow = (await sb.rows()).find((r) => r.label === "QA Foxtrot");
	check("its row moves above the divider", pinnedRow?.tree === "Pinned in Research", show(pinnedRow));
	// Pin by drag: onto the pinned list's end.
	await sb.drag({ re: "^QA Golf$" }, { re: "^QA Foxtrot$" }, 0.9, "[role=treeitem]");
	st = await until(async () => {
		const now = await sb.state();
		return pinnedLines(now, spaceNamed(now, "Research")?.pinned ?? []).includes("0:QA Golf") ? now : null;
	}, 5000);
	check(
		"dragging an open tab under a pinned one pins it",
		st,
		show(pinnedLines(st ?? (await sb.state()), spaceNamed(st ?? (await sb.state()), "Research")?.pinned ?? [])),
	);
	await step("pinned-two");
	// Unpin.
	await sb.click("QA Golf", { role: "[role=treeitem]", button: "right" });
	await sb.click("Unpin", { role: "[role=menuitem]" });
	st = await until(async () => {
		const now = await sb.state();
		return openTitles(now, "Research").includes("QA Golf") ? now : null;
	}, 5000);
	check("Unpin puts it back in the open tabs", st, show(openTitles(st ?? (await sb.state()), "Research")));

	// Folders two deep: a folder from the empty space's menu, renamed, with one inside it, holding Foxtrot.
	const empty = await sb.box({ re: "^Open tabs in Research$" }, "[role=tree]");
	if (empty) {
		await sb.mouse("mouseMoved", empty.x, empty.bottom + 40);
		await sb.mouse("mousePressed", empty.x, empty.bottom + 40, "right");
		await sb.mouse("mouseReleased", empty.x, empty.bottom + 40, "right");
	}
	await sb.click("New folder", { role: "[role=menuitem]" });
	const naming = await until(() => sb.has("Folder name"), 4000);
	check("New folder asks for its name", naming, naming ? "name field focused" : "no name field");
	await sb.run(`(() => { const i = window.__qa.find("Folder name"); i.focus(); i.select(); return true; })()`);
	await sb.type("Reading");
	await sb.key("Enter");
	await sb.click("Reading", { role: "[role=treeitem]", button: "right" });
	await sb.click("New folder inside", { role: "[role=menuitem]" });
	await until(() => sb.has("Folder name"), 4000);
	await sb.run(`(() => { const i = window.__qa.find("Folder name"); i.focus(); i.select(); return true; })()`);
	await sb.type("Deep");
	await sb.key("Enter");
	await sb.drag({ re: "^QA Foxtrot$" }, { re: "^Deep$" }, 0.5, "[role=treeitem]");
	st = await until(async () => {
		const now = await sb.state();
		const lines = pinnedLines(now, spaceNamed(now, "Research")?.pinned ?? []);
		return lines.includes("0:[Reading]") && lines.includes("1:[Deep]") && lines.includes("2:QA Foxtrot") ? now : null;
	}, 5000);
	check(
		"folders nest two deep and take a tab",
		st,
		show(pinnedLines(st ?? (await sb.state()), spaceNamed(st ?? (await sb.state()), "Research")?.pinned ?? [])),
	);
	await step("folders");
	// Rename by the menu, collapse by a click.
	await sb.click("Reading", { role: "[role=treeitem]", button: "right" });
	await sb.click("Rename", { role: "[role=menuitem]" });
	await until(() => sb.has("Folder name"), 4000);
	await sb.run(`(() => { const i = window.__qa.find("Folder name"); i.focus(); i.select(); return true; })()`);
	await sb.type("Reading list");
	await sb.key("Enter");
	await sb.click("Reading list", { role: "[role=treeitem]" });
	st = await until(async () => {
		const now = await sb.state();
		return pinnedLines(now, spaceNamed(now, "Research")?.pinned ?? []).includes("0:[Reading list closed]") ? now : null;
	}, 5000);
	check(
		"Rename renames and a click folds the folder",
		st,
		show(pinnedLines(st ?? (await sb.state()), spaceNamed(st ?? (await sb.state()), "Research")?.pinned ?? [])),
	);
	const hidden = !(await sb.rows()).some((r) => r.label === "QA Foxtrot" || r.label === "Deep");
	check("a folded folder hides what's inside", hidden, (await sb.rows()).map((r) => r.label).join(" | "));
	await sb.click("Reading list", { role: "[role=treeitem]" });
	const unfolded = await until(async () => (await sb.rows()).some((r) => r.label === "QA Foxtrot"), 3000);
	check("a click unfolds it again, inner folder and all", unfolded, (await sb.rows()).map((r) => r.label).join(" | "));

	// Unloading a pinned tab: the row stays, the browser tab goes; a click loads it again with its icon.
	await sb.click("QA Foxtrot", { role: "[role=treeitem]" });
	await until(async () => (await sb.tabs()).find((t) => t.active)?.title === "QA Foxtrot", 5000);
	await sb.click("QA Foxtrot", { role: "[role=treeitem]", button: "right" });
	await sb.click("Unload tab", { role: "[role=menuitem]" });
	const unloaded = await until(async () => !(await sb.tabs()).some((t) => t.title === "QA Foxtrot"), 5000);
	check("Unload tab closes the browser tab", unloaded, show((await sb.tabs()).map((t) => t.title)));
	check(
		"but the pinned row stays",
		(await sb.rows()).some((r) => r.label === "QA Foxtrot"),
		"row there",
	);
	await step("unloaded");
	await sb.click("QA Foxtrot", { role: "[role=treeitem]" });
	const reloaded = await until(
		async () => (await sb.tabs()).find((t) => t.title === "QA Foxtrot" && t.active && !t.loading),
		8000,
	);
	check(
		"clicking it loads it again as the browser's tab",
		reloaded,
		show((await sb.tabs()).map((t) => [t.title, t.active])),
	);
	const icon = await until(
		() =>
			sb.run(
				`(() => { const row = window.__qa.find("QA Foxtrot", "[role=treeitem]"); const img = row?.querySelector(".fav img"); return img?.getAttribute("src")?.startsWith("data:image/") ? img.getAttribute("src").slice(0, 30) : null; })()`,
			),
		6000,
	);
	check("with its own icon on the row", icon, show(icon));
	await step("reloaded");

	// Essentials: from the menu and by a drag; they show in every space.
	await sb.click("QA Golf", { role: "[role=treeitem]", button: "right" });
	await sb.click("Add to Essentials", { role: "[role=menuitem]" });
	st = await until(async () => {
		const now = await sb.state();
		return now.essentials.some((id) => now.tabs[id]?.title === "QA Golf") ? now : null;
	}, 5000);
	check("Add to Essentials adds it", st, show((st ?? (await sb.state())).essentials));
	await sb.drag({ re: "^QA Hotel$" }, "QA Golf", 0.5, "[role=listitem]");
	st = await until(async () => {
		const now = await sb.state();
		return now.essentials.some((id) => now.tabs[id]?.title === "QA Hotel") ? now : null;
	}, 5000);
	const withHotel = st ?? (await sb.state());
	check(
		"dragging a tab onto Essentials adds it",
		st,
		show(withHotel.essentials.map((id) => withHotel.tabs[id]?.title)),
	);
	await sb.key("2", { ctrl: true });
	await until(async () => shownSpace(await sb.state())?.name === "Play", 5000);
	const tiles = await sb.names("[role=listitem]");
	check(
		"Essentials stay when switching spaces",
		tiles.includes("QA Golf") && tiles.includes("QA Hotel"),
		tiles.join(", "),
	);
	await step("essentials-in-play", true);
	await sb.key("1", { ctrl: true });
	await until(async () => shownSpace(await sb.state())?.name === "Research", 5000);
}

async function extensions() {
	const sb = ctx.sidebar;
	await inResearch();
	const installed = await until(async () => {
		const list = await sb.extensions();
		return Array.isArray(list) && list.some((x) => x.name === QA_EXTENSION) && list.some((x) => x.id === UBLOCK)
			? list
			: null;
	}, 10000);
	check(
		"getExtensions has uBlock Origin and the QA extension",
		installed,
		show((await sb.extensions()).map?.((x) => [x.name, x.pinned])),
	);
	await sb.click("Extensions");
	const listed = await until(async () => {
		const names = await sb.names("button");
		return names.includes(`Unpin uBlock Origin`) || names.includes("Pin uBlock Origin") ? names : null;
	}, 5000);
	const panel = (listed ?? []).filter((n) => /^(Pin|Unpin) /.test(n));
	check(
		"the Extensions panel lists both",
		panel.some((n) => n.endsWith("uBlock Origin")) && panel.some((n) => n.endsWith(QA_EXTENSION)),
		panel.join(", "),
	);
	await step("extensions-panel");
	// Pin the QA extension: its icon joins the address field next to uBlock's.
	if ((listed ?? []).includes(`Pin ${QA_EXTENSION}`)) await sb.click(`Pin ${QA_EXTENSION}`);
	await sb.key("Escape");
	const pill = await until(async () => {
		const names = await sb.names(".url button");
		return names.includes(QA_EXTENSION) ? names : null;
	}, 5000);
	check("pinning puts its icon in the address field", pill, show(await sb.names(".url button")));
	const order = (pill ?? []).filter((n) => n === QA_EXTENSION || n === "uBlock Origin");
	note("pinned icon order", order.join(", "));
	const pinnedInBrowser = await until(
		async () => (await sb.extensions()).find((x) => x.name === QA_EXTENSION)?.pinned,
		5000,
	);
	check(
		"and the browser has it pinned",
		pinnedInBrowser,
		show((await sb.extensions()).find((x) => x.name === QA_EXTENSION)),
	);
	const badge = await until(async () => (await sb.extensions()).find((x) => x.name === QA_EXTENSION)?.badge, 5000);
	check("its badge text reaches the sidebar", badge === "7", show(badge));
	const drawn = await sb.run(
		`(() => { const b = window.__qa.find(${JSON.stringify(QA_EXTENSION)}, ".url button"); return b ? { title: b.title, text: b.textContent.trim() } : null; })()`,
	);
	check("and shows on its icon", drawn && (drawn.text.includes("7") || drawn.title.includes("7")), show(drawn));
	await step("two-pinned", true);
	// Clicking the pinned icon opens its popup.
	const before = new Set((await ctx.browser.targets()).map((t) => t.id));
	await sb.click(QA_EXTENSION, { role: ".url button" });
	const popup = await until(
		async () =>
			(await ctx.browser.targets()).find(
				(t) => !before.has(t.id) && /^chrome-extension:\/\/[a-p]{32}\/popup\.html/.test(t.url),
			),
		6000,
	);
	check(
		"clicking it opens its popup",
		popup,
		popup ? popup.url : show((await ctx.browser.targets()).map((t) => t.url)),
	);
	if (popup) {
		const p = await connect(popup.webSocketDebuggerUrl);
		await evaluate(p, "(window.close(), true)").catch(() => {});
		p.close();
	}
	const ublockBefore = new Set((await ctx.browser.targets()).map((t) => t.id));
	await sb.click("uBlock Origin", { role: ".url button" });
	const ublockPopup = await until(
		async () =>
			(await ctx.browser.targets()).find(
				(t) => !ublockBefore.has(t.id) && t.url.startsWith(`chrome-extension://${UBLOCK}/`),
			),
		6000,
	);
	check("uBlock Origin's icon opens its popup", ublockPopup, ublockPopup ? ublockPopup.url : "no new uBlock page");
	if (ublockPopup) {
		const p = await connect(ublockPopup.webSocketDebuggerUrl);
		await evaluate(p, "(window.close(), true)").catch(() => {});
		p.close();
	}
	// Unpin uBlock from the panel: its icon leaves the address field.
	await sb.click("Extensions");
	await sb.click("Unpin uBlock Origin");
	await sb.key("Escape");
	const unpinned = await until(async () => !(await sb.names(".url button")).includes("uBlock Origin"), 5000);
	check("unpinning takes the icon out of the address field", unpinned, show(await sb.names(".url button")));
	const browserUnpinned = await until(
		async () => (await sb.extensions()).find((x) => x.id === UBLOCK)?.pinned === false,
		5000,
	);
	check("and the browser has it unpinned", browserUnpinned, show((await sb.extensions()).find((x) => x.id === UBLOCK)));
	await step("ublock-unpinned");
}

async function panels() {
	const sb = ctx.sidebar;
	await inResearch();
	// Downloads: a real one into the profile.
	await ctx.browser.browserSession.call("Browser.setDownloadBehavior", {
		behavior: "allow",
		downloadPath: join(profile, "downloads"),
	});
	const shownTab = (await sb.tabs()).find((t) => t.active);
	if (shownTab) await sb.tell("navigateTab", shownTab.id, `http://${ctx.host}/qa-download.txt`);
	const done = await until(async () => {
		/** @type {{ name: string, state: string }[]} */
		const list = await sb.ask("getDownloads");
		return Array.isArray(list) && list.find((d) => d.name === "qa-download.txt" && d.state === "complete");
	}, 10000);
	check("a download arrives", done, show(done));
	await sb.click("Downloads");
	const listed = await until(async () => (await sb.text()).includes("qa-download.txt"), 5000);
	check("the Downloads panel lists it", listed, listed ? "qa-download.txt" : "not in the panel");
	await step("downloads-panel");
	await sb.key("Escape");

	// Media: a page plays; from another tab, the card plays, pauses, skips and mutes it.
	await openBar("New tab");
	await barPick(`${ctx.host}/audio`, { re: `^Go to ${ctx.host.replace(/\./g, "\\.")}/audio$` });
	const audioTab = await until(async () => (await sb.tabs()).find((t) => t.title === "QA Tune" && !t.loading), 8000);
	const audio = await pageOf(`http://${ctx.host}/audio`);
	if (!audioTab || !audio) {
		check("the audio page opens", false, "no QA Tune tab");
		return;
	}
	await evaluate(audio, `document.getElementById("a").play().then(() => true)`, true);
	await sb
		.click("QA Alpha", { role: "[role=treeitem]" })
		.catch(() => sb.click({ re: "^QA (Echo|Alpha)$" }, { role: "[role=treeitem]" }));
	const card = await until(() => sb.has({ re: "^Now playing: QA Tune" }, "section[aria-label]"), 10000);
	check("the media card shows what's playing in another tab", card, card ? "Now playing: QA Tune" : "no card");
	await step("media-card");
	/** @param {boolean} want */
	const playing = (want) =>
		until(async () => {
			/** @type {{ tabId: number, playing: boolean }[]} */
			const media = await sb.ask("getMedia");
			return Array.isArray(media) && media.some((m) => m.tabId === audioTab.id && m.playing === want);
		}, 4000);
	await sb.click("Pause");
	check("Pause pauses it", await playing(false), "getMedia playing=false");
	await sb.click("Play");
	check("Play plays it again", await playing(true), "getMedia playing=true");
	await sb.click("Next track");
	const next = await until(() => evaluate(audio, `document.body.dataset.next === "1"`), 4000);
	check("Next track reaches the page's handler", next, `next=${await evaluate(audio, "document.body.dataset.next")}`);
	await sb.click("Previous track");
	const previous = await until(() => evaluate(audio, `document.body.dataset.previous === "1"`), 4000);
	check(
		"Previous track reaches the page's handler",
		previous,
		`previous=${await evaluate(audio, "document.body.dataset.previous")}`,
	);
	await sb.click("Mute");
	const muted = await until(async () => (await sb.tabs()).find((t) => t.id === audioTab.id)?.muted, 4000);
	check("Mute mutes its tab", muted, `muted=${muted}`);
	await sb.click("Unmute");
	await evaluate(audio, `(document.getElementById("a").pause(), true)`);
	audio.close();

	// Archive and Search panels.
	await sb.click("More");
	await sb.click({ re: "^Archived tabs \\(\\d+\\)$" }, { role: "[role=menuitem]" });
	const archive = await until(() => sb.has("Archived tabs", "[role=dialog]"), 4000);
	check(
		"the Archive panel opens",
		archive,
		archive ? ((await sb.text()).match(/Archived tabs[^.]*\.?/)?.[0] ?? "open") : "no panel",
	);
	await step("archive-panel");
	await sb.key("Escape");
	await sb.click("More");
	await sb.click("Search the sidebar", { role: "[role=menuitem]" });
	await until(() => sb.has("Search the sidebar", "input"), 4000);
	await sb.run(`(window.__qa.find("Search the sidebar", "input").focus(), true)`);
	await sb.type("QA Golf");
	const found = await until(async () => (await sb.names("[role=option]")).some((n) => n.includes("QA Golf")), 4000);
	check("Search the sidebar finds a tab", found, show(await sb.names("[role=option]")));
	await step("search-panel");
	await sb.key("Escape");
}

async function settings() {
	const sb = ctx.sidebar;
	await inResearch();
	await sb.click("More");
	await sb.click("Settings", { role: "[role=menuitem]" });
	const target = await until(
		async () => (await ctx.browser.targets()).find((t) => t.url.startsWith("chrome://loka-settings")),
		6000,
	);
	if (!check("More > Settings opens chrome://loka-settings", target, target?.url ?? "no settings tab")) return;
	const page = driver(await connect(/** @type {Target} */ (target).webSocketDebuggerUrl));
	await page.s.call("Runtime.enable");
	if (checkoutWebui) await useCheckoutWebui(page.s, "settings");
	await until(() => page.has("Sound effects", "[role=switch]"), 8000);
	const dir = join(evidence, flow);
	mkdirSync(dir, { recursive: true });
	await page.picture(join(dir, "00-settings.png"));

	// Sound effects.
	const soundBefore = (await sb.ui()).sound ?? true;
	await page.click("Sound effects", { role: "[role=switch]" });
	const soundSaved = await until(async () => (await sb.ui()).sound === !soundBefore, 4000);
	check("Sound effects switches the saved setting", soundSaved, `sound ${soundBefore} -> ${(await sb.ui()).sound}`);
	const sidebarSound = await until(
		() => sb.run(`document.querySelector("loka-panel").ui.sound === ${!soundBefore}`),
		4000,
	);
	check(
		"and the sidebar takes it",
		sidebarSound,
		`sidebar ui.sound=${await sb.run(`document.querySelector("loka-panel").ui.sound`)}`,
	);
	await page.click("Sound effects", { role: "[role=switch]" });

	// Keep the sidebar open: off lets the browser slide it away.
	await page.click("Keep the sidebar open", { role: "[role=switch]" });
	const unpinned = await until(async () => (await sb.ask("getSidebarPinned")) === false, 4000);
	check(
		"Keep the sidebar open off unpins the sidebar in the browser",
		unpinned,
		`getSidebarPinned=${await sb.ask("getSidebarPinned")}`,
	);
	const floating = await until(
		() => sb.run(`Boolean(document.querySelector("loka-panel").shadowRoot.querySelector(".window.floating"))`),
		4000,
	);
	check("and the sidebar shows itself floating", floating, `floating=${floating}`);
	windows(ctx.browser.pid, join(dir, "01-sidebar-unpinned.window.png"), " - Loka");
	await page.click("Keep the sidebar open", { role: "[role=switch]" });
	const repinned = await until(async () => (await sb.ask("getSidebarPinned")) === true, 4000);
	check("and on pins it back", repinned, `getSidebarPinned=${await sb.ask("getSidebarPinned")}`);

	// A space's light or dark reaches its pages.
	const shown = shownSpace(await sb.state())?.name ?? "";
	for (const scheme of ["Dark", "Light"]) {
		await page
			.click(scheme, { role: `[role=radiogroup][aria-label="${shown}: light or dark"] [role=radio]` })
			.catch(async () => {
				const group = await page.box(`${shown}: light or dark`, "[role=radiogroup]");
				if (!group) throw new Error(`no light or dark choice for ${shown}`);
			});
		const want = scheme.toLowerCase();
		const saved = await until(async () => shownSpace(await sb.state())?.scheme === want, 4000);
		const follows = await until(() => evaluate(page.s, `matchMedia("(prefers-color-scheme: ${want})").matches`), 5000);
		check(
			`${shown}: ${scheme} saves and reaches pages`,
			saved && follows,
			`scheme ${shownSpace(await sb.state())?.scheme}, page ${want} ${follows}`,
		);
	}
	await page.click("System", { role: `[role=radio]` }).catch(() => {});

	// Archive hours.
	await page.run(
		`(() => { const s = window.__qa.find("Archive open tabs", "select"); s.value = s.options[1].value; s.dispatchEvent(new Event("change", { bubbles: true })); return s.value; })()`,
	);
	const hours = await until(async () => (await sb.ui()).archiveAfterHours, 4000);
	check("Archive open tabs saves its hours", typeof hours === "number" && hours > 0, `archiveAfterHours=${hours}`);

	// Extension pins in Settings and in the sidebar are the same.
	await page.click("Pin uBlock Origin");
	const pillBack = await until(async () => (await sb.names(".url button")).includes("uBlock Origin"), 5000);
	check("pinning in Settings puts it in the sidebar's address field", pillBack, show(await sb.names(".url button")));
	await page.picture(join(dir, "02-settings-after.png"));
	page.s.close();

	// History: search, delete one, clear today.
	await sb.key("h", { ctrl: true });
	const historyTarget = await until(
		async () => (await ctx.browser.targets()).find((t) => t.url.startsWith("chrome://history")),
		6000,
	);
	if (!check("Ctrl+H opens chrome://history", historyTarget, historyTarget?.url ?? "no history tab")) return;
	const history = driver(await connect(/** @type {Target} */ (historyTarget).webSocketDebuggerUrl));
	if (checkoutWebui) await useCheckoutWebui(history.s, "history");
	await until(() => history.has("Search history", "input"), 8000);
	await history.run(`(window.__qa.find("Search history", "input").focus(), true)`);
	await history.type("QA Bravo");
	const hits = await until(async () => {
		const names = await history.names("[role=checkbox]");
		return names.some((n) => n.includes("QA Bravo")) ? names : null;
	}, 6000);
	check("History search finds a visited page", hits, show(hits ?? (await history.names("[role=checkbox]"))));
	await history.picture(join(dir, "03-history-search.png"));
	await history.click(
		/** @type {string} */ (
			(await history.names("button")).find((n) => n.startsWith("Remove QA Bravo")) ?? "Remove QA Bravo from history"
		),
	);
	const removed = await until(
		async () => !(await history.names("[role=checkbox]")).some((n) => n.includes("QA Bravo")),
		5000,
	);
	check("Remove from history deletes it", removed, show(await history.names("[role=checkbox]")));
	await history.run(
		`(() => { const i = window.__qa.find("Search history", "input"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`,
	);
	await history.click("Clear history");
	await history.click("Today", { role: "[role=menuitem]" });
	await history.click("Clear history", { role: "[role=alertdialog] button" });
	const cleared = await until(async () => (await history.names("[role=checkbox]")).length === 0, 6000);
	check("Clear history: today empties it", cleared, `${(await history.names("[role=checkbox]")).length} left`);
	await history.picture(join(dir, "04-history-cleared.png"));
	history.s.close();
}

/** What a restart has to keep, read from the saved spaces and the browser. */
async function snapshot() {
	const sb = ctx.sidebar;
	const st = await sb.state();
	return {
		spaces: st.spaces.map((x) => `${x.name}:${x.hue}:${x.planet}:${x.scheme}`),
		pinned: st.spaces.map((x) => `${x.name}=${pinnedLines(st, x.pinned).join(",")}`),
		essentials: st.essentials.map((id) => st.tabs[id]?.title),
		extensions: (await sb.extensions())
			.filter((x) => x.pinned)
			.map((x) => x.name)
			.sort(),
		ui: await sb.ui(),
	};
}

async function restart() {
	// On startup: Continue where you left off (what chrome://settings/onStartup's choice sets), so the window's tabs
	// come back and the sidebar has to take them in again.
	const { targetId } = await ctx.browser.browserSession.call("Target.createTarget", {
		url: "chrome://settings/onStartup",
	});
	const settingsTab = await until(async () => (await ctx.browser.targets()).find((t) => t.id === targetId), 5000);
	if (settingsTab) {
		const s = await connect(settingsTab.webSocketDebuggerUrl);
		await until(() => evaluate(s, `Boolean(chrome.settingsPrivate)`), 5000);
		const set = await evaluate(
			s,
			`new Promise((done) => chrome.settingsPrivate.setPref("session.restore_on_startup", 1, "", done))`,
		);
		check("Continue where you left off is on", set, show(set));
		s.close();
		await ctx.browser.browserSession.call("Target.closeTarget", { targetId });
	}
	await until(async () => !(await ctx.sidebar.tabs()).some((t) => t.url.startsWith("chrome://settings")), 5000);
	const before = await snapshot();
	const openBefore = (await ctx.sidebar.tabs()).map((t) => t.url).filter((u) => u.startsWith("http"));
	const stBefore = await ctx.sidebar.state();
	/** @type {Record<string, string>} */
	const homesBefore = Object.fromEntries(openBefore.map((url) => [url, homeIn(stBefore, url)]));
	writeFileSync(join(evidence, "restart-before.json"), JSON.stringify({ before, homesBefore }, null, 2));
	ctx.sidebar.s.close();
	bar?.s.close();
	bar = null;
	const quitted = await quit(ctx.browser);
	check(
		"the browser quits",
		quitted.ended,
		quitted.ended
			? `all ${quitted.tree} processes ended ${quitted.waited} ms after Browser.close`
			: `${quitted.killed} of ${quitted.tree} still running after ${quitted.waited} ms (${quitted.left.join(", ")}), stopped by pid`,
	);
	ctx.browser = await launch();
	ctx.sidebar = await attachSidebar(ctx.browser);
	if (checkoutWebui) await checkoutCommandBar();
	// What the restart brought back, once the sidebar has taken in the restored tabs (or 15 s have passed).
	const keys = /** @type {(keyof typeof before)[]} */ (["spaces", "pinned", "essentials", "extensions", "ui"]);
	const read = async () => {
		const [after, tabsNow, st] = await Promise.all([snapshot(), ctx.sidebar.tabs(), ctx.sidebar.state()]);
		const reattached = tabsNow.filter((t) => t.url.startsWith("http"));
		const homes = reattached.map((t) => `${t.title}: ${homeIn(st, t.url)}`);
		const wanted = reattached.map((t) => `${t.title}: ${homesBefore[t.url] ?? "?"}`);
		const restored = show(reattached.map((t) => t.url).sort()) === show([...openBefore].sort());
		const same = keys.every((key) => show(after[key]) === show(before[key]));
		return { after, reattached, homes, wanted, restored, settled: same && restored && show(homes) === show(wanted) };
	};
	const back =
		(await until(async () => {
			const now = await read();
			return now.settled ? now : null;
		}, 15000)) ?? (await read());
	const { after, reattached, homes, wanted, restored } = back;
	writeFileSync(join(evidence, "restart-after.json"), JSON.stringify(after, null, 2));
	for (const key of keys) check(`${key} survive a restart`, show(after[key]) === show(before[key]), show(after[key]));
	check(
		"the browser restores the window's web tabs",
		restored,
		`before ${openBefore.length}, after ${reattached.length}: ${reattached.map((t) => t.title).join(", ")}`,
	);
	check("each one is back in its own space", show(homes) === show(wanted), homes.join(", "));
	await step("after-restart", true);
}

// ---- main ---------------------------------------------------------------------------------------------------------

/** What a flow needs from earlier ones besides first run's spaces: the QA pages that tabs opens. */
const NEEDS = { "4-states": ["3-tabs"], "5-pinning": ["3-tabs"], "7-panels": ["3-tabs"], "8-settings": ["3-tabs"] };

async function main() {
	/** @type {[string, () => Promise<unknown>][]} */
	const all = [
		["1-first-run", firstRun],
		["2-spaces", spaces],
		["3-tabs", tabs],
		["4-states", states],
		["5-pinning", pinning],
		["6-extensions", extensions],
		["7-panels", panels],
		["8-settings", settings],
		["9-restart", restart],
	];
	// --only <flow>[,<flow>] runs those flows after the ones they build on (first run always; restart needs them all).
	const onlyAt = process.argv.indexOf("--only");
	const asked = onlyAt > 0 ? (process.argv[onlyAt + 1] ?? "").split(",") : [];
	const names = all.map(([n]) => n);
	const wanted = asked.map((a) => names.find((n) => n === a || n.slice(2) === a));
	if (wanted.some((w) => !w) || (onlyAt > 0 && !wanted.length)) {
		console.error(`--only takes one or more of: ${names.map((n) => n.slice(2)).join(", ")}`);
		process.exit(1);
	}
	const keep =
		!wanted.length || wanted.includes("9-restart")
			? names
			: ["1-first-run", ...wanted.flatMap((w) => [...(NEEDS[/** @type {keyof typeof NEEDS} */ (w)] ?? []), String(w)])];
	const flows = all.filter(([n]) => keep.includes(n));
	if (!existsSync(chrome)) {
		console.error(`No browser at ${chrome}. Build it (bun run browser:build) or set LOKA_CHROME.`);
		process.exit(2);
	}
	refuseWhileBuilding(chrome);
	mkdirSync(evidence, { recursive: true });
	mkdirSync(profile, { recursive: true });
	writeExtension();
	log.stream = createWriteStream(join(evidence, "chrome.log"));
	const { server, host } = await startPages();
	try {
		ctx = { browser: await launch(), sidebar: /** @type {Sidebar} */ (/** @type {unknown} */ (null)), host };
		for (const [name, run] of flows) {
			flow = name;
			stepNumber = 0;
			console.log(`\n== ${name}`);
			try {
				const ok = await run();
				if (ok === false) break;
			} catch (e) {
				check("flow finished", false, e instanceof Error ? (e.stack ?? e.message) : String(e));
				if (!ctx.sidebar) break;
				// What the sidebar and the browser had when it stopped.
				const dir = join(evidence, flow);
				mkdirSync(dir, { recursive: true });
				await ctx.sidebar.picture(join(dir, "failed.png")).catch(() => false);
				const [rows, browserTabs, groups, st] = await Promise.all([
					ctx.sidebar.rows(),
					ctx.sidebar.tabs(),
					ctx.sidebar.groups(),
					ctx.sidebar.state(),
				]).catch(() => []);
				writeFileSync(join(dir, "failed.json"), JSON.stringify({ rows, browserTabs, groups, state: st }, null, 2));
				await ctx.sidebar.key("Escape").catch(() => {});
				await ctx.sidebar.away().catch(() => {});
			}
		}
	} finally {
		flow = "cleanup";
		const stopped = ctx?.browser ? await quit(ctx.browser) : { ended: true, tree: 0, killed: 0 };
		server.close();
		log.stream?.end();
		await sleep(800);
		for (const dir of [profile, extensionDir])
			rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
		const gone = !existsSync(profile) && !existsSync(extensionDir);
		check(
			"cleanup",
			gone && (stopped.ended || stopped.killed > 0),
			`${stopped.killed} of ${stopped.tree} processes needed taskkill; profile ${gone ? "deleted" : "still there"}`,
		);
		writeFileSync(join(evidence, "checks.json"), JSON.stringify({ chrome, webui, checks, notes }, null, 2));
	}
	const failed = checks.filter((c) => !c.ok);
	const byFlow = [...new Set(checks.map((c) => c.flow))].map((f) => {
		const mine = checks.filter((c) => c.flow === f);
		return `${mine.every((c) => c.ok) ? "PASS" : "FAIL"} ${f} (${mine.filter((c) => c.ok).length}/${mine.length})`;
	});
	console.log(
		`\n${byFlow.join("\n")}\n\n${failed.length ? "FAIL" : "PASS"}: ${checks.length - failed.length}/${checks.length} checks (webui: ${webui}). Evidence: ${evidence}`,
	);
	process.exit(failed.length ? 1 : 0);
}

await main();
