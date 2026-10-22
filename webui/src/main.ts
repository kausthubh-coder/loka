// The Loka sidebar, built into the browser: the window's left column shows this page (chrome://loka-sidebar).
// Clicks change the spaces (saved in the profile); sync.ts makes this window's real tabs follow.

import { css, html, LitElement, nothing } from "lit";
import type { Act } from "../../prototype/src/app/loka-app";
import { type NebulaNow, setStarMotion, skyLayer, skyNow, skyStyles, skyTurn } from "../../prototype/src/app/sky";
import { reducedMotion, themeTokens } from "../../prototype/src/app/theme";
import { resolveScheme, type Scheme } from "../../prototype/src/app/theme.logic";
import { DEFAULT_UI, type UiPrefs } from "../../prototype/src/app/ui-prefs.logic";
import {
	type ActionId,
	isActionId,
	isChromeMenuCommand,
} from "../../prototype/src/features/command-bar/command-bar.logic";
import "../../prototype/src/features/command-bar/loka-command-bar";
import { sectionUrl } from "../../prototype/src/features/library/library.logic";
import type { MediaAction, NowPlaying } from "../../prototype/src/features/media/loka-media-card";
import { nowPlaying } from "../../prototype/src/features/media/media.logic";
import { type LiveTabs, setFaviconSource } from "../../prototype/src/features/sidebar/favicon";
import { keepUnchanged } from "../../prototype/src/features/sidebar/keep-unchanged.logic";
import "../../prototype/src/features/sidebar/loka-sidebar";
import type { LokaSidebar } from "../../prototype/src/features/sidebar/loka-sidebar";
import { SPACE_HUES } from "../../prototype/src/features/sidebar/planet";
import {
	activeSpace,
	type BrowserState,
	newId,
	type SpaceLook,
	switchesForward,
	type TabId,
} from "../../prototype/src/features/sidebar/sidebar.logic";
import { playCue, setSoundPrefs } from "../../prototype/src/features/sound/sound";
import "../../prototype/src/features/spaces/loka-space-editor";
import type { LookPreview } from "../../prototype/src/features/spaces/loka-space-editor";
import { isEmptyTab } from "../../prototype/src/features/tabs/live.logic";
import { type BrowserCommand, browser, type CommandPick, type NativeMedia, type NativeTab } from "./bridge";
import { faviconUrl } from "./favicon-url";
import { frameColor } from "./frame-color.logic";
import { type Hold, type HoldReason, holdChanged, NO_HOLD } from "./hold.logic";
import { shownAddress, startsEmpty } from "./new-tab.logic";
import { onboardingIntents, onboardingSpaces } from "./onboarding.logic";
import {
	act,
	browserTabOf,
	linkedTabs,
	markOnboardingApplied,
	onLinksChanged,
	pendingOnboarding,
	readState,
	readUi,
	watch,
	writeUi,
} from "./store";

setFaviconSource(faviconUrl);

type Editing = { mode: "create"; look: SpaceLook } | { mode: "edit"; spaceId: string; look: SpaceLook };

const darkSystem = matchMedia("(prefers-color-scheme: dark)");

export class LokaPanel extends LitElement {
	static override properties = {
		state: { state: true },
		ui: { state: true },
		command: { state: true },
		editing: { state: true },
		preview: { state: true },
		live: { state: true },
		media: { state: true },
		pinned: { state: true },
		systemDark: { state: true },
	};

	state: BrowserState | null = null;
	ui: UiPrefs = DEFAULT_UI;
	/** The sidebar's own command bar, when the browser hands it a shortcut instead of showing its floating one. */
	command: { mode: BrowserCommand; query: string } | null = null;
	editing: Editing | null = null;
	preview: LookPreview | null = null;
	/** Each loaded tab's page: its own icon, loading, sound. */
	live: LiveTabs = {};
	/** The browser's media sessions. Null until it answers. */
	media: NativeMedia[] | null = null;
	/** The browser keeps whether the sidebar is pinned; it starts pinned until the browser says otherwise. */
	pinned = true;
	systemDark = darkSystem.matches;
	private tabs: NativeTab[] = [];
	/** The last icon each Loka tab's page had, so a pinned tab keeps it after it unloads. */
	private icons = new Map<TabId, string>();
	private sentScheme: string | null = null;
	private sentFrame: string | null = null;
	/** Why the hidden sidebar must stay open right now, and what the browser was told. */
	private holding: Hold = NO_HOLD;

