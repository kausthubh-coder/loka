import type { Browser, NativeDownload } from "../../../../webui/src/bridge";

export type DownloadAction = Parameters<Browser["downloadAction"]>[1];

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** A file size the way Windows shows it: 1024 per step, one decimal under 10 ("2.1 MB", "148 MB", "840 KB"). */
export function formatBytes(bytes: number): string {
	let value = Math.max(0, bytes);
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit++;
	}
	const shown = unit > 0 && value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
	return `${shown} ${UNITS[unit]}`;
}

/** How far along a download is, 0 to 1, or null when the browser doesn't know its size. */
export function downloadProgress(d: NativeDownload): number | null {
	if (d.state === "complete") return 1;
	if (d.totalBytes <= 0) return null;
	return Math.min(1, d.receivedBytes / d.totalBytes);
}

/** When a download started, said briefly: the time today, "Yesterday", the weekday this week, else the date. */
export function whenLabel(startTime: number, now: number): string {
	const start = new Date(startTime);
	const today = new Date(now);
	const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((day(today) - day(start)) / 86_400_000);
	if (days <= 0) return start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	if (days === 1) return "Yesterday";
	if (days < 7) return start.toLocaleDateString(undefined, { weekday: "long" });
	return start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The line under a download's name: how much has come in, or how it ended. */
export function downloadStatus(d: NativeDownload, now: number): string {
	const sizeKnown = d.totalBytes > 0;
	const sofar = sizeKnown
		? `${formatBytes(d.receivedBytes)} of ${formatBytes(d.totalBytes)}`
		: formatBytes(d.receivedBytes);
	if (d.state === "running") return sofar;
	if (d.state === "paused") return `Paused, ${sofar}`;
	if (d.state === "complete")
		return `${formatBytes(sizeKnown ? d.totalBytes : d.receivedBytes)}, ${whenLabel(d.startTime, now)}`;
	if (d.state === "cancelled") return "Cancelled";
	return "Didn't finish";
}

/**
 * What a download offers. `open` is what clicking the row does (only a finished file opens); `buttons` are the
 * small actions beside it, most likely first.
 */
export function downloadActions(d: NativeDownload): { open: boolean; buttons: DownloadAction[] } {
	if (d.state === "running") return { open: false, buttons: ["pause", "cancel"] };
	if (d.state === "paused") return { open: false, buttons: d.canResume ? ["resume", "cancel"] : ["cancel"] };
	if (d.state === "complete") return { open: true, buttons: ["show", "remove"] };
	return { open: false, buttons: ["retry", "remove"] };
}

/** A file's type as its tile shows it: the extension, upper case, at most four letters ("" for none). */
export function fileExt(name: string): string {
	return name.includes(".") ? (name.split(".").pop() ?? "").toUpperCase().slice(0, 4) : "";
}

/** A file type's tile color, by extension, so a list of files can be told apart at a glance. */
export function fileHue(name: string): number {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	const known: Record<string, number> = { exe: 205, msi: 205, pdf: 0, png: 150, jpg: 150, zip: 40, json: 45, mp4: 280 };
	if (ext in known) return known[ext] ?? 220;
	let hash = 0;
	for (const c of ext) hash = (hash * 31 + c.charCodeAt(0)) % 360;
	return hash;
}

/** Newest first, the way the browser's own list reads. */
export function sortDownloads(list: NativeDownload[]): NativeDownload[] {
	return list.toSorted((a, b) => b.startTime - a.startTime);
}

/**
 * The progress the toolbar's Downloads button shows: how much of everything still downloading has come in, null
 * when nothing is downloading, and NaN when something's size isn't known (the ring just spins).
 */
export function overallProgress(list: NativeDownload[] | null): number | null {
	const running = (list ?? []).filter((d) => d.state === "running");
	if (!running.length) return null;
	if (running.some((d) => d.totalBytes <= 0)) return Number.NaN;
	const total = running.reduce((n, d) => n + d.totalBytes, 0);
	return running.reduce((n, d) => n + d.receivedBytes, 0) / total;
}

/**
 * The downloads that finished between two answers from the browser: complete now, and not complete before (a tiny
 * file can arrive already complete). The first answer (`before` null) is history, so nothing in it counts.
 */
export function newlyFinished(before: NativeDownload[] | null, after: NativeDownload[]): NativeDownload[] {
	if (before === null) return [];
	const done = new Set(before.filter((d) => d.state === "complete").map((d) => d.id));
	return after.filter((d) => d.state === "complete" && !done.has(d.id));
}
