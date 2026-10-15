// Playwright driver for the Loka sidebar prototype. Run recipes with node, not bun: Playwright's browser launch
// hangs under bun on Windows.
//
//   import { openLoka } from "./loka.mjs";
//   const loka = await openLoka("my-check");      // fresh seed data, evidence folder created
//   await loka.drag(loka.row("Hacker News"), loka.row("Docs"), "into");
//   console.log(await loka.outline());
//   await loka.proof("after-drag");                // screenshot + ARIA snapshot + outline JSON
//   await loka.close();                            // fails if the page logged errors

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

export const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

export function prototypePort() {
	if (process.env.PORT) return Number(process.env.PORT);
	try {
		const match = readFileSync(join(ROOT, ".env.local"), "utf8").match(/^PORT=(\d+)/m);
		if (match) return Number(match[1]);
	} catch {}
	throw new Error("No PORT in .env.local. Run `bun run setup` in this checkout first.");
}

function stamp() {
	return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/**
 * @param {string} runName names the evidence folder: .agents/verify-runs/<time>-<runName>/
 * @param {{ fresh?: boolean, onboarding?: boolean, width?: number, height?: number }} [options]
 *   fresh: reset to the seed data and default window prefs first. onboarding: also show the first-run tour, which
 *   is otherwise marked done so it doesn't cover the sidebar.
 */
export async function openLoka(runName, { fresh = true, onboarding = false, width = 1280, height = 800 } = {}) {
	const url = `http://localhost:${prototypePort()}/`;
	const dir = join(ROOT, ".agents", "verify-runs", `${stamp()}-${runName}`);
	mkdirSync(dir, { recursive: true });

	const browser = await chromium.launch();
	const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
	const page = await context.newPage();
	/** @type {string[]} */
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

	await page.goto(url, { waitUntil: "networkidle" });
	if (fresh) {
		await page.evaluate((tour) => {
			localStorage.removeItem("loka.state.v1");
			if (tour) localStorage.removeItem("loka.ui.v1");
			else localStorage.setItem("loka.ui.v1", JSON.stringify({ onboarded: true }));
		}, onboarding);
		await page.goto(url, { waitUntil: "networkidle" });
	}
	const sidebar = page.locator("loka-sidebar");
	// With the tour showing, the sidebar is hidden underneath it until the tour ends.
	if (onboarding) await page.getByRole("dialog", { name: "Welcome to Loka" }).waitFor();
	else await sidebar.getByRole("tree").first().waitFor();

	/** Saved state, as the app wrote it to localStorage. */
	async function state() {
		return page.evaluate(() => JSON.parse(localStorage.getItem("loka.state.v1") ?? "null"));
	}

	/** Saved window prefs: sidebarWidth, sidebarSide, sidebarHidden, onboarded. */
	async function ui() {
		return page.evaluate(() => JSON.parse(localStorage.getItem("loka.ui.v1") ?? "null"));
	}

	return {
		page,
		sidebar,
		dir,
		url,

		/** A pinned or open row (tab or folder) in the visible space, by its visible text. @param {string} name */
		row: (name) => sidebar.getByRole("treeitem", { name }).first(),
		/** An Essentials tile, by tab title. @param {string} title */
		essential: (title) => sidebar.getByRole("listitem", { name: title, exact: true }),
		/** A neighbouring planet on the horizon switcher. @param {string} name */
		space: (name) => sidebar.getByRole("button", { name: new RegExp(`^${name} \\(Ctrl \\d\\)$`) }),
		/** A context-menu item, after a right-click. @param {string} name */
		menuItem: (name) => sidebar.getByRole("menuitem", { name, exact: true }),

		/**
		 * Drag the way a user does. zone picks where on the target: before (top edge), after (bottom edge) or
		 * into (the middle: inside a folder, or onto a tab to make a folder of both). Essentials tiles use left/right edges for before/after.
		 * @param {import("playwright").Locator} source @param {import("playwright").Locator} target
		 * @param {"before" | "after" | "into"} zone
		 */
		async drag(source, target, zone) {
			const box = await target.boundingBox();
			if (!box) throw new Error("drag target is not visible");
			const horizontal = (await target.getAttribute("role")) === "listitem";
			const edge = (/** @type {number} */ size) => (zone === "before" ? 3 : zone === "after" ? size - 3 : size / 2);
			const targetPosition = horizontal ? { x: edge(box.width), y: box.height / 2 } : { x: 60, y: edge(box.height) };
			await source.dragTo(target, { targetPosition });
			await page.waitForTimeout(150);
		},

		state,
		ui,

		/** The active space as readable lines: pinned tree as "depth:name", open tabs, essentials, active tab. */
		async outline() {
			const s = await state();
			const space = s.spaces.find((/** @type {{ id: string }} */ x) => x.id === s.activeSpaceId);
			const title = (/** @type {string} */ id) => s.tabs[id]?.title ?? `missing:${id}`;
			/** @param {any[]} nodes @param {number} depth @returns {string[]} */
			const walk = (nodes, depth) =>
				nodes.flatMap((n) =>
					n.kind === "folder"
						? [`${depth}:${n.name}${n.open ? "" : " (closed)"}`, ...walk(n.children, depth + 1)]
						: [`${depth}:${title(n.id)}`],
				);
			return {
				space: space.name,
				activeTab: space.activeTabId ? title(space.activeTabId) : null,
				essentials: s.essentials.map(title),
				pinned: walk(space.pinned, 0),
				open: space.open.map(title),
			};
		},

		/** Screenshot, ARIA snapshot of the window and the outline, saved as <name>.* in the evidence folder. @param {string} name */
		async proof(name) {
			await page.screenshot({ path: join(dir, `${name}.png`) });
			writeFileSync(join(dir, `${name}.aria.txt`), await page.locator("loka-app").ariaSnapshot());
			writeFileSync(join(dir, `${name}.outline.json`), JSON.stringify(await this.outline(), null, 2));
		},

		async close() {
			writeFileSync(join(dir, "console-errors.json"), JSON.stringify(errors, null, 2));
			await browser.close();
			if (errors.length) throw new Error(`The page logged errors: ${errors.join(" | ")}`);
		},
	};
}
