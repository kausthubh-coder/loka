import { describe, expect, test } from "bun:test";
import { commitsFromApi, normalizeEmail, timeAgo, waitlistBody } from "./site.logic";

describe("normalizeEmail", () => {
	test("trims and lowercases a real address", () => {
		expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
	});

	test("rejects things that can't be an address", () => {
		expect(normalizeEmail("")).toBeNull();
		expect(normalizeEmail("ada")).toBeNull();
		expect(normalizeEmail("ada@example")).toBeNull();
		expect(normalizeEmail("ada @example.com")).toBeNull();
		expect(normalizeEmail(`${"a".repeat(250)}@x.io`)).toBeNull();
	});
});

test("waitlistBody sends the email and the picked ideas", () => {
	expect(JSON.parse(waitlistBody("ada@example.com", ["Quiet spaces", "Live folders"]))).toEqual({
		email: "ada@example.com",
		wants: "Quiet spaces, Live folders",
		source: "loka-site",
	});
});

describe("timeAgo", () => {
	const now = new Date("2026-10-15T12:00:00Z");

	test("names the largest whole unit", () => {
		expect(timeAgo("2026-10-15T11:59:30Z", now)).toBe("just now");
		expect(timeAgo("2026-10-15T11:59:00Z", now)).toBe("1 minute ago");
		expect(timeAgo("2026-10-15T09:00:00Z", now)).toBe("3 hours ago");
		expect(timeAgo("2026-10-12T12:00:00Z", now)).toBe("3 days ago");
	});

	test("falls back to the date after a month, and to nothing for garbage", () => {
		expect(timeAgo("2026-08-01T12:00:00Z", now)).toBe("Aug 1, 2026");
		expect(timeAgo("not a date", now)).toBe("");
	});
});

test("commitsFromApi keeps first lines, skips merges and stops at the limit", () => {
	const api = [
		{
			sha: "a6c4941aaaa",
			html_url: "https://github.com/x/1",
			commit: { message: "Merge pull request #7", committer: { date: "2026-10-15T00:00:00Z" } },
		},
		{
			sha: "1b74058bbbb",
			html_url: "https://github.com/x/2",
			commit: {
				message: "Make the prototype work in cloud sessions\n\nLong body",
				committer: { date: "2026-10-14T00:00:00Z" },
			},
		},
		{
			sha: "8904631cccc",
			html_url: "https://github.com/x/3",
			commit: { message: "Add the verify-loka skill", author: { date: "2026-10-13T00:00:00Z" } },
		},
		{ sha: "dddd", html_url: "", commit: { message: "Over the limit" } },
	];
	expect(commitsFromApi(api, 2)).toEqual([
		{
			sha: "1b74058",
			message: "Make the prototype work in cloud sessions",
			url: "https://github.com/x/2",
			date: "2026-10-14T00:00:00Z",
		},
		{
			sha: "8904631",
			message: "Add the verify-loka skill",
			url: "https://github.com/x/3",
			date: "2026-10-13T00:00:00Z",
		},
	]);
	expect(commitsFromApi({ message: "API rate limit exceeded" }, 3)).toEqual([]);
});
