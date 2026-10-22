// A new snapshot of plain data (the spaces read back from the store, the browser's live tabs) is all new objects,
// even where nothing changed. The sidebar redraws a row only when its objects change (`guard` in loka-sidebar.ts),
// so before it draws a snapshot, every part that equals what it already has is swapped back for the old object.

type Plain = Record<string, unknown>;

const isPlain = (value: unknown): value is Plain =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** An array item's id, when it has one: list items are matched by id, so an insert doesn't shift every match. */
const idOf = (value: unknown): unknown => (isPlain(value) ? value.id : undefined);

function keepArray(before: unknown[], after: unknown[]): unknown[] {
	const byId = new Map<unknown, unknown>();
	for (const item of before) {
		const id = idOf(item);
		if (typeof id === "string") byId.set(id, item);
	}
	let same = before.length === after.length;
	const kept = after.map((item, i) => {
		const id = idOf(item);
		const match = typeof id === "string" ? byId.get(id) : before[i];
		const value = match === undefined ? item : keep(match, item);
		if (value !== before[i]) same = false;
		return value;
	});
	return same ? before : kept;
}

function keepObject(before: Plain, after: Plain): Plain {
	const keys = Object.keys(after);
	let same = keys.length === Object.keys(before).length;
	const kept: Plain = {};
	for (const key of keys) {
		const value = key in before ? keep(before[key], after[key]) : after[key];
		if (value !== before[key] || !(key in before)) same = false;
		kept[key] = value;
	}
	return same ? before : kept;
}

function keep(before: unknown, after: unknown): unknown {
	if (before === after) return before;
	if (Array.isArray(before) && Array.isArray(after)) return keepArray(before, after);
	if (isPlain(before) && isPlain(after)) return keepObject(before, after);
	return after;
}

/**
 * `after`, with every object and array that equals its counterpart in `before` replaced by that counterpart. Equal
 * all through, it returns `before` itself. Plain data only (what JSON can hold).
 */
export function keepUnchanged<T>(before: T, after: T): T {
	return keep(before, after) as T;
}
