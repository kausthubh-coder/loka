// The sidebar's menus, in a window of their own: menu.html, which the browser keeps loaded and hidden in each window
// (LokaMenu) and shows at the pointer when the sidebar asks (showMenu). Out here a menu can reach past the sidebar's
// edge. It draws what it's handed, tells the browser how big that is, and hands back the path of what was picked; the
// sidebar runs it.

import { css, html, LitElement, nothing } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { themeTokens } from "../../prototype/src/app/theme";
import { resolveScheme } from "../../prototype/src/app/theme.logic";
import "../../prototype/src/features/menu/loka-menu";
import type { LokaMenu } from "../../prototype/src/features/menu/loka-menu";
import { browser, type ShownMenu } from "./bridge";

/** Room around the menu for its shadow. LokaMenu::Place (loka_menu.cc) moves the window up and left by as much. */
const SHADOW = 10;

const darkSystem = matchMedia("(prefers-color-scheme: dark)");

export class LokaMenuPage extends LitElement {
	static override properties = {
		menu: { state: true },
		opened: { state: true },
		systemDark: { state: true },
	};

	menu: ShownMenu | null = null;
	/** Counts each menu shown, so each starts fresh (no submenu open, the keyboard on its first item). */
	opened = 0;
	systemDark = darkSystem.matches;
	private sized = new ResizeObserver(() => this.sendSize());

	override connectedCallback() {
		super.connectedCallback();
		browser.onMenuShow((menu) => {
			this.menu = menu;
			this.opened++;
		});
		// Nothing to show yet: this tells the browser the page is here, so it can hand over a menu.
		browser.menuReady(0, 0);
		// Hidden (picked, closed, or a click elsewhere): nothing stays drawn for next time.
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "hidden") this.menu = null;
		});
		darkSystem.addEventListener("change", (e) => {
			this.systemDark = e.matches;
		});
	}

	/** The browser shows the window as big as the menu, so a submenu opening grows it. */
	private sendSize() {
		const box = this.renderRoot.querySelector("loka-menu")?.getBoundingClientRect();
		if (box) browser.menuReady(Math.ceil(box.width) + 2 * SHADOW, Math.ceil(box.height) + 2 * SHADOW);
	}

	protected override updated(changed: Map<string, unknown>) {
		if (!changed.has("opened")) return;
		const menu = this.renderRoot.querySelector<LokaMenu>("loka-menu");
		if (!menu) return;
		this.sized.disconnect();
		this.sized.observe(menu);
		void menu.updateComplete.then(() => {
			this.sendSize();
			menu.focusFirst();
		});
	}

	override render() {
		const menu = this.menu;
		if (!menu) return nothing;
		const scheme = resolveScheme(menu.scheme, this.systemDark);
		document.documentElement.style.colorScheme = scheme;
		return html`<div class="frame theme-${scheme}" style="--hue: ${menu.hue}">
			${keyed(
				this.opened,
				html`<loka-menu
					.menu=${{ title: menu.title, items: menu.items }}
					@loka-menu-pick=${(e: CustomEvent<number[]>) => {
						this.menu = null;
						browser.menuPicked(e.detail);
					}}
					@loka-menu-close=${() => {
						this.menu = null;
						browser.closeMenu();
					}}
				></loka-menu>`,
			)}
		</div>`;
	}

	static override styles = [
		themeTokens,
		css`
			:host {
				display: block;
			}
			.frame {
				display: inline-block;
				padding: ${SHADOW}px;
				background: transparent;
			}
		`,
	];
}

customElements.define("loka-menu-page", LokaMenuPage);
