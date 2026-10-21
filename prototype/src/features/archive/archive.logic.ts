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

/** The choices Settings offers for archiving open tabs, in hours (0 is never). 12 hours by default. */
export const ARCHIVE_CHOICES: { label: string; hours: number }[] = [
	{ label: "Never", hours: 0 },
	{ label: "After 12 hours", hours: 12 },
	{ label: "After a day", hours: 24 },
	{ label: "After a week", hours: 24 * 7 },
	{ label: "After 30 days", hours: 24 * 30 },
];

/** The choices Settings offers for unloading the tabs of spaces no window shows, in minutes (0 is never). */
export const SLEEP_CHOICES: { label: string; minutes: number }[] = [
	{ label: "After 15 minutes", minutes: 15 },
	{ label: "After 30 minutes", minutes: 30 },
	{ label: "After an hour", minutes: 60 },
	{ label: "After 2 hours", minutes: 120 },
	{ label: "Never", minutes: 0 },
];
