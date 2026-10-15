// Loads the built extension into Playwright's Chromium and drives it like a user, against real browser tabs.
//   bun run ext:build && node extension/test/e2e.mjs
// Needs the prototype's dev server running (its pages stand in for websites). Writes screenshots to
// .agents/verify-runs/<time>-extension/. Run with node: Playwright's browser launch hangs under bun on Windows.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DIST = join(ROOT, "extension", "dist");
const port = Number(readFileSync(join(ROOT, ".env.local"), "utf8").match(/^PORT=(\d+)/m)?.[1]);
const site = (name) => `http://localhost:${port}/?site=${name}`;
const dir = join(
	ROOT,
	".agents",
	"verify-runs",
	`${new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}-extension`,
);
mkdirSync(dir, { recursive: true });

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "loka-e2e-")), {
	channel: "chromium",
	headless: true,
	viewport: { width: 1280, height: 800 },
	args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
const errors = [];
try {
	const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
	const id = new URL(worker.url()).host;
	const ext = (page) => `chrome-extension://${id}/${page}`;

	// The tour opens on install; skip it, then open two "websites".
	const tour = context.pages().find((p) => p.url().includes("onboarding.html")) ?? (await context.waitForEvent("page"));
	await tour
		.getByRole("button", { name: "Skip" })
		.click()
		.catch(() => {});
	const a = await context.newPage();
	await a.goto(site("a"));
	const b = await context.newPage();
	await b.goto(site("b"));

	// The sidebar, opened as a tab so the test can see it (in the browser it's the side panel).
	const panel = await context.newPage();
	panel.on("pageerror", (e) => errors.push(e.message));
	await panel.goto(ext("sidebar.html"));
	const sidebar = panel.locator("loka-sidebar");
	await sidebar.getByRole("tree", { name: /Open tabs in Personal/ }).waitFor();
	const openRows = () =>
		sidebar
			.getByRole("tree", { name: /Open tabs in/ })
			.getByRole("treeitem")
			.allTextContents();
	await panel.waitForTimeout(800);
	const rows = await openRows();
	assert.ok(rows.filter((r) => r.includes("Loka prototype")).length >= 2, `the two open sites are listed: ${rows}`);
	await panel.screenshot({ path: join(dir, "01-sidebar-with-real-tabs.png") });

	// Real tabs are grouped by space, in a tab group named after the space.
	const groups = await panel.evaluate(() => chrome.tabGroups.query({}).then((g) => g.map((x) => x.title)));
	assert.deepEqual(groups, ["Personal"], "live tabs sit in the Personal tab group");

	// The command bar opens an address in a new real tab.
	const before = context.pages().length;
	await panel.keyboard.press("Control+k");
	await panel.getByRole("combobox", { name: "Search or enter address" }).fill(site("c"));
	await panel.keyboard.press("Enter");
	await panel.waitForTimeout(1200);
	assert.equal(context.pages().length, before + 1, "a new browser tab opened");

	// A new space: the editor creates it, Loka switches to it, and the old space's tab group folds away.
	await sidebar.getByRole("button", { name: "Spaces: Personal", exact: true }).click();
	await sidebar.getByRole("menuitem", { name: "New space" }).click();
	const editor = panel.getByRole("dialog", { name: "New space" });
	await editor.getByRole("textbox", { name: "Space name" }).fill("Work");
	await editor.getByRole("button", { name: "Create space" }).click();
	await panel.waitForTimeout(1200);
	await panel.screenshot({ path: join(dir, "02-new-space.png") });
	const folded = await panel.evaluate(() =>
		chrome.tabGroups.query({}).then((g) => g.map((x) => [x.title, x.collapsed])),
	);
	// Work had nothing to show, so it got a new tab (the command bar) in a Work group of its own.
	assert.deepEqual(
		folded,
		[
			["Personal", true],
			["Work", false],
		],
		"switching to Work folded Personal's tabs away and opened a tab in Work",
	);

	// Back to Personal; closing a tab from the sidebar closes the real tab.
	await panel.keyboard.press("Control+1");
	await panel.waitForTimeout(800);
	const count = context.pages().length;
	const row = sidebar
		.getByRole("tree", { name: /Open tabs in Personal/ })
		.getByRole("treeitem")
		.first();
	await row.hover();
	await row.getByRole("button", { name: /^Close / }).click();
	await panel.waitForTimeout(1000);
	assert.equal(context.pages().length, count - 1, "the real tab closed");
	await panel.screenshot({ path: join(dir, "03-after-close.png") });

	// The new tab page is the command bar on the night sky.
	const blank = await context.newPage();
	await blank.goto(ext("newtab.html"));
	await blank.getByRole("combobox", { name: "Search or enter address" }).waitFor();
	await blank.screenshot({ path: join(dir, "04-new-tab.png") });

	assert.deepEqual(errors, [], "no errors in the sidebar page");
	console.log(`PASS  extension  evidence: ${dir}`);
} catch (error) {
	console.log(`FAIL  extension  ${error instanceof Error ? error.message : error}\n      evidence: ${dir}`);
	process.exitCode = 1;
} finally {
	await context.close();
}
