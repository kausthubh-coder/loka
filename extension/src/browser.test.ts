import { expect, test } from "bun:test";
import { downloadRow, formatBytes } from "./browser.logic";

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
