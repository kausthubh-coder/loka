import { expect, test } from "bun:test";
import { itemAt, type MenuItem, menuHeight, toEntries } from "./menu.logic";

const ran: string[] = [];
const items: MenuItem[] = [
	{ label: "Pin to space", run: () => ran.push("pin") },
	{
		label: "Move to space",
		items: [
			{ label: "School", run: () => ran.push("school") },
			{ label: "Home", run: () => ran.push("home") },
		],
	},
	{ label: "Close tab", danger: true, divider: true, hint: "Ctrl W", run: () => ran.push("close") },
];

test("a menu sent to another page keeps what it shows and drops what it does", () => {
	expect(toEntries(items)).toEqual([
		{ label: "Pin to space" },
		{ label: "Move to space", items: [{ label: "School" }, { label: "Home" }] },
		{ label: "Close tab", danger: true, divider: true, hint: "Ctrl W" },
	]);
	expect(JSON.parse(JSON.stringify(toEntries(items)))).toEqual(toEntries(items));
});

test("a picked path finds the item again, in a submenu too", () => {
	itemAt(items, [1, 1])?.run?.();
	itemAt(items, [2])?.run?.();
	expect(ran).toEqual(["home", "close"]);
	expect(itemAt(items, [1])?.label).toBe("Move to space");
	expect(itemAt(items, [5])).toBeUndefined();
	expect(itemAt(items, [0, 3])).toBeUndefined();
	expect(itemAt(items, [])).toBeUndefined();
});

test("its height counts rows, lines, the title and an open submenu", () => {
	const menu = { items: toEntries(items) };
	expect(menuHeight(menu, null)).toBe(8 + 34 * 3 + 9);
	expect(menuHeight(menu, 1)).toBe(8 + 34 * 5 + 9);
	expect(menuHeight({ ...menu, title: "uBlock" }, null)).toBe(8 + 34 * 3 + 9 + 39);
});
