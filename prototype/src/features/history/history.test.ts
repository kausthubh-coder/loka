import { expect, test } from "bun:test";
import type { HistoryItem } from "../../../../webui/src/history-bridge";
import {
	appendPage,
	clearRange,
	dateSpan,
	dayLabel,
	displayHost,
	groupByDay,
	groupRuns,
	itemKey,
	type Row,
	redirectTarget,
	selectThrough,
	takeSpan,
	visibleRows,
	visitIconUrl,
	visitTitle,
	withoutUrls,
} from "./history.logic";

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

test("each date filter spans its local days: today, yesterday, the last seven days, and before them", () => {
	const midnight = (date: number) => new Date(2026, 9, date).getTime();
	expect(dateSpan("all", NOW)).toEqual({ begin: 0, before: 0 });
	expect(dateSpan("today", NOW)).toEqual({ begin: midnight(15), before: 0 });
	expect(dateSpan("yesterday", NOW)).toEqual({ begin: midnight(14), before: midnight(15) });
	expect(dateSpan("week", NOW)).toEqual({ begin: midnight(9), before: 0 });
	expect(dateSpan("older", NOW)).toEqual({ begin: 0, before: midnight(9) });
});

test("a filter keeps only its span's visits, and says when a page went past its start", () => {
	const items = [
		visit(1, "https://lit.dev/docs/"),
		visit(15, "https://github.com/imputnet/helium-windows"),
		visit(20, "https://zen-browser.app/"),
		visit(40, "https://news.ycombinator.com/"),
	];
	const yesterday = takeSpan(items, dateSpan("yesterday", NOW));
	expect(yesterday.items.map((i) => i.url)).toEqual([
		"https://github.com/imputnet/helium-windows",
		"https://zen-browser.app/",
	]);
	expect(yesterday.reachedStart).toBe(true);
	const today = takeSpan(items.slice(0, 1), dateSpan("today", NOW));
	expect(today.items.map((i) => i.url)).toEqual(["https://lit.dev/docs/"]);
	expect(today.reachedStart).toBe(false);
	expect(takeSpan(items, dateSpan("older", NOW)).items).toEqual([]);
});

test("redirect links resolve to where they were going", () => {
	expect(
		redirectTarget(
			"https://www.youtube.com/redirect?event=video_description&redir_token=QUFFLUhqbTZ4&q=https%3A%2F%2Fgithub.com%2Fkausthubh-coder%2Floka&v=dQw4w9WgXcQ",
		),
	).toBe("https://github.com/kausthubh-coder/loka");
	expect(
		redirectTarget(
			"https://www.google.com/url?sa=t&source=web&rct=j&opi=89978449&url=https://lit.dev/docs/components/overview/&ved=2ahUKEwi",
		),
	).toBe("https://lit.dev/docs/components/overview/");
	expect(redirectTarget("https://www.google.co.uk/url?q=https://www.bbc.co.uk/news&sa=U")).toBe(
		"https://www.bbc.co.uk/news",
	);
	expect(
		redirectTarget("https://l.facebook.com/l.php?u=https%3A%2F%2Fzen-browser.app%2Fdownload%3Ffbclid%3DIwAR0&h=AT0x"),
	).toBe("https://zen-browser.app/download?fbclid=IwAR0");
	expect(redirectTarget("https://www.youtube.com/attribution_link?a=xyz&u=%2Fwatch%3Fv%3DdQw4w9WgXcQ")).toBe(
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	);
	expect(redirectTarget("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2F&rut=abc")).toBe(
		"https://developer.mozilla.org/en-US/",
	);
});

test("a redirect to a redirect is followed to the end", () => {
	const inner = `https://www.google.com/url?q=${encodeURIComponent("https://lit.dev/")}`;
	expect(redirectTarget(`https://l.facebook.com/l.php?u=${encodeURIComponent(inner)}`)).toBe("https://lit.dev/");
});

test("ordinary pages, and redirects with no usable target, aren't redirects", () => {
	expect(redirectTarget("https://www.youtube.com/watch?v=dQw4w9WgXcQ&q=https://lit.dev/")).toBeNull();
	expect(redirectTarget("https://www.google.com/search?q=https://lit.dev/")).toBeNull();
	expect(redirectTarget("https://www.youtube.com/redirect?event=video_description")).toBeNull();
	expect(redirectTarget("https://www.google.com/url?q=javascript:alert(1)")).toBeNull();
	expect(redirectTarget("https://t.co/Xk2bQ9fLmP")).toBeNull();
	expect(redirectTarget("not a url")).toBeNull();
});

