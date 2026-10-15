// Sample data for the prototype's fake browser (fake-browser.ts). Shaped exactly like what the real browser sends,
// down to icons as data: URLs, so the UI is tested against what it will get.

import type {
	NativeDownload,
	NativeExtension,
	NativeMedia,
	NativeSuggestion,
	NativeTab,
} from "../../../webui/src/bridge";

const svg = (body: string) =>
	`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}`;

export const DEMO_EXTENSIONS: NativeExtension[] = [
	{
		id: "cjpalhdlnbpafiamejdnhcphjbkeiagm",
		name: "uBlock Origin",
		icon: svg(
			`<path d="M16 2 4 6.5v8.2C4 22 9.2 27.7 16 30c6.8-2.3 12-8 12-15.3V6.5z" fill="#800000"/><path d="M16 4.6 6.4 8.2v6.5c0 5.9 4.1 10.6 9.6 12.6 5.5-2 9.6-6.7 9.6-12.6V8.2z" fill="#c00"/><text x="16" y="21.5" font-family="Segoe UI,sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">μ</text>`,
		),
		badge: "12",
		badgeColor: "#5f6368",
		pinned: true,
	},
	{
		id: "nngceckbapebfimnlniiiahkandclblb",
		name: "Bitwarden Password Manager",
		icon: svg(
			`<rect width="32" height="32" rx="7" fill="#175ddc"/><path d="M9 7h14v9.5c0 4.6-3.7 7.6-7 8.9-3.3-1.3-7-4.3-7-8.9z" fill="none" stroke="#fff" stroke-width="2"/><path d="M16 9v14.3c2.4-1.1 5-3.4 5-6.8V9z" fill="#fff"/>`,
		),
		badge: "",
		badgeColor: "",
		pinned: true,
	},
	{
		id: "eimadpbcbfnmbkopoojfekhnkhdbieeh",
		name: "Dark Reader",
		icon: svg(
			`<rect width="32" height="32" rx="7" fill="#1e2129"/><path d="M21.5 22.5a8.5 8.5 0 0 1-9.9-13 9 9 0 1 0 12 11 8.5 8.5 0 0 1-2.1 2z" fill="#f7a35c"/><circle cx="12" cy="15" r="1.6" fill="#fff"/><circle cx="17" cy="15" r="1.6" fill="#fff"/>`,
		),
		badge: "",
		badgeColor: "",
		pinned: false,
	},
	{
		id: "ldgfbffkinooeloadekpmfoklnobpien",
		name: "Raindrop.io",
		icon: svg(
			`<defs><linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ab8ff"/><stop offset="1" stop-color="#1572d3"/></linearGradient></defs><path d="M16 3c4.6 6 9 10.8 9 16a9 9 0 0 1-18 0c0-5.2 4.4-10 9-16z" fill="url(#r)"/><path d="M12 19a4 4 0 0 0 4 4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`,
		),
		badge: "",
		badgeColor: "",
		pinned: false,
	},
	{
		id: "hlepfoohegkhhmjieoechaddaejaokhf",
		name: "Refined GitHub",
		icon: svg(
			`<rect width="32" height="32" rx="7" fill="#24292f"/><path d="M16 6.5a9.5 9.5 0 0 0-3 18.5c.5.1.6-.2.6-.5v-1.7c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6 0-.6 0-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1 2.8.8.1-.6.3-1 .6-1.3-2.1-.2-4.3-1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.5 1 2.6 0 3.7-2.2 4.5-4.3 4.7.3.3.6.9.6 1.8v2.6c0 .3.2.6.7.5A9.5 9.5 0 0 0 16 6.5z" fill="#fff"/>`,
		),
		badge: "3",
		badgeColor: "#2da44e",
		pinned: false,
	},
];

const MB = 1024 ** 2;
const MINUTE = 60_000;

