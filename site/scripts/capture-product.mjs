// Takes the product screenshots the site shows, from the sidebar prototype, at 2x.
//
//   bun run build                                (repo root: builds the prototype into prototype/dist)
//   node site/scripts/capture-product.mjs        (writes site/public/product/*.png)
//
// Run it with node, not bun: Playwright's browser launch hangs under bun on Windows.
// The browser is served the built files straight from disk, so no dev server runs alongside it.
// Each shot starts from the seed data (three spaces, folders two deep) and gets there with keys and clicks.

import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const SITE = resolve(import.meta.dirname, "..");
const ROOT = resolve(SITE, "..");
const DIST = join(ROOT, "prototype", "dist");
const OUT = join(SITE, "public", "product");
if (!existsSync(join(DIST, "index.html"))) throw new Error("No prototype/dist. Run `bun run build` in the repo root.");
const url = "http://loka.prototype/";

/** The sidebar's box at the default width, for crops. */
const SIDEBAR = { x: 0, y: 0, width: 272, height: 800 };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await context.route(`${url}**`, (route) => {
	const path = new URL(route.request().url()).pathname;
	const file = join(DIST, path === "/" ? "index.html" : path);
	return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
});
const page = await context.newPage();
/** @type {string[]} */
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

/** @param {{ tour?: boolean }} [options] */
async function fresh({ tour = false } = {}) {
	await page.goto(url, { waitUntil: "networkidle" });
	await page.evaluate((showTour) => {
		localStorage.removeItem("loka.state.v1");
		if (showTour) localStorage.removeItem("loka.ui.v1");
		else localStorage.setItem("loka.ui.v1", JSON.stringify({ onboarded: true }));
	}, tour);
	await page.goto(url, { waitUntil: "networkidle" });
	if (!tour) await page.locator("loka-sidebar").getByRole("tree").first().waitFor();
}

/**
 * Waits for every running animation in the window (space switches, panels, the tour) to finish. Endless ones, like
 * the playing-music bars, never do, so they don't count.
 */
async function settled() {
	await page.waitForFunction(() => {
		const all = (/** @type {Document | ShadowRoot} */ root) => {
			let n = root
				.getAnimations()
				.filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY).length;
			for (const el of root.querySelectorAll("*")) if (el.shadowRoot) n += all(el.shadowRoot);
			return n;
		};
		return all(document) === 0;
	});
	await page.waitForTimeout(150);
}

/** @param {string} name @param {{ x: number, y: number, width: number, height: number }} [clip] */
async function shot(name, clip) {
	await settled();
	await page.screenshot({ path: join(OUT, `${name}.png`), clip });
	console.log(`wrote ${name}.png`);
}

const sidebar = page.locator("loka-sidebar");

// The three spaces, whole window and sidebar only.
await fresh();
await shot("build");
await shot("sidebar-build", SIDEBAR);
await page.keyboard.press("Control+2");
await shot("school");
await shot("sidebar-school", SIDEBAR);
await page.keyboard.press("Control+3");
await shot("home");
await shot("sidebar-home", SIDEBAR);

// Folders: Build's pinned tree, two folders deep.
await page.keyboard.press("Control+1");
await shot("folders", { x: 0, y: 150, width: 272, height: 190 });

// The command bar finding a tab in another space.
await page.keyboard.press("Control+k");
await page.getByRole("combobox", { name: "Search or enter address" }).fill("canvas");
await shot("command-bar", { x: 312, y: 106, width: 656, height: 198 });
await page.keyboard.press("Escape");

// Sidebar search reaching into a closed folder in School.
await page.keyboard.press("Control+Shift+F");
await sidebar.getByRole("combobox", { name: "Search the sidebar" }).fill("minecraft");
await shot("search", { x: 0, y: 0, width: 272, height: 180 });
await page.keyboard.press("Escape");

// Media controls for the Lo-fi tab playing in Home, seen from Build.
await sidebar.getByRole("region", { name: "Now playing: Lo-fi beats" }).waitFor();
await shot("media", { x: 0, y: 600, width: 272, height: 200 });

// The archive: turned on in Settings, then its panel.
await fresh();
await sidebar.getByRole("button", { name: "More" }).click();
await sidebar.getByRole("menuitem", { name: "Settings", exact: true }).click();
await page
	.locator("loka-settings")
	.getByRole("combobox", { name: "Archive open tabs" })
	.selectOption({ label: "After a day" });
await sidebar.getByRole("button", { name: "More" }).click();
await sidebar.getByRole("menuitem", { name: "Archived tabs (2)", exact: true }).click();
await sidebar.getByRole("dialog", { name: "Archived tabs" }).waitFor();
await shot("archive", { x: 0, y: 0, width: 272, height: 250 });

// Import, as the first-run tour offers it, with the sample Chrome and Arc files from the verify skill.
await fresh({ tour: true });
const tour = page.getByRole("dialog", { name: "Welcome to Loka" });
await tour.getByRole("button", { name: "Get started" }).click();
const fixtures = join(ROOT, ".agents", "skills", "verify-loka", "fixtures");
for (const [button, file] of [
	["Import from Chrome", "Bookmarks"],
	["Import from Arc", "StorableSidebar.json"],
]) {
	const [chooser] = await Promise.all([
		page.waitForEvent("filechooser"),
		tour.getByRole("button", { name: button }).click(),
	]);
	await chooser.setFiles(join(fixtures, file));
}
await tour.getByText("Ready: 2 spaces, 3 pinned tabs").waitFor();
await shot("import");

await browser.close();
if (errors.length) throw new Error(`The prototype logged errors: ${errors.join(" | ")}`);
