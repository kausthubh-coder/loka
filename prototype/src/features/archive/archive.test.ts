import { expect, test } from "bun:test";
import { timeAgo } from "./archive.logic";

const now = Date.UTC(2026, 9, 15, 12, 0);
const ago = (ms: number) => timeAgo(now - ms, now);

test("archived times read the way a person says them", () => {
	expect([ago(20_000), ago(5 * 60_000), ago(60 * 60_000), ago(3 * 3_600_000)]).toEqual([
		"just now",
		"5 min ago",
		"1 hour ago",
		"3 hours ago",
	]);
	expect([ago(25 * 3_600_000), ago(4 * 86_400_000)]).toEqual(["yesterday", "4 days ago"]);
});

test("a time in the future (a clock change) reads as just now, not a negative age", () => {
	expect(timeAgo(now + 60_000, now)).toBe("just now");
});
