// Settings' rail: which section is current while the page scrolls, and what the search finds.

/** What a setting's row says: its name and the line under it. The search reads both. */
export interface SettingText {
	label: string;
	detail: string;
}

/** A section as the search reads it. `keywords` are words it answers to that it doesn't show (About: "version"). */
export interface SectionText<Row extends SettingText = SettingText> {
	id: string;
	title: string;
	lead?: string;
	keywords?: string;
	rows: Row[];
}

/** A section the search kept: all of it (its own name or words matched), or only the rows that matched. */
export interface Found<Section extends SectionText> {
	section: Section;
	whole: boolean;
	rows: Section["rows"];
}

/** The words of a search, each matched on its own, in any order. */
function searchWords(query: string): string[] {
	return query.trim().split(/\s+/).filter(Boolean);
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasEvery(text: string, words: string[]): boolean {
	return words.every((w) => new RegExp(escapeRegExp(w), "iu").test(text));
}

/**
 * The sections and rows a search shows, in page order. Every word has to be somewhere: a section whose title, lead or
 * keywords hold them all shows whole; otherwise a row shows when its label, detail and section title hold them all
 * ("sound volume" finds Sound's Volume). Sections with nothing left are dropped. An empty search keeps everything.
 */
export function findSettings<Section extends SectionText>(sections: Section[], query: string): Found<Section>[] {
	const words = searchWords(query);
	if (!words.length) return sections.map((section) => ({ section, whole: true, rows: section.rows }));
	const found: Found<Section>[] = [];
	for (const section of sections) {
		const own = [section.title, section.lead ?? "", section.keywords ?? ""].join(" ");
		if (hasEvery(own, words)) {
			found.push({ section, whole: true, rows: section.rows });
			continue;
		}
		const rows = section.rows.filter((r) => hasEvery(`${section.title} ${r.label} ${r.detail}`, words));
		if (rows.length) found.push({ section, whole: false, rows });
	}
	return found;
}

/** A piece of text, and whether it's part of a match. */
export interface Piece {
	text: string;
	hit: boolean;
}

/**
 * Cuts text into pieces around every place a search word appears, case aside, so the matches can be marked.
 * Overlapping matches ("tab" and "tabs") merge into one. An empty search, or no match, gives the text as one piece.
 */
export function highlight(text: string, query: string): Piece[] {
	const words = searchWords(query);
	if (!words.length || !text) return [{ text, hit: false }];
	const hits: [number, number][] = [];
	for (const word of words) {
		for (const m of text.matchAll(new RegExp(escapeRegExp(word), "giu"))) hits.push([m.index, m.index + m[0].length]);
	}
	if (!hits.length) return [{ text, hit: false }];
	hits.sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [];
	for (const [start, end] of hits) {
		const last = merged.at(-1);
		if (last && start <= last[1]) last[1] = Math.max(last[1], end);
		else merged.push([start, end]);
	}
	const pieces: Piece[] = [];
	let at = 0;
	for (const [start, end] of merged) {
		if (start > at) pieces.push({ text: text.slice(at, start), hit: false });
		pieces.push({ text: text.slice(start, end), hit: true });
		at = end;
	}
	if (at < text.length) pieces.push({ text: text.slice(at), hit: false });
	return pieces;
}

/** What the page's IntersectionObservers last saw, to pick the current section from. */
export interface ScrollSpy {
	/** The sections on the page now, top to bottom (a search hides some). */
	order: string[];
	/** Sections crossing the band near the top of the view. */
	inBand: ReadonlySet<string>;
	/** The top of the page is in view. */
	atTop: boolean;
	/** The end of the page is in view. */
	atEnd: boolean;
	/** The current section until now. */
	previous: string | null;
	/** The section a click in the rail is scrolling to, until that scroll ends. */
	target: string | null;
}

/**
 * The section the rail marks as current:
 * - while a click scrolls to a section, that one (the page passes others on the way, and the last few can't reach
 *   the top);
 * - scrolled to the end, the last one, which may be too short to reach the band;
 * - else the first section crossing the band near the top of the view;
 * - else (between two sections) the one that was current, while it's still on the page;
 * - else the first.
 */
export function currentSection(spy: ScrollSpy): string | null {
	const { order } = spy;
	if (spy.target && order.includes(spy.target)) return spy.target;
	if (spy.atEnd && !spy.atTop) return order.at(-1) ?? null;
	const crossing = order.find((id) => spy.inBand.has(id));
	if (crossing) return crossing;
	if (spy.previous && order.includes(spy.previous)) return spy.previous;
	return order[0] ?? null;
}