	private onHold(reason: HoldReason, on: boolean) {
		const { hold, send } = holdChanged(this.holding, reason, on);
		this.holding = hold;
		if (send !== null) browser.holdSidebar(send);
	}

	/** Typing anywhere on this page (the command bar, a folder's name, search) holds the sidebar open. */
	private onFocus = (e: FocusEvent) => {
		const el = e.composedPath()[0];
		const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
		if (typing) this.onHold("input", e.type === "focusin");
	};
	/** Whether this window has shown its first page yet; if that's an empty tab, the command bar opens over it. */
	private started = false;

	/**
	 * A change saved but not yet drawn, while the crossfade captures the old look (one frame). Later changes build on
	 * it, never on what's on screen.
	 */
	private pending: BrowserState | null = null;

	/** Changes the spaces: drawn now, saved and followed by the browser (store.ts act). */
	apply: Act = (intent) => {
		const before = this.pending ?? this.state;
		if (!before) return;
		const next = act(intent);
		if (!next || next === before) return;
		if (this.pending) {
			this.pending = next;
			return;
		}
		// A space in the other scheme crossfades the whole sidebar rather than snapping every color at once.
		if (this.schemeOf(next) !== this.schemeOf(before) && !reducedMotion() && document.startViewTransition) {
			this.pending = next;
			const fade = document.startViewTransition(async () => {
				this.state = this.pending ?? next;
				this.pending = null;
				await this.updateComplete;
			});
			// A quick second switch skips the first crossfade; that's fine, not an error.
			fade.ready.catch(() => {});
			fade.finished.catch(() => {});
		} else this.state = next;
	};

	private schemeOf(state: BrowserState, preview = this.preview): Scheme {
		return resolveScheme(preview?.scheme ?? activeSpace(state).scheme, this.systemDark);
	}

	/** Rebuilds `live` from the browser's tabs and which Loka tab each one is. */
	private refreshLive = () => {
		const byId = new Map(this.tabs.map((t) => [t.id, t]));
		const links = linkedTabs();
		for (const [lokaId, browserId] of Object.entries(links)) {
			const icon = byId.get(browserId)?.favicon;
			if (icon) this.icons.set(lokaId, icon);
		}
		// A tab no browser tab in this window shows has no page here; one the browser unloaded keeps its tab.
		const live: LiveTabs = {};
		for (const lokaId of Object.keys(this.state?.tabs ?? {})) {
			live[lokaId] = { icon: this.icons.get(lokaId), unloaded: true };
		}
		for (const [lokaId, browserId] of Object.entries(links)) {
			const tab = byId.get(browserId);
			if (!tab) continue;
			live[lokaId] = {
				icon: this.icons.get(lokaId),
				loading: tab.loading,
				audible: tab.audible,
				muted: tab.muted,
				unloaded: tab.discarded,
			};
		}
		// A title changing in the browser changes nothing here: the sidebar then has nothing to redraw.
		this.live = keepUnchanged(this.live, live);
	};

	private setTabs = (tabs: NativeTab[]) => {
		this.tabs = tabs;
		// Which tab is on screen, and whether a playing one is muted, decide the now-playing card (render). `live`
		// often stays the same object now, so it can't be what redraws the page.
		this.requestUpdate();
		this.refreshLive();
		const empty = this.started ? null : startsEmpty(tabs);
		if (empty !== null) {
			this.started = true;
			if (empty) browser.openCommandBar("new-tab");
		}
	};

