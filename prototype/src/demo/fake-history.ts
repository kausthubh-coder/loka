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

// Visits whose address isn't the page: link redirectors (what a click from YouTube, Google or Facebook leaves in
// history, titled for the interstitial) and pages with no title. Every so often one of these is the next visit.
const ODD_VISITS: { url: string; title: string }[] = [
	{
		url: `https://www.youtube.com/redirect?event=video_description&redir_token=QUFFLUhqbTZ4cWRVZ3RNRk1fRlNnb0p3&q=${encodeURIComponent("https://github.com/kausthubh-coder/loka")}&v=dQw4w9WgXcQ`,
		title: "YouTube",
	},
	{
		url: `https://www.google.com/url?sa=t&source=web&rct=j&opi=89978449&url=${encodeURIComponent("https://lit.dev/docs/components/overview/")}&ved=2ahUKEwiR4`,
		title: "Redirect Notice",
	},
	{
		url: `https://l.facebook.com/l.php?u=${encodeURIComponent("https://zen-browser.app/download?fbclid=IwAR0x")}&h=AT0q`,
		title: "Leaving Facebook",
	},
	{ url: "https://canvas.example.edu/courses/281/files/lecture-07.pdf", title: "" },
];

function makeHistory(now: number): HistoryItem[] {
	const rand = seeded(42);
	const items: HistoryItem[] = [];
	let time = now - 4 * 60_000;
	let site = SITES[0] ?? ["", [""]];
	// About 40 visits a day for 45 days, bunched into sessions with quiet nights. People stay on a site for a few
	// pages at a time (a run of videos, a few repos), so the next visit is often on the same site.
	while (items.length < 1800) {
		const odd = rand() < 0.04 ? ODD_VISITS[Math.floor(rand() * ODD_VISITS.length)] : undefined;
		if (odd) items.push({ ...odd, time });
		else {
			if (rand() > 0.3) site = SITES[Math.floor(rand() * SITES.length)] ?? site;
			const [base, titles] = site;
			const title = titles[Math.floor(rand() * titles.length)] ?? "";
			const path = title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.slice(0, 32);
			items.push({ url: `${base}/${path}`, title, time });
		}
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
