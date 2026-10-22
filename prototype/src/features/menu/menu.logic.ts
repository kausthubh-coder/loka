// A menu as data: what <loka-menu> draws, and what the sidebar sends the browser's floating menu window (menu.html),
// which can't take functions. An item is found again by its path: its index, then its index in the submenu.

export interface MenuEntry {
	label: string;
	/** Its shortcut, shown quietly on the right. */
	hint?: string;
	/** Styled as destructive (Close tab, Close others). */
	danger?: boolean;
	/** Starts a new group in the menu: a line above it. */
	divider?: boolean;
	/** A submenu, opened under the item. */
	items?: MenuEntry[];
}

export interface MenuModel {
	/** What the menu is for (an extension's name), shown at the top and never picked. */
	title?: string;
	items: MenuEntry[];
}

/** A menu item that does something when picked; the sidebar's own shape. */
export interface MenuItem extends Omit<MenuEntry, "items"> {
	run?: () => void;
	items?: MenuItem[];
}

/** The items without what they do, for drawing in another page. */
export function toEntries(items: MenuItem[]): MenuEntry[] {
	return items.map(({ label, hint, danger, divider, items: inner }) => ({
		label,
		...(hint === undefined ? {} : { hint }),
		...(danger ? { danger } : {}),
		...(divider ? { divider } : {}),
		...(inner ? { items: toEntries(inner) } : {}),
	}));
}

/** The item at `path`, or undefined when the menu has changed since. */
export function itemAt<T extends { items?: T[] }>(items: T[], path: number[]): T | undefined {
	const [first, ...rest] = path;
	const item = first === undefined ? undefined : items[first];
	if (!item || rest.length === 0) return item;
	return itemAt(item.items ?? [], rest);
}

/** How tall a menu is drawn, in CSS px: rows, lines, the title, and an open submenu's rows. */
export function menuHeight(menu: MenuModel, open: number | null): number {
	const rows = menu.items.length + (open === null ? 0 : (menu.items[open]?.items?.length ?? 0));
	const lines = menu.items.filter((i) => i.divider).length;
	return 8 + 34 * rows + 9 * lines + (menu.title ? 39 : 0);
}
