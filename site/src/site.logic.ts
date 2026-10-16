// Pure helpers for the landing page: the waitlist form and the live GitHub panel.

/** A trimmed, lowercased email, or null when it can't be one. Real checking happens when we send the email. */
export function normalizeEmail(raw: string): string | null {
	const email = raw.trim().toLowerCase();
	if (email.length > 254) return null;
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** What the waitlist endpoint receives. `wants` are the roadmap ideas the person picked, in the order shown. */
export function waitlistBody(email: string, wants: string[]): string {
	return JSON.stringify({ email, wants: wants.join(", "), source: "loka-site" });
}

/** "just now", "5 minutes ago", "3 days ago". Falls back to the date after a month. */
export function timeAgo(iso: string, now: Date): string {
	const then = new Date(iso);
	const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
	if (Number.isNaN(seconds)) return "";
	if (seconds < 60) return "just now";
	if (seconds >= 60 * 60 * 24 * 31) {
		return then.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
	}
	const units: [number, string][] = [
		[60 * 60 * 24, "day"],
		[60 * 60, "hour"],
		[60, "minute"],
	];
	for (const [size, name] of units) {
		const count = Math.floor(seconds / size);
		if (count >= 1) return `${count} ${name}${count === 1 ? "" : "s"} ago`;
	}
	return "just now";
}

export interface Commit {
	sha: string;
	message: string;
	url: string;
	date: string;
}

/** The first line of each commit from GitHub's `/commits` response, skipping merge commits. */
export function commitsFromApi(json: unknown, limit: number): Commit[] {
	if (!Array.isArray(json)) return [];
	const commits: Commit[] = [];
	for (const item of json) {
		const message = String(item?.commit?.message ?? "").split("\n")[0] ?? "";
		if (!message || message.startsWith("Merge ")) continue;
		commits.push({
			sha: String(item.sha ?? "").slice(0, 7),
			message,
			url: String(item.html_url ?? ""),
			date: String(item.commit?.committer?.date ?? item.commit?.author?.date ?? ""),
		});
		if (commits.length === limit) break;
	}
	return commits;
}
