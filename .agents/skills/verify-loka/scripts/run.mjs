// Runs the mapped feature recipes against the running prototype and saves evidence.
//   node .agents/skills/verify-loka/scripts/run.mjs <folders|spaces|tabs|essentials|export-import|all>
// Each recipe starts from fresh seed data, drives the UI the way a user does, asserts the saved state,
// and writes screenshots, ARIA snapshots and outlines to .agents/verify-runs/<time>-<feature>/.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openLoka } from "./loka.mjs";

/** @typedef {Awaited<ReturnType<typeof openLoka>>} Loka */

/** @type {Record<string, (loka: Loka) => Promise<void>>} */
const recipes = {
	async folders(loka) {
		await loka.proof("01-seed");
		await loka.drag(loka.row("Hacker News"), loka.row("Docs"), "into");
		let o = await loka.outline();
		assert.ok(o.pinned.includes("2:Hacker News"), "Hacker News is inside Docs");
		assert.ok(!o.open.includes("Hacker News"), "and gone from open tabs");
		await loka.proof("02-tab-into-nested-folder");

		await loka.row("Docs").click({ button: "right" });
		await loka.menuItem("New folder inside").click();
		await loka.page.keyboard.type("Patches");
		await loka.page.keyboard.press("Enter");
		o = await loka.outline();
		assert.ok(o.pinned.includes("2:Patches"), "subfolder created inside Docs");
		await loka.proof("03-subfolder");

		const before = (await loka.outline()).pinned;
		await loka.drag(loka.row("Loka"), loka.row("Lit docs"), "before");
		assert.deepEqual((await loka.outline()).pinned, before, "a folder can't move into its own subfolder");

		await loka.row("Docs").click();
		o = await loka.outline();
		assert.ok(o.pinned.includes("1:Docs (closed)"), "Docs closed");
		assert.equal(await loka.row("Lit docs").count(), 0, "closed folder hides its tabs");
		await loka.row("Docs").click();

		await loka.row("Docs").click({ button: "right" });
		await loka.menuItem("Ungroup (keep tabs)").click();
		o = await loka.outline();
		assert.ok(!o.pinned.some((l) => l.endsWith(":Docs")), "Docs is gone");
		assert.ok(o.pinned.includes("1:Lit docs") && o.pinned.includes("1:Patches"), "its contents moved up a level");
		await loka.proof("04-ungrouped");

		await loka.page.reload({ waitUntil: "networkidle" });
		assert.deepEqual((await loka.outline()).pinned, o.pinned, "the tree survives a reload");
	},

	async spaces(loka) {
		await loka.page.keyboard.press("Control+2");
		let o = await loka.outline();
		assert.equal(o.space, "School");
		assert.equal(o.activeTab, "Canvas: CSC 281", "School remembers its own active tab");
		await loka.proof("01-ctrl-2-school");

		await loka.space("Home").click();
		assert.equal((await loka.outline()).space, "Home");
		await loka.page.getByText("Nothing open in Home").waitFor();
		await loka.proof("02-home-empty-page");

		await loka.space("Build").click();
		assert.equal((await loka.outline()).activeTab, "imputnet/helium-windows", "Build's active tab came back");

		// Hovering a space button mid-drag switches to that space, like Arc.
		await loka.row("Zen Browser").dragTo(loka.space("School"));
		assert.equal((await loka.outline()).space, "School", "drag-hover switched space");

		await loka.sidebar.getByRole("button", { name: "New space", exact: true }).click();
		o = await loka.outline();
		assert.equal(o.space, "Space 4");
		assert.deepEqual([o.pinned, o.open], [[], []], "a new space starts empty");
		await loka.proof("03-new-space");
	},

	async tabs(loka) {
		await loka.page.keyboard.press("Control+k");
		await loka.page.getByRole("textbox", { name: "Search or enter address" }).fill("lit.dev/playground");
		await loka.page.keyboard.press("Enter");
		let o = await loka.outline();
		assert.equal(o.open[0], "lit.dev", "new tab opens at the top of open tabs");
		assert.equal(o.activeTab, "lit.dev");
		await loka.proof("01-ctrl-k-new-tab");

		await loka.row("Zen Browser").click();
		assert.equal((await loka.outline()).activeTab, "Zen Browser");
		await loka.sidebar.getByRole("button", { name: "Close Zen Browser" }).click();
		o = await loka.outline();
		assert.ok(!o.open.includes("Zen Browser"), "closed tab is gone");

		await loka.row("Arc: what we learned").click({ button: "right" });
		await loka.menuItem("Pin to space").click();
		o = await loka.outline();
		assert.equal(o.pinned.at(-1), "0:Arc: what we learned", "pinned at the end of the space's pinned list");
		await loka.proof("02-pinned");

		await loka.row("imputnet/helium-windows").click({ button: "right" });
		await loka.menuItem("Unload tab").click();
		o = await loka.outline();
		assert.ok(o.pinned.includes("1:imputnet/helium-windows"), "unloading a pinned tab keeps it pinned");

		await loka.sidebar.getByRole("button", { name: "Clear", exact: true }).click();
		assert.deepEqual((await loka.outline()).open, [], "Clear closes every open tab");
		await loka.proof("03-cleared");
	},

	async essentials(loka) {
		await loka.drag(loka.row("Hacker News"), loka.essential("YouTube"), "after");
		let o = await loka.outline();
		assert.equal(o.essentials.at(-1), "Hacker News", "dropped after YouTube");
		assert.ok(!o.open.includes("Hacker News"));
		await loka.proof("01-added");

		await loka.page.keyboard.press("Control+2");
		assert.ok((await loka.outline()).essentials.includes("Hacker News"), "Essentials are shared by every space");
		await loka.page.keyboard.press("Control+1");

		await loka.essential("Inbox").click({ button: "right" });
		await loka.menuItem("Remove from Essentials").click();
		o = await loka.outline();
		assert.ok(!o.essentials.includes("Inbox"));
		assert.equal(o.open[0], "Inbox", "removed essential lands at the top of open tabs");
		await loka.proof("02-removed");
	},

	async "export-import"(loka) {
		await loka.drag(loka.row("Hacker News"), loka.row("Docs"), "into");
		const exported = await loka.outline();
		await loka.sidebar.getByRole("button", { name: "More" }).click();
		const [download] = await Promise.all([
			loka.page.waitForEvent("download"),
			loka.menuItem("Export spaces (JSON)").click(),
		]);
		const file = join(loka.dir, "loka-spaces.json");
		await download.saveAs(file);
		assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), await loka.state(), "the file holds the saved state");

		await loka.sidebar.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Reset demo data").click();
		assert.ok((await loka.outline()).open.includes("Hacker News"), "reset brought back the seed data");

		const choose = async (/** @type {string} */ path) => {
			await loka.sidebar.getByRole("button", { name: "More" }).click();
			const [chooser] = await Promise.all([
				loka.page.waitForEvent("filechooser"),
				loka.menuItem("Import spaces (JSON)").click(),
			]);
			await chooser.setFiles(path);
			await loka.page.waitForTimeout(200);
		};
		await choose(file);
		assert.deepEqual(await loka.outline(), exported, "import restored the exported spaces");
		await loka.proof("01-imported");

		const bad = join(loka.dir, "not-a-loka-file.json");
		writeFileSync(bad, JSON.stringify({ hello: "world" }));
		/** @type {string[]} */
		const dialogs = [];
		loka.page.once("dialog", (d) => {
			dialogs.push(d.message());
			d.dismiss();
		});
		await choose(bad);
		assert.deepEqual(dialogs, ["That file isn't a Loka spaces export."]);
		assert.deepEqual(await loka.outline(), exported, "a bad file changes nothing");
	},
};

const wanted = process.argv[2];
const names = wanted === "all" ? Object.keys(recipes) : [wanted ?? ""];
if (!names.every((n) => n in recipes)) {
	console.error(`Usage: node run.mjs <${Object.keys(recipes).join("|")}|all>`);
	process.exit(1);
}
let failed = 0;
for (const name of names) {
	const loka = await openLoka(name);
	try {
		await recipes[name]?.(loka);
		await loka.close();
		console.log(`PASS  ${name}  evidence: ${loka.dir}`);
	} catch (error) {
		failed++;
		await loka.page.screenshot({ path: join(loka.dir, "failure.png") }).catch(() => {});
		await loka.close().catch(() => {});
		console.log(`FAIL  ${name}  ${error instanceof Error ? error.message : error}\n      evidence: ${loka.dir}`);
	}
}
process.exit(failed ? 1 : 0);
