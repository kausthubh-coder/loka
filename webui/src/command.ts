// The floating command bar: command.html, which the browser shows in a frameless, transparent window centered over
// a browser window when Ctrl+T, Ctrl+L or the sidebar's address field asks for it (openCommandBar). Everything
// outside the bar is transparent. It reads the spaces from the profile like the sidebar does, but doesn't run the
// tab sync: that's the sidebar's job in each window.
//
// What's picked here that the browser can do itself (open an address, search, switch to a loaded tab) happens
// here. What changes Loka's spaces (an unloaded tab, a space, a command) goes to the window's sidebar through
// commandPicked, so there's one place that changes them.

import { css, html, LitElement, nothing } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { themeTokens } from "../../prototype/src/app/theme";
import { resolveScheme } from "../../prototype/src/app/theme.logic";
import "../../prototype/src/features/command-bar/loka-command-bar";
import { setFaviconSource } from "../../prototype/src/features/sidebar/favicon";
import { activeSpace, type BrowserState } from "../../prototype/src/features/sidebar/sidebar.logic";
import { playCue, setSoundPrefs } from "../../prototype/src/features/sound/sound";
import { type BrowserCommand, browser, type CommandPick, type NativeTab } from "./bridge";
import { faviconUrl, readState, readUi, watch } from "./store";

setFaviconSource(faviconUrl);

const darkSystem = matchMedia("(prefers-color-scheme: dark)");

/** What the bar is for when it opens before the browser says: command.html?mode=focus-location, or a new tab. */
function startMode(): BrowserCommand {
	return new URLSearchParams(location.search).get("mode") === "focus-location" ? "focus-location" : "new-tab";
}

export class LokaCommandPage extends LitElement {
	static override properties = {
		state: { state: true },
		mode: { state: true },
		query: { state: true },
		opened: { state: true },
		systemDark: { state: true },
		pinned: { state: true },
	};

	state: BrowserState | null = null;
	mode: BrowserCommand = startMode();
	query = "";
	/** Counts each time the browser shows the bar, so it starts fresh (empty, focused, animating in) every time. */
	opened = 0;
	systemDark = darkSystem.matches;
	pinned = true;
	private tabs: NativeTab[] = [];

	override connectedCallback() {
		super.connectedCallback();
		void readState().then((state) => {
			this.state = state;
		});
		void readUi().then((ui) => setSoundPrefs({ on: ui.sound, volume: ui.soundVolume }));
		watch(({ state, ui }) => {
			if (state) this.state = state;
			if (ui) setSoundPrefs({ on: ui.sound, volume: ui.soundVolume });
		});
		browser.onTabsChanged((tabs) => {
			this.tabs = tabs;
		});
		void browser.tabs().then((tabs) => {
			this.tabs = tabs;
			if (this.mode === "focus-location" && this.opened === 0) {
				this.query = this.shownTab()?.url ?? "";
				this.opened++;
			}
		});
		void browser.sidebarPinned().then((pinned) => {
			this.pinned = pinned;
		});
		browser.onCommand((mode) => void this.open(mode));
		darkSystem.addEventListener("change", (e) => {
			this.systemDark = e.matches;
		});
	}

	private shownTab(): NativeTab | undefined {
		return this.tabs.find((t) => t.active);
	}

	/** The browser showed the bar for `mode`: start over, with the current address for Ctrl+L. */
	private async open(mode: BrowserCommand) {
		this.tabs = await browser.tabs();
		this.mode = mode;
		this.query = mode === "focus-location" ? (this.shownTab()?.url ?? "") : "";
		this.opened++;
		playCue("command");
	}

	private close = () => browser.closeCommandBar();

	private pick(pick: CommandPick) {
		const shown = this.shownTab();
		const state = this.state;
		if (pick.kind === "open") {
			const newTab = pick.newTab || !shown;
			if (pick.search !== undefined) browser.search(pick.search, newTab);
			else if (newTab || !shown) void browser.createTab(pick.url, true);
			else browser.navigateTab(shown.id, pick.url);
		} else if (pick.kind === "browser-tab") {
			browser.activateTab(pick.tabId);
		} else {
			// A Loka tab that's loaded in this window is a browser tab the browser can show; the sidebar's sync then
			// switches its space. Anything else changes the spaces, which only the sidebar does.
			const url = pick.kind === "tab" ? state?.tabs[pick.tabId]?.url : undefined;
			const loaded = url ? this.tabs.find((t) => t.url === url) : undefined;
			if (loaded) browser.activateTab(loaded.id);
			else browser.commandPicked(pick);
		}
	}

	override render() {
		const state = this.state;
		if (!state) return nothing;
		const space = activeSpace(state);
		const scheme = resolveScheme(space.scheme, this.systemDark);
		document.documentElement.style.colorScheme = scheme;
		return html`<div class="frame theme-${scheme}" style="--hue: ${space.hue}">
			${keyed(
				this.opened,
				html`<loka-command-bar
					layout="page"
					.state=${state}
					.browser=${browser}
					.pinned=${this.pinned}
					.mode=${this.mode}
					.initialQuery=${this.query}
					@loka-pick=${(e: CustomEvent<CommandPick>) => this.pick(e.detail)}
					@loka-close=${this.close}
				></loka-command-bar>`,
			)}
		</div>`;
	}

	static override styles = [
		themeTokens,
		css`
			:host {
				display: block;
				height: 100vh;
			}
			.frame {
				position: relative;
				height: 100%;
				background: transparent;
			}
		`,
	];
}

customElements.define("loka-command-page", LokaCommandPage);