	override connectedCallback() {
		super.connectedCallback();
		void (async () => {
			[this.state, this.ui] = await Promise.all([readState(), readUi()]);
			await this.applySetup();
		})();
		watch(({ state, ui, onboarding }) => {
			if (onboarding) void this.applySetup();
			// A change from elsewhere, or the browser correcting this page: drawn as it comes, or after a crossfade. The
			// parts that didn't change stay the objects drawn, so their rows don't redraw.
			if (state && this.pending) this.pending = state;
			else if (state) this.state = this.state ? keepUnchanged(this.state, state) : state;
			if (ui) this.ui = ui;
		});
		browser.onTabsChanged(this.setTabs);
		void browser.syncTabs().then((tabs) => this.setTabs(tabs));
		// The sync links a new browser tab to its Loka tab a moment after the browser reports it.
		onLinksChanged(this.refreshLive);
		window.addEventListener("keydown", this.onKey);
		window.addEventListener("focusin", this.onFocus);
		window.addEventListener("focusout", this.onFocus);
		darkSystem.addEventListener("change", (e) => {
			this.systemDark = e.matches;
		});
		void browser.sidebarPinned().then((pinned) => {
			this.pinned = pinned;
		});
		browser.onSidebarPinnedChanged((pinned) => {
			this.pinned = pinned;
		});
		// Ctrl+T and Ctrl+L, when the browser hands them to this page rather than to its floating command bar.
		browser.onCommand((command) => this.onBrowserCommand(command));
		browser.onCommandPicked((pick) => this.runPick(pick));
		// The sidebar's menus open in the browser's menu window, which says what was picked.
		browser.onMenuPicked((path) => this.sidebar()?.menuPicked(path));
		browser.onMenuClosed(() => this.sidebar()?.menuClosed());
		void browser.media().then((media) => {
			this.media = media;
		});
		browser.onMediaChanged((media) => {
			this.media = media;
		});
	}

	/** Takes in the spaces made in setup, once, as intents: a tab the browser takes in meanwhile stays. */
	private async applySetup() {
		const json = await pendingOnboarding();
		if (!json || !this.state) return;
		markOnboardingApplied(json);
		for (const intent of onboardingIntents(this.state, onboardingSpaces(json))) this.apply(intent);
	}

	/** The old sky's nebula on a switch, read before the switch is drawn (skyNow). */
	private nebulaBefore: NebulaNow | null = null;

	protected override willUpdate(changed: Map<string, unknown>) {
		const before = changed.get("state") as BrowserState | null | undefined;
		if (before && this.state && before.activeSpaceId !== this.state.activeSpaceId) {
			this.nebulaBefore = skyNow(this.renderRoot);
		}
	}

	protected override updated(changed: Map<string, unknown>) {
		const before = changed.get("state") as BrowserState | null | undefined;
		const state = this.state;
		if (!state) return;
		if (before && before.activeSpaceId !== state.activeSpaceId) {
			const forward = switchesForward(state, before.activeSpaceId, state.activeSpaceId);
			skyTurn(this.renderRoot, forward, activeSpace(before).hue, this.schemeOf(before, null), this.nebulaBefore);
			this.nebulaBefore = null;
		}
		this.followScheme(this.pending ?? state);
		this.followFrame(this.pending ?? state);
		// Scrollbars and form controls in this page match what it shows.
		document.documentElement.style.colorScheme = this.schemeOf(state);
		// Unpinned, the browser floats this page over the window: its rounded corners show what's behind.
		document.body.style.background = this.pinned ? "" : "transparent";
	}

	/** The window's frame around the page takes the space's sky, so the sidebar reads as the whole window. */
	private followFrame(state: BrowserState) {
		const color = frameColor(activeSpace(state).hue, this.schemeOf(state));
		if (color === this.sentFrame) return;
		this.sentFrame = color;
		browser.setThemeColor(color);
	}

	/** The browser and its pages follow the space's own choice; "system" hands it back to the computer. */
	private followScheme(state: BrowserState) {
		const scheme = activeSpace(state).scheme;
		if (scheme === this.sentScheme) return;
		this.sentScheme = scheme;
		browser.setColorScheme(scheme);
	}

