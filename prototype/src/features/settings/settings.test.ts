import { expect, test } from "bun:test";
import { currentSection, findSettings, highlight, type ScrollSpy, type SectionText } from "./settings.logic";

// Shaped like the real page's sections, with their real words.
const SECTIONS: SectionText[] = [
	{
		id: "sidebar",
		title: "Sidebar",
		rows: [
			{
				label: "Keep the sidebar open",
				detail: "Off, it slides away and comes back when the mouse reaches the window's edge.",
			},
		],
	},
	{
		id: "sound",
		title: "Sound",
		rows: [
			{
				label: "Sound effects",
				detail: "Soft cues when you switch spaces, open and close tabs and folders, and pin",
			},
			{ label: "Volume", detail: "Plays a cue when you let go" },
		],
	},
	{ id: "media", title: "Media", rows: [{ label: "Autoplay", detail: "For pages you open from now on" }] },
	{
		id: "tabs",
		title: "Tabs",
		rows: [
			{ label: "Archive open tabs", detail: "Open tabs you haven't looked at move to Archived tabs." },
			{ label: "Archived tabs", detail: "0 archived. Find them in the sidebar's ... menu or with the command bar." },
		],
	},
	{
		id: "extensions",
		title: "Extensions",
		lead: "Pinned ones sit in the sidebar's address field, one click away.",
		rows: [],
	},
	{ id: "about", title: "About", keywords: "version engine license", rows: [] },
];

const shown = (query: string) =>
	findSettings(SECTIONS, query).map((f) => [f.section.id, f.whole, f.rows.map((r) => r.label)]);

test("an empty search shows every section whole", () => {
	expect(shown("  ").map(([id, whole]) => [id, whole])).toEqual([
		["sidebar", true],
		["sound", true],
		["media", true],
		["tabs", true],
		["extensions", true],
		["about", true],
	]);
});

test("a search keeps only the rows whose label or detail has the word, whatever its case", () => {
	expect(shown("AUTOPLAY")).toEqual([["media", false, ["Autoplay"]]]);
	expect(shown("cue")).toEqual([["sound", false, ["Sound effects", "Volume"]]]);
	expect(shown("archived")).toEqual([["tabs", false, ["Archive open tabs", "Archived tabs"]]]);
});

test("a word in a section's title, lead or keywords shows the whole section", () => {
	expect(shown("sound")).toEqual([["sound", true, ["Sound effects", "Volume"]]]);
	expect(shown("address field")).toEqual([["extensions", true, []]]);
	expect(shown("version")).toEqual([["about", true, []]]);
});

test("every word has to match, and a row can take one from its section's title", () => {
	expect(shown("sound volume")).toEqual([["sound", false, ["Volume"]]]);
	expect(shown("volume autoplay")).toEqual([]);
	expect(shown("tabs folders")).toEqual([["sound", false, ["Sound effects"]]]);
});

test("search words are text, not patterns", () => {
	expect(shown("...")).toEqual([["tabs", false, ["Archived tabs"]]]);
	expect(shown("(")).toEqual([]);
});

test("highlight marks each match in the text as it's written", () => {
	expect(highlight("Archive open tabs", "OPEN")).toEqual([
		{ text: "Archive ", hit: false },
		{ text: "open", hit: true },
		{ text: " tabs", hit: false },
	]);
	expect(highlight("Open tabs you haven't looked at", "open look")).toEqual([
		{ text: "Open", hit: true },
		{ text: " tabs you haven't ", hit: false },
		{ text: "look", hit: true },
		{ text: "ed at", hit: false },
	]);
});

test("overlapping matches merge into one mark", () => {
	expect(highlight("Archived tabs", "tab tabs")).toEqual([
		{ text: "Archived ", hit: false },
		{ text: "tabs", hit: true },
	]);
});

test("with no search or no match the text is one plain piece", () => {
	expect(highlight("Volume", "")).toEqual([{ text: "Volume", hit: false }]);
	expect(highlight("Volume", "autoplay")).toEqual([{ text: "Volume", hit: false }]);
});

const ORDER = ["sidebar", "spaces", "sound", "media", "tabs", "about"];
const spy = (change: Partial<ScrollSpy>): ScrollSpy => ({
	order: ORDER,
	inBand: new Set(),
	atTop: false,
	atEnd: false,
	previous: null,
	target: null,
	...change,
});

test("the current section is the first one crossing the band at the top of the view", () => {
	expect(currentSection(spy({ inBand: new Set(["media", "sound"]), previous: "sidebar" }))).toBe("sound");
});

test("between two sections the one that was current stays current", () => {
	expect(currentSection(spy({ previous: "media" }))).toBe("media");
});

test("a current section the search hid gives way to the first one left", () => {
	expect(currentSection(spy({ order: ["tabs", "about"], previous: "media" }))).toBe("tabs");
	expect(currentSection(spy({ order: [] }))).toBe(null);
});

test("scrolled to the end, the last section is current, even when it's too short to reach the band", () => {
	expect(currentSection(spy({ atEnd: true, inBand: new Set(["tabs"]) }))).toBe("about");
});

test("a page short enough to show its top and end at once goes by the band", () => {
	expect(currentSection(spy({ atTop: true, atEnd: true, inBand: new Set(["sidebar"]) }))).toBe("sidebar");
});

test("the section a click is scrolling to stays current until the scroll ends", () => {
	expect(currentSection(spy({ target: "media", inBand: new Set(["spaces"]) }))).toBe("media");
	expect(currentSection(spy({ target: "tabs", atEnd: true }))).toBe("tabs");
	expect(currentSection(spy({ order: ["sound"], target: "tabs", inBand: new Set(["sound"]) }))).toBe("sound");
});