test("a row names the site a visit went to, without www.", () => {
	expect(displayHost("https://www.youtube.com/redirect?q=https%3A%2F%2Fwww.reddit.com%2Fr%2Fbrowsers&v=1")).toBe(
		"reddit.com",
	);
	expect(displayHost("https://www.google.com/url?url=https://lit.dev/docs/")).toBe("lit.dev");
	expect(displayHost("https://t.co/Xk2bQ9fLmP")).toBe("t.co");
	expect(displayHost("https://news.ycombinator.com/item?id=41234567")).toBe("news.ycombinator.com");
	expect(displayHost("file:///C:/Users/kaust/Downloads/syllabus.pdf")).toBe("This computer");
	expect(displayHost("chrome://settings/")).toBe("settings");
});

test("a visit's title: its own, else its readable path or host, and a redirect is named for its target", () => {
	expect(visitTitle({ url: "https://lit.dev/docs/", title: "Lit: Reactive properties", time: 0 })).toBe(
		"Lit: Reactive properties",
	);
	expect(
		visitTitle({
			url: "https://www.google.com/url?q=https://canvas.example.edu/courses/281/files/lecture%2007.pdf&sa=U",
			title: "Redirect Notice",
			time: 0,
		}),
	).toBe("courses/281/files/lecture 07.pdf");
	expect(visitTitle({ url: "http://127.0.0.1:5295/untitled/report-2026.pdf", title: "", time: 0 })).toBe(
		"untitled/report-2026.pdf",
	);
	expect(visitTitle({ url: "https://zen-browser.app/", title: "https://zen-browser.app/", time: 0 })).toBe(
		"zen-browser.app",
	);
	expect(visitTitle({ url: "https://t.co/Xk2bQ9fLmP", title: "", time: 0 })).toBe("t.co");
	expect(visitIconUrl({ url: "https://www.youtube.com/redirect?q=https%3A%2F%2Flit.dev%2F", title: "", time: 0 })).toBe(
		"https://lit.dev/",
	);
});

test("three or more visits in a row to one site fold into one entry; two stay as rows", () => {
	const items = [
		visit(1, "https://www.youtube.com/watch?v=a", "lofi hip hop radio"),
		visit(1.1, "https://www.youtube.com/watch?v=b", "How browsers work"),
		visit(1.2, "https://youtube.com/watch?v=c", "Minecraft farm tutorial"),
		visit(1.3, "https://lit.dev/docs/", "Lit: Lifecycle"),
		visit(1.4, "https://lit.dev/docs/styles/", "Lit: Styles"),
		visit(1.5, "https://github.com/", "GitHub"),
	];
	const entries = groupRuns(items);
	expect(entries.map((e) => (e.kind === "site" ? `${e.host} x${e.items.length}` : e.item.title))).toEqual([
		"youtube.com x3",
		"Lit: Lifecycle",
		"Lit: Styles",
		"GitHub",
	]);
	expect(entries[0]?.key).toBe(`site|${itemKey(items[0] ?? visit(0, ""))}`);
});

test("only consecutive visits fold, a redirect counts as the site it went to, and a run stops at midnight", () => {
	const redirect = `https://www.youtube.com/redirect?q=${encodeURIComponent("https://github.com/kausthubh-coder/loka")}`;
	const items = [
		visit(14, "https://github.com/imputnet/helium-windows", "imputnet/helium-windows"),
		visit(14.2, redirect, "YouTube"),
		visit(14.4, "https://github.com/kausthubh-coder/loka/pulls", "Pull requests"),
		// 14:30 minus 14.5 hours is midnight: the visits below are yesterday's.
		visit(14.6, "https://github.com/", "GitHub"),
		visit(14.7, "https://github.com/lit/lit", "lit/lit"),
		visit(15, "https://zen-browser.app/", "Zen Browser"),
		visit(15.2, "https://github.com/", "GitHub"),
	];
	expect(groupRuns(items).map((e) => (e.kind === "site" ? `${e.host} x${e.items.length}` : e.item.title))).toEqual([
		"github.com x3",
		"GitHub",
		"lit/lit",
		"Zen Browser",
		"GitHub",
	]);
});

test("a folded site shows its visits under it only while it's expanded", () => {
	const items = [
		visit(1, "https://lit.dev/a", "Lit: Lifecycle"),
		visit(1.1, "https://lit.dev/b", "Lit: Styles"),
		visit(1.2, "https://lit.dev/c", "Lit: Directives"),
		visit(1.3, "https://github.com/", "GitHub"),
	];
	const entries = groupRuns(items);
	const site = entries[0]?.key ?? "";
	const label = (r: Row) =>
		r.kind === "site" ? `site ${r.host}${r.expanded ? " (open)" : ""}` : `${r.kind} ${r.item.title}`;
	expect(visibleRows(entries, new Set()).map(label)).toEqual(["site lit.dev", "visit GitHub"]);
	expect(visibleRows(entries, new Set([site])).map(label)).toEqual([
		"site lit.dev (open)",
		"child Lit: Lifecycle",
		"child Lit: Styles",
		"child Lit: Directives",
		"visit GitHub",
	]);
});