	private onKey = (e: KeyboardEvent) => {
		if (this.editing || !(e.ctrlKey || e.metaKey)) return;
		if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
			e.preventDefault();
			this.apply({ op: "stepTab", step: e.key === "ArrowDown" ? 1 : -1, now: Date.now() });
		} else if (e.shiftKey && e.key.toLowerCase() === "f") {
			e.preventDefault();
			this.sidebar()?.openPanel("search");
		} else if (e.key === "h") {
			e.preventDefault();
			this.run("history");
		} else if (e.key === "k" || e.key === "l") {
			e.preventDefault();
			browser.openCommandBar(e.key === "k" ? "new-tab" : "focus-location");
		} else {
			const n = Number(e.key);
			const target = Number.isInteger(n) && n >= 1 ? this.state?.spaces[n - 1] : undefined;
			if (target) {
				e.preventDefault();
				if (target.id !== this.state?.activeSpaceId) playCue("space");
				this.apply({ op: "switchSpace", spaceId: target.id });
			}
		}
	};

	/** The tab on screen in this window, as the browser has it. */
	private shownTab(): NativeTab | undefined {
		return this.tabs.find((t) => t.active);
	}

	/** A browser shortcut, handed over by the browser (see BrowserCommand). */
	private onBrowserCommand(command: BrowserCommand) {
		if (command === "next-tab" || command === "previous-tab") {
			this.apply({ op: "stepTab", step: command === "next-tab" ? 1 : -1, now: Date.now() });
		} else if (command === "close-tab") {
			this.closeShownTab();
		} else if (command !== "new-tab" && command !== "focus-location") {
			const spaces = this.state?.spaces ?? [];
			const n = Number(command.slice("space-".length));
			// Ctrl+9 is the last space, like the last tab in other browsers.
			const target = n === 9 ? spaces.at(-1) : spaces[n - 1];
			if (target && target.id !== this.state?.activeSpaceId) {
				playCue("space");
				this.apply({ op: "switchSpace", spaceId: target.id });
			}
		} else {
			this.openOwnCommandBar(command);
		}
	}

	/**
	 * Ctrl+W closes the shown tab the way its x in the sidebar does, so the space shows its next tab, or an empty tab
	 * when it has none, and the window stays. On an empty tab it closes the window, as Zen does.
	 */
	private closeShownTab() {
		const shown = this.shownTab();
		if (!shown) return;
		const lokaId = Object.entries(linkedTabs()).find(([, id]) => id === shown.id)?.[0];
		if (lokaId) {
			this.apply({ op: "closeTab", tabId: lokaId, now: Date.now() });
			this.unload(lokaId);
		} else if (isEmptyTab(shown.url)) browser.windowAction("close");
		else browser.closeTab(shown.id);
	}

	private openOwnCommandBar(mode: "new-tab" | "focus-location") {
		if (!this.command) playCue("command");
		this.command = { mode, query: mode === "focus-location" ? shownAddress(this.shownTab()) : "" };
	}

	/** Runs what was picked in a command bar: this page's own, or the browser's floating one (command.html). */
	private runPick(pick: CommandPick) {
		const shown = this.shownTab();
		if (pick.kind === "open") {
			// An empty tab is never navigated: what's picked there opens in a tab of its own, and the empty one goes.
			const newTab = pick.newTab || !shown || isEmptyTab(shown.url);
			if (pick.search !== undefined) browser.search(pick.search, newTab);
			else if (newTab || !shown) void browser.createTab(pick.url, true);
			else browser.navigateTab(shown.id, pick.url);
		} else if (pick.kind === "tab") {
			this.apply({ op: "switchSpace", spaceId: pick.spaceId });
			this.apply({ op: "activateTab", tabId: pick.tabId, now: Date.now() });
		} else if (pick.kind === "browser-tab") {
			browser.activateTab(pick.tabId);
		} else if (pick.kind === "space") {
			this.apply({ op: "switchSpace", spaceId: pick.spaceId });
		} else if (isActionId(pick.action)) {
			this.run(pick.action);
		}
	}

	private sidebar() {
		return this.renderRoot.querySelector<LokaSidebar>("loka-sidebar");
	}

	private toggleMute(tabId: TabId) {
		const tab = this.tabs.find((t) => t.id === browserTabOf(tabId));
		if (tab) browser.setMuted(tab.id, !tab.muted);
	}

	/** Reloads a loaded tab's page; an unloaded tab loads by being shown. */
	private reloadTab(tabId: TabId) {
		const browserId = browserTabOf(tabId);
		if (browserId !== undefined) browser.reload(browserId);
		else this.apply({ op: "activateTab", tabId, now: Date.now() });
	}

	private run(action: ActionId) {
		const state = this.state;
		if (!state) return;
		const space = activeSpace(state);
		if (action === "new-space") {
			const hue = SPACE_HUES[state.spaces.length % SPACE_HUES.length] ?? 200;
			this.editing = {
				mode: "create",
				look: { name: `Space ${state.spaces.length + 1}`, hue, planet: "banded", scheme: "system" },
			};
		} else if (action === "edit-space") {
			this.editing = {
				mode: "edit",
				spaceId: space.id,
				look: { name: space.name, hue: space.hue, planet: space.planet, scheme: space.scheme },
			};
		} else if (action === "new-folder") {
			this.apply({ op: "createFolder", spaceId: space.id, parentId: null, name: "New folder", id: newId() });
		} else if (action === "toggle-sound") {
			this.ui = { ...this.ui, sound: !this.ui.sound };
			void writeUi(this.ui);
			setSoundPrefs({ on: this.ui.sound, volume: this.ui.soundVolume });
			if (this.ui.sound) playCue("pin");
		} else if (action === "toggle-sidebar") {
			// Shown at once; the browser slides the sidebar away (or keeps it) and says so if it changes elsewhere.
			this.pinned = !this.pinned;
			browser.setSidebarPinned(this.pinned);
		} else if (action === "settings") {
			browser.openPage("chrome://loka-settings/");
		} else if (action === "history" || action === "library") {
			// One Library tab: the browser goes to it and takes it to the section's address.
			browser.openPage(sectionUrl("chrome://history/", action === "history" ? "history" : "spaces"));
		} else if (action === "onboarding") {
			browser.openPage("chrome://setup/");
		} else if (action === "downloads" || action === "extensions" || action === "archive") {
			this.sidebar()?.openPanel(action);
		} else if (action === "search-sidebar") {
			this.sidebar()?.openPanel("search");
		} else if (isChromeMenuCommand(action)) {
			browser.browserCommand(action);
		}
	}

	/** The card's last contents, kept as the same object while they stay the same, so the sidebar needn't redraw. */
	private playing: NowPlaying | null = null;

	/** The card shows media from another tab; the browser's tab ids map back to Loka's through the sync's links. */
	private nowPlaying(state: BrowserState): NowPlaying | null {
		const media = nowPlaying(this.media, this.shownTab()?.id);
		if (!media) return null;
		const lokaId = Object.entries(linkedTabs()).find(([, id]) => id === media.tabId)?.[0];
		const tab = lokaId ? (state.tabs[lokaId] ?? null) : null;
		const now = { media, tab, muted: this.tabs.find((t) => t.id === media.tabId)?.muted ?? false };
		this.playing = this.playing ? keepUnchanged(this.playing, now) : now;
		return this.playing;
	}

	private onMedia(action: MediaAction) {
		const state = this.state;
		const playing = state && this.nowPlaying(state);
		if (!playing) return;
		const { tabId, playing: on } = playing.media;
		if (action === "go") {
			const lokaId = playing.tab?.id;
			if (lokaId) this.apply({ op: "revealTab", tabId: lokaId, now: Date.now() });
			else browser.activateTab(tabId);
		} else if (action === "toggle") browser.mediaAction(tabId, on ? "pause" : "play");
		else if (action === "previous" || action === "next") browser.mediaAction(tabId, action);
		else if (action === "mute") browser.setMuted(tabId, !playing.muted);
	}

	private onNav(action: "back" | "forward" | "reload") {
		const shown = this.shownTab();
		if (!shown) return;
		if (action === "back") browser.goBack(shown.id);
		else if (action === "forward") browser.goForward(shown.id);
		else browser.reload(shown.id);
	}

	/**
	 * A tab closed from the sidebar. A pinned tab or Essential stays in the spaces, so only the browser tab goes, now.
	 * A closed open tab is gone from the spaces: the browser shows the next tab first and then closes it, so it never
	 * picks a tab from another space in between.
	 */
	private unload(tabId: TabId) {
		if (!this.state?.tabs[tabId]) return;
		const browserId = browserTabOf(tabId);
		if (browserId === undefined) return;
		// The window's last tab: an empty tab takes its place first, so the window stays open.
		if (this.tabs.length === 1) void browser.createTab("", true).then(() => browser.closeTab(browserId));
		else browser.closeTab(browserId);
	}

	private saveSpace(look: SpaceLook) {
		const editing = this.editing;
		if (!editing) return;
		this.editing = null;
		this.preview = null;
		if (editing.mode === "create") playCue("space-new");
		this.apply(
			editing.mode === "create"
				? { op: "createSpace", look, id: newId() }
				: { op: "updateSpace", spaceId: editing.spaceId, look },
		);
	}

	private deleteEditedSpace() {
		const editing = this.editing;
		if (editing?.mode !== "edit") return;
		this.editing = null;
		this.preview = null;
		this.apply({ op: "deleteSpace", spaceId: editing.spaceId });
	}

	override render() {
		const state = this.state;
		if (!state) return null;
		const hue = this.preview?.hue ?? activeSpace(state).hue;
		const scheme = this.schemeOf(state);
		setSoundPrefs({ on: this.ui.sound, volume: this.ui.soundVolume });
		setStarMotion(this.ui.starMotion);
		return html`
			<div
				class="window theme-${scheme} ${this.pinned ? "" : "floating"}"
				style="--hue: ${hue}"
				@loka-action=${(e: CustomEvent<ActionId>) => this.run(e.detail)}
				@loka-command=${(e: CustomEvent<BrowserCommand>) => browser.openCommandBar(e.detail)}
				@loka-media=${(e: CustomEvent<MediaAction>) => this.onMedia(e.detail)}
				@loka-nav=${(e: CustomEvent<"back" | "forward" | "reload">) => this.onNav(e.detail)}
				@loka-tab-closed=${(e: CustomEvent<string>) => this.unload(e.detail)}
				@loka-hold=${(e: CustomEvent<{ reason: HoldReason; on: boolean }>) => this.onHold(e.detail.reason, e.detail.on)}
				@loka-preview=${(e: CustomEvent<LookPreview>) => {
					this.preview = e.detail;
				}}
			>
				${skyLayer(hue, scheme, this.ui.starMotion === "off" ? "still" : "drifts")}
				<loka-sidebar
					.state=${state}
					.apply=${this.apply}
					.playing=${this.nowPlaying(state)}
					.live=${this.live}
					.browser=${browser}
					.pinned=${this.pinned}
					.soundOn=${this.ui.sound}
					.demo=${false}
					.floatingMenus=${true}
					@loka-tab-mute=${(e: CustomEvent<string>) => this.toggleMute(e.detail)}
					@loka-tab-reload=${(e: CustomEvent<string>) => this.reloadTab(e.detail)}
				></loka-sidebar>
				${
					this.command
						? html`<loka-command-bar
								.state=${state}
								.live=${this.live}
								.browser=${browser}
								.links=${linkedTabs()}
								.pinned=${this.pinned}
								.sound=${this.ui.sound}
								.mode=${this.command.mode}
								.initialQuery=${this.command.query}
								@loka-pick=${(e: CustomEvent<CommandPick>) => this.runPick(e.detail)}
								@loka-close=${() => {
									this.command = null;
								}}
							></loka-command-bar>`
						: nothing
				}
				${
					this.editing
						? html`<loka-space-editor
								.look=${this.editing.look}
								.mode=${this.editing.mode}
								.deletable=${state.spaces.length > 1}
								@loka-save=${(e: CustomEvent<SpaceLook>) => this.saveSpace(e.detail)}
								@loka-delete=${() => this.deleteEditedSpace()}
								@loka-close=${() => {
									this.editing = null;
									this.preview = null;
								}}
							></loka-space-editor>`
						: nothing
				}
			</div>
		`;
	}

	static override styles = [
		themeTokens,
		skyStyles,
		css`
			:host {
				display: block;
				height: 100vh;
			}
			.window {
				position: relative;
				height: 100%;
				isolation: isolate;
				/* clip, not hidden: nothing (a focus, a scroll into view) can scroll the window itself. */
				overflow: clip;
				display: flex;
				flex-direction: column;
			}
			/* Floating over the page while unpinned: a finished panel of its own, corners and all. */
			.window.floating {
				border-radius: 12px;
			}
			loka-sidebar {
				flex: 1;
				min-height: 0;
			}
		`,
	];
}

customElements.define("loka-panel", LokaPanel);
