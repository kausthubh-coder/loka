import type { HistoryItem } from "../../../../webui/src/history-bridge";

/** A visit's identity in the list: the same page visited twice is two rows. */
export function itemKey(item: HistoryItem): string {
	return `${item.time}|${item.url}`;
}

export interface Day {
	/** The local date, "2026-10-15", stable across re-renders. */
	key: string;
	label: string;
	items: HistoryItem[];
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

/** Visits, newest first, cut into local days, each with its heading. */
export function groupByDay(items: HistoryItem[], now: number): Day[] {
	const days: Day[] = [];
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
