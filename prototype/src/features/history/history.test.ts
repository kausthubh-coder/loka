import { expect, test } from "bun:test";
import type { HistoryItem } from "../../../../webui/src/history-bridge";
import { appendPage, clearRange, dayLabel, groupByDay, itemKey, selectThrough, withoutUrls } from "./history.logic";

const NOW = new Date(2026, 9, 15, 14, 30).getTime();
const HOUR = 60 * 60 * 1000;
const visit = (hoursAgo: number, url: string, title = url): HistoryItem => ({
	url,
	title,
	time: NOW - hoursAgo * HOUR,
});

test("visits are cut into local days, newest first, under Today, Yesterday and then their dates", () => {
	const items = [
		visit(1, "https://lit.dev/"),
		visit(13, "https://zen-browser.app/"),
		visit(20, "https://github.com/"),
		visit(50, "https://git-scm.com/"),
	];
	const days = groupByDay(items, NOW);
	expect(days.map((d) => [d.key, d.label, d.items.length])).toEqual([
		["2026-10-15", "Today", 2],
		["2026-10-14", "Yesterday", 1],
		[
			"2026-10-13",
			new Date(NOW - 50 * HOUR).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
			1,
		],
	]);
});

test("a day in another year says the year", () => {
	const lastYear = new Date(2025, 11, 30, 9).getTime();
	expect(dayLabel(lastYear, NOW)).toBe(
		new Date(lastYear).toLocaleDateString(undefined, {
			weekday: "long",
			month: "long",
			day: "numeric",
			year: "numeric",
		}),
	);
});

test("the next page adds only visits not already shown", () => {
	const first = [visit(1, "https://a.example/"), visit(2, "https://b.example/")];
	const next = [visit(2, "https://b.example/"), visit(3, "https://c.example/")];
	expect(appendPage(first, next).map((i) => i.url)).toEqual([
		"https://a.example/",
		"https://b.example/",
		"https://c.example/",
	]);
});

test("clearing takes the last hour, everything since midnight, or everything, up to now", () => {
	expect(clearRange("hour", NOW)).toEqual({ begin: NOW - HOUR, end: NOW });
	expect(clearRange("today", NOW)).toEqual({ begin: new Date(2026, 9, 15).getTime(), end: NOW });
	expect(clearRange("all", NOW)).toEqual({ begin: 0, end: NOW });
});

test("shift-click selects every row between the last one clicked and this one, either way", () => {
	const order = ["a", "b", "c", "d", "e"];
	expect([...selectThrough(order, new Set(["a"]), "b", "d")].sort()).toEqual(["a", "b", "c", "d"]);
	expect([...selectThrough(order, new Set(), "d", "b")].sort()).toEqual(["b", "c", "d"]);
	expect([...selectThrough(order, new Set(), null, "c")]).toEqual(["c"]);
});

test("deleting an address removes every visit to it", () => {
	const items = [visit(1, "https://a.example/"), visit(2, "https://b.example/"), visit(3, "https://a.example/")];
	expect(withoutUrls(items, new Set(["https://a.example/"])).map(itemKey)).toEqual([
		itemKey(visit(2, "https://b.example/")),
	]);
});
