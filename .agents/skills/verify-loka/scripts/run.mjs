// Runs the mapped feature recipes against the running prototype and saves evidence.
//   node .agents/skills/verify-loka/scripts/run.mjs <folders|spaces|tabs|essentials|export-import|command-bar|space-editor|layout|make-folders|archive|search-and-keys|import|media|theme|contrast|contrast-pages|extensions|history|library|sound|sky|onboarding|all>
// Each recipe starts from fresh seed data, drives the UI the way a user does, asserts the saved state,
// and writes screenshots, ARIA snapshots and outlines to .agents/verify-runs/<time>-<feature>/.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openLoka, ROOT } from "./loka.mjs";

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

		// A closed folder that holds the active tab shows a dot on its icon.
		await loka.row("Loka").click();
		assert.equal(await loka.row("Loka").locator(".holds").count(), 1, "closed Loka marks the active tab inside");
		await loka.proof("04-closed-folder-holds-active");
		await loka.row("Loka").click();
		assert.equal(await loka.row("Loka").locator(".holds").count(), 0, "open folders show no dot");

		await loka.row("Docs").click({ button: "right" });
		await loka.menuItem("Ungroup (keep tabs)").click();
		o = await loka.outline();
		assert.ok(!o.pinned.some((l) => l.endsWith(":Docs")), "Docs is gone");
		assert.ok(o.pinned.includes("1:Lit docs") && o.pinned.includes("1:Patches"), "its contents moved up a level");
		await loka.proof("05-ungrouped");

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

		// Hovering a neighbouring planet mid-drag switches to that space, like Arc.
		await loka.row("Zen Browser").dragTo(loka.space("School"));
		assert.equal((await loka.outline()).space, "School", "drag-hover switched space");

		// A sideways swipe on the sidebar turns to the next space (School -> Home).
		await loka.row("Canvas: CSC 281").hover();
		await loka.page.mouse.wheel(120, 0);
		assert.equal((await loka.outline()).space, "Home", "swipe moved to the next space");
		await loka.proof("03-swiped-to-home");
		await loka.page.keyboard.press("Control+2");

		// The space's menu moves it along the horizon, which is Ctrl+1..9's order too.
		const order = async () => (await loka.state()).spaces.map((/** @type {{ name: string }} */ s) => s.name);
		const world = loka.sidebar.getByRole("button", { name: "Spaces: School", exact: true });
		await world.click();
		assert.equal(await loka.menuItem("Move right").count(), 1, "School in the middle can move right");
		await loka.page.waitForTimeout(400); // the menu's fade-in, for the picture
		await loka.proof("04-space-menu-moves");
		await loka.menuItem("Move left").click();
		assert.deepEqual(await order(), ["School", "Build", "Home"], "Move left put School first");
		assert.equal((await loka.outline()).space, "School", "the space showing stays showing");
		await loka.proof("05-school-moved-left");
		await loka.page.reload({ waitUntil: "networkidle" });
		await loka.sidebar.getByRole("tree").first().waitFor();
		assert.deepEqual(await order(), ["School", "Build", "Home"], "the order survives a reload");
		await loka.page.keyboard.press("Control+2");
		assert.equal((await loka.outline()).space, "Build", "Ctrl+2 is Build now");
		await loka.page.keyboard.press("Control+1");
		assert.equal((await loka.outline()).space, "School", "Ctrl+1 shows School, now first");
		assert.equal(
			await loka.space("Build").getAttribute("aria-label"),
			"Build (Ctrl 2)",
			"the horizon's neighbour carries its new shortcut",
		);
		// At the start there is no Move left; right-clicking the planet has the same moves.
		await world.click();
		assert.equal(await loka.menuItem("Move left").count(), 0, "the first space can't move left");
		await loka.page.keyboard.press("Escape");
		await world.click({ button: "right" });
		await loka.menuItem("Move right").click();
		assert.deepEqual(await order(), ["Build", "School", "Home"], "Move right from the planet's right-click menu");
		await loka.proof("06-school-moved-back");

		// The current planet lists every space and can add one (through the editor, with the suggested name).
		await loka.sidebar.getByRole("button", { name: "Spaces: School", exact: true }).click();
		await loka.menuItem("New space").click();
		await loka.page.getByRole("dialog", { name: "New space" }).getByRole("button", { name: "Create space" }).click();
		o = await loka.outline();
		assert.equal(o.space, "Space 4");
		assert.deepEqual([o.pinned, o.open], [[], []], "a new space starts empty");
		await loka.proof("07-new-space");
	},

	async tabs(loka) {
		await loka.page.keyboard.press("Control+k");
		await loka.page.getByRole("combobox", { name: "Search or enter address" }).fill("lit.dev/playground");
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
		await loka.row("lit.dev").click({ button: "middle" });
		o = await loka.outline();
		assert.ok(!o.open.includes("lit.dev"), "a middle click closes a tab");

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

		// ---- several rows at once: Ctrl+click, Shift+click, and the selection's menu ----
		await resetDemo(loka);
		const pick = { modifiers: /** @type {["ControlOrMeta"]} */ (["ControlOrMeta"]) };
		await loka.row("Hacker News").click(pick);
		await loka.row("Zen Browser").click(pick);
		assert.deepEqual(await picked(loka), ["Hacker News", "Zen Browser"], "Ctrl+click picks rows");
		assert.equal((await loka.outline()).activeTab, "imputnet/helium-windows", "and doesn't switch tabs");
		await loka.proof("04-ctrl-picked");
		await loka.page.keyboard.press("Escape");
		assert.deepEqual(await picked(loka), [], "Escape lets go of them");
		await loka.row("Hacker News").click(pick);
		await loka.row("Zen Browser").click({ modifiers: ["Shift"] });
		assert.deepEqual(
			await picked(loka),
			["Hacker News", "Arc: what we learned", "Zen Browser"],
			"Shift+click picks the run",
		);
		await loka.row("Arc: what we learned").click({ button: "right" });
		await loka.sidebar.getByRole("menu", { name: "3 tabs selected" }).waitFor();
		// It fades in; the picture waits for that.
		await loka.page.waitForTimeout(300);
		await loka.proof("05-selection-menu");
		await loka.menuItem("Move to space").click();
		await loka.menuItem("School").click();
		let s = await loka.state();
		assert.deepEqual(spaceOpen(s, "s-school"), ["Hacker News", "Arc: what we learned", "Zen Browser"]);
		assert.deepEqual(spaceOpen(s, "s-build"), [], "Move to space took all three, in order");

		await loka.page.keyboard.press("Control+2");
		await loka.row("Hacker News").click(pick);
		await loka.row("Zen Browser").click({ modifiers: ["Shift"] });
		await loka.row("Hacker News").click({ button: "right" });
		await loka.menuItem("Pin to space").click();
		o = await loka.outline();
		assert.deepEqual(
			o.pinned.slice(-3),
			["0:Hacker News", "0:Arc: what we learned", "0:Zen Browser"],
			"pinned in order",
		);
		assert.deepEqual(o.open, []);
		assert.deepEqual(await picked(loka), [], "a menu action lets go of the selection");

		await loka.row("Arc: what we learned").click(pick);
		await loka.row("Zen Browser").click(pick);
		await loka.row("Zen Browser").click({ button: "right" });
		await loka.menuItem("Unpin").click();
		assert.deepEqual((await loka.outline()).open, ["Arc: what we learned", "Zen Browser"], "Unpin keeps their order");

		await loka.row("Hacker News").click(pick);
		await loka.row("Canvas: CSC 281").click(pick);
		await loka.row("Canvas: CSC 281").click({ button: "right" });
		await loka.menuItem("Close 2 tabs").click();
		o = await loka.outline();
		assert.ok(
			o.pinned.includes("0:Hacker News") && o.pinned.includes("0:Canvas: CSC 281"),
			"closing pinned tabs unloads them",
		);
		assert.deepEqual((await loka.state()).archive, [], "and archives nothing");

		await loka.row("Arc: what we learned").click(pick);
		await loka.row("Zen Browser").click(pick);
		await loka.row("Arc: what we learned").click({ button: "right" });
		await loka.menuItem("Close 2 tabs").click();
		s = await loka.state();
		assert.deepEqual(spaceOpen(s, "s-school"), [], "closing open tabs deletes them");
		assert.deepEqual(
			s.archive.map((/** @type {any} */ a) => a.tab.title),
			["Zen Browser", "Arc: what we learned"],
			"into the archive, last closed on top",
		);

		await loka.row("Hacker News").click(pick);
		await loka.row("Canvas: CSC 281").click(pick);
		await loka.row("Hacker News").click({ button: "right" });
		await loka.menuItem("New folder with these tabs").click();
		await loka.page.keyboard.type("Picked");
		await loka.page.keyboard.press("Enter");
		o = await loka.outline();
		assert.deepEqual(
			o.pinned.slice(-3),
			["0:Picked", "1:Canvas: CSC 281", "1:Hacker News"],
			"a folder of both, in sidebar order",
		);
		await loka.proof("06-folder-of-picked");
		await loka.page.reload({ waitUntil: "networkidle" });
		assert.deepEqual((await loka.outline()).pinned, o.pinned, "and it survives a reload");
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

		// ---- the limit of 12, and adding several at once ----
		await resetDemo(loka);
		const pick = { modifiers: /** @type {["ControlOrMeta"]} */ (["ControlOrMeta"]) };
		const notice = loka.sidebar.getByRole("status").filter({ hasText: "Essentials" });
		// Build's three open tabs, then its three pinned tabs (the run passes over the Docs folder): 4 + 6 = 10.
		await loka.row("Hacker News").click(pick);
		await loka.row("Zen Browser").click({ modifiers: ["Shift"] });
		await loka.row("Arc: what we learned").click({ button: "right" });
		await loka.menuItem("Add to Essentials").click();
		await loka.row("imputnet/helium-windows").click(pick);
		await loka.row("Lit docs").click({ modifiers: ["Shift"] });
		assert.deepEqual(await picked(loka), ["imputnet/helium-windows", "Chromium: Windows build guide", "Lit docs"]);
		await loka.row("Lit docs").click({ button: "right" });
		await loka.menuItem("Add to Essentials").click();
		o = await loka.outline();
		assert.equal(o.essentials.length, 10);
		assert.deepEqual(o.essentials.slice(4), [
			"Hacker News",
			"Arc: what we learned",
			"Zen Browser",
			"imputnet/helium-windows",
			"Chromium: Windows build guide",
			"Lit docs",
		]);
		assert.equal(await notice.count(), 0, "everything fit, so nothing is said");

		// School: Canvas and the two tabs in Game project. Only two fit.
		await loka.page.keyboard.press("Control+2");
		await loka.row("Game project").click();
		await loka.row("Canvas: CSC 281").click(pick);
		await loka.row("Game design doc").click(pick);
		await loka.row("Minecraft farm designs").click(pick);
		await loka.row("Minecraft farm designs").click({ button: "right" });
		await loka.menuItem("Add to Essentials").click();
		await notice.waitFor();
		assert.equal(
			(await notice.textContent())?.trim(),
			"Added 2. Essentials have room for 12, so 1 tab didn't fit.",
			"the sidebar says what didn't fit",
		);
		o = await loka.outline();
		assert.equal(o.essentials.length, 12, "Essentials stop at 12");
		assert.deepEqual(o.essentials.slice(-2), ["Canvas: CSC 281", "Game design doc"], "the first two, in order");
		assert.ok(o.pinned.includes("2:Minecraft farm designs"), "the one that didn't fit stays where it was");
		// The tiles fly in from their rows; the picture waits for them to land.
		await loka.page.waitForTimeout(400);
		await loka.proof("03-twelve-and-a-notice");

		// One more from its own menu: refused, and said.
		await loka.row("Minecraft farm designs").click({ button: "right" });
		await loka.menuItem("Add to Essentials").click();
		await loka.page.waitForTimeout(100);
		assert.equal((await notice.textContent())?.trim(), "Essentials have room for 12. Remove one first.");
		assert.equal((await loka.outline()).essentials.length, 12);

		// Dragging onto a full grid: no free cell, no drop line on a tile's edge, and letting go changes nothing.
		const from = await loka.row("Minecraft farm designs").boundingBox();
		const tile = await loka.essential("YouTube").boundingBox();
		if (!from || !tile) throw new Error("drag ends not visible");
		await loka.page.mouse.move(from.x + 60, from.y + from.height / 2);
		await loka.page.mouse.down();
		await loka.page.mouse.move(from.x + 70, from.y + from.height / 2, { steps: 3 });
		await loka.page.mouse.move(tile.x + tile.width - 3, tile.y + tile.height / 2, { steps: 8 });
		const marks = await loka.sidebar.evaluate(
			(el) =>
				el.shadowRoot?.querySelectorAll(".essentials .slot, .essentials .drop-before, .essentials .drop-after").length,
		);
		assert.equal(marks, 0, "a full grid shows no drop slot or line");
		await loka.proof("04-drag-onto-full-grid");
		await loka.page.mouse.up();
		await loka.page.waitForTimeout(150);
		o = await loka.outline();
		assert.equal(o.essentials.length, 12);
		assert.ok(o.pinned.includes("2:Minecraft farm designs"), "the drop changed nothing");

		// Full Essentials still reorder.
		await loka.drag(loka.essential("Game design doc"), loka.essential("Inbox"), "before");
		assert.equal((await loka.outline()).essentials[0], "Game design doc", "a tile moved to the front");
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

	async "command-bar"(loka) {
		const bar = loka.page.getByRole("combobox", { name: "Search or enter address" });
		await loka.page.keyboard.press("Control+k");
		await bar.fill("canvas");
		await loka.proof("01-results-for-canvas");
		// "canvas" starts the Canvas tab's site, so result 0 switches to it (in School) and the search is result 1.
		await loka.page.keyboard.press("Enter");
		let o = await loka.outline();
		assert.deepEqual([o.space, o.activeTab], ["School", "Canvas: CSC 281"], "jumped to a tab in another space");

		// The start of an open tab's site: its row first, and the field completes the address, selected.
		const field = () =>
			bar.evaluate((/** @type {HTMLInputElement} */ el) => [
				el.value,
				el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0),
			]);
		await loka.page.keyboard.press("Control+k");
		await loka.page.keyboard.type("youtu", { delay: 50 });
		await loka.page.waitForTimeout(200);
		assert.deepEqual(await field(), ["youtube.com", "be.com"], "youtu is completed to youtube.com");
		assert.match(await loka.page.locator("#result-0").innerText(), /YouTube[\s\S]*Switch to tab/);
		await loka.proof("02-youtu-completed");
		// Backspace takes the completion away, and the browser's next answer doesn't bring it back.
		await loka.page.keyboard.press("Backspace");
		await loka.page.waitForTimeout(200);
		assert.deepEqual(await field(), ["youtu", ""], "Backspace removed the completion");
		assert.match(await loka.page.locator("#result-0").innerText(), /youtu[\s\S]*Search with/);
		// The next character turns completing back on, and Enter switches to the tab.
		await loka.page.keyboard.type("b");
		assert.deepEqual(await field(), ["youtube.com", "e.com"], "typing on continued the completion");
		await loka.page.keyboard.press("Enter");
		assert.equal((await loka.outline()).activeTab, "YouTube", "Enter switched to the YouTube tab");

		// Plain words still search first, with nothing completed.
		await loka.page.keyboard.press("Control+k");
		await loka.page.keyboard.type("how to cook rice", { delay: 10 });
		await loka.page.waitForTimeout(200);
		assert.deepEqual(await field(), ["how to cook rice", ""]);
		assert.match(await loka.page.locator("#result-0").innerText(), /how to cook rice[\s\S]*Search with/);
		await loka.page.keyboard.press("Escape");

		await loka.page.keyboard.press("Control+k");
		await bar.fill("preferences");
		await loka.page.keyboard.press("ArrowDown");
		await loka.page.keyboard.press("Enter");
		o = await loka.outline();
		assert.equal(o.activeTab, "Settings", "a command found by a related word opened Settings");
		await loka.page.locator("loka-settings").getByRole("heading", { name: "Settings" }).waitFor();
		await loka.proof("03-settings-from-command");
	},

	async "space-editor"(loka) {
		await loka.sidebar.getByRole("button", { name: "Spaces: Build", exact: true }).click();
		await loka.menuItem("New space").click();
		const dialog = loka.page.getByRole("dialog", { name: "New space" });
		await dialog.getByRole("textbox", { name: "Space name" }).fill("Music");
		await dialog.getByRole("button", { name: "Hue 330" }).click();
		await dialog.getByRole("button", { name: "Moon" }).click();
		await loka.proof("01-editor-filled");
		await dialog.getByRole("button", { name: "Create space" }).click();
		let s = (await loka.state()).spaces.at(-1);
		assert.deepEqual([s.name, s.hue, s.planet], ["Music", 330, "cratered"], "the new space has the chosen look");
		assert.equal((await loka.outline()).space, "Music", "and is now the current space");
		await loka.page.waitForTimeout(500);
		await loka.proof("02-music-space");

		await loka.sidebar.getByRole("button", { name: "Spaces: Music", exact: true }).click();
		await loka.menuItem("Edit this space").click();
		const edit = loka.page.getByRole("dialog", { name: "Edit Music" });
		await edit.getByRole("textbox", { name: "Space name" }).fill("Tunes");
		await edit.getByRole("button", { name: "Ringed" }).click();
		await edit.getByRole("button", { name: "Save" }).click();
		s = (await loka.state()).spaces.at(-1);
		assert.deepEqual([s.name, s.planet, s.hue], ["Tunes", "ringed", 330], "editing kept the color, changed the rest");

		await loka.sidebar.getByRole("button", { name: "Spaces: Tunes", exact: true }).click();
		await loka.menuItem("Edit this space").click();
		await loka.page.keyboard.press("Escape");
		assert.equal(await loka.page.locator("loka-space-editor").count(), 0, "Escape closes the editor");

		await loka.sidebar.getByRole("button", { name: "Spaces: Tunes", exact: true }).click();
		await loka.menuItem("Edit this space").click();
		const doomed = loka.page.getByRole("dialog", { name: "Edit Tunes" });
		await doomed.getByRole("button", { name: "Delete space" }).click();
		assert.ok(
			(await loka.state()).spaces.some((/** @type {{ name: string }} */ x) => x.name === "Tunes"),
			"the first click only asks",
		);
		await doomed.getByRole("button", { name: "Delete it and its tabs" }).click();
		const names = (await loka.state()).spaces.map((/** @type {{ name: string }} */ x) => x.name);
		assert.deepEqual(names, ["Build", "School", "Home"], "the second click deletes the space");
		assert.equal((await loka.outline()).space, "Home", "and the space before it shows");
		await loka.proof("03-tunes-deleted");
	},

	async layout(loka) {
		const box = async (/** @type {string | import("playwright").Locator} */ target) => {
			const b = await (typeof target === "string" ? loka.page.locator(target) : target).boundingBox();
			if (!b) throw new Error(`${target} is not visible`);
			return b;
		};
		// Drag the sidebar's edge 80 px wider.
		const handle = await box(loka.page.getByRole("separator", { name: "Resize sidebar" }));
		await loka.page.mouse.move(handle.x + handle.width / 2, 400);
		await loka.page.mouse.down();
		await loka.page.mouse.move(handle.x + handle.width / 2 + 80, 400, { steps: 6 });
		await loka.page.mouse.up();
		assert.equal((await loka.ui()).sidebarWidth, 380, "dragging the edge saved the new width");
		assert.equal(Math.round((await box("loka-sidebar")).width), 380);
		await loka.proof("01-wider");

		await loka.sidebar.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Settings").click();
		const settings = loka.page.locator("loka-settings");
		await settings.getByRole("radio", { name: "Right" }).click();
		assert.ok((await box("loka-sidebar")).x > (await box("loka-page")).x, "the sidebar moved to the right");
		await loka.proof("02-sidebar-right");
		await settings.getByRole("radio", { name: "Left" }).click();

		// Settings' rail: a click marks its section current and focuses its heading; the search filters the rail.
		const rail = settings.getByRole("navigation", { name: "Settings sections" });
		const current = () =>
			settings.evaluate((el) =>
				[...(el.shadowRoot?.querySelectorAll('nav button[aria-current="true"]') ?? [])].map((b) =>
					b.textContent?.trim(),
				),
			);
		await rail.getByRole("button", { name: "Sound" }).click();
		const heading = settings.getByRole("heading", { name: "Sound", exact: true });
		let top = -1;
		for (let i = 0; i < 30 && !(top >= 0 && top < 800 / 3); i++) {
			await loka.page.waitForTimeout(100);
			top = (await heading.boundingBox())?.y ?? -1;
		}
		assert.ok(top >= 0 && top < 800 / 3, `the Sound heading scrolled near the top (${top})`);
		assert.deepEqual(await current(), ["Sound"], "the clicked section is the current one");
		assert.ok(
			await heading.evaluate((h) => /** @type {ShadowRoot} */ (h.getRootNode()).activeElement === h),
			"focus moved to its heading",
		);
		await settings.getByRole("searchbox", { name: "Search settings" }).fill("autoplay");
		assert.deepEqual(await rail.getByRole("button").allInnerTexts(), ["Media"], "the search leaves only Media");
		await loka.proof("02-settings-search");
		await loka.page.keyboard.press("Escape");
		assert.equal((await rail.getByRole("button").allInnerTexts()).length, 13, "Escape brings every section back");

		// The top row's button hides the sidebar: the browser (here the fake) unpins it and slides it away.
		await loka.sidebar.getByRole("button", { name: "Hide sidebar" }).click();
		await loka.page.waitForTimeout(350);
		assert.deepEqual(await demoCalls(loka, "setSidebarPinned"), [[false]], "the button asked the browser to unpin");
		assert.ok((await box("loka-sidebar")).x + 380 <= 0, "a hidden sidebar is off screen");
		await loka.proof("03-hidden");
		await loka.page.mouse.move(2, 400);
		await loka.page.mouse.move(4, 420);
		await loka.page.waitForTimeout(350);
		assert.ok((await box("loka-sidebar")).x >= 0, "reaching the edge slides it in");
		await loka.proof("04-peek");
		// The same button, now "Keep sidebar open", pins it back; Ctrl+S toggles it too.
		await loka.sidebar.getByRole("button", { name: "Keep sidebar open" }).click();
		await loka.page.keyboard.press("Control+s");
		await loka.page.keyboard.press("Control+s");
		assert.deepEqual(await demoCalls(loka, "setSidebarPinned"), [[false], [true], [false], [true]]);

		// Downloads sits in the bottom row beside the +, not in the address field; its panel rises from there.
		const pill = await loka.sidebar.locator(".url button").evaluateAll((els) => els.map((e) => e.ariaLabel));
		assert.ok(!pill.includes("Downloads"), `no Downloads in the address field: ${pill}`);
		const downloadsButton = loka.sidebar.locator(".bottom").getByRole("button", { name: "Downloads", exact: true });
		assert.equal(await downloadsButton.locator(".ring").count(), 1, "a ring while a file comes in");
		await downloadsButton.click();
		const downloads = loka.sidebar.getByRole("dialog", { name: "Downloads" });
		assert.equal(await downloads.getByRole("progressbar").count(), 2, "one running, one paused");
		await downloads.getByRole("button", { name: "Try again lofi-cover.png" }).click();
		assert.equal(await downloads.getByRole("progressbar").count(), 3, "trying a failed download again restarts it");
		await downloads.getByRole("button", { name: /^Pause helium/ }).click();
		assert.deepEqual(await demoCalls(loka, "downloadAction"), [
			[3, "retry"],
			[6, "pause"],
		]);
		await loka.proof("05-downloads");
		await loka.page.keyboard.press("Escape");
		// It plays its exit first; on a busy machine that can outlast a fixed wait.
		await downloads.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
		assert.equal(await downloads.count(), 0, "Escape closes the panel");
		await loka.sidebar.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Downloads").click();
		await downloads.waitFor();
		await loka.page.keyboard.press("Escape");
	},

	async "make-folders"(loka) {
		// Drop one open tab on the middle of another: a folder of the two, named by typing.
		await loka.drag(loka.row("Zen Browser"), loka.row("Arc: what we learned"), "into");
		await loka.page.keyboard.type("Browsers");
		await loka.page.keyboard.press("Enter");
		let o = await loka.outline();
		assert.deepEqual(o.pinned.slice(-3), ["0:Browsers", "1:Arc: what we learned", "1:Zen Browser"]);
		assert.deepEqual(o.open, ["Hacker News"], "both left the open tabs");
		await loka.proof("01-tab-on-tab");

		// Right-click the sidebar's background (here the divider's empty line) for a new folder; there is no toolbar
		// button for it.
		assert.equal(await loka.sidebar.getByRole("button", { name: "New folder", exact: true }).count(), 0);
		const empty = await loka.sidebar.locator(".divider").boundingBox();
		if (!empty) throw new Error("no divider");
		await loka.page.mouse.click(empty.x + 60, empty.y + empty.height / 2, { button: "right" });
		await loka.menuItem("New folder").click();
		await loka.page.keyboard.type("Later");
		await loka.page.keyboard.press("Enter");
		assert.ok((await loka.outline()).pinned.includes("0:Later"), "right-click made a folder");

		// A tab's own menu can start a folder around it.
		await loka.row("Hacker News").click({ button: "right" });
		await loka.menuItem("New folder with this tab").click();
		await loka.page.keyboard.type("News");
		await loka.page.keyboard.press("Enter");
		o = await loka.outline();
		assert.deepEqual(o.pinned.slice(-2), ["0:News", "1:Hacker News"]);
		await loka.proof("02-folders-made");
	},

	async archive(loka) {
		// Seed: Arc was last shown 9 hours ago, Zen 5 hours ago, Hacker News 2 hours ago: all inside the 12-hour default.
		assert.ok((await loka.outline()).open.includes("Arc: what we learned"), "recent open tabs stay");
		await loka.sidebar.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Settings").click();
		const setting = loka.page.locator("loka-settings").getByRole("combobox", { name: "Archive open tabs" });
		assert.equal(await setting.inputValue(), "12", "archiving is on after 12 hours by default");
		// Eight hours later Arc (17 h) and Zen (13 h) are past it; Hacker News (10 h) isn't. The archive runs every minute.
		await loka.page.clock.install();
		await loka.page.reload({ waitUntil: "networkidle" });
		await loka.sidebar.getByRole("tree").first().waitFor();
		await loka.page.clock.fastForward("08:00:00");
		const o = await loka.outline();
		assert.ok(!o.open.includes("Arc: what we learned") && !o.open.includes("Zen Browser"), "old open tabs archived");
		assert.ok(o.open.includes("Hacker News"), "a recent one stays");
		assert.deepEqual(
			(await loka.state()).archive.map((/** @type {any} */ a) => a.tab.title),
			["Arc: what we learned", "Zen Browser"],
		);

		await loka.sidebar.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Archived tabs (2)").click();
		const panel = loka.sidebar.getByRole("dialog", { name: "Archived tabs" });
		await loka.proof("01-archive-panel");
		await panel.getByRole("button", { name: /Zen Browser/ }).click();
		const back = await loka.outline();
		assert.deepEqual([back.open[0], back.activeTab], ["Zen Browser", "Zen Browser"], "restored to the top and shown");

		await loka.page.keyboard.press("Control+k");
		await loka.page.getByRole("combobox", { name: "Search or enter address" }).fill("archived");
		await loka.page.keyboard.press("ArrowDown");
		await loka.page.keyboard.press("Enter");
		await panel.getByRole("button", { name: /Arc: what we learned/ }).waitFor();
		await loka.proof("02-archive-from-command-bar");
	},

	async "search-and-keys"(loka) {
		await loka.page.keyboard.press("Control+Shift+F");
		const search = loka.sidebar.getByRole("combobox", { name: "Search the sidebar" });
		await search.fill("minecraft");
		await loka.proof("01-search");
		await loka.page.keyboard.press("Enter");
		const o = await loka.outline();
		assert.deepEqual([o.space, o.activeTab], ["School", "Minecraft farm designs"], "went to the tab in another space");
		assert.ok(o.pinned.includes("2:Minecraft farm designs"), "and opened the closed folder above it");

		await loka.page.keyboard.press("Control+1");
		await loka.page.keyboard.press("Control+Alt+ArrowDown");
		assert.equal((await loka.outline()).activeTab, "Chromium: Windows build guide", "next tab in sidebar order");
		await loka.page.keyboard.press("Control+Alt+ArrowUp");
		await loka.page.keyboard.press("Control+Alt+ArrowUp");
		assert.equal((await loka.outline()).activeTab, "YouTube", "previous tab reaches Essentials");

		// Arrow keys move through the tree; Left closes a folder, Right opens it.
		await loka.row("Loka").focus();
		await loka.page.keyboard.press("ArrowLeft");
		assert.ok((await loka.outline()).pinned.includes("0:Loka (closed)"));
		await loka.page.keyboard.press("ArrowRight");
		await loka.page.keyboard.press("ArrowDown");
		await loka.page.keyboard.press("Enter");
		assert.equal((await loka.outline()).activeTab, "imputnet/helium-windows", "Down then Enter opened the next row");

		// Left goes up to the folder holding the row; Right on an open folder goes into it.
		/** The focused row's name. */
		const focused = () =>
			loka.sidebar.evaluate((el) => el.shadowRoot?.activeElement?.querySelector(".label")?.textContent ?? null);
		await loka.page.keyboard.press("ArrowLeft");
		assert.equal(await focused(), "Loka", "Left on a tab goes to its folder");
		await loka.page.keyboard.press("ArrowRight");
		assert.equal(await focused(), "imputnet/helium-windows", "Right on an open folder goes to its first row");
		await loka.page.keyboard.press("ArrowDown");
		await loka.page.keyboard.press("ArrowRight");
		assert.equal(await focused(), "Chromium: Windows build guide", "and into the folder two levels down");

		// Shift+Down picks rows and stays in its own list; Escape lets go.
		await loka.page.keyboard.press("Shift+ArrowDown");
		assert.deepEqual(await picked(loka), ["Chromium: Windows build guide", "Lit docs"], "Shift+Down picks the run");
		await loka.page.keyboard.press("Shift+ArrowDown");
		assert.equal(await focused(), "Lit docs", "Shift+Down stops at the end of the pinned tree");
		await loka.proof("02-shift-down");
		await loka.page.keyboard.press("Escape");
		assert.deepEqual(await picked(loka), []);

		// Down crosses into the open tabs; Shift+Down picks two; Delete closes them and focus takes their place.
		await loka.page.keyboard.press("ArrowDown");
		assert.equal(await focused(), "Hacker News");
		await loka.page.keyboard.press("Shift+ArrowDown");
		await loka.page.keyboard.press("Delete");
		assert.deepEqual((await loka.outline()).open, ["Zen Browser"], "Delete closed the picked tabs");
		assert.equal(await focused(), "Zen Browser", "focus moved to the row that took their place");
		// With nothing picked, Delete closes the focused tab; a pinned one only unloads.
		await loka.page.keyboard.press("Delete");
		assert.deepEqual((await loka.outline()).open, []);
		assert.deepEqual(
			(await loka.state()).archive.map((/** @type {any} */ a) => a.tab.title),
			["Zen Browser", "Arc: what we learned", "Hacker News"],
			"all three are in the archive",
		);
		await loka.row("Lit docs").focus();
		await loka.page.keyboard.press("Delete");
		assert.ok((await loka.outline()).pinned.includes("2:Lit docs"), "Delete on a pinned tab keeps it");
		await loka.proof("03-deleted");

		// The window's shortcuts still work on a focused row: Ctrl+Alt+Down steps tabs, Ctrl+2 switches space.
		await loka.page.keyboard.press("Control+Alt+ArrowDown");
		assert.equal(await focused(), "Lit docs", "Ctrl+Alt+Down doesn't move the row focus");
		await loka.page.keyboard.press("Control+2");
		assert.equal((await loka.outline()).space, "School");
	},

	async import(loka) {
		await loka.sidebar.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Settings").click();
		const settings = loka.page.locator("loka-settings");
		const rows = settings.locator(".row");
		await choose(
			loka,
			rows.filter({ hasText: "From Chrome" }).getByRole("button", { name: "Choose file" }),
			"Bookmarks",
		);
		await settings.getByText("Added 4 bookmarks as a folder in this space.").waitFor();
		assert.ok((await loka.outline()).pinned.includes("0:Chrome bookmarks (closed)"));
		await choose(
			loka,
			rows.filter({ hasText: "From Arc" }).getByRole("button", { name: "Choose file" }),
			"StorableSidebar.json",
		);
		await settings.getByText("Added 2 spaces with 3 pinned tabs, and 1 Favorites.").waitFor();
		const s = await loka.state();
		const research = s.spaces.find((/** @type {{ name: string }} */ x) => x.name === "Research");
		assert.ok(research, "Arc's Research space was added");
		assert.equal(
			s.essentials.map((/** @type {string} */ id) => s.tabs[id].title).at(-1),
			"Mail",
			"Arc's Favorite joined Essentials",
		);
		await choose(
			loka,
			rows.filter({ hasText: "From Edge" }).getByRole("button", { name: "Choose file" }),
			"StorableSidebar.json",
		);
		await settings.getByText("That isn't Edge's Bookmarks file.").waitFor();
		await loka.proof("01-imported");
		await loka.page.keyboard.press("Control+4");
		await loka.page.waitForTimeout(500);
		await loka.proof("02-research-space");
	},

	async media(loka) {
		// The Lo-fi beats tab in Home plays (the fake's media session), so its card shows in Build.
		const card = loka.sidebar.getByRole("region", { name: /^Now playing: / });
		await card.waitFor();
		assert.equal(await card.getAttribute("aria-label"), "Now playing: Snowman", "the media session's own title");
		await loka.proof("01-card");
		await card.getByRole("button", { name: "Next track" }).click();
		await loka.sidebar.getByRole("region", { name: "Now playing: Coffee Break" }).waitFor();
		await card.getByRole("button", { name: "Pause" }).click();
		await card.getByRole("button", { name: "Play" }).waitFor();
		await card.getByRole("button", { name: "Mute" }).click();
		await card.getByRole("button", { name: "Unmute" }).waitFor();
		assert.deepEqual(await demoCalls(loka, "mediaAction"), [
			[101, "next"],
			[101, "pause"],
		]);
		await card.getByRole("button", { name: "Go to Lo-fi beats" }).first().click();
		const o = await loka.outline();
		assert.deepEqual([o.space, o.activeTab], ["Home", "Lo-fi beats"], "the card took us to the playing tab");
		await card.waitFor({ state: "detached" });
		await loka.page.keyboard.press("Control+1");
		await card.waitFor();
	},

	async theme(loka) {
		// Build is dark, School light, Home follows the system (the test browser is light).
		const scheme = () =>
			loka.page.evaluate(() => {
				const w = document.querySelector("loka-app")?.shadowRoot?.querySelector(".window");
				return w?.classList.contains("theme-light") ? "light" : "dark";
			});
		assert.equal(await scheme(), "dark");
		await loka.page.keyboard.press("Control+2");
		await loka.page.waitForTimeout(800);
		assert.equal(await scheme(), "light", "School is light");
		await loka.proof("01-school-light");
		await loka.page.keyboard.press("Control+3");
		await loka.page.waitForTimeout(800);
		assert.equal(await scheme(), "light", "Home follows the system");
		assert.deepEqual(
			await demoCalls(loka, "setColorScheme"),
			[["dark"], ["light"], ["system"]],
			"the browser was told each time",
		);

		// The space editor sets it, and it's saved with the space.
		await loka.sidebar.getByRole("button", { name: "Spaces: Home", exact: true }).click();
		await loka.menuItem("Edit this space").click();
		const editor = loka.page.getByRole("dialog", { name: "Edit Home" });
		await editor.getByRole("radio", { name: "Dark" }).click();
		await loka.page.waitForTimeout(300);
		assert.equal(await scheme(), "dark", "the window previews the choice");
		await loka.proof("02-editor-dark");
		await editor.getByRole("button", { name: "Save" }).click();
		const home = (await loka.state()).spaces.find((/** @type {{ id: string }} */ s) => s.id === "s-home");
		assert.equal(home.scheme, "dark");
		assert.deepEqual((await demoCalls(loka, "setColorScheme")).at(-1), ["dark"]);
	},

	async contrast(loka) {
		// Every text the sidebar draws, against the pixels behind it, for each space color in both schemes and on each
		// kind of planet (the space's name sits on it). Every space gets the hue, scheme and planet in the saved state,
		// with Moving stars off so the stars stay where they are between the two screenshots. Two window widths: the
		// real browser's sky is the sidebar page's own, as wide as the sidebar, which a window just wider than the
		// sidebar draws the same way (the nebula's glows land behind the list); the prototype's sky spans its whole
		// window. The planet doesn't change with the width, so it's looked at on every kind only in the narrow one.
		const hues = sourceList("prototype/src/features/sidebar/planet.ts", "SPACE_HUES").map(Number);
		const planets = sourceList("prototype/src/features/sidebar/sidebar.logic.ts", "PLANET_KINDS");
		assert.equal(hues.length, 8, "the eight space colors");
		/** @type {Measured[]} */
		const all = [];
		for (const width of [330, 1280]) {
			await loka.page.setViewportSize({ width, height: 800 });
			const away = { x: width - 8, y: 400 };
			for (const scheme of ["dark", "light"]) {
				for (const hue of hues) {
					for (const planet of width === 330 ? planets : planets.slice(0, 1)) {
						await showSpace(loka, { hue, scheme, planet }, away);
						const at = { width, hue, scheme, planet, surface: "sidebar" };
						all.push(...(await measureText(loka, { ...at, state: "Build" })));
						if (width === 330) {
							// The planet turns under the name: look at it a quarter turn at a time.
							for (const phase of [0.25, 0.5, 0.75]) {
								await turnPlanet(loka, phase);
								all.push(...(await measureText(loka, { ...at, state: `turn ${phase}` }, { only: ".world-name" })));
							}
						}
						if (planet !== planets[0]) continue;
						await sidebarShot(loka, `${width}-${scheme}-${hue}-build`);
						await loka.row("Hacker News").hover();
						all.push(...(await measureText(loka, { ...at, state: "hover" })));
						await loka.row("Lit docs").click({ button: "right" });
						await loka.sidebar.getByRole("menuitem").first().waitFor();
						await loka.page.waitForTimeout(250);
						all.push(...(await measureText(loka, { ...at, state: "menu" })));
						await sidebarShot(loka, `${width}-${scheme}-${hue}-menu`);
						await loka.page.keyboard.press("Escape");
						// School has a closed folder; Home has no pinned tabs and no tab showing, so the address field is
						// empty and the divider sits high, on the nebula.
						for (const [key, space, row] of /** @type {[string, string, string][]} */ ([
							["Control+2", "School", "Canvas: CSC 281"],
							["Control+3", "Home", "Lo-fi beats"],
						])) {
							await loka.page.keyboard.press(key);
							await loka.row(row).waitFor();
							await loka.page.mouse.move(away.x, away.y);
							await loka.page.waitForTimeout(1000);
							await turnPlanet(loka, 0);
							all.push(...(await measureText(loka, { ...at, state: space })));
						}
						await sidebarShot(loka, `${width}-${scheme}-${hue}-home`);
					}
				}
			}
		}
		contrastReport(
			loka,
			all,
			`${hues.length} hues x 2 schemes x ${planets.length} planets, windows 330 and 1280 px wide; Build, a hovered row, a menu, School, Home, the planet turning`,
		);
	},

	async "contrast-pages"(loka) {
		// The contrast recipe's measurement on everything else Loka draws text on: Settings (every screen of it, and the
		// space editor it opens), the Library's four sections, the command bar, the sidebar's panels and download toast,
		// the empty page, and a long space name on the planet. Each hue and scheme as in `contrast`. Pages are measured
		// with the sidebar hidden, so they span the window as the browser's tab does, its sky as wide as the page (with
		// the sidebar beside them they were the same, 2x the time); the command bar embedded, beside the sidebar and
		// without it (the prototype's glass), and as the browser's floating page (layout="page"). The sidebar's surfaces
		// at 330 and 1280 px, like `contrast`. CONTRAST_HUES=210,40 limits the hues while iterating.
		const hues = sourceList("prototype/src/features/sidebar/planet.ts", "SPACE_HUES").map(Number);
		const planets = sourceList("prototype/src/features/sidebar/sidebar.logic.ts", "PLANET_KINDS");
		assert.equal(hues.length, 8, "the eight space colors");
		const only = process.env.CONTRAST_HUES?.split(",").map(Number);
		/** @type {Measured[]} */
		const all = [];
		const page = loka.page.locator("loka-page");
		const seed = await loka.state();
		for (const scheme of ["dark", "light"]) {
			for (const hue of only ?? hues) {
				const look = { hue, scheme, planet: planets[0] ?? "banded" };
				const measure = async (
					/** @type {number} */ width,
					/** @type {string} */ surface,
					/** @type {string} */ state,
					/** @type {{ root?: string, only?: string }} */ where,
				) => all.push(...(await measureText(loka, { width, hue, scheme, planet: look.planet, surface, state }, where)));

				await loka.page.setViewportSize({ width: 1280, height: 800 });
				const away = { x: 1272, y: 400 };
				// Settings, a screen at a time, then the space editor from its Spaces section.
				await showSpace(loka, look, away, { seed, pinned: false, page: "loka://settings" });
				await page.getByRole("navigation", { name: "Settings sections" }).waitFor();
				for (let step = 0; step < 12; step++) {
					if (step > 0 && !(await scrollSurface(loka, "loka-settings"))) break;
					await measure(1280, "settings", `screen ${step + 1}`, { root: "loka-page" });
					if (step === 0) await pageShot(loka, `settings-${scheme}-${hue}`);
				}
				await scrollSurface(loka, "loka-settings", "top");
				await page.getByRole("button", { name: "Edit", exact: true }).first().click();
				const editor = loka.page
					.getByRole("dialog")
					.filter({ has: loka.page.getByRole("radiogroup") })
					.first();
				await editor.waitFor();
				// The name opens selected, drawn in the selection's colors; End puts the caret after it, as typing would.
				await loka.page.keyboard.press("End");
				await loka.page.waitForTimeout(400);
				await measure(1280, "space editor", "from Settings", { root: "loka-space-editor" });
				await pageShot(loka, `space-editor-${scheme}-${hue}`);
				await loka.page.keyboard.press("Escape");

				// The Library's sections, the first three screens of each.
				for (const [section, url, ready] of /** @type {[string, string, string][]} */ ([
					["spaces", "loka://history#spaces", "heading"],
					["archive", "loka://history#archive", "button"],
					["history", "loka://history", "treeitem"],
					["downloads", "loka://history#downloads", "button"],
				])) {
					await showSpace(loka, look, away, { seed, pinned: false, page: url, archive: true });
					await page
						.locator("loka-library")
						.getByRole(/** @type {any} */ (ready))
						.first()
						.waitFor();
					await loka.page.waitForTimeout(300);
					for (let step = 0; step < 3; step++) {
						if (step > 0 && !(await scrollSurface(loka, "loka-library"))) break;
						await measure(1280, `library ${section}`, `screen ${step + 1}`, { root: "loka-page" });
						if (step === 0) await pageShot(loka, `library-${section}-${scheme}-${hue}`);
					}
				}

				for (const layout of ["sidebar", "full"]) {
					const pinned = layout === "sidebar";
					// The command bar, empty and with results, over a web page.
					await showSpace(loka, look, away, { seed, pinned });
					await loka.page.keyboard.press("Control+k");
					const field = loka.page.getByRole("combobox", { name: "Search or enter address" });
					await field.waitFor();
					await loka.page.waitForTimeout(300);
					await measure(1280, "command bar", `${layout} empty`, { root: "loka-command-bar" });
					await field.fill("lit");
					await loka.page.waitForTimeout(500);
					await measure(1280, "command bar", `${layout} results`, { root: "loka-command-bar" });
					await pageShot(loka, `command-bar-${layout}-${scheme}-${hue}`);
					if (layout === "full") {
						// The browser's floating window: the bar is the whole page, near solid, with no scrim.
						await loka.page.evaluate(() =>
							document
								.querySelector("loka-app")
								?.shadowRoot?.querySelector("loka-command-bar")
								?.setAttribute("layout", "page"),
						);
						await loka.page.waitForTimeout(300);
						await measure(1280, "command bar", "floating page, results", { root: "loka-command-bar" });
						await pageShot(loka, `command-bar-floating-${scheme}-${hue}`);
					}
					await loka.page.keyboard.press("Escape");
				}

				// The sidebar's panels and the download toast, at both widths like `contrast`; the empty page beside it.
				for (const width of [330, 1280]) {
					await loka.page.setViewportSize({ width, height: 800 });
					const off = { x: width - 8, y: 400 };
					await showSpace(loka, look, off, { seed, archive: true });
					const panels = /** @type {[string, () => Promise<void>][]} */ ([
						["downloads", () => loka.sidebar.locator(".bottom").getByRole("button", { name: "Downloads" }).click()],
						[
							"archive",
							async () => {
								await loka.sidebar.getByRole("button", { name: "More" }).click();
								await loka.sidebar.getByRole("menuitem", { name: /^Archived tabs/ }).click();
							},
						],
						[
							"search",
							async () => {
								await loka.page.keyboard.press("Control+Shift+F");
								await loka.sidebar.getByRole("combobox", { name: "Search the sidebar" }).fill("lit");
							},
						],
						["extensions", () => loka.sidebar.getByRole("button", { name: "Extensions", exact: true }).click()],
					]);
					for (const [panel, open] of panels) {
						await open();
						await loka.page.mouse.move(off.x, off.y);
						await loka.page.waitForTimeout(500);
						await measure(width, `${panel} panel`, `${width}px`, { root: "loka-sidebar", only: PANELS });
						await sidebarShot(loka, `${panel}-panel-${width}-${scheme}-${hue}`);
						await loka.page.keyboard.press("Escape");
						await loka.page.waitForTimeout(250);
					}
					await loka.page.evaluate(() => {
						const sidebar = /** @type {any} */ (
							document.querySelector("loka-app")?.shadowRoot?.querySelector("loka-sidebar")
						);
						// What followDownloads sets when a download finishes with the panel closed (the layout recipe and
						// verify:flows `panels` prove it gets there); set here so it doesn't leave after 4 s mid-measure.
						sidebar.toast = sidebar.downloads.find((/** @type {any} */ d) => d.state === "complete");
					});
					await loka.sidebar.locator(".toast").waitFor();
					await loka.page.waitForTimeout(400);
					await measure(width, "download toast", `${width}px`, { root: "loka-sidebar", only: ".toast" });
					await sidebarShot(loka, `toast-${width}-${scheme}-${hue}`);
					if (width === 1280) {
						await loka.page.keyboard.press("Control+3");
						await page.getByText("Nothing open in Home").waitFor();
						await loka.page.mouse.move(off.x, off.y);
						await loka.page.waitForTimeout(800);
						await measure(width, "empty page", "Home", { root: "loka-page" });
					}
				}

				// The longest name the editor takes, on each planet: a quarter turn at a time in the default sidebar width,
				// and once in the narrowest.
				await loka.page.setViewportSize({ width: 330, height: 800 });
				for (const sidebarWidth of [300, 220]) {
					for (const planet of planets) {
						await showSpace(loka, { ...look, planet }, { x: 322, y: 400 }, { seed, name: LONG_NAME, sidebarWidth });
						for (const phase of sidebarWidth === 300 ? [0, 0.25, 0.5, 0.75] : [0]) {
							await turnPlanet(loka, phase);
							await measure(330, "long space name", `${sidebarWidth}px sidebar, ${planet}, turn ${phase}`, {
								root: "loka-sidebar",
								only: ".world-name",
							});
						}
						if (planet === planets[0]) await sidebarShot(loka, `long-name-${sidebarWidth}-${scheme}-${hue}`);
					}
				}
			}
		}
		contrastReport(
			loka,
			all,
			`${(only ?? hues).length} hues x 2 schemes; Settings and the space editor and the Library's four sections at 1280 px, the sidebar hidden; the command bar with the sidebar shown and hidden, and floating; the sidebar's four panels and the download toast at 330 and 1280 px; the empty page; a ${LONG_NAME.length}-letter space name on each planet at 300 and 220 px`,
		);
	},

	async extensions(loka) {
		// The fake browser has five extensions; uBlock Origin and Bitwarden are pinned into the address field.
		const ublock = loka.sidebar.getByRole("button", { name: "uBlock Origin", exact: true });
		await ublock.click();
		const [id, anchor] = /** @type {[string, { x: number; y: number }]} */ ((await demoCalls(loka, "runExtension"))[0]);
		const box = await ublock.boundingBox();
		assert.equal(id, "cjpalhdlnbpafiamejdnhcphjbkeiagm");
		assert.deepEqual([anchor.x, anchor.y], [box?.x, box?.y], "the popup opens at the button");
		await loka.page.getByRole("dialog", { name: "uBlock Origin popup" }).waitFor();
		await loka.proof("01-popup");

		await loka.sidebar.getByRole("button", { name: "Extensions", exact: true }).click();
		const panel = loka.sidebar.getByRole("dialog", { name: "Extensions" });
		await panel.getByRole("button", { name: "Pin Dark Reader" }).click();
		await loka.sidebar.getByRole("button", { name: "Dark Reader", exact: true }).waitFor();
		assert.deepEqual(await demoCalls(loka, "setExtensionPinned"), [["eimadpbcbfnmbkopoojfekhnkhdbieeh", true]]);
		await loka.proof("02-pinned-dark-reader");
		await loka.page.keyboard.press("Escape");

		// Right-click: the extension's own menu, headed with its name; Options only when it has an options page.
		const menuItems = async (/** @type {string} */ name) => {
			const menu = loka.sidebar.getByRole("menu", { name });
			await menu.waitFor();
			return (await menu.getByRole("menuitem").allTextContents()).map((t) => t.trim());
		};
		await ublock.click({ button: "right" });
		assert.deepEqual(await menuItems("uBlock Origin"), [
			"Unpin from address bar",
			"Options",
			"Manage extension",
			"Remove from Loka…",
		]);
		assert.equal(await loka.menuItem("New folder").count(), 0, "not the sidebar's own menu");
		await loka.page.waitForTimeout(250);
		await loka.proof("03-extension-menu");
		await loka.menuItem("Manage extension").click();
		await loka.sidebar
			.getByRole("button", { name: "Bitwarden Password Manager", exact: true })
			.click({ button: "right" });
		assert.deepEqual(await menuItems("Bitwarden Password Manager"), [
			"Unpin from address bar",
			"Manage extension",
			"Remove from Loka…",
		]);
		await loka.page.keyboard.press("Escape");
		// From the keyboard: Shift+F10 on the focused icon, Down, Enter; focus comes back to the icon.
		await ublock.focus();
		await loka.page.keyboard.press("Shift+F10");
		await menuItems("uBlock Origin");
		await loka.page.keyboard.press("ArrowDown");
		await loka.page.keyboard.press("Enter");
		assert.equal(await loka.sidebar.evaluate((el) => el.shadowRoot?.activeElement?.ariaLabel), "uBlock Origin");
		// In the panel, a row's right-click; Remove takes it out when the browser says so.
		await loka.sidebar.getByRole("button", { name: "Extensions", exact: true }).click();
		await panel.getByRole("button", { name: "Open Raindrop.io" }).click({ button: "right" });
		assert.deepEqual(await menuItems("Raindrop.io"), ["Pin to address bar", "Manage extension", "Remove from Loka…"]);
		await loka.menuItem("Remove from Loka…").click();
		await panel.getByRole("button", { name: "Open Raindrop.io" }).waitFor({ state: "detached" });
		assert.deepEqual(await demoCalls(loka, "extensionAction"), [
			["cjpalhdlnbpafiamejdnhcphjbkeiagm", "manage"],
			["cjpalhdlnbpafiamejdnhcphjbkeiagm", "options"],
			["ldgfbffkinooeloadekpmfoklnobpien", "remove"],
		]);
		await loka.proof("04-removed-from-panel");
	},

	async history(loka) {
		await loka.page.keyboard.press("Control+h");
		const history = loka.page.locator("loka-history");
		await history.getByRole("heading", { name: "Today" }).waitFor();
		// A day's top-level rows: visits, and sites folded into one row ("lit.dev, 4 visits").
		const topRows = history.locator('[role="tree"] > [role="treeitem"]');
		/** How many visits the list shows, counting each folded site's. */
		const visitCount = async () => {
			let n = 0;
			for (const label of await topRows.evaluateAll((rows) => rows.map((r) => r.getAttribute("aria-label") ?? ""))) {
				n += Number(/, (\d+) visits$/.exec(label)?.[1] ?? 1);
			}
			return n;
		};

		// No row shows a redirector's address: redirects are named for where they went.
		// textContent, not innerText: days off screen aren't rendered (content-visibility), so their innerText is empty.
		const first = await history.getByRole("treeitem").allTextContents();
		assert.ok(first.length > 0, "the list shows visits");
		assert.ok(
			first.every((t) => !/redirect\?|\/url\?|l\.php\?|https?:\/\//.test(t)),
			"no row shows a raw address or a redirect link",
		);

		// The date filters narrow the list to their days.
		await history.getByRole("button", { name: "Yesterday", exact: true }).click();
		await loka.page.waitForTimeout(300);
		const days = (await history.locator("section.day h2").allTextContents()).map((t) => t.trim());
		assert.deepEqual(days, ["Yesterday"], "Yesterday shows only yesterday");
		await loka.proof("01-yesterday");
		await history.getByRole("button", { name: "All", exact: true }).click();
		await history.getByRole("heading", { name: "Today" }).waitFor();

		// A folded site opens with Enter to show its visits, and Left closes it again.
		const site = history.locator('[role="treeitem"][aria-expanded="false"]').first();
		const siteLabel = (await site.getAttribute("aria-label")) ?? "";
		const siteKey = (await site.getAttribute("data-key")) ?? "";
		const siteVisits = Number(/, (\d+) visits$/.exec(siteLabel)?.[1] ?? 0);
		assert.ok(siteVisits >= 3, `a site folds three or more visits (${siteLabel})`);
		await site.focus();
		await loka.page.keyboard.press("Enter");
		const open = history.locator(`[data-key="${siteKey}"]`);
		assert.equal(await open.getAttribute("aria-expanded"), "true", "Enter opens the site");
		assert.equal(await open.locator('[role="group"] > [role="treeitem"]').count(), siteVisits, "showing its visits");
		await loka.page.keyboard.press("ArrowRight");
		assert.equal(
			await open
				.locator('[role="group"] > [role="treeitem"]')
				.first()
				.evaluate((el) => el.matches(":focus")),
			true,
			"Right goes into it",
		);
		await loka.proof("02-site-open");
		await loka.page.keyboard.press("ArrowLeft");
		await loka.page.keyboard.press("ArrowLeft");
		assert.equal(await open.getAttribute("aria-expanded"), "false", "Left goes back up and closes it");

		// Search narrows the list: every row is a Lit page, or lit.dev folded.
		await history.getByRole("searchbox", { name: "Search history" }).fill("lit:");
		await loka.page.waitForTimeout(400);
		const titles = await topRows.allTextContents();
		assert.ok(
			titles.length > 0 && titles.every((t) => t.includes("Lit:") || t.includes("lit.dev")),
			"the search narrows the list",
		);
		await loka.proof("03-search");

		// Pick a run with Shift and delete it.
		const before = await visitCount();
		await history.getByRole("checkbox").nth(0).click();
		await history
			.getByRole("checkbox")
			.nth(2)
			.click({ modifiers: ["Shift"] });
		const picked = Number(/(\d+) selected/.exec((await history.getByText(/\d+ selected/).textContent()) ?? "")?.[1]);
		assert.ok(picked >= 3, `three rows picked at least three visits (${picked})`);
		await history.getByRole("button", { name: "Delete" }).click();
		await loka.page.waitForTimeout(300);
		assert.ok((await visitCount()) <= before - picked, "the picked visits are gone (every visit to their pages)");
		assert.equal(await history.getByText(/\d+ selected/).count(), 0, "and nothing is picked any more");
		await loka.proof("04-deleted");
	},

	async library(loka) {
		const lib = loka.page.locator("loka-library");
		/** The Library's tab: the one tab at loka://history, wherever it is. */
		const libraryTab = async () =>
			Object.values((await loka.state()).tabs).find((/** @type {any} */ t) => t.url.startsWith("loka://history"));
		const openLibrary = async () => {
			await loka.page.getByRole("button", { name: "More" }).click();
			await loka.menuItem("Library").click();
		};
		const section = (/** @type {string} */ name) => lib.getByRole("link", { name, exact: true });

		// "..." > Library opens it at Spaces: every space with its planet, counts, whole pinned tree and open tabs.
		await openLibrary();
		const spaces = lib.locator("loka-library-spaces");
		await spaces.getByRole("heading", { name: "Build", exact: true }).waitFor();
		assert.equal((await libraryTab())?.url, "loka://history#spaces", "the Library opens at #spaces");
		assert.equal(await section("Spaces").getAttribute("aria-current"), "page", "the switcher marks Spaces");
		assert.deepEqual(
			(await spaces.getByRole("heading", { level: 2 }).allTextContents()).map((t) => t.trim()),
			["Essentials", "Build", "School", "Home"],
		);
		const school = spaces.getByRole("region", { name: "School" });
		assert.match((await school.textContent()) ?? "", /3 pinned, 2 folders/, "a space says what it holds");
		// The sidebar has Game project closed; the Library shows the whole tree.
		assert.equal(await school.getByRole("button", { name: /^Game project/ }).getAttribute("aria-expanded"), "true");
		await school.getByRole("button", { name: "Go to Game design doc" }).waitFor();
		await loka.proof("01-spaces");

		// A folder closes here only: the sidebar's folders stay as they were.
		await school.getByRole("button", { name: /^CSC 281/ }).click();
		assert.equal(await school.getByRole("button", { name: "Go to Game design doc" }).count(), 0, "closed here");
		const folderOpen = (/** @type {any} */ st, /** @type {string} */ id) =>
			st.spaces[1].pinned.find((/** @type {any} */ n) => n.id === id)?.open;
		assert.equal(folderOpen(await loka.state(), "f-csc281"), true, "and still open in the sidebar");
		await school.getByRole("button", { name: /^CSC 281/ }).click();

		// Clicking a tab goes to it: its space, the folders above it opened, the tab shown.
		await school.getByRole("button", { name: "Go to Game design doc" }).click();
		let st = await loka.state();
		const schoolNow = st.spaces.find((/** @type {any} */ s) => s.id === "s-school");
		assert.deepEqual([st.activeSpaceId, schoolNow.activeTabId], ["s-school", "t-gdd"], "the tab is shown");
		assert.equal(
			schoolNow.pinned[1].children[0].open,
			true,
			"Game project opened in the sidebar so the tab can be seen",
		);
		// Back to the Library (it's in Build), then "Switch to" Home.
		await openLibrary();
		await spaces.getByRole("button", { name: "Switch to Home" }).click();
		assert.equal((await loka.state()).activeSpaceId, "s-home", "Switch to goes to the space");
		await loka.page.keyboard.press("Control+1");

		// The rail's space rows reorder the spaces: drag Home above Build with the mouse.
		await openLibrary();
		const rail = spaces.getByRole("group", { name: "Go to a space" });
		// The current space's row is named "<space> Current space" (its dot's title).
		const railRow = (/** @type {string} */ name) => rail.getByRole("button", { name: new RegExp(`^${name}( |$)`) });
		const order = async () => (await loka.state()).spaces.map((/** @type {{ name: string }} */ s) => s.name);
		const railOrder = async () => (await rail.getByRole("button").allTextContents()).map((t) => t.trim());
		const from = await railRow("Home").boundingBox();
		const onto = await railRow("Build").boundingBox();
		if (!from || !onto) throw new Error("the rail's rows are not visible");
		await loka.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
		await loka.page.mouse.down();
		await loka.page.mouse.move(onto.x + onto.width / 2, onto.y + 4, { steps: 8 });
		assert.deepEqual(await railRow("Home").getAttribute("class"), "filter jump dragging", "the dragged row is lifted");
		assert.deepEqual(await railOrder(), ["Home", "Build", "School"], "mid-drag the rail shows where it lands");
		assert.deepEqual(await order(), ["Build", "School", "Home"], "nothing is saved before the drop");
		await loka.proof("01a-reorder-dragging");
		await loka.page.mouse.up();
		assert.deepEqual(await order(), ["Home", "Build", "School"], "the drop saved Home first");
		assert.deepEqual(
			(await spaces.getByRole("heading", { level: 2 }).allTextContents()).map((t) => t.trim()),
			["Essentials", "Home", "Build", "School"],
			"the list follows the new order",
		);
		await loka.proof("01b-reorder-dropped");
		await loka.page.keyboard.press("Control+1");
		assert.equal((await loka.state()).activeSpaceId, "s-home", "Ctrl+1 shows Home, now first");

		// Keys: focus Home's row and Alt+Down moves it one place, keeping the focus; at the end it stays.
		await openLibrary();
		const focused = () =>
			loka.page.evaluate(() => {
				let el = document.activeElement;
				while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
				return el?.textContent?.trim();
			});
		await railRow("Home").focus();
		await loka.page.keyboard.press("Alt+ArrowDown");
		assert.deepEqual(await order(), ["Build", "Home", "School"], "Alt+Down moved Home one place");
		assert.equal(await focused(), "Home", "Home's row keeps the focus");
		await loka.page.keyboard.press("Alt+ArrowDown");
		await loka.page.keyboard.press("Alt+ArrowDown");
		assert.deepEqual(await order(), ["Build", "School", "Home"], "Alt+Down at the end does nothing more");
		await loka.page.keyboard.press("Alt+ArrowUp");
		assert.deepEqual(await order(), ["Build", "Home", "School"], "Alt+Up moves it back up");
		assert.equal(await spaces.getByRole("status").textContent(), "Home moved to 2 of 3", "a screen reader hears it");
		await loka.proof("01c-reorder-by-keys");
		await loka.page.keyboard.press("Alt+ArrowDown");

		// Eight hours on, the archive takes Arc (17 h) and Zen (13 h) from Build.
		await loka.page.clock.install();
		await loka.page.reload({ waitUntil: "networkidle" });
		await loka.sidebar.getByRole("tree").first().waitFor();
		await loka.page.clock.fastForward("08:00:00");
		assert.deepEqual(
			(await loka.state()).archive.map((/** @type {any} */ a) => a.tab.title),
			["Arc: what we learned", "Zen Browser"],
		);

		await openLibrary();
		await section("Archive").click();
		const archive = lib.locator("loka-library-archive");
		await archive.getByRole("heading", { name: "Archived tabs" }).waitFor();
		assert.equal((await libraryTab())?.url, "loka://history#archive", "the switcher changes the address");
		assert.deepEqual(
			(await archive.locator("section h2").allTextContents()).map((t) => t.trim()),
			["Today"],
		);
		const arcRow = archive.getByRole("button", { name: "Bring back Arc: what we learned" });
		assert.match((await arcRow.textContent()) ?? "", /Build/, "a row names the space it left");
		await archive.getByRole("button", { name: /^Build/ }).click();
		assert.equal(await archive.getByRole("button", { name: /^Bring back/ }).count(), 2, "Build's filter keeps both");
		await archive.getByRole("searchbox", { name: "Search archived tabs" }).fill("zen");
		assert.deepEqual(
			await archive.getByRole("button", { name: /^Bring back/ }).evaluateAll((els) => els.map((e) => e.ariaLabel)),
			["Bring back Zen Browser"],
			"search narrows to Zen",
		);
		await loka.proof("02-archive-search");
		await archive.getByRole("button", { name: "Bring back Zen Browser" }).click();
		st = await loka.state();
		const build = st.spaces.find((/** @type {any} */ s) => s.id === "s-build");
		assert.deepEqual(
			[st.activeSpaceId, build.open[0], build.activeTabId],
			["s-build", "t-zen", "t-zen"],
			"Zen is back at the top of Build's open tabs, shown",
		);
		assert.deepEqual(
			st.archive.map((/** @type {any} */ a) => a.tab.title),
			["Arc: what we learned"],
		);

		// Clear asks first; Cancel keeps it, Clear archive empties it.
		await openLibrary();
		await section("Archive").click();
		await archive.getByRole("button", { name: "Clear archive…" }).click();
		const confirm = archive.getByRole("alertdialog", { name: "Clear 1 archived tab?" });
		await confirm.waitFor();
		// It fades in; the picture waits for that.
		await loka.page.waitForTimeout(300);
		await loka.proof("03-archive-confirm");
		await confirm.getByRole("button", { name: "Cancel" }).click();
		assert.equal((await loka.state()).archive.length, 1, "Cancel keeps the archive");
		await archive.getByRole("button", { name: "Clear archive…" }).click();
		await confirm.getByRole("button", { name: "Clear archive" }).click();
		assert.deepEqual((await loka.state()).archive, [], "Clear archive empties it");
		await archive.getByText("Nothing archived").waitFor();

		// Downloads: the browser's list by day, with each state's actions.
		await section("Downloads").click();
		const downloads = lib.locator("loka-library-downloads");
		await downloads.getByRole("heading", { name: "Downloads" }).waitFor();
		assert.equal((await libraryTab())?.url, "loka://history#downloads");
		await downloads.getByRole("button", { name: "Pause helium_0.19.2.1_x64-installer.exe" }).click();
		await downloads.getByRole("button", { name: "Resume helium_0.19.2.1_x64-installer.exe" }).waitFor();
		await downloads.getByRole("button", { name: "Show in folder CSC281-GDD-v3.pdf" }).click();
		// A finished file's row is its Open button, named by the file.
		await downloads.getByRole("button", { name: /^CSC281-GDD-v3\.pdf/ }).click();
		assert.deepEqual(await demoCalls(loka, "downloadAction"), [
			[6, "pause"],
			[4, "show"],
			[4, "open"],
		]);
		await downloads.getByRole("searchbox", { name: "Search downloads" }).fill("nodejs");
		assert.deepEqual(
			await downloads.getByRole("button", { name: /^Try again/ }).evaluateAll((els) => els.map((e) => e.ariaLabel)),
			["Try again node-v24.4.0-x64.msi"],
			"search finds a file by the site it came from",
		);
		await downloads.getByRole("searchbox", { name: "Search downloads" }).fill("");
		await loka.proof("04-downloads");

		// History is the existing page, and Ctrl+H from any section goes back to it.
		await section("Spaces").click();
		await spaces.getByRole("heading", { name: "Build", exact: true }).waitFor();
		await loka.page.keyboard.press("Control+h");
		// The clock is 8 hours on, so the fake's visits may read Yesterday: wait for the section, not a day.
		await lib.locator("loka-history").getByRole("heading", { name: "History", level: 1 }).waitFor();
		await lib.locator("loka-history").getByRole("treeitem").first().waitFor();
		assert.equal((await libraryTab())?.url, "loka://history", "Ctrl+H is the bare address");
		assert.equal(await section("History").getAttribute("aria-current"), "page");

		// A narrow window: the rail is a header, the sections one row across it.
		await loka.page.setViewportSize({ width: 760, height: 800 });
		await section("Spaces").click();
		await spaces.getByRole("heading", { name: "Build", exact: true }).waitFor();
		const [first, last] = await Promise.all([section("Spaces").boundingBox(), section("Downloads").boundingBox()]);
		assert.equal(first?.y, last?.y, "the four sections sit in one row");
		await loka.proof("05-narrow");

		// Narrow, the rail's spaces are a row of pills: a drag goes sideways. Home onto Build's left edge goes first.
		assert.deepEqual(await order(), ["Build", "School", "Home"]);
		const pill = await railRow("Home").boundingBox();
		const leftOf = await railRow("Build").boundingBox();
		if (!pill || !leftOf) throw new Error("the rail's pills are not visible");
		assert.equal(pill.y, leftOf.y, "the pills sit in one row");
		await loka.page.mouse.move(pill.x + pill.width / 2, pill.y + pill.height / 2);
		await loka.page.mouse.down();
		await loka.page.mouse.move(leftOf.x + 4, leftOf.y + leftOf.height / 2, { steps: 8 });
		await loka.page.mouse.up();
		assert.deepEqual(await order(), ["Home", "Build", "School"], "a sideways drag reorders in the narrow rail");
		await loka.proof("06-narrow-reordered");
	},

	async sound(loka) {
		// Counts the oscillators each action starts; the page is reloaded with the counter in place.
		await loka.page.addInitScript(() => {
			/** @type {any} */ (window).__tones = 0;
			const start = OscillatorNode.prototype.start;
			OscillatorNode.prototype.start = function (...args) {
				/** @type {any} */ (window).__tones++;
				return start.apply(this, args);
			};
		});
		await loka.page.reload({ waitUntil: "networkidle" });
		await loka.sidebar.getByRole("tree").first().waitFor();
		const tones = async () => {
			await loka.page.waitForTimeout(300);
			return loka.page.evaluate(() => {
				const n = /** @type {any} */ (window).__tones;
				/** @type {any} */ (window).__tones = 0;
				return n;
			});
		};
		assert.equal(await tones(), 0, "nothing plays as the page loads");
		// After the first input the audio device opens once the page has been quiet for 3 s (it's slow to open), so
		// cues start after that.
		await loka.page.mouse.click(800, 600);
		await loka.page.waitForTimeout(3600);
		await tones();
		await loka.row("Docs").click();
		assert.ok((await tones()) > 0, "closing a folder plays a cue");
		await loka.page.keyboard.press("Control+2");
		assert.ok((await tones()) > 0, "switching spaces plays a cue");
		await loka.page.keyboard.press("Control+2");
		assert.equal(await tones(), 0, "the space you're already in plays nothing");
		// Each folder cue is two tones. The gate allows at most three cues in 600ms, so some of five quick clicks drop.
		for (let i = 0; i < 5; i++) await loka.row("Game project").click({ delay: 0 });
		const fast = await tones();
		assert.ok(fast > 0 && fast < 10, `five quick clicks play fewer than five cues (${fast / 2})`);

		await loka.page.keyboard.press("Control+1");
		await loka.page.waitForTimeout(400);
		await loka.page.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Settings").click();
		const settings = loka.page.locator("loka-settings");
		await settings.getByRole("switch", { name: "Sound effects" }).click();
		assert.equal((await loka.ui()).sound, false, "the switch saves sound off");
		await loka.proof("01-sound-off");
		await tones();
		await loka.row("Docs").click();
		assert.equal(await tones(), 0, "with sound off, nothing plays");

		// Off shows as a quiet icon in the top row, which turns sounds back on; so does "..." > Unmute sounds.
		const off = loka.sidebar.getByRole("button", { name: "Sounds are off" });
		assert.equal(await off.count(), 1, "a muted sidebar says so");
		await off.click();
		assert.equal((await loka.ui()).sound, true, "the icon turns sounds back on");
		assert.equal(await off.count(), 0, "and goes");
		await loka.page.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Mute sounds").click();
		assert.equal((await loka.ui()).sound, false, "... > Mute sounds turns them off");

		// Autoplay is the browser's: Settings > Media asks it, and keeps what it showed.
		await settings.getByRole("radio", { name: "Block sound only" }).click();
		assert.deepEqual(await demoCalls(loka, "setAutoplay"), [["block-audible"]]);
		assert.equal((await loka.ui()).autoplay, "block-audible");
		await loka.proof("02-autoplay");
	},

	async sky(loka) {
		// Fake timers, so 15 s without input pass at once; the page reloads with them in place.
		await loka.page.clock.install();
		await loka.page.reload({ waitUntil: "networkidle" });
		await loka.sidebar.getByRole("tree").first().waitFor();
		/** The window's sky: what sky.ts set on the page's root, and the near star layer's drift. */
		const sky = () =>
			loka.page.evaluate(() => {
				const stars = document.querySelector("loka-app")?.shadowRoot?.querySelector(".sky .stars.near");
				return {
					play: getComputedStyle(document.documentElement).getPropertyValue("--loka-sky-play").trim(),
					willChange: stars ? getComputedStyle(stars).willChange : null,
					drift: stars?.getAnimations()[0]?.playState ?? null,
				};
			});
		const moving = { play: "running", willChange: "transform", drift: "running" };
		const still = { play: "paused", willChange: "auto", drift: "paused" };

		assert.equal((await loka.ui()).starMotion ?? "while-using", "while-using", "the default is while I'm using Loka");
		assert.deepEqual(await sky(), moving, "the stars drift once the page opens");
		await loka.page.clock.fastForward(14_000);
		assert.deepEqual(await sky(), moving, "and still at 14 s without input");
		await loka.page.clock.fastForward(1_500);
		assert.deepEqual(await sky(), still, "15 s without input: they stop");
		await loka.page.mouse.move(640, 400);
		assert.deepEqual(await sky(), moving, "the pointer moving in the window starts them again");

		await loka.page.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Settings").click();
		const stars = loka.page.locator("loka-settings").getByRole("radiogroup", { name: "Moving stars" });
		await stars.scrollIntoViewIfNeeded();
		assert.equal(await stars.getByRole("radio", { name: "While I'm using Loka" }).getAttribute("aria-checked"), "true");
		await loka.proof("01-appearance");

		// Off draws the sky with no drift animation at all, so it holds no layers for it.
		const off = { play: "paused", willChange: "auto", drift: null };
		await stars.getByRole("radio", { name: "Off" }).click();
		assert.equal((await loka.ui()).starMotion, "off", "Off is saved");
		assert.deepEqual(await sky(), off, "Off holds the stars");
		await loka.page.mouse.move(600, 380);
		assert.deepEqual(await sky(), off, "and input doesn't start them");

		await stars.getByRole("radio", { name: "Always" }).click();
		assert.equal((await loka.ui()).starMotion, "always", "Always is saved");
		await loka.page.clock.fastForward(60_000);
		assert.deepEqual(await sky(), moving, "Always: still drifting a minute after the last input");

		// Every mode stops while the window is hidden (minimised or covered) and with reduced motion.
		const setHidden = (/** @type {boolean} */ hidden) =>
			loka.page.evaluate((h) => {
				Object.defineProperty(document, "visibilityState", {
					configurable: true,
					get: () => (h ? "hidden" : "visible"),
				});
				document.dispatchEvent(new Event("visibilitychange"));
			}, hidden);
		await setHidden(true);
		assert.deepEqual(await sky(), still, "Always stops while the window is hidden");
		await setHidden(false);
		assert.deepEqual(await sky(), moving, "and goes on when it shows again");
		// The media query's change event comes a moment after emulateMedia.
		const settledSky = async (/** @type {{ play: string, willChange: string, drift: string | null }} */ want) => {
			for (let i = 0; i < 20 && JSON.stringify(await sky()) !== JSON.stringify(want); i++) {
				await loka.page.waitForTimeout(50);
			}
			return sky();
		};
		await loka.page.emulateMedia({ reducedMotion: "reduce" });
		const reduced = { play: "paused", willChange: "auto", drift: null };
		assert.deepEqual(await settledSky(reduced), reduced, "with reduced motion the stars have no drift at all");
		await loka.page.emulateMedia({ reducedMotion: "no-preference" });
		assert.deepEqual(await settledSky(moving), moving, "and drift again without it");

		await stars.getByRole("radio", { name: "While I'm using Loka" }).click();
		assert.equal((await loka.ui()).starMotion, "while-using");
		await loka.proof("02-back-to-default");
	},
};

