// The hero's live sidebar: the prototype's seed spaces (prototype/src/features/sidebar/sidebar.seed.ts) and a small
// version of its rules, enough to switch spaces, open folders, open and close tabs, and make a new space.

import type { PlanetKind } from "../planet";

export type Tab = { title: string; url: string };
export type Node =
	| { kind: "tab"; id: string }
	| { kind: "folder"; id: string; name: string; open: boolean; children: Node[] };
export type Space = {
	id: string;
	name: string;
	hue: number;
	planet: PlanetKind;
	pinned: Node[];
	open: string[];
	active: string | null;
};
export type Demo = { tabs: Record<string, Tab>; essentials: string[]; spaces: Space[]; current: number };

/** The colors a new space can take, in the prototype's order. */
export const SPACE_HUES = [200, 30, 150, 330, 260, 175, 0, 90];
export const PLANET_KINDS: PlanetKind[] = ["ringed", "banded", "cratered", "ocean"];
/** Past this the horizon gets crowded in a 280px sidebar; the browser has no limit. */
export const MAX_SPACES = 6;

const tab = (id: string): Node => ({ kind: "tab", id });

export function seed(): Demo {
	return {
		tabs: {
			mail: { title: "Inbox", url: "https://mail.google.com" },
			cal: { title: "Calendar", url: "https://calendar.google.com" },
			gh: { title: "GitHub", url: "https://github.com" },
			yt: { title: "YouTube", url: "https://youtube.com" },
			helium: { title: "imputnet/helium-windows", url: "https://github.com/imputnet/helium-windows" },
			chromium: { title: "Chromium: Windows build guide", url: "https://chromium.googlesource.com/chromium/src" },
			lit: { title: "Lit docs", url: "https://lit.dev/docs" },
			hn: { title: "Hacker News", url: "https://news.ycombinator.com" },
			arc: { title: "Arc: what we learned", url: "https://browsercompany.substack.com" },
			zen: { title: "Zen Browser", url: "https://zen-browser.app" },
			canvas: { title: "Canvas: CSC 281", url: "https://canvas.example.edu/courses/281" },
			gdd: { title: "Game design doc", url: "https://docs.google.com/document/d/gdd" },
			farms: { title: "Minecraft farm designs", url: "https://minecraft.wiki/w/Tutorials/Farming" },
			music: { title: "Lo-fi beats", url: "https://music.youtube.com" },
			trails: { title: "Trail maps", url: "https://alltrails.com" },
			recipes: { title: "Weeknight recipes", url: "https://seriouseats.com" },
		},
		essentials: ["mail", "cal", "gh", "yt"],
		current: 0,
		spaces: [
			{
				id: "build",
				name: "Build",
				hue: 200,
				planet: "ringed",
				pinned: [
					{
						kind: "folder",
						id: "f-loka",
						name: "Loka",
						open: true,
						children: [
							tab("helium"),
							{ kind: "folder", id: "f-docs", name: "Docs", open: true, children: [tab("chromium"), tab("lit")] },
						],
					},
				],
				open: ["hn", "arc", "zen"],
				active: "helium",
			},
			{
				id: "school",
				name: "School",
				hue: 30,
				planet: "banded",
				pinned: [
					tab("canvas"),
					{
						kind: "folder",
						id: "f-csc",
						name: "CSC 281",
						open: true,
						children: [
							{ kind: "folder", id: "f-game", name: "Game project", open: false, children: [tab("gdd"), tab("farms")] },
						],
					},
				],
				open: [],
				active: "canvas",
			},
			{
				id: "home",
				name: "Home",
				hue: 150,
				planet: "ocean",
				pinned: [
					{ kind: "folder", id: "f-weekend", name: "Weekend", open: false, children: [tab("trails"), tab("recipes")] },
				],
				open: ["music"],
				active: null,
			},
		],
	};
}

export function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

/** The prototype's letter-tile color for a site. */
export function faviconColor(url: string): string {
	let hash = 0;
	for (const char of hostOf(url)) hash = (hash * 31 + char.charCodeAt(0)) % 360;
	return `hsl(${hash} 70% 72%)`;
}

export function holds(node: Node, id: string | null): boolean {
	if (!id) return false;
	if (node.kind === "tab") return node.id === id;
	return node.children.some((c) => holds(c, id));
}

