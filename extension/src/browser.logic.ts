import type { Download } from "../../prototype/src/features/downloads/loka-downloads";

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