/** The rows picked with Ctrl+ or Shift+click or Shift+arrow (aria-checked), by name, in sidebar order. @param {Loka} loka */
async function picked(loka) {
	return loka.sidebar.getByRole("treeitem", { checked: true }).locator(".label").allTextContents();
}

/** A space's open tabs by title, from the saved state. @param {any} state @param {string} spaceId */
function spaceOpen(state, spaceId) {
	const space = state.spaces.find((/** @type {{ id: string }} */ x) => x.id === spaceId);
	return space.open.map((/** @type {string} */ id) => state.tabs[id].title);
}

/** Back to the seed data, from `...` > Reset demo data. @param {Loka} loka */
async function resetDemo(loka) {
	await loka.sidebar.getByRole("button", { name: "More" }).click();
	await loka.menuItem("Reset demo data").click();
	await loka.page.waitForTimeout(300);
}

/** What the sidebar asked the fake browser to do, by message, as argument lists. @param {Loka} loka @param {string} message */
async function demoCalls(loka, message) {
	return loka.page.evaluate((m) => window.lokaDemo.calls.filter((c) => c.message === m).map((c) => c.args), message);
}

/** Waits until the tour's step has finished fading in, so its screenshot isn't blank on a busy machine. @param {Loka} loka */
async function settled(loka) {
	await loka.page.waitForFunction(() => {
		const tour = document.querySelector("loka-app")?.shadowRoot?.querySelector("loka-onboarding");
		return tour?.shadowRoot?.getAnimations().length === 0;
	});
}

