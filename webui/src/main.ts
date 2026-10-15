// The Loka sidebar, built into the browser: the window's left column shows this page (chrome://loka-sidebar).
// Clicks change the spaces (saved in the profile); sync.ts makes this window's real tabs follow.

import { css, html, LitElement } from "lit";
import type { Update } from "../../prototype/src/app/loka-app";
import { skyLayer, skyStyles, skyTurn } from "../../prototype/src/app/sky";
import { DEFAULT_UI, type UiPrefs } from "../../prototype/src/app/ui-prefs.logic";
import type { ActionId } from "../../prototype/src/features/command-bar/command-bar.logic";
import "../../prototype/src/features/command-bar/loka-command-bar";
import { setDownloadSource } from "../../prototype/src/features/downloads/loka-downloads";
import type { Media, MediaAction } from "../../prototype/src/features/media/loka-media-card";
import { type LiveTabs, setFaviconSource } from "../../prototype/src/features/sidebar/favicon";
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
	switchesForward,
	switchSpace,
	type TabId,
	updateSpace,
} from "../../prototype/src/features/sidebar/sidebar.logic";
import { playCue, setSoundPrefs } from "../../prototype/src/features/sound/sound";
import "../../prototype/src/features/spaces/loka-space-editor";
import { browser, type NativeTab } from "./bridge";
import { applyOnboarding, onboardingSpaces } from "./onboarding.logic";
import {
	faviconUrl,
	markOnboardingApplied,
	onLinksChanged,
	pendingOnboarding,
	readSession,
	readState,
	readUi,
	watch,
	writeSession,
	writeState,
} from "./store";
import { browserTabOf, linkedTabs, spacesChanged, startSync } from "./sync";

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
		live: { state: true },
	};

	state: BrowserState | null = null;
	ui: UiPrefs = DEFAULT_UI;
	media: Media | null = null;
	commandOpen = false;
	editing: Editing | null = null;
	previewHue: number | null = null;
	/** Each loaded tab's page: its own icon, loading, sound. */
	live: LiveTabs = {};
	private tabs: NativeTab[] = [];
	/** The last icon each Loka tab's page had, so a pinned tab keeps it after it unloads. */
	private icons = new Map<TabId, string>();

	apply: Update = (change) => {
		if (!this.state) return;
		this.state = change(this.state);
		void writeState(this.state).then(spacesChanged);
	};

	/** Rebuilds `live` from the browser's tabs and which Loka tab each one is. */
	private refreshLive = () => {
		const byId = new Map(this.tabs.map((t) => [t.id, t]));
		const links = linkedTabs();
		for (const [lokaId, browserId] of Object.entries(links)) {
			const icon = byId.get(browserId)?.favicon;
			if (icon) this.icons.set(lokaId, icon);
		}
		const live: LiveTabs = {};
		for (const [lokaId, icon] of this.icons) live[lokaId] = { icon };
		for (const [lokaId, browserId] of Object.entries(links)) {
			const tab = byId.get(browserId);
			if (!tab) continue;
			live[lokaId] = { icon: this.icons.get(lokaId), loading: tab.loading, audible: tab.audible, muted: tab.muted };
		}
		this.live = live;
	};

	private setTabs = (tabs: NativeTab[]) => {
		this.tabs = tabs;
		this.refreshLive();
	};

	override connectedCallback() {
		super.connectedCallback();
		void (async () => {
			[this.state, this.ui] = await Promise.all([readState(), readUi()]);
			this.media = (await readSession()).media;
			await this.applySetup();
		})();
		watch(({ state, ui, media, onboarding }) => {
			if (onboarding) void this.applySetup();
			if (state) this.state = state;
			if (ui) this.ui = ui;
			if (media !== undefined) this.media = media;
		});
		browser.onTabsChanged(this.setTabs);
		void browser.tabs().then(this.setTabs);
		// The sync links a new browser tab to its Loka tab a moment after the browser reports it.
		onLinksChanged(this.refreshLive);
		window.addEventListener("keydown", this.onKey);
	}

	/** Takes in the spaces made in setup, once. */
	private async applySetup() {
		const json = await pendingOnboarding();
		if (!json || !this.state) return;
		markOnboardingApplied(json);
		const spaces = onboardingSpaces(json);
		if (spaces.length) this.apply((s) => applyOnboarding(s, spaces));
	}

	protected override updated(changed: Map<string, unknown>) {
		const before = changed.get("state") as BrowserState | null | undefined;
		const state = this.state;
		if (before && state && before.activeSpaceId !== state.activeSpaceId) {
			const forward = switchesForward(state, before.activeSpaceId, state.activeSpaceId);
			skyTurn(this.renderRoot, forward, activeSpace(before).hue);
		}
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
			this.openCommandBar();
		} else {
			const n = Number(e.key);
			const target = Number.isInteger(n) && n >= 1 ? this.state?.spaces[n - 1] : undefined;
			if (target) {
				e.preventDefault();
				if (target.id !== this.state?.activeSpaceId) playCue("space");
				this.apply((s) => switchSpace(s, target.id));
			}
		}
	};

	private openCommandBar() {
		if (!this.commandOpen) playCue("command");
		this.commandOpen = true;
	}

	private sidebar() {
		return this.renderRoot.querySelector<LokaSidebar>("loka-sidebar");
	}

	private toggleMute(tabId: TabId) {
		const tab = this.tabs.find((t) => t.id === browserTabOf(tabId));
		if (tab) browser.setMuted(tab.id, !tab.muted);
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
		const browserId = browserTabOf(media.tabId);
		if (action === "go") this.apply((s) => revealTab(s, media.tabId));
		else if (action === "stop") await writeSession({ media: null });
		if (browserId === undefined) return;
		if (action === "mute") browser.setMuted(browserId, !media.muted);
		// Play and pause need the page's media session, which the sidebar doesn't reach yet: it shows the tab.
		if (action === "toggle") browser.activateTab(browserId);
	}

	private onNav(action: "back" | "forward" | "reload") {
		const state = this.state;
		const shown = state && activeSpace(state).activeTabId;
		const browserId = shown ? browserTabOf(shown) : undefined;
		if (browserId === undefined) return;
		if (action === "back") browser.goBack(browserId);
		else if (action === "forward") browser.goForward(browserId);
		else browser.reload(browserId);
	}

	private unload(tabId: TabId) {
		const browserId = browserTabOf(tabId);
		if (browserId !== undefined) browser.closeTab(browserId);
	}

	private saveSpace(look: SpaceLook) {
		const editing = this.editing;
		if (!editing) return;
		if (editing.mode === "create") playCue("space-new");
		this.apply((s) => (editing.mode === "create" ? createSpace(s, look)[0] : updateSpace(s, editing.spaceId, look)));
		this.editing = null;
		this.previewHue = null;
	}

	override render() {
		const state = this.state;
		if (!state) return null;
		const hue = this.previewHue ?? activeSpace(state).hue;
		setSoundPrefs({ on: this.ui.sound, volume: this.ui.soundVolume });
		// Whether it's playing is whatever the tab says now: the sync only records that sound started.
		const audible = this.media ? this.live[this.media.tabId]?.audible : undefined;
		const media = this.media && audible !== undefined ? { ...this.media, playing: audible } : this.media;
		return html`
			<div
				class="window"
				style="--hue: ${hue}"
				@loka-action=${(e: CustomEvent<ActionId>) => this.run(e.detail)}
				@loka-command=${() => this.openCommandBar()}
				@loka-media=${(e: CustomEvent<MediaAction>) => this.onMedia(e.detail)}
				@loka-nav=${(e: CustomEvent<"back" | "forward" | "reload">) => this.onNav(e.detail)}
				@loka-tab-closed=${(e: CustomEvent<string>) => this.unload(e.detail)}
				@loka-preview=${(e: CustomEvent<number>) => {
					this.previewHue = e.detail;
				}}
			>
				${skyLayer(hue)}
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
				<loka-sidebar
					.state=${state}
					.apply=${this.apply}
					.media=${media}
					.live=${this.live}
					.demo=${false}
					@loka-tab-mute=${(e: CustomEvent<string>) => this.toggleMute(e.detail)}
				></loka-sidebar>
				${
					this.commandOpen
						? html`<loka-command-bar
								.state=${state}
								.apply=${this.apply}
								.live=${this.live}
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
		`,
	];
}

customElements.define("loka-panel", LokaPanel);
