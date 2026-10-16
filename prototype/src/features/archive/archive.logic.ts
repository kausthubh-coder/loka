const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago": how long since an archived tab left. */
export function timeAgo(then: number, now: number): string {
	const gone = Math.max(0, now - then);
	if (gone < MINUTE) return "just now";
	if (gone < HOUR) return `${Math.floor(gone / MINUTE)} min ago`;
	if (gone < DAY) {
		const hours = Math.floor(gone / HOUR);
		return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
	}
	const days = Math.floor(gone / DAY);
	return days === 1 ? "yesterday" : `${days} days ago`;
}

/** The choices Settings offers for archiving open tabs, in hours. Off by default. */
export const ARCHIVE_CHOICES: { label: string; hours: number | null }[] = [
	{ label: "Never", hours: null },
	{ label: "After 12 hours", hours: 12 },
	{ label: "After a day", hours: 24 },
	{ label: "After a week", hours: 24 * 7 },
	{ label: "After 30 days", hours: 24 * 30 },
];