export function DEMO_DOWNLOADS(now: number): NativeDownload[] {
	return [
		{
			id: 6,
			name: "helium_0.19.2.1_x64-installer.exe",
			url: "https://github.com/imputnet/helium-windows/releases/download/0.19.2.1/helium_0.19.2.1_x64-installer.exe",
			state: "running",
			receivedBytes: 56 * MB,
			totalBytes: 148 * MB,
			startTime: now - MINUTE,
			canResume: true,
		},
		{
			id: 5,
			name: "blender-4.5.1-windows-x64.msi",
			url: "https://download.blender.org/release/Blender4.5/blender-4.5.1-windows-x64.msi",
			state: "paused",
			receivedBytes: 121 * MB,
			totalBytes: 342 * MB,
			startTime: now - 12 * MINUTE,
			canResume: true,
		},
		{
			id: 4,
			name: "CSC281-GDD-v3.pdf",
			url: "https://canvas.example.edu/courses/281/files/9921/download",
			state: "complete",
			receivedBytes: 2.1 * MB,
			totalBytes: 2.1 * MB,
			startTime: now - 48 * MINUTE,
			canResume: false,
		},
		{
			id: 3,
			name: "lofi-cover.png",
			url: "https://i.ytimg.com/vi/jfKfPfyJRdk/maxresdefault.png",
			state: "failed",
			receivedBytes: 160 * 1024,
			totalBytes: 840 * 1024,
			startTime: now - 95 * MINUTE,
			canResume: false,
		},
		{
			id: 2,
			name: "loka-spaces.json",
			url: "blob:http://localhost/0b7c",
			state: "complete",
			receivedBytes: 6 * 1024,
			totalBytes: 6 * 1024,
			startTime: now - 26 * 60 * MINUTE,
			canResume: false,
		},
		{
			id: 1,
			name: "node-v24.4.0-x64.msi",
			url: "https://nodejs.org/dist/v24.4.0/node-v24.4.0-x64.msi",
			state: "cancelled",
			receivedBytes: 9 * MB,
			totalBytes: 31 * MB,
			startTime: now - 3 * 24 * 60 * MINUTE,
			canResume: false,
		},
	];
}

/** The browser tab playing music: the seed's "Lo-fi beats" tab in Home (see DEMO_LINKS). */
export const MUSIC_TAB: NativeTab = {
	id: 101,
	index: 0,
	url: "https://music.youtube.com",
	title: "Lo-fi beats",
	favicon: "",
	active: false,
	pinned: false,
	loading: false,
	audible: true,
	muted: false,
	groupId: -1,
	lastAccessed: 0,
};

/** Which demo browser tab shows which seed tab, as the real sync's links would. */
export const DEMO_LINKS: Record<string, number> = { "t-music": MUSIC_TAB.id };

const cover = (hue: number, moon: boolean) =>
	svg(
		`<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 30%)"/><stop offset="1" stop-color="hsl(${hue + 40} 70% 62%)"/></linearGradient></defs><rect width="32" height="32" fill="url(#s)"/>${moon ? `<circle cx="22" cy="10" r="4" fill="#fff6d8"/>` : `<circle cx="16" cy="17" r="6" fill="#ffd27a"/>`}<path d="M0 24c6-4 10-4 16-1s10 2 16-1v10H0z" fill="hsl(${hue} 40% 16%)"/><rect x="9" y="19" width="5" height="4" fill="#ffcf73" opacity=".85"/>`,
	);

export const DEMO_PLAYLIST: Omit<NativeMedia, "tabId" | "playing">[] = [
	{ title: "Snowman", artist: "Lofi Girl, WYS", artwork: cover(250, true) },
	{ title: "Coffee Break", artist: "Lofi Girl, Kupla", artwork: cover(20, false) },
	{ title: "Night Walk", artist: "Lofi Girl, Sleepy Fish", artwork: cover(210, true) },
];

export const DEMO_HISTORY: NativeSuggestion[] = [
	{ kind: "bookmark", title: "Zen Browser", url: "https://zen-browser.app/" },
	{
		kind: "history",
		title: "Zen Browser: Workspaces docs",
		url: "https://docs.zen-browser.app/user-manual/workspaces",
	},
	{ kind: "history", title: "git-rebase Documentation", url: "https://git-scm.com/docs/git-rebase" },
	{ kind: "bookmark", title: "Pro Git book", url: "https://git-scm.com/book/en/v2" },
	{ kind: "history", title: "Lit: Reactive properties", url: "https://lit.dev/docs/components/properties/" },
	{ kind: "history", title: "Lit: Lifecycle", url: "https://lit.dev/docs/components/lifecycle/" },
	{
		kind: "bookmark",
		title: "MDN: View Transition API",
		url: "https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API",
	},
	{
		kind: "history",
		title: "MDN: @starting-style",
		url: "https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style",
	},
	{
		kind: "history",
		title: "Chromium Code Search: browser_view.cc",
		url: "https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/ui/views/frame/browser_view.cc",
	},
	{ kind: "history", title: "Helium releases", url: "https://github.com/imputnet/helium-windows/releases" },
	{ kind: "bookmark", title: "Minecraft Wiki: Farming", url: "https://minecraft.wiki/w/Tutorials/Farming" },
	{
		kind: "history",
		title: "r/browsers: Arc alternatives on Windows",
		url: "https://www.reddit.com/r/browsers/comments/arc_alternatives",
	},
];
