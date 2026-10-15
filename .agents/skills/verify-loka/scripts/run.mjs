// Runs the mapped feature recipes against the running prototype and saves evidence.
//   node .agents/skills/verify-loka/scripts/run.mjs <folders|spaces|tabs|essentials|export-import|command-bar|space-editor|layout|make-folders|archive|search-and-keys|import|media|sound|onboarding|all>
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

		// The current planet lists every space and can add one (through the editor, with the suggested name).
		await loka.sidebar.getByRole("button", { name: "Spaces: School", exact: true }).click();
		await loka.menuItem("New space").click();
		await loka.page.getByRole("dialog", { name: "New space" }).getByRole("button", { name: "Create space" }).click();
		o = await loka.outline();
		assert.equal(o.space, "Space 4");
		assert.deepEqual([o.pinned, o.open], [[], []], "a new space starts empty");
		await loka.proof("04-new-space");
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

	async "command-bar"(loka) {
		const bar = loka.page.getByRole("combobox", { name: "Search or enter address" });
		await loka.page.keyboard.press("Control+k");
		await bar.fill("canvas");
		await loka.proof("01-results-for-canvas");
		// Result 0 is the search; result 1 is the Canvas tab in School.
		await loka.page.keyboard.press("ArrowDown");
		await loka.page.keyboard.press("Enter");
		let o = await loka.outline();
		assert.deepEqual([o.space, o.activeTab], ["School", "Canvas: CSC 281"], "jumped to a tab in another space");

		await loka.page.keyboard.press("Control+k");
		await bar.fill("preferences");
		await loka.page.keyboard.press("ArrowDown");
		await loka.page.keyboard.press("Enter");
		o = await loka.outline();
		assert.equal(o.activeTab, "Settings", "a command found by a related word opened Settings");
		await loka.page.locator("loka-settings").getByRole("heading", { name: "Settings" }).waitFor();
		await loka.proof("02-settings-from-command");
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
		assert.equal((await loka.ui()).sidebarWidth, 352, "dragging the edge saved the new width");
		assert.equal(Math.round((await box("loka-sidebar")).width), 352);
		await loka.proof("01-wider");

		await loka.sidebar.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Settings").click();
		const settings = loka.page.locator("loka-settings");
		await settings.getByRole("radio", { name: "Right" }).click();
		assert.ok((await box("loka-sidebar")).x > (await box("loka-page")).x, "the sidebar moved to the right");
		await loka.proof("02-sidebar-right");
		await settings.getByRole("radio", { name: "Left" }).click();

		await loka.page.keyboard.press("Control+s");
		await loka.page.waitForTimeout(300);
		assert.equal((await loka.ui()).sidebarHidden, true, "Ctrl+S hid the sidebar");
		assert.ok((await box("loka-sidebar")).x + 352 <= 0, "a hidden sidebar is off screen");
		await loka.proof("03-hidden");
		await loka.page.mouse.move(2, 400);
		await loka.page.mouse.move(4, 420);
		await loka.page.waitForTimeout(350);
		assert.ok((await box("loka-sidebar")).x >= 0, "reaching the edge slides it in");
		await loka.proof("04-peek");
		await loka.page.keyboard.press("Control+s");

		// Downloads is a toolbar panel, like Extensions.
		await loka.sidebar.getByRole("button", { name: "Downloads", exact: true }).click();
		const downloads = loka.sidebar.getByRole("dialog", { name: "Downloads" });
		await downloads.getByRole("button", { name: "Retry" }).click();
		assert.equal(await downloads.getByRole("progressbar").count(), 2, "retrying a failed download restarts it");
		await loka.proof("05-downloads");
		await loka.page.keyboard.press("Escape");
		assert.equal(await downloads.count(), 0, "Escape closes the panel");
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

		// Right-click empty sidebar space for a new folder; there is no toolbar button for it.
		assert.equal(await loka.sidebar.getByRole("button", { name: "New folder", exact: true }).count(), 0);
		const empty = await loka.sidebar.locator(".scroll").boundingBox();
		if (!empty) throw new Error("no sidebar list");
		await loka.page.mouse.click(empty.x + 120, empty.y + empty.height - 12, { button: "right" });
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
		assert.ok((await loka.outline()).open.includes("Arc: what we learned"), "archiving is off by default");
		await loka.sidebar.getByRole("button", { name: "More" }).click();
		await loka.menuItem("Settings").click();
		await loka.page
			.locator("loka-settings")
			.getByRole("combobox", { name: "Archive open tabs" })
			.selectOption({ label: "After a day" });
		// Seed: Arc was last shown 3 days ago and Zen 26 hours ago; Hacker News 2 hours ago.
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
		// Lo-fi beats plays in Home, so its card shows in Build.
		const card = loka.sidebar.getByRole("region", { name: "Now playing: Lo-fi beats" });
		await card.waitFor();
		await loka.proof("01-card");
		await card.getByRole("button", { name: "Pause" }).click();
		await card.getByRole("button", { name: "Play" }).waitFor();
		await card.getByRole("button", { name: "Mute" }).click();
		await card.getByRole("button", { name: "Unmute" }).waitFor();
		await card.getByRole("button", { name: "Go to Lo-fi beats" }).first().click();
		const o = await loka.outline();
		assert.deepEqual([o.space, o.activeTab], ["Home", "Lo-fi beats"], "the card took us to the playing tab");
		assert.equal(await card.count(), 0, "no card while the playing tab is on screen");
		await loka.page.keyboard.press("Control+1");
		await card.waitFor();
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
	},
};

/** Waits until the tour's step has finished fading in, so its screenshot isn't blank on a busy machine. @param {Loka} loka */
async function settled(loka) {
	await loka.page.waitForFunction(() => {
		const tour = document.querySelector("loka-app")?.shadowRoot?.querySelector("loka-onboarding");
		return tour?.shadowRoot?.getAnimations().length === 0;
	});
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
