// The prototype's stand-in for the History page's handler: the same shape as webui/src/history-bridge.ts's
// `history`, over a seeded, realistic history (the same every load) big enough to page through.

import type { HistoryBridge, HistoryItem } from "../../../webui/src/history-bridge";

const SITES: [string, string[]][] = [
	[
		"https://github.com/imputnet/helium-windows",
		["imputnet/helium-windows", "Releases · imputnet/helium-windows", "Issues · imputnet/helium-windows"],
	],
	[
		"https://github.com/kausthubh-coder/loka",
		["kausthubh-coder/loka", "Pull requests · kausthubh-coder/loka", "feat/native-sidebar · kausthubh-coder/loka"],
	],
	[
		"https://news.ycombinator.com",
		["Hacker News", "Ask HN: What browser do you use?", "Show HN: A sidebar-first browser"],
	],
	["https://zen-browser.app", ["Zen Browser", "Zen Browser: Workspaces", "Zen Browser: Compact mode"]],
	["https://lit.dev/docs", ["Lit: Reactive properties", "Lit: Lifecycle", "Lit: Styles", "Lit: Directives"]],
	[
		"https://developer.mozilla.org/en-US/docs/Web",
		["View Transition API - MDN", "@starting-style - MDN", "content-visibility - MDN"],
	],
	[
		"https://www.youtube.com/watch",
		["lofi hip hop radio - beats to relax/study to", "How browsers work", "Minecraft farm tutorial"],
	],
	["https://canvas.example.edu/courses/281", ["Canvas: CSC 281", "Assignment 4: Game design doc", "Grades: CSC 281"]],
	["https://docs.google.com/document/d/gdd", ["Game design doc - Google Docs", "CSC 281 notes - Google Docs"]],
	[
		"https://source.chromium.org/chromium/chromium/src",
		["browser_view.cc - Chromium Code Search", "tab_strip_model.h - Chromium Code Search"],
	],
	["https://www.reddit.com/r/browsers", ["r/browsers", "Arc alternatives on Windows : r/browsers"]],
	["https://minecraft.wiki/w", ["Tutorials/Farming - Minecraft Wiki", "Redstone - Minecraft Wiki"]],
];

function seeded(seed: number) {
	let s = seed;
	return () => {
		s = (s * 16807) % 2147483647;
		return s / 2147483647;
	};
}

function makeHistory(now: number): HistoryItem[] {
	const rand = seeded(42);
	const items: HistoryItem[] = [];
	let time = now - 4 * 60_000;
	// About 40 visits a day for 45 days, bunched into sessions with quiet nights.
	while (items.length < 1800) {
		const [base, titles] = SITES[Math.floor(rand() * SITES.length)] ?? SITES[0] ?? ["", [""]];
		const title = titles[Math.floor(rand() * titles.length)] ?? "";
		const path = title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.slice(0, 32);
		items.push({ url: `${base}/${path}`, title, time });
		time -= rand() < 0.08 ? 2 * 60 * 60_000 + rand() * 6 * 60 * 60_000 : 30_000 + rand() * 20 * 60_000;
	}
	return items;
}

let all = makeHistory(Date.now());
const listeners = new Set<() => void>();

export const fakeHistory: HistoryBridge = {
	queryHistory: async (text, beforeMs, maxCount) => {
		const q = text.trim().toLowerCase();
		const before = beforeMs || Number.POSITIVE_INFINITY;
		const matches = all.filter(
			(i) => i.time < before && (!q || i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q)),
		);
		const items = matches.slice(0, Math.min(200, maxCount));
		// The real history answers from disk in a few milliseconds.
		await new Promise((resolve) => setTimeout(resolve, 60));
		return { items, done: items.length === matches.length };
	},
	deleteUrls: (urls) => {
		const gone = new Set(urls);
		all = all.filter((i) => !gone.has(i.url));
		for (const listener of listeners) listener();
	},
	deleteRange: (begin, end) => {
		all = all.filter((i) => i.time < begin || i.time > end);
		for (const listener of listeners) listener();
	},
	openUrl: (url, newTab) => {
		window.dispatchEvent(new CustomEvent("loka-demo-open", { detail: { url, newTab } }));
	},
	onHistoryChanged: (listener) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
};
