import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import type { MenuEntry, MenuModel } from "./menu.logic";

/**
 * A menu: rows of choices, an item with a submenu opening it underneath, the shortcut quiet on the right. The keys
 * work as in any menu: Up, Down, Home and End move; Right opens a submenu and Left closes it; Enter picks; Escape and
 * Tab close. It doesn't run anything itself: it says which item was picked, by its path (`loka-menu-pick`), or that it
 * was closed (`loka-menu-close`). The sidebar draws it in place in the prototype; in the browser it's drawn in a
 * window of its own (menu.html) so it can reach past the sidebar's edge.
 */
export class LokaMenu extends LitElement {
	static override properties = {
		menu: { attribute: false },
		submenu: { state: true },
	};

	declare menu: MenuModel;
	/** The item whose submenu is open. */
	submenu: number | null = null;

	/** Puts the keyboard on the first item, as a menu that just opened does. */
	focusFirst() {
		void this.updateComplete.then(() => this.buttons()[0]?.focus());
	}

	private buttons() {
		return [...this.renderRoot.querySelectorAll<HTMLElement>('[role="menuitem"]')];
	}

	private pick(path: number[]) {
		this.dispatchEvent(new CustomEvent("loka-menu-pick", { detail: path, bubbles: true, composed: true }));
	}

	private close() {
		this.dispatchEvent(new CustomEvent("loka-menu-close", { bubbles: true, composed: true }));
	}

	/** Opens item `index`'s submenu (or closes it with null), then puts the keyboard in it or back on its item. */
	private async openSubmenu(index: number | null) {
		const parent = this.submenu;
		this.submenu = index;
		await this.updateComplete;
		const selector = index === null ? `[data-index="${parent}"]` : ".nested";
		this.renderRoot.querySelector<HTMLElement>(selector)?.focus();
	}

	private onKey(e: KeyboardEvent) {
		const items = this.buttons();
		const current = this.shadowRoot?.activeElement as HTMLElement | null;
		const at = current ? items.indexOf(current) : -1;
		const nested = current?.classList.contains("nested") ?? false;
		let next: number;
		if (e.key === "ArrowDown") next = (at + 1) % items.length;
		else if (e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = items.length - 1;
		else if (e.key === "ArrowRight" && current?.getAttribute("aria-haspopup") === "menu") {
			e.preventDefault();
			void this.openSubmenu(Number(current.dataset.index));
			return;
		} else if (e.key === "ArrowLeft" && (nested || current?.getAttribute("aria-expanded") === "true")) {
			e.preventDefault();
			void this.openSubmenu(null);
			return;
		} else if (e.key === "Escape" || e.key === "Tab") {
			e.preventDefault();
			e.stopPropagation();
			this.close();
			return;
		} else return;
		e.preventDefault();
		items[next]?.focus();
	}

	private item(entry: MenuEntry, path: number[]): TemplateResult {
		const [index = 0] = path;
		const nested = path.length > 1;
		const opens = entry.items !== undefined;
		return html`${entry.divider ? html`<hr role="separator" />` : nothing}<button
				class="${entry.danger ? "danger" : ""} ${nested ? "nested" : ""} ${opens && this.submenu === index ? "open" : ""}"
				role="menuitem"
				tabindex="-1"
				data-index=${index}
				aria-label=${entry.label}
				aria-haspopup=${opens ? "menu" : nothing}
				aria-expanded=${opens ? this.submenu === index : nothing}
				@click=${(e: Event) => {
					e.stopPropagation();
					if (opens) void this.openSubmenu(this.submenu === index ? null : index);
					else this.pick(path);
				}}
			>
				<span>${entry.label}</span>${entry.hint ? html`<kbd>${entry.hint}</kbd>` : nothing}${
					opens
						? html`<svg class="more" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>`
						: nothing
				}
			</button>`;
	}

	override render() {
		const menu = this.menu;
		return html`<div
			class="menu"
			role="menu"
			aria-label=${menu.title ?? nothing}
			@keydown=${(e: KeyboardEvent) => this.onKey(e)}
		>
			${menu.title ? html`<div class="menu-title" aria-hidden="true">${menu.title}</div><hr role="separator" />` : nothing}
			${menu.items.map(
				(entry, i) =>
					html`${this.item(entry, [i])}${
						this.submenu === i && entry.items
							? html`<div role="group" aria-label=${entry.label}>
									${entry.items.map((child, j) => this.item(child, [i, j]))}
								</div>`
							: nothing
					}`,
			)}
		</div>`;
	}

	static override styles = css`
		:host {
			display: block;
			font-size: 14px;
			user-select: none;
			--glass-edge: light-dark(hsl(var(--hue) 40% 20% / 0.1), hsl(0 0% 100% / 0.12));
		}
		/* Frosted glass over whatever is behind, opaque enough that it never shows through the text. */
		.menu {
			display: flex;
			flex-direction: column;
			width: 196px;
			padding: 4px;
			border-radius: 12px;
			transform-origin: top left;
			color: var(--loka-ink);
			background: hsl(from var(--loka-surface) h s l / 0.96);
			box-shadow:
				inset 0 0 0 1px var(--glass-edge),
				var(--loka-surface-edge);
			backdrop-filter: blur(20px) saturate(1.4);
		}
		@supports not (backdrop-filter: blur(1px)) {
			.menu {
				background: hsl(from var(--loka-surface) h s l / 1);
			}
		}
		@media (prefers-reduced-transparency: reduce) {
			.menu {
				background: hsl(from var(--loka-surface) h s l / 1);
				backdrop-filter: none;
			}
		}
		@media (prefers-reduced-motion: no-preference) {
			.menu {
				transition:
					opacity 150ms cubic-bezier(0.2, 0, 0, 1),
					transform 200ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
					transform: scale(0.97);
				}
			}
		}
		/* The sidebar's buttons: no chrome of their own. */
		button {
			font: inherit;
			color: inherit;
			background: none;
			border: 0;
			cursor: default;
			flex: none;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			text-align: left;
			height: 34px;
			padding: 0 10px;
			border-radius: 8px;
			font-size: 14px;
		}
		button > span {
			flex: 1;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		/* Hover and keyboard focus look the same: one lit row at a time. */
		button:hover,
		button:focus-visible,
		button.open {
			background: var(--loka-fill-hover);
			outline: none;
		}
		button:active {
			background: var(--loka-pressed);
		}
		button.danger {
			color: var(--loka-danger);
		}
		button.danger:hover,
		button.danger:focus-visible {
			background: color-mix(in srgb, var(--loka-danger) 14%, transparent);
		}
		button.danger:active {
			background: color-mix(in srgb, var(--loka-danger) 22%, transparent);
		}
		.more {
			width: 14px;
			height: 14px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.5;
			stroke-linecap: round;
			stroke-linejoin: round;
			color: var(--loka-ink-3);
		}
		[role="group"] {
			display: flex;
			flex-direction: column;
		}
		button.nested {
			padding-left: 24px;
		}
		.open .more {
			rotate: 90deg;
		}
		kbd {
			font: 12px system-ui, "Segoe UI", sans-serif;
			color: var(--loka-ink-3);
		}
		/* What the menu is for (an extension's name): quiet, not a choice, so the keys skip it. */
		.menu-title {
			flex: none;
			height: 30px;
			padding: 0 10px;
			line-height: 30px;
			font-size: 12px;
			font-weight: 600;
			color: var(--loka-ink-2);
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		hr {
			flex: none;
			height: 1px;
			margin: 4px 6px;
			border: 0;
			background: var(--loka-line);
		}
	`;
}

customElements.define("loka-menu", LokaMenu);
