import type { HistoryItem } from "../../../../webui/src/history-bridge";

/** A visit's identity in the list: the same page visited twice is two rows. */
export function itemKey(item: HistoryItem): string {
	return `${item.time}|${item.url}`;
}

/** A day of something with a time: visits here, and the Library's archived tabs and downloads. */
export interface Day<T extends { time: number } = HistoryItem> {
	/** The local date, "2026-10-15", stable across re-renders. */
	key: string;
	label: string;
	items: T[];
}

function startOfDay(time: number): Date {
	const d = new Date(time);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(day: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** A day's heading: Today, Yesterday, then the weekday and date, with the year once it isn't this one. */
export function dayLabel(time: number, now: number): string {
	const day = startOfDay(time);
	const today = startOfDay(now);
	const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	const sameYear = day.getFullYear() === today.getFullYear();
	return day.toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

/** A visit's time of day, as the row shows it. */
export function timeLabel(time: number): string {
	return new Date(time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Visits (or anything with a time), newest first, cut into local days, each with its heading. */
export function groupByDay<T extends { time: number }>(items: T[], now: number): Day<T>[] {
	const days: Day<T>[] = [];
	for (const item of items) {
		const key = dateKey(startOfDay(item.time));
		const last = days.at(-1);
		if (last?.key === key) last.items.push(item);
		else days.push({ key, label: dayLabel(item.time, now), items: [item] });
	}
	return days;
}

/** Adds the next page to what's shown, skipping visits already there (a page boundary can repeat one). */
export function appendPage(shown: HistoryItem[], page: HistoryItem[]): HistoryItem[] {
	const have = new Set(shown.map(itemKey));
	return [...shown, ...page.filter((item) => !have.has(itemKey(item)))];
}

export type ClearRange = "hour" | "today" | "all";

/** The span "Clear history" removes, ending now: the last hour, since midnight, or everything. */
export function clearRange(range: ClearRange, now: number): { begin: number; end: number } {
	if (range === "hour") return { begin: now - 60 * 60 * 1000, end: now };
	if (range === "today") return { begin: startOfDay(now).getTime(), end: now };
	return { begin: 0, end: now };
}

/**
 * Shift-click selection: every row from the anchor (the last row clicked) to this one, in the order shown, added
 * to what was selected. Without an anchor it's just this row.
 */
export function selectThrough(
	order: string[],
	selected: ReadonlySet<string>,
	anchor: string | null,
	target: string,
): Set<string> {
	const from = anchor === null ? -1 : order.indexOf(anchor);
	const to = order.indexOf(target);
	if (from === -1 || to === -1) return new Set([...selected, target]);
	const [a, b] = from < to ? [from, to] : [to, from];
	return new Set([...selected, ...order.slice(a, b + 1)]);
}

/** The visits left once these addresses are deleted, shown before the browser answers. */
export function withoutUrls(items: HistoryItem[], urls: ReadonlySet<string>): HistoryItem[] {
	return items.filter((item) => !urls.has(item.url));
}

export type DateFilter = "all" | "today" | "yesterday" | "week" | "older";

/** How many days "This week" covers, today included. A rolling week, so it isn't nearly empty on a Monday. */
const WEEK_DAYS = 7;

/** Midnight `days` days before today's, in local time (so a daylight-saving day is still one day). */
function midnightBefore(now: number, days: number): number {
	const d = new Date(now);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() - days).getTime();
}

/**
 * The span a date filter shows: visits at or after `begin`, and before `before`. `before` is 0 for "up to now", the
 * way queryHistory takes it, so the browser is asked straight for the right page instead of every newer one first.
 */
export function dateSpan(filter: DateFilter, now: number): { begin: number; before: number } {
	if (filter === "today") return { begin: midnightBefore(now, 0), before: 0 };
	if (filter === "yesterday") return { begin: midnightBefore(now, 1), before: midnightBefore(now, 0) };
	if (filter === "week") return { begin: midnightBefore(now, WEEK_DAYS - 1), before: 0 };
	if (filter === "older") return { begin: 0, before: midnightBefore(now, WEEK_DAYS - 1) };
	return { begin: 0, before: 0 };
}

/**
 * A page from the browser cut to a filter's span. Pages come newest first, so once one reaches past the span's
 * start there's nothing more to load for this filter (`reachedStart`).
 */
export function takeSpan(
	items: HistoryItem[],
	span: { begin: number; before: number },
): { items: HistoryItem[]; reachedStart: boolean } {
	const inSpan = items.filter((i) => i.time >= span.begin && (span.before === 0 || i.time < span.before));
	return { items: inSpan, reachedStart: items.some((i) => i.time < span.begin) };
}

/**
 * Link redirectors: a click from a site that sends you through its own address first, with where you were going in
 * a query parameter. History keeps the redirector's address, which says nothing about the page you went to.
 */
const REDIRECTORS: { host: RegExp; path: RegExp; params: string[] }[] = [
	{ host: /(^|\.)youtube\.com$/, path: /^\/(redirect|attribution_link)$/, params: ["q", "u"] },
	{ host: /(^|\.)google(\.[a-z]{2,3}){1,2}$/, path: /^\/url$/, params: ["q", "url"] },
	{ host: /^(l|lm)\.facebook\.com$/, path: /^\/l\.php$/, params: ["u"] },
	{ host: /^l\.instagram\.com$/, path: /^\/$/, params: ["u"] },
	{ host: /^out\.reddit\.com$/, path: /^\//, params: ["url"] },
	{ host: /(^|\.)duckduckgo\.com$/, path: /^\/l\/?$/, params: ["uddg"] },
	{ host: /(^|\.)linkedin\.com$/, path: /^\/redir\/redirect\/?$/, params: ["url"] },
	{ host: /^slack-redir\.net$/, path: /^\/link$/, params: ["url"] },
	{ host: /^steamcommunity\.com$/, path: /^\/linkfilter\/?$/, params: ["url", "u"] },
	{ host: /(^|\.)vk\.com$/, path: /^\/away\.php$/, params: ["to"] },
];

/** Link shorteners: the address names no page, and the target isn't in it, so the row shows just the host. */
const SHORTENERS = new Set(["t.co", "bit.ly", "goo.gl", "tinyurl.com", "lnkd.in", "ow.ly", "buff.ly"]);

function parse(url: string): URL | null {
	try {
		return new URL(url);
	} catch {
		return null;
	}
}

/**
 * Where a redirector's address was sending you (a youtube.com/redirect?q=, google.com/url?q=, l.facebook.com/l.php?u=
 * link), or null when it isn't one. A redirect to another redirect is followed to the end.
 */
export function redirectTarget(url: string): string | null {
	let target: string | null = null;
	let at = parse(url);
	// A few hops at most: a chain longer than that is a loop, not a link.
	for (let hop = 0; at && hop < 4; hop++) {
		const page = at;
		const rule = REDIRECTORS.find((r) => r.host.test(page.hostname) && r.path.test(page.pathname));
		const value = rule?.params.map((p) => page.searchParams.get(p)).find((v) => v);
		if (!value) break;
		// YouTube's attribution links carry a path on youtube.com itself.
		const next = parse(value.startsWith("/") ? new URL(value, page.origin).href : value);
		if (!next || (next.protocol !== "http:" && next.protocol !== "https:")) break;
		target = next.href;
		at = next;
	}
	return target;
}

/** The site a visit is on, as the row names it: where a redirect went, without "www.". */
export function displayHost(url: string): string {
	const page = parse(redirectTarget(url) ?? url);
	if (!page) return url;
	if (page.protocol === "file:") return "This computer";
	return page.hostname.replace(/^www\./, "") || page.protocol.replace(/:$/, "");
}

/** A name for a page with no title: its path, readable ("untitled/report-2026.pdf"), else its host. */
function pathTitle(url: string): string {
	const page = parse(url);
	const host = displayHost(url);
	if (!page || SHORTENERS.has(host)) return host;
	const path = page.pathname.replace(/^\/+|\/+$/g, "");
	if (!path) return host;
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

/**
 * A visit's title as the row shows it. A redirect's own title is its interstitial's ("Redirect Notice"), so it's
 * named for where it went; a page without a title (or titled with its own address) is named by its path or host.
 */
export function visitTitle(item: HistoryItem): string {
	const target = redirectTarget(item.url);
	if (target) return pathTitle(target);
	const title = item.title.trim();
	if (title && title !== item.url) return title;
	return pathTitle(item.url);
}

/** The address a visit's icon is for: the redirect's target, so the icon matches the site the row names. */
export function visitIconUrl(item: HistoryItem): string {
	return redirectTarget(item.url) ?? item.url;
}

/**
 * How many visits in a row to one site make a group. Two would hide a title to save a single row; three or more
 * is a stretch of browsing worth folding.
 */
export const GROUP_MIN = 3;

/** One line in a day's list: a single visit, or a run of visits to one site folded into one row. */
export type Entry =
	| { kind: "visit"; key: string; item: HistoryItem }
	| { kind: "site"; key: string; host: string; items: HistoryItem[] };

/**
 * Folds runs of `min` or more back-to-back visits to the same site (after redirect cleanup), on the same local day,
 * into one entry. Only consecutive visits fold: going elsewhere and coming back starts a new run.
 */
export function groupRuns(items: HistoryItem[], min = GROUP_MIN): Entry[] {
	const runs: HistoryItem[][] = [];
	for (const item of items) {
		const run = runs.at(-1);
		const last = run?.at(-1);
		const sameDay = last && dateKey(startOfDay(last.time)) === dateKey(startOfDay(item.time));
		if (run && last && sameDay && displayHost(last.url) === displayHost(item.url)) run.push(item);
		else runs.push([item]);
	}
	return runs.flatMap((run): Entry[] => {
		const first = run[0];
		if (first && run.length >= min) {
			return [{ kind: "site", key: `site|${itemKey(first)}`, host: displayHost(first.url), items: run }];
		}
		return run.map((item) => ({ kind: "visit", key: itemKey(item), item }));
	});
}

/** A row on screen, in the order the arrow keys walk: visits, site rows, and an open site's visits under it. */
export type Row =
	| { kind: "visit"; key: string; item: HistoryItem }
	| { kind: "site"; key: string; host: string; items: HistoryItem[]; expanded: boolean }
	| { kind: "child"; key: string; item: HistoryItem; parent: string };

/** The rows a list of entries shows: a site's visits only while it's expanded. */
export function visibleRows(entries: Entry[], expanded: ReadonlySet<string>): Row[] {
	return entries.flatMap((entry): Row[] => {
		if (entry.kind === "visit") return [entry];
		const open = expanded.has(entry.key);
		const site: Row = { ...entry, expanded: open };
		if (!open) return [site];
		return [site, ...entry.items.map((item): Row => ({ kind: "child", key: itemKey(item), item, parent: entry.key }))];
	});
}
