import type { BrowserState, PinnedNode, Tab } from "./sidebar.logic";

// Real-shaped starting data: three spaces, essentials, folders two levels deep and some open tabs.
// Ids are fixed so tests and screenshots can refer to them.

const tabs: Tab[] = [
	{ id: "t-mail", title: "Inbox", url: "https://mail.google.com" },
	{ id: "t-cal", title: "Calendar", url: "https://calendar.google.com" },
	{ id: "t-gh", title: "GitHub", url: "https://github.com" },
	{ id: "t-yt", title: "YouTube", url: "https://youtube.com" },
	{ id: "t-gdd", title: "Game design doc", url: "https://docs.google.com/document/d/gdd" },
	{ id: "t-ref", title: "Minecraft farm designs", url: "https://minecraft.wiki/w/Tutorials/Farming" },
	{ id: "t-canvas", title: "Canvas: CSC 281", url: "https://canvas.example.edu/courses/281" },
	{ id: "t-helium", title: "imputnet/helium-windows", url: "https://github.com/imputnet/helium-windows" },
	{
		id: "t-chromium",
		title: "Chromium: Windows build guide",
		url: "https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md",
	},
	{ id: "t-lit", title: "Lit docs", url: "https://lit.dev/docs" },
	{ id: "t-hn", title: "Hacker News", url: "https://news.ycombinator.com" },
	{ id: "t-arc", title: "Arc: what we learned", url: "https://browsercompany.substack.com" },
	{ id: "t-music", title: "Lo-fi beats", url: "https://music.youtube.com" },
	{ id: "t-zen", title: "Zen Browser", url: "https://zen-browser.app" },
];

const tab = (id: string): PinnedNode => ({ kind: "tab", id });

export function seedState(): BrowserState {
	return {
		version: 1,
		tabs: Object.fromEntries(tabs.map((t) => [t.id, t])),
		essentials: ["t-mail", "t-cal", "t-gh", "t-yt"],
		activeSpaceId: "s-build",
		spaces: [
			{
				id: "s-build",
				name: "Build",
				hue: 200,
				planet: "ringed",
				activeTabId: "t-helium",
				pinned: [
					{
						kind: "folder",
						id: "f-loka",
						name: "Loka",
						open: true,
						children: [
							tab("t-helium"),
							{ kind: "folder", id: "f-docs", name: "Docs", open: true, children: [tab("t-chromium"), tab("t-lit")] },
						],
					},
				],
				open: ["t-hn", "t-arc", "t-zen"],
			},
			{
				id: "s-school",
				name: "School",
				hue: 30,
				planet: "banded",
				activeTabId: "t-canvas",
				pinned: [
					tab("t-canvas"),
					{
						kind: "folder",
						id: "f-csc281",
						name: "CSC 281",
						open: true,
						children: [
							{
								kind: "folder",
								id: "f-game",
								name: "Game project",
								open: false,
								children: [tab("t-gdd"), tab("t-ref")],
							},
						],
					},
				],
				open: [],
			},
			{
				id: "s-home",
				name: "Home",
				hue: 150,
				planet: "ocean",
				activeTabId: null,
				pinned: [],
				open: ["t-music"],
			},
		],
	};
}
