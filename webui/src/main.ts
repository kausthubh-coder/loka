// The Loka sidebar, built into the browser: the window's left column shows this page (chrome://loka-sidebar).
// Clicks change the spaces (saved in the profile); sync.ts makes this window's real tabs follow.

import { css, html, LitElement } from "lit";
import type { Update } from "../../prototype/src/app/loka-app";
import { skyLayer, skyStyles } from "../../prototype/src/app/sky";
import { DEFAULT_UI, type UiPrefs } from "../../prototype/src/app/ui-prefs.logic";
import type { ActionId } from "../../prototype/src/features/command-bar/command-bar.logic";
import "../../prototype/src/features/command-bar/loka-command-bar";
import { setDownloadSource } from "../../prototype/src/features/downloads/loka-downloads";
import type { Media, MediaAction } from "../../prototype/src/features/media/loka-media-card";
import { setFaviconSource } from "../../prototype/src/features/sidebar/favicon";
import "../../prototype/src/features/sidebar/loka-sidebar";
import { type LokaSidebar, setExtensionSource } from "../../prototype/src/features/sidebar/loka-sidebar";
import { SPACE_HUES } from "../../prototype/src/features/sidebar/planet";
import {
	activeSpace,
	type BrowserState,
	createFolder,
	createSpace,
	revealTab,
	type SpaceLook,
	stepTab,
	switchSpace,
	updateSpace,
} from "../../prototype/src/features/sidebar/sidebar.logic";
import "../../prototype/src/features/spaces/loka-space-editor";
import { browser } from "./bridge";
import { faviconUrl, onIconsChanged, readSession, readState, readUi, watch, writeSession, writeState } from "./store";
import { browserTabOf, spacesChanged, startSync } from "./sync";

setFaviconSource(faviconUrl);
// Downloads and extensions are the browser's own pages for now; the panels hand over to them.
setDownloadSource({
	list: () => [],
	watch: () => () => {},
	retry: () => {},
	cancel: () => {},
	show: () => browser.openPage("chrome://downloads/"),
	clear: () => {},
	openFolder: () => browser.openPage("chrome://downloads/"),
});
setExtensionSource({
	list: async () => [],
	watch: () => () => {},
	open: () => browser.openPage("chrome://extensions/"),
	manage: () => browser.openPage("chrome://extensions/"),
});
startSync();

/** Opens what the command bar chose: an address as typed, or a search with the user's own engine. */
function openUrl() {
	return ({ url, query, search }: { url: string; query: string; search: boolean }) => {
		if (search) browser.search(query, true);
		else void browser.createTab(url, true);
	};
}

type Editing = { mode: "create"; look: SpaceLook } | { mode: "edit"; spaceId: string; look: SpaceLook };

export class LokaPanel extends LitElement {
	static override properties = {
		state: { state: true },
		ui: { state: true },
		media: { state: true },
		commandOpen: { state: true },
		editing: { state: true },
		previewHue: { state: true },
	};

	state: BrowserState | null = null;
	ui: UiPrefs = DEFAULT_UI;
	media: Media | null = null;
	commandOpen = false;
	editing: Editing | null = null;
	previewHue: number | null = null;

	apply: Update = (change) => {
		if (!this.state) return;
		this.state = change(this.state);
		void writeState(this.state).then(spacesChanged);
	};

	override connectedCallback() {
		super.connectedCallback();
		void (async () => {
			[this.state, this.ui] = await Promise.all([readState(), readUi()]);
			this.media = (await readSession()).media;
		})();
		watch(({ state, ui, media }) => {
			if (state) this.state = state;
			if (ui) this.ui = ui;
			if (media !== undefined) this.media = media;
		});
		window.addEventListener("keydown", this.onKey);
		// A page's icon usually arrives after its title: redraw so the row shows it.
		onIconsChanged(() => {
			if (this.state) this.state = { ...this.state };
		});
	}