/** The items of an exported array literal in a source file, so the recipe can't drift from it. */
function sourceList(/** @type {string} */ file, /** @type {string} */ name) {
	const match = readFileSync(join(ROOT, file), "utf8").match(new RegExp(`${name}\\b[^=]*= \\[([^\\]]+)\\]`));
	if (!match?.[1]) throw new Error(`no ${name} in ${file}`);
	return match[1].split(",").map((s) => s.trim().replace(/"/g, ""));
}

/**
 * Gives every space this hue, scheme and planet and shows Build, from a reload, with the stars still. `seed` starts
 * from that saved state instead of the current one. `page` shows that address in Build (loka://settings,
 * loka://history#spaces), `archive` puts three tabs in the archive (one from a deleted space), `name` renames Build,
 * `pinned: false` hides the sidebar so the page spans the window, and `sidebarWidth` sets its width.
 * @param {Loka} loka
 * @param {{ hue: number, scheme: string, planet: string }} look
 * @param {{ x: number, y: number }} away
 * @param {{ seed?: unknown, page?: string, archive?: boolean, name?: string, pinned?: boolean, sidebarWidth?: number }} [options]
 */
async function showSpace(loka, look, away, options = {}) {
	await loka.page.evaluate(
		({ look, options }) => {
			const state = options.seed
				? structuredClone(options.seed)
				: JSON.parse(localStorage.getItem("loka.state.v1") ?? "null");
			for (const space of state.spaces) Object.assign(space, look);
			const build = state.spaces[0];
			state.activeSpaceId = build.id;
			if (options.name) build.name = options.name;
			if (options.page) {
				state.tabs["contrast-page"] = { id: "contrast-page", title: "Loka", url: options.page };
				build.open.unshift("contrast-page");
				build.activeTabId = "contrast-page";
			}
			if (options.archive) {
				const hour = 3_600_000;
				const gone = (/** @type {string} */ id, /** @type {string} */ title, /** @type {string} */ url) => ({
					id: `contrast-archived-${id}`,
					title,
					url,
				});
				state.archive = [
					{
						tab: gone("1", "Arc: what we learned", "https://arc.net/blog"),
						spaceId: build.id,
						archivedAt: Date.now() - 2 * hour,
					},
					{
						tab: gone("2", "Zen Browser", "https://zen-browser.app/"),
						spaceId: state.spaces[1].id,
						archivedAt: Date.now() - 26 * hour,
					},
					{
						tab: gone("3", "Notes on tab groups", "https://example.com/notes"),
						spaceId: "gone",
						archivedAt: Date.now() - 72 * hour,
					},
				];
			}
			localStorage.setItem("loka.state.v1", JSON.stringify(state));
			const ui = {
				onboarded: true,
				starMotion: "off",
				...(options.sidebarWidth ? { sidebarWidth: options.sidebarWidth } : {}),
			};
			localStorage.setItem("loka.ui.v1", JSON.stringify(ui));
			if (options.pinned === false) localStorage.setItem("loka.demo.sidebarPinned", "false");
			else localStorage.removeItem("loka.demo.sidebarPinned");
		},
		{ look, options },
	);
	await loka.page.reload({ waitUntil: "networkidle" });
	await loka.sidebar.getByRole("tree").first().waitFor();
	await loka.page.mouse.move(away.x, away.y);
	await loka.page.waitForTimeout(400);
	await turnPlanet(loka, 0);
}

/** Holds the big planet's turn at this fraction of a full turn. */
async function turnPlanet(/** @type {Loka} */ loka, /** @type {number} */ phase) {
	await loka.page.evaluate((phase) => {
		const root = document.querySelector("loka-app")?.shadowRoot?.querySelector("loka-sidebar")?.shadowRoot;
		for (const a of root?.getAnimations() ?? []) {
			if (!(a instanceof CSSAnimation) || a.animationName !== "turn") continue;
			a.pause();
			a.currentTime = phase * 270_000;
		}
	}, phase);
}

/** The sidebar (and a menu reaching past it) as <name>.png in the evidence folder. */
async function sidebarShot(/** @type {Loka} */ loka, /** @type {string} */ name) {
	const box = await loka.sidebar.boundingBox();
	if (!box) throw new Error("the sidebar isn't showing");
	await loka.page.screenshot({
		path: join(loka.dir, `${name}.png`),
		clip: { x: 0, y: 0, width: Math.ceil(box.x + box.width) + 40, height: Math.ceil(box.height) },
	});
}

/** The page (Settings, the Library, the empty page) as <name>.png in the evidence folder: the whole window. */
async function pageShot(/** @type {Loka} */ loka, /** @type {string} */ name) {
	await loka.page.screenshot({ path: join(loka.dir, `${name}.png`) });
}

/**
 * Scrolls the biggest scrolling box inside the first `host` element (found through shadow roots) on by most of its
 * height, or back to the top. Says whether it moved.
 * @param {Loka} loka @param {string} host @param {"next" | "top"} [to]
 */
async function scrollSurface(loka, host, to = "next") {
	const moved = await loka.page.evaluate(
		({ host, to }) => {
			/** @returns {Element[]} */
			const everything = (/** @type {ParentNode} */ root) =>
				[...root.querySelectorAll("*")].flatMap((el) => [el, ...(el.shadowRoot ? everything(el.shadowRoot) : [])]);
			const surface = everything(document).find((el) => el.localName === host);
			if (!surface?.shadowRoot) throw new Error(`no ${host}`);
			const scrollers = everything(surface.shadowRoot).filter((el) => {
				const s = getComputedStyle(el);
				return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 8;
			});
			const box = scrollers.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
			if (!box) return false;
			const before = box.scrollTop;
			box.scrollTo({ top: to === "top" ? 0 : before + box.clientHeight * 0.85, behavior: "instant" });
			return box.scrollTop !== before;
		},
		{ host, to },
	);
	// Lists fade at their edges with scroll-driven animations; give them, and anything loading in, a moment.
	await loka.page.waitForTimeout(moved ? 400 : 0);
	return moved;
}

/** Where the sidebar's panels draw: the four panels' own elements, inside the sidebar's panel. */
const PANELS = "loka-downloads, loka-archive-panel, loka-sidebar-search, loka-extensions";

/** As long as the space editor lets a name be (maxlength 32). */
const LONG_NAME = "Weekend research and long reads";

/**
 * Writes every measurement to contrast.json and the texts below their minimum, worst per text, to contrast.txt with
 * the counts per surface and scheme; prints the table and fails if any text is short.
 * @param {Loka} loka @param {Measured[]} all @param {string} what
 */
function contrastReport(loka, all, what) {
	writeFileSync(join(loka.dir, "contrast.json"), JSON.stringify(all, null, 1));
	const failing = worstPerText(all.filter((m) => !m.excluded && m.ratio < m.needs));
	const measured = all.filter((m) => !m.excluded);
	const lowest = Math.min(...measured.map((m) => m.ratio)).toFixed(2);
	const surfaces = [...new Set(all.map((m) => m.surface))];
	const count = (/** @type {Measured[]} */ list, /** @type {string} */ surface, /** @type {string} */ scheme) =>
		list.filter((m) => m.surface === surface && m.scheme === scheme).length;
	const table = [
		`${measured.length} text boxes measured (${what}); lowest ${lowest}:1`,
		`${failing.length} texts below their minimum (${["dark", "light"].map((s) => `${s} ${failing.filter((m) => m.scheme === s).length}`).join(", ")})`,
		"",
		["surface", "measured dark", "measured light", "failing dark", "failing light"].join("\t"),
		...surfaces.map((s) =>
			[
				s,
				count(measured, s, "dark"),
				count(measured, s, "light"),
				count(failing, s, "dark"),
				count(failing, s, "light"),
			].join("\t"),
		),
		"",
		["scheme", "hue", "element", "text", "ratio", "needs", "raw", "where"].join("\t"),
		...failing.map((m) =>
			[m.scheme, m.hue, m.element, m.text, m.ratio.toFixed(2), m.needs, m.raw.toFixed(2), m.where].join("\t"),
		),
	].join("\n");
	writeFileSync(join(loka.dir, "contrast.txt"), `${table}\n`);
	console.log(table);
	assert.equal(failing.length, 0, `${failing.length} texts below 4.5:1 (3:1 large); table in contrast.txt`);
}

/**
 * @typedef {{ width: number, hue: number, scheme: string, planet: string, surface: string, state: string,
 *   element: string, text: string, ratio: number, raw: number, needs: number, where: string, excluded?: string }} Measured
 */

/**
 * WCAG contrast of every text in an element (the sidebar unless `root` names another, found through shadow roots)
 * against what's drawn behind it. It reads each text's color and box,
 * screenshots the window, hides all text (color: transparent; a text-shadow stays, as it's drawn to sit behind the
 * letters, the way a halo is the background in WCAG's terms) and screenshots it again. The pixels that changed are the
 * letters; the rectangle around them inside the text's box is where it looks, so a line box's padding or a badge's
 * rounded ends don't count. In there it takes the worst background pixel: the lowest ratio of the text's color,
 * blended by its own and its ancestors' opacity, against that pixel. Before that each pixel is the median of the 5x5
 * around it, which keeps the sky's gradients, the nebula, the clouds and the planet but drops specks under 2 px
 * across: a single star under a light label would fail any color there is (`raw` is the ratio without it). Large text
 * (24 px, or 18.66 px bold) needs 3:1, the rest 4.5:1. A text field's value, or its placeholder when it's empty, and a
 * select's shown option count as text in the field's content box. Text in the sidebar's list that has slid under the
 * planet's fade is excluded, as it's meant to dissolve there, and so is a disabled control's (WCAG exempts inactive
 * controls). `only` limits it to texts inside an element matching a selector, through shadow roots.
 * @param {Loka} loka
 * @param {{ width: number, hue: number, scheme: string, planet: string, surface: string, state: string }} at
 * @param {{ root?: string, only?: string }} [where]
 * @returns {Promise<Measured[]>}
 */
async function measureText(loka, at, { root = "loka-sidebar", only = "" } = {}) {
	const texts = await loka.page.evaluate(
		({ root, only }) => {
			/** @returns {Element | undefined} */
			const find = (/** @type {ParentNode} */ r) => {
				for (const el of r.querySelectorAll("*")) {
					if (el.localName === root) return el;
					const inside = el.shadowRoot && find(el.shadowRoot);
					if (inside) return inside;
				}
				return undefined;
			};
			const surface = find(document);
			if (!surface?.shadowRoot) throw new Error(`no ${root}`);
			const paint = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
			if (!paint) throw new Error("no canvas");
			/** A CSS color as sRGB 0-255 and alpha 0-1, however it's written (hsl, oklch, color-mix). */
			const rgba = (/** @type {string} */ color) => {
				paint.clearRect(0, 0, 1, 1);
				paint.fillStyle = color;
				paint.fillRect(0, 0, 1, 1);
				const [r = 0, g = 0, b = 0, a = 0] = paint.getImageData(0, 0, 1, 1).data;
				return [r, g, b, a / 255];
			};
			const up = (/** @type {Element} */ el) => {
				const root = el.getRootNode();
				return el.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
			};
			const fade =
				root === "loka-sidebar" ? surface.shadowRoot.querySelector(".bottom")?.getBoundingClientRect() : undefined;
			/**
			 * @type {{ element: string, text: string, color: number[], opacity: number, needs: number, excluded?: string,
			 *   boxes: { x: number, y: number, right: number, bottom: number }[] }[]}
			 */
			const out = [];
			/** One text drawn by `el` in `color`, in these rectangles. */
			const record = (
				/** @type {Element} */ el,
				/** @type {string} */ text,
				/** @type {string} */ color,
				/** @type {DOMRect[]} */ rects,
			) => {
				if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
				const style = getComputedStyle(el);
				let opacity = 1;
				let inside = !only;
				let disabled = false;
				const clips = [new DOMRect(0, 0, innerWidth, innerHeight)];
				for (let a = /** @type {Element | null} */ (el); a; a = up(a)) {
					const s = getComputedStyle(a);
					opacity *= Number(s.opacity);
					if (s.overflowX !== "visible" || s.overflowY !== "visible") clips.push(a.getBoundingClientRect());
					if (only && a.matches(only)) inside = true;
					if (a.matches(":disabled, [aria-disabled='true']")) disabled = true;
				}
				if (!inside || opacity < 0.05) return;
				const boxes = rects.flatMap((r) => {
					const x = Math.max(r.left, ...clips.map((c) => c.left));
					const y = Math.max(r.top, ...clips.map((c) => c.top));
					const right = Math.min(r.right, ...clips.map((c) => c.right));
					const bottom = Math.min(r.bottom, ...clips.map((c) => c.bottom));
					return right - x >= 2 && bottom - y >= 2 ? [{ x, y, right, bottom }] : [];
				});
				if (!boxes.length) return;
				const size = Number.parseFloat(style.fontSize);
				const weight = Number(style.fontWeight);
				const host = /** @type {ShadowRoot} */ (el.getRootNode()).host?.localName ?? "";
				const under = fade && el.closest(".scroll") && boxes.every((b) => b.bottom > fade.top + 24);
				const tag = (/** @type {Element} */ e) => `${e.localName}${[...e.classList].map((c) => `.${c}`).join("")}`;
				// An element with no class of its own is named by its parent too: span.world-name > span.
				const name = el.classList.length || !el.parentElement ? tag(el) : `${tag(el.parentElement)} > ${tag(el)}`;
				out.push({
					element: `${host} ${name}`.trim(),
					text: text.replace(/\s+/g, " ").trim().slice(0, 40),
					color: rgba(color),
					opacity,
					boxes,
					needs: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5,
					excluded: under ? "under the planet's fade" : disabled ? "disabled" : undefined,
				});
			};
			/** A field's content box: where its value or placeholder is drawn. */
			const contentBox = (/** @type {Element} */ el) => {
				const r = el.getBoundingClientRect();
				const s = getComputedStyle(el);
				const px = (/** @type {string} */ v) => Number.parseFloat(v) || 0;
				const left = r.left + px(s.borderLeftWidth) + px(s.paddingLeft);
				const top = r.top + px(s.borderTopWidth) + px(s.paddingTop);
				const right = r.right - px(s.borderRightWidth) - px(s.paddingRight);
				const bottom = r.bottom - px(s.borderBottomWidth) - px(s.paddingBottom);
				return new DOMRect(left, top, right - left, bottom - top);
			};
			const visit = (/** @type {Node} */ node) => {
				if (node instanceof Text) {
					const el = node.parentElement;
					// .fav is a favicon stand-in: a letter drawn as the site's icon, on its own color.
					if (!el || !node.data.trim() || el.closest("svg, style, .fav, option, textarea")) return;
					const range = document.createRange();
					range.selectNodeContents(node);
					record(el, node.data, getComputedStyle(el).color, [...range.getClientRects()]);
					return;
				}
				if (
					(node instanceof HTMLInputElement && /^(text|search|url|email|number|)$/.test(node.type)) ||
					node instanceof HTMLTextAreaElement
				) {
					const color = node.value ? getComputedStyle(node).color : getComputedStyle(node, "::placeholder").color;
					if (node.value || node.placeholder) record(node, node.value || node.placeholder, color, [contentBox(node)]);
				}
				if (node instanceof HTMLSelectElement) {
					const shown = node.selectedOptions[0]?.text ?? "";
					if (shown.trim()) record(node, shown, getComputedStyle(node).color, [contentBox(node)]);
				}
				if (node instanceof Element && node.shadowRoot) visit(node.shadowRoot);
				for (const child of node.childNodes) visit(child);
			};
			visit(surface);
			return out;
		},
		{ root, only },
	);

	// The same window with every letter gone.
	const hide = (/** @type {boolean} */ on) =>
		loka.page.evaluate(async (on) => {
			const w = /** @type {Window & { contrastHide?: CSSStyleSheet }} */ (window);
			if (!w.contrastHide) {
				w.contrastHide = new CSSStyleSheet();
				w.contrastHide.replaceSync(
					"*, *::before, *::after, *::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important; text-decoration-color: transparent !important; caret-color: transparent !important; transition: none !important; }",
				);
			}
			const sheet = w.contrastHide;
			const roots = /** @type {(Document | ShadowRoot)[]} */ ([document]);
			const walk = (/** @type {ParentNode} */ n) => {
				for (const el of n.querySelectorAll("*")) {
					if (el.shadowRoot) {
						roots.push(el.shadowRoot);
						walk(el.shadowRoot);
					}
				}
			};
			walk(document);
			for (const root of roots) {
				const rest = root.adoptedStyleSheets.filter((s) => s !== sheet);
				root.adoptedStyleSheets = on ? [...rest, sheet] : rest;
			}
			await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
		}, on);
	const shown = (await loka.page.screenshot()).toString("base64");
	await hide(true);
	const hidden = (await loka.page.screenshot()).toString("base64");
	await hide(false);

	const ratios = await loka.page.evaluate(
		async ({ shown, hidden, texts }) => {
			const pixels = async (/** @type {string} */ png) => {
				const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
				const ctx = new OffscreenCanvas(image.width, image.height).getContext("2d", { willReadFrequently: true });
				if (!ctx) throw new Error("no canvas");
				ctx.drawImage(image, 0, 0);
				return ctx.getImageData(0, 0, image.width, image.height);
			};
			const { width, height, data: px } = await pixels(hidden);
			const letters = (await pixels(shown)).data;
			/** The rectangle around the pixels the text drew inside a box, or the box when it drew none. */
			const ink = (/** @type {{ x: number, y: number, right: number, bottom: number }} */ b) => {
				const found = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, right: 0, bottom: 0, n: 0 };
				for (let y = Math.ceil(b.y); y < Math.floor(b.bottom); y++) {
					for (let x = Math.ceil(b.x); x < Math.floor(b.right); x++) {
						const i = (y * width + x) * 4;
						let change = 0;
						for (let c = 0; c < 3; c++) change += Math.abs((letters[i + c] ?? 0) - (px[i + c] ?? 0));
						if (change < 24) continue;
						found.n++;
						found.x = Math.min(found.x, x);
						found.y = Math.min(found.y, y);
						found.right = Math.max(found.right, x + 1);
						found.bottom = Math.max(found.bottom, y + 1);
					}
				}
				return found.n >= 3 ? found : b;
			};
			// This runs for every pixel under every text (millions on a page), so it allocates nothing per pixel.
			const linear = (/** @type {number} */ c) => {
				const v = c / 255;
				return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
			};
			const LINEAR = Float64Array.from({ length: 256 }, (_, c) => linear(c));
			/** Linear light of a channel that may be a blend (not a whole number). */
			const lin = (/** @type {number} */ c) => (Number.isInteger(c) ? (LINEAR[c] ?? 0) : linear(c));
			const luminance = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) =>
				0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
			const index = (/** @type {number} */ x, /** @type {number} */ y) =>
				(Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4;
			const window5 = [new Uint8Array(25), new Uint8Array(25), new Uint8Array(25)];
			const bg = [0, 0, 0];
			/** The median of the 5x5 around a pixel, per channel, into `bg`. */
			const median = (/** @type {number} */ x, /** @type {number} */ y) => {
				let n = 0;
				for (let dy = -2; dy <= 2; dy++) {
					for (let dx = -2; dx <= 2; dx++) {
						const i = index(x + dx, y + dy);
						for (let c = 0; c < 3; c++) /** @type {Uint8Array} */ (window5[c])[n] = px[i + c] ?? 0;
						n++;
					}
				}
				for (let c = 0; c < 3; c++) bg[c] = /** @type {Uint8Array} */ (window5[c]).sort()[12] ?? 0;
			};
			return texts.map((t) => {
				const [tr = 0, tg = 0, tb = 0, ta = 1] = t.color;
				const alpha = ta * t.opacity;
				const ratio = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => {
					const a = luminance(alpha * tr + (1 - alpha) * r, alpha * tg + (1 - alpha) * g, alpha * tb + (1 - alpha) * b);
					const l = luminance(r, g, b);
					return (Math.max(a, l) + 0.05) / (Math.min(a, l) + 0.05);
				};
				let worst = Number.POSITIVE_INFINITY;
				let raw = Number.POSITIVE_INFINITY;
				let where = "";
				for (const b of t.boxes.map(ink)) {
					for (let y = Math.ceil(b.y); y < Math.floor(b.bottom); y++) {
						for (let x = Math.ceil(b.x); x < Math.floor(b.right); x++) {
							median(x, y);
							const [r = 0, g = 0, bl = 0] = bg;
							const here = ratio(r, g, bl);
							const i = index(x, y);
							raw = Math.min(raw, ratio(px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0));
							if (here < worst) {
								worst = here;
								where = `${x},${y} on rgb(${r} ${g} ${bl}) ink rgba(${t.color.join(" ")}) x${t.opacity.toFixed(2)}`;
							}
						}
					}
				}
				return { ratio: worst, raw, where };
			});
		},
		{ shown, hidden, texts },
	);
	return texts.map((t, i) => ({
		...at,
		element: t.element,
		text: t.text,
		needs: t.needs,
		...(ratios[i] ?? { ratio: 0, raw: 0, where: "" }),
		...(t.excluded ? { excluded: t.excluded } : {}),
	}));
}

/** One line per text that fails, at its worst over every state and planet it was measured in. @param {Measured[]} failing */
function worstPerText(failing) {
	/** @type {Map<string, Measured & { states: Set<string> }>} */
	const worst = new Map();
	for (const m of failing) {
		const key = `${m.surface} ${m.scheme} ${m.hue} ${m.element} ${m.text}`;
		const seen = worst.get(key);
		const states = seen?.states ?? new Set();
		states.add(
			`${m.width}px ${m.state === "Build" || m.state.startsWith("turn") ? `${m.state} on ${m.planet}` : m.state}`,
		);
		if (!seen || m.ratio < seen.ratio) worst.set(key, { ...m, states });
	}
	return [...worst.values()]
		.map((m) => ({ ...m, where: `${[...m.states].join(" ")}; ${m.where}` }))
		.sort((a, b) => a.scheme.localeCompare(b.scheme) || a.hue - b.hue || a.ratio - b.ratio);
}

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

/** Clicks a button that opens a file picker and gives it one of the sample files in ../fixtures. */
async function choose(
	/** @type {Loka} */ loka,
	/** @type {import("playwright").Locator} */ button,
	/** @type {string} */ file,
) {
	const [chooser] = await Promise.all([loka.page.waitForEvent("filechooser"), button.click()]);
	await chooser.setFiles(join(FIXTURES, file));
	await loka.page.waitForTimeout(200);
}

/** Run with the first-run tour showing, which the other recipes skip. */
const tourRecipes = {
	async onboarding(/** @type {Loka} */ loka) {
		const tour = loka.page.getByRole("dialog", { name: "Welcome to Loka" });
		await tour.getByRole("heading", { name: "Welcome to Loka" }).waitFor();
		await settled(loka);
		await loka.proof("01-welcome");
		await tour.getByRole("button", { name: "Get started" }).click();
		await choose(loka, tour.getByRole("button", { name: "Import from Chrome" }), "Bookmarks");
		await choose(loka, tour.getByRole("button", { name: "Import from Arc" }), "StorableSidebar.json");
		await tour.getByText("Ready: 4 bookmarks").waitFor();
		await tour.getByText("Ready: 2 spaces, 3 pinned tabs").waitFor();
		await settled(loka);
		await loka.proof("02-import");
		await tour.getByRole("button", { name: "Import from 2 browsers" }).click();

		await tour.getByRole("textbox", { name: "Space 1 name" }).fill("Code");
		await tour.getByRole("radiogroup", { name: "Space 1 color" }).getByRole("radio", { name: "Hue 260" }).click();
		await tour.getByRole("button", { name: /Code: change planet/ }).click();
		await settled(loka);
		await loka.proof("03-spaces");
		await tour.getByRole("button", { name: "Next" }).click();

		await loka.page.keyboard.press("Control+k");
		await tour.getByText("Done").waitFor();
		assert.equal(
			await loka.page.locator("loka-command-bar").count(),
			0,
			"trying Ctrl+K in the tour doesn't open the bar",
		);
		await settled(loka);
		await loka.proof("04-keys-tried");
		await tour.getByRole("button", { name: "Open Loka" }).click();

		const first = (await loka.state()).spaces[0];
		assert.deepEqual(
			[first.name, first.hue, first.planet],
			["Code", 260, "cratered"],
			"the tour edited the first space",
		);
		const o = await loka.outline();
		assert.equal(o.space, "Code");
		assert.ok(
			o.pinned.includes("0:Chrome bookmarks (closed)"),
			"Chrome's bookmarks became a folder in the first space",
		);
		const names = (await loka.state()).spaces.map((/** @type {{ name: string }} */ s) => s.name);
		assert.deepEqual(names.slice(-2), ["Research", "Fun"], "Arc's spaces became Loka spaces");
		assert.equal((await loka.ui()).onboarded, true);
		await loka.page.reload({ waitUntil: "networkidle" });
		assert.equal(await loka.page.locator("loka-onboarding").count(), 0, "the tour doesn't come back after a reload");
		await loka.proof("05-after-tour");
	},
};

/** @type {Record<string, (loka: Loka) => Promise<void>>} */
const all = { ...recipes, ...tourRecipes };
const wanted = process.argv[2];
const names = wanted === "all" ? Object.keys(all) : [wanted ?? ""];
if (!names.every((n) => n in all)) {
	console.error(`Usage: node run.mjs <${Object.keys(all).join("|")}|all>`);
	process.exit(1);
}
let failed = 0;
for (const name of names) {
	const loka = await openLoka(name, { onboarding: name in tourRecipes });
	try {
		await all[name]?.(loka);
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
