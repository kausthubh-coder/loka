import type { Download } from "../../prototype/src/features/downloads/loka-downloads";
import type { LiveTabs } from "../../prototype/src/features/sidebar/favicon";
import type { TabId } from "../../prototype/src/features/sidebar/sidebar.logic";
import type { LiveMap } from "../../prototype/src/features/tabs/live.logic";

/** The parts of a browser tab the sidebar draws. */
export type PageTab = Pick<chrome.tabs.Tab, "id" | "favIconUrl" | "status" | "audible" | "mutedInfo">;

/**
 * What each loaded Loka tab's page looks like right now, for the sidebar. `icons` remembers the last icon each
 * Loka tab's page declared, so a pinned tab keeps it after it unloads; it's updated in place. Only icons this page
 * can load are kept: a browser page's chrome:// icon can't be shown from an extension.
 */
export function pageInfo(links: LiveMap, tabs: PageTab[], icons: Map<TabId, string>): LiveTabs {
	const byId = new Map(tabs.map((t) => [t.id, t]));
	for (const [lokaId, browserId] of Object.entries(links)) {
		const icon = byId.get(browserId)?.favIconUrl;
		if (icon && /^(https?|data):/.test(icon)) icons.set(lokaId, icon);
	}
	const live: LiveTabs = {};
	for (const [lokaId, icon] of icons) live[lokaId] = { icon };
	for (const [lokaId, browserId] of Object.entries(links)) {
		const tab = byId.get(browserId);
		if (!tab) continue;
		live[lokaId] = {
			icon: icons.get(lokaId),
			loading: tab.status === "loading",
			audible: tab.audible === true,
			muted: tab.mutedInfo?.muted === true,
		};
	}
	return live;
}

/** Bytes as people read them: "840 KB", "2.1 MB", "1.4 GB". */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit++;
	}
	return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** A browser download as the Downloads panel shows it. */
export function downloadRow(item: chrome.downloads.DownloadItem, now: number): Download {
	const name = item.filename.split(/[\\/]/).pop() || item.url;
	const total = item.totalBytes > 0 ? item.totalBytes : item.fileSize;
	const started = Date.parse(item.startTime);
	const sameDay = new Date(started).toDateString() === new Date(now).toDateString();
	const when = sameDay
		? new Date(started).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
		: new Date(started).toLocaleDateString([], { month: "short", day: "numeric" });
	const status = item.state === "in_progress" ? "running" : item.state === "complete" ? "done" : "failed";
	return {
		id: String(item.id),
		name,
		size: formatBytes(total),
		when,
		status,
		progress: total > 0 ? Math.min(1, item.bytesReceived / total) : 0,
	};
}