	private onKey = (e: KeyboardEvent) => {
		if (this.editing || !(e.ctrlKey || e.metaKey)) return;
		if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
			e.preventDefault();
			this.apply((s) => stepTab(s, e.key === "ArrowDown" ? 1 : -1));
		} else if (e.shiftKey && e.key.toLowerCase() === "f") {
			e.preventDefault();
			this.sidebar()?.openPanel("search");
		} else if (e.key === "k" || e.key === "l") {
			e.preventDefault();
			this.commandOpen = true;
		} else {
			const n = Number(e.key);
			const target = Number.isInteger(n) && n >= 1 ? this.state?.spaces[n - 1] : undefined;
			if (target) {
				e.preventDefault();
				this.apply((s) => switchSpace(s, target.id));
			}
		}
	};

	private sidebar() {
		return this.renderRoot.querySelector<LokaSidebar>("loka-sidebar");
	}

	/** The browser tab showing a Loka tab right now, if it's loaded. */
	private async browserTab(tabId: string): Promise<number | undefined> {
		return browserTabOf(tabId);
	}

	private run(action: ActionId) {
		const state = this.state;
		if (!state) return;
		const space = activeSpace(state);
		if (action === "new-space") {
			const hue = SPACE_HUES[state.spaces.length % SPACE_HUES.length] ?? 200;
			this.editing = { mode: "create", look: { name: `Space ${state.spaces.length + 1}`, hue, planet: "banded" } };
		} else if (action === "edit-space") {
			this.editing = {
				mode: "edit",
				spaceId: space.id,
				look: { name: space.name, hue: space.hue, planet: space.planet },
			};
		} else if (action === "new-folder") {
			this.apply((s) => createFolder(s, space.id, null, "New folder")[0]);
		} else if (action === "toggle-sidebar") {
			// The sidebar is part of the window; there's nothing to close.
		} else if (action === "settings") {
			browser.openPage("chrome://settings/");
		} else if (action === "onboarding") {
			browser.openPage("chrome://setup/");
		} else if (action === "downloads" || action === "archive") {
			this.sidebar()?.openPanel(action);
		} else if (action === "search-sidebar") {
			this.sidebar()?.openPanel("search");
		}
	}

	private async onMedia(action: MediaAction) {
		const media = this.media;
		if (!media) return;
		const browserId = await this.browserTab(media.tabId);
		if (action === "go") this.apply((s) => revealTab(s, media.tabId));
		else if (action === "stop") await writeSession({ media: null });
		if (browserId === undefined) return;
		if (action === "mute") browser.setMuted(browserId, !media.muted);
		// Play and pause need the page's media session, which the sidebar doesn't reach yet: it shows the tab.
		if (action === "toggle") browser.activateTab(browserId);
	}

	private async onNav(action: "back" | "forward" | "reload") {
		const state = this.state;
		const shown = state && activeSpace(state).activeTabId;
		const browserId = shown ? await this.browserTab(shown) : undefined;
		if (browserId === undefined) return;
		if (action === "back") browser.goBack(browserId);
		else if (action === "forward") browser.goForward(browserId);
		else browser.reload(browserId);
	}

	private async unload(tabId: string) {
		const browserId = await this.browserTab(tabId);
		if (browserId !== undefined) browser.closeTab(browserId);
	}

	private saveSpace(look: SpaceLook) {
		const editing = this.editing;
		if (!editing) return;
		this.apply((s) => (editing.mode === "create" ? createSpace(s, look)[0] : updateSpace(s, editing.spaceId, look)));
		this.editing = null;
		this.previewHue = null;
	}

	override render() {
		const state = this.state;
		if (!state) return null;
		const hue = this.previewHue ?? activeSpace(state).hue;
		return html`
			<div
				class="window"
				style="--hue: ${hue}"
				@loka-action=${(e: CustomEvent<ActionId>) => this.run(e.detail)}
				@loka-command=${() => {
					this.commandOpen = true;
				}}
				@loka-media=${(e: CustomEvent<MediaAction>) => this.onMedia(e.detail)}
				@loka-nav=${(e: CustomEvent<"back" | "forward" | "reload">) => this.onNav(e.detail)}
				@loka-tab-closed=${(e: CustomEvent<string>) => this.unload(e.detail)}
				@loka-preview=${(e: CustomEvent<number>) => {
					this.previewHue = e.detail;
				}}
			>
				${skyLayer()}
				<div
					class="titlebar"
					@mousedown=${(e: MouseEvent) => {
						if (e.button === 0 && e.target === e.currentTarget && e.detail === 1) browser.startWindowDrag();
					}}
					@dblclick=${(e: MouseEvent) => e.target === e.currentTarget && browser.windowAction("maximize")}
				>
					<button class="caption" aria-label="Minimize" @click=${() => browser.windowAction("minimize")}>
						<svg viewBox="0 0 10 10"><path d="M1 5.5h8" /></svg>
					</button>
					<button class="caption" aria-label="Maximize" @click=${() => browser.windowAction("maximize")}>
						<svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" rx="1" /></svg>
					</button>
					<button class="caption close" aria-label="Close" @click=${() => browser.windowAction("close")}>
						<svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" /></svg>
					</button>
				</div>
				<loka-sidebar .state=${state} .apply=${this.apply} .media=${this.media} .demo=${false}></loka-sidebar>
				${
					this.commandOpen
						? html`<loka-command-bar
								.state=${state}
								.apply=${this.apply}
								.go=${openUrl()}
								@loka-close=${() => {
									this.commandOpen = false;
								}}
							></loka-command-bar>`
						: null
				}
				${
					this.editing
						? html`<loka-space-editor
								.look=${this.editing.look}
								.mode=${this.editing.mode}
								@loka-save=${(e: CustomEvent<SpaceLook>) => this.saveSpace(e.detail)}
								@loka-close=${() => {
									this.editing = null;
									this.previewHue = null;
								}}
							></loka-space-editor>`
						: null
				}
			</div>
		`;
	}

	static override styles = [
		skyStyles,
		css`
			:host {
				display: block;
				height: 100vh;
				color: #e9e9ef;
			}
			.window {
				position: relative;
				height: 100%;
				isolation: isolate;
				overflow: hidden;
				display: flex;
				flex-direction: column;
			}
			/* The window's title bar lives here: empty space drags the window, the buttons sit at its end. */
			.titlebar {
				flex: none;
				height: 34px;
				display: flex;
				justify-content: flex-end;
				align-items: center;
				gap: 2px;
				padding: 0 6px;
			}
			.caption {
				width: 34px;
				height: 28px;
				display: grid;
				place-items: center;
				border: 0;
				border-radius: 7px;
				background: transparent;
				color: rgb(233 233 239 / 0.62);
				cursor: default;
			}
			.caption svg {
				width: 10px;
				height: 10px;
				fill: none;
				stroke: currentColor;
				stroke-width: 1.2;
			}
			.caption:hover {
				background: rgb(255 255 255 / 0.1);
				color: #e9e9ef;
			}
			.caption.close:hover {
				background: #c42b1c;
				color: #fff;
			}
			.caption:focus-visible {
				outline: 2px solid hsl(var(--hue) 80% 70%);
				outline-offset: -2px;
			}
			loka-sidebar {
				flex: 1;
				min-height: 0;
			}
			@media (prefers-reduced-motion: no-preference) {
				.window {
					transition: --hue 420ms cubic-bezier(0.2, 0, 0, 1);
				}
			}
		`,
	];
}

customElements.define("loka-panel", LokaPanel);
