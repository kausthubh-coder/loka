// The browser's real data behind the prototype's panels: downloads, installed extensions, bookmarks, and opening
// addresses or searches with the user's own search engine.

import type { Download, DownloadSource } from "../../prototype/src/features/downloads/loka-downloads";
import type { ImportNode } from "../../prototype/src/features/import/import.logic";
import type { ExtensionSource } from "../../prototype/src/features/sidebar/loka-sidebar";
import { downloadRow } from "./browser.logic";

let downloads: Download[] = [];

async function refreshDownloads() {
	const items = await chrome.downloads.search({ orderBy: ["-startTime"], limit: 12 });
	downloads = items.map((item) => downloadRow(item, Date.now()));
}

export const browserDownloads: DownloadSource = {
	list: () => downloads,
	watch(changed) {
		const update = () => void refreshDownloads().then(changed);
		update();
		chrome.downloads.onCreated.addListener(update);
		chrome.downloads.onChanged.addListener(update);
		// Bytes received don't fire change events, so a running download is polled for its progress.
		const timer = window.setInterval(() => {
			if (downloads.some((d) => d.status === "running")) update();
		}, 1000);
		return () => {
			chrome.downloads.onCreated.removeListener(update);
			chrome.downloads.onChanged.removeListener(update);
			window.clearInterval(timer);
		};
	},
	retry: (id) => {
		const item = Number(id);
		void chrome.downloads.search({ id: item }).then(([d]) => {
			if (d?.canResume) void chrome.downloads.resume(item);
			else if (d?.url) void chrome.downloads.download({ url: d.url });
		});
	},
	cancel: (id) => void chrome.downloads.cancel(Number(id)),
	show: (id) => chrome.downloads.show(Number(id)),
	clear: () => {
		void chrome.downloads.erase({ state: "complete" });
		void chrome.downloads.erase({ state: "interrupted" });
	},
	openFolder: () => chrome.downloads.showDefaultFolder(),
};

export const browserExtensions: ExtensionSource = {
	async list() {
		const all = await chrome.management.getAll();
		return all
			.filter((x) => x.type === "extension" && x.enabled && x.id !== chrome.runtime.id)
			.map((x) => ({
				id: x.id,
				name: x.name,
				letter: x.name.slice(0, 1).toLowerCase(),
				color: "#4c4f5c",
				detail: x.description.split(".")[0]?.slice(0, 60) ?? "",
				icon: x.icons?.at(-1)?.url,
			}));
	},
	watch(changed) {
		const events = [
			chrome.management.onInstalled,
			chrome.management.onUninstalled,
			chrome.management.onEnabled,
			chrome.management.onDisabled,
		] as chrome.events.Event<() => void>[];
		for (const e of events) e.addListener(changed);
		return () => {
			for (const e of events) e.removeListener(changed);
		};
	},
	open: (id) => void chrome.tabs.create({ url: `chrome://extensions/?id=${id}` }),
	manage: () => void chrome.tabs.create({ url: "chrome://extensions" }),
};

/**
 * Opens what the command bar chose. Addresses open as typed; searches go to the user's own search engine. On the
 * new tab page it all happens in that same tab; from the sidebar, in a new one.
 */
export function openUrl(where: "new-tab" | "this-tab") {
	return ({ url, query, search }: { url: string; query: string; search: boolean }) => {
		const disposition = where === "new-tab" ? "NEW_TAB" : "CURRENT_TAB";
		if (search) void chrome.search.query({ text: query, disposition });
		else if (where === "new-tab") void chrome.tabs.create({ url });
		else void chrome.tabs.update({ url });
	};
}

/** This browser's bookmarks bar and Other bookmarks, in the importer's shape. */
export async function browserBookmarks(): Promise<ImportNode[]> {
	const [root] = await chrome.bookmarks.getTree();
	const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[]): ImportNode[] =>
		nodes.flatMap((n): ImportNode[] =>
			n.url
				? [{ kind: "tab", title: n.title || n.url, url: n.url }]
				: [{ kind: "folder", name: n.title || "Folder", children: walk(n.children ?? []) }],
		);
	const [bar, other] = root?.children ?? [];
	return [
		...walk(bar?.children ?? []),
		...(other?.children?.length
			? [{ kind: "folder" as const, name: "Other bookmarks", children: walk(other.children) }]
			: []),
	];
}

/** Opens one of the browser's own settings pages, for the things the browser owns. */
export function openBrowserSettings(page: "appearance" | "privacy" | "search" | "passwords" | "shortcuts") {
	const url = {
		appearance: "chrome://settings/appearance",
		privacy: "chrome://settings/privacy",
		search: "chrome://settings/search",
		passwords: "chrome://password-manager/settings",
		shortcuts: "chrome://extensions/shortcuts",
	}[page];
	void chrome.tabs.create({ url });
}