function mapSpace(demo: Demo, change: (s: Space) => Space): Demo {
	return { ...demo, spaces: demo.spaces.map((s, i) => (i === demo.current ? change(s) : s)) };
}

export function toggleFolder(demo: Demo, folderId: string): Demo {
	const walk = (nodes: Node[]): Node[] =>
		nodes.map((n) =>
			n.kind === "folder" ? { ...n, open: n.id === folderId ? !n.open : n.open, children: walk(n.children) } : n,
		);
	return mapSpace(demo, (s) => ({ ...s, pinned: walk(s.pinned) }));
}

export function activate(demo: Demo, tabId: string): Demo {
	return mapSpace(demo, (s) => ({ ...s, active: tabId }));
}

export function closeTab(demo: Demo, tabId: string): Demo {
	return mapSpace(demo, (s) => {
		const at = s.open.indexOf(tabId);
		const open = s.open.filter((id) => id !== tabId);
		// Closing the tab you're on shows the one below it, or above it if it was last, like the browser.
		const active = s.active === tabId ? (open[Math.min(at, open.length - 1)] ?? null) : s.active;
		return { ...s, open, active };
	});
}

export function clearOpen(demo: Demo): Demo {
	return mapSpace(demo, (s) => ({ ...s, open: [], active: s.open.includes(s.active ?? "") ? null : s.active }));
}

/** Opens what was typed in the command bar: an address if it looks like one, else a web search. */
export function openTyped(demo: Demo, typed: string, id: string): Demo {
	const text = typed.trim();
	const isAddress = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text);
	const t: Tab = isAddress
		? { title: hostOf(`https://${text}`), url: `https://${text}` }
		: { title: `${text} - Search`, url: `https://duckduckgo.com/?q=${encodeURIComponent(text)}` };
	return mapSpace({ ...demo, tabs: { ...demo.tabs, [id]: t } }, (s) => ({ ...s, open: [...s.open, id], active: id }));
}

export type Found = { tabId: string; space: number | null };

/** Tabs whose title or address match, in every space, each with the space it lives in (null for Essentials). */
export function findTabs(demo: Demo, query: string): Found[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const found: Found[] = demo.essentials.map((tabId) => ({ tabId, space: null }));
	const walk = (nodes: Node[], space: number) => {
		for (const n of nodes) {
			if (n.kind === "tab") found.push({ tabId: n.id, space });
			else walk(n.children, space);
		}
	};
	demo.spaces.forEach((s, i) => {
		walk(s.pinned, i);
		for (const id of s.open) found.push({ tabId: id, space: i });
	});
	const matches = found.filter(({ tabId }) => {
		const t = demo.tabs[tabId];
		return t && (t.title.toLowerCase().includes(q) || hostOf(t.url).includes(q));
	});
	return matches.slice(0, 5);
}

/** Goes to a found tab: switches to its space, opens the folders on the way, and shows it. */
export function reveal(demo: Demo, { tabId, space }: Found): Demo {
	if (space === null) return activate(demo, tabId);
	const open = (nodes: Node[]): Node[] =>
		nodes.map((n) => (n.kind === "folder" && holds(n, tabId) ? { ...n, open: true, children: open(n.children) } : n));
	const moved = { ...demo, current: space };
	return mapSpace(moved, (s) => ({ ...s, pinned: open(s.pinned), active: tabId }));
}

export function addSpace(demo: Demo, name: string, hue: number, planet: PlanetKind, id: string): Demo {
	const space: Space = { id, name: name.trim() || "New space", hue, planet, pinned: [], open: [], active: null };
	return { ...demo, spaces: [...demo.spaces, space], current: demo.spaces.length };
}

/** The first color no space has yet, so a new space starts out different from the others. */
export function nextHue(demo: Demo): number {
	return SPACE_HUES.find((h) => !demo.spaces.some((s) => s.hue === h)) ?? 200;
}

const MISSING: Tab = { title: "", url: "" };

/** A tab by id; every id the demo hands out has one, so the blank tab is only for the type checker. */
export function tabOf(tabs: Record<string, Tab>, id: string): Tab {
	return tabs[id] ?? MISSING;
}

/** A space by position, the current one by default. A demo always has its three seed spaces. */
export function spaceAt(demo: Demo, index = demo.current): Space {
	const space = demo.spaces[index] ?? demo.spaces[0];
	if (!space) throw new Error("loka demo: no spaces");
	return space;
}
