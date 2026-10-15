import { expect, test } from "bun:test";
import { downloadRow, formatBytes, pageInfo } from "./browser.logic";

test("each loaded tab shows its page's own icon, loading and sound; an unloaded pinned tab keeps its last icon", () => {
	const icons = new Map<string, string>();
	const loaded = pageInfo(
		{ yt: 11, wiki: 12, settings: 13 },
		[
			{ id: 11, favIconUrl: "https://www.youtube.com/favicon.ico", status: "complete", audible: true },
			{ id: 12, status: "loading", mutedInfo: { muted: true } },
			{ id: 13, favIconUrl: "chrome://theme/IDR_SETTINGS_FAVICON", status: "complete" },
		],
		icons,
	);
	expect(loaded).toEqual({
		yt: { icon: "https://www.youtube.com/favicon.ico", loading: false, audible: true, muted: false },
		wiki: { icon: undefined, loading: true, audible: false, muted: true },
		settings: { icon: undefined, loading: false, audible: false, muted: false },
	});
	// YouTube's tab is unloaded: the browser tab is gone, the icon stays.
	expect(pageInfo({ wiki: 12 }, [{ id: 12, status: "complete" }], icons).yt).toEqual({
		icon: "https://www.youtube.com/favicon.ico",
	});
});

test("sizes read the way people say them", () => {
	expect([
		formatBytes(512),
		formatBytes(840_000),
		formatBytes(2_100_000),
		formatBytes(148_000_000),
		formatBytes(0),
	]).toEqual(["512 B", "840 KB", "2.1 MB", "148 MB", ""]);
});

test("a browser download becomes a panel row with its name, progress and state", () => {
	const now = Date.UTC(2026, 9, 15, 15, 0);
	const item = {
		id: 7,
		filename: "C:\\Users\\me\\Downloads\\loka-setup.exe",
		url: "https://example.com/loka-setup.exe",
		totalBytes: 200_000_000,
		fileSize: 0,
		bytesReceived: 50_000_000,
		state: "in_progress",
		startTime: new Date(now - 60_000).toISOString(),
	} as chrome.downloads.DownloadItem;
	const row = downloadRow(item, now);
	expect([row.id, row.name, row.size, row.status, row.progress]).toEqual([
		"7",
		"loka-setup.exe",
		"200 MB",
		"running",
		0.25,
	]);
	expect(downloadRow({ ...item, state: "interrupted" } as chrome.downloads.DownloadItem, now).status).toBe("failed");
});
