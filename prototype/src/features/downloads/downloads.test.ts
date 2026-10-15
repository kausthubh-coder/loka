import { expect, test } from "bun:test";
import type { NativeDownload } from "../../../../webui/src/bridge";
import {
	downloadActions,
	downloadProgress,
	downloadStatus,
	formatBytes,
	overallProgress,
	sortDownloads,
	whenLabel,
} from "./downloads.logic";

const NOW = new Date(2026, 9, 15, 14, 30).getTime();
const HOUR = 60 * 60 * 1000;
const download = (extra: Partial<NativeDownload>): NativeDownload => ({
	id: 1,
	name: "helium_0.19.2.1_x64-installer.exe",
	url: "https://github.com/imputnet/helium-windows/releases",
	state: "running",
	receivedBytes: 0,
	totalBytes: -1,
	startTime: NOW,
	canResume: true,
	...extra,
});

test("sizes read the way Windows shows them", () => {
	expect([0, 900, 6 * 1024, 840 * 1024, 2.1 * 1024 ** 2, 148 * 1024 ** 2, 1.25 * 1024 ** 3].map(formatBytes)).toEqual([
		"0 B",
		"900 B",
		"6 KB",
		"840 KB",
		"2.1 MB",
		"148 MB",
		"1.3 GB",
	]);
});

test("a running download says how much has come in, of how much when that's known", () => {
	const known = download({ receivedBytes: 56 * 1024 ** 2, totalBytes: 148 * 1024 ** 2 });
	expect(downloadStatus(known, NOW)).toBe("56 MB of 148 MB");
	expect(downloadProgress(known)).toBeCloseTo(56 / 148);
	const unknown = download({ receivedBytes: 3 * 1024 ** 2 });
	expect([downloadStatus(unknown, NOW), downloadProgress(unknown)]).toEqual(["3 MB", null]);
});

test("each state says how it ended", () => {
	const at = (state: NativeDownload["state"]) =>
		downloadStatus(
			download({ state, receivedBytes: 1024 ** 2, totalBytes: 2 * 1024 ** 2, startTime: NOW - 26 * HOUR }),
			NOW,
		);
	expect([at("paused"), at("complete"), at("failed"), at("cancelled")]).toEqual([
		"Paused, 1 MB of 2 MB",
		"2 MB, Yesterday",
		"Didn't finish",
		"Cancelled",
	]);
});

test("a start time reads as today's time, yesterday, a weekday, then a date", () => {
	const today = new Date(NOW - 2 * HOUR).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	expect(whenLabel(NOW - 2 * HOUR, NOW)).toBe(today);
	expect(whenLabel(NOW - 20 * HOUR, NOW)).toBe("Yesterday");
	expect(whenLabel(NOW - 3 * 24 * HOUR, NOW)).toBe(
		new Date(NOW - 3 * 24 * HOUR).toLocaleDateString(undefined, { weekday: "long" }),
	);
	expect(whenLabel(NOW - 30 * 24 * HOUR, NOW)).toBe(
		new Date(NOW - 30 * 24 * HOUR).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
	);
});

test("only a finished file opens; each state offers its own buttons", () => {
	expect(downloadActions(download({ state: "running" }))).toEqual({ open: false, buttons: ["pause", "cancel"] });
	expect(downloadActions(download({ state: "paused" }))).toEqual({ open: false, buttons: ["resume", "cancel"] });
	expect(downloadActions(download({ state: "paused", canResume: false }))).toEqual({
		open: false,
		buttons: ["cancel"],
	});
	expect(downloadActions(download({ state: "complete" }))).toEqual({ open: true, buttons: ["show", "remove"] });
	expect(downloadActions(download({ state: "failed" }))).toEqual({ open: false, buttons: ["retry", "remove"] });
	expect(downloadActions(download({ state: "cancelled" }))).toEqual({ open: false, buttons: ["retry", "remove"] });
});

test("the newest download comes first", () => {
	const list = [
		download({ id: 1, startTime: 10 }),
		download({ id: 2, startTime: 30 }),
		download({ id: 3, startTime: 20 }),
	];
	expect(sortDownloads(list).map((d) => d.id)).toEqual([2, 3, 1]);
});

test("the toolbar ring shows the share of everything still downloading", () => {
	const list = [
		download({ id: 1, receivedBytes: 30, totalBytes: 100 }),
		download({ id: 2, receivedBytes: 10, totalBytes: 100 }),
		download({ id: 3, state: "complete", receivedBytes: 500, totalBytes: 500 }),
	];
	expect(overallProgress(list)).toBeCloseTo(0.2);
	expect(overallProgress([download({ state: "complete" })])).toBeNull();
	expect(overallProgress(null)).toBeNull();
	expect(overallProgress([download({ receivedBytes: 5 })])).toBeNaN();
});
