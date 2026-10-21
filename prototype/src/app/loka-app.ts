import { css, html, LitElement, nothing } from "lit";
import "../features/sidebar/loka-sidebar";
import "../features/page/loka-page";
import "../features/command-bar/loka-command-bar";
import "../features/spaces/loka-space-editor";
import "../features/onboarding/loka-onboarding";
import type { BrowserCommand, CommandPick, NativeMedia, NativeTab } from "../../../webui/src/bridge";
import { DEMO_EXTENSIONS, DEMO_LINKS } from "../demo/demo-data";
import { fakeBrowser, onDemoPopup, pressBrowserShortcut } from "../demo/fake-browser";
import { fakeHistory } from "../demo/fake-history";
import { type ActionId, isActionId } from "../features/command-bar/command-bar.logic";
import { type Section, sectionTitle, sectionUrl } from "../features/library/library.logic";
import type { MediaAction, NowPlaying } from "../features/media/loka-media-card";
import { nowPlaying } from "../features/media/media.logic";
import { applyTour, type TourResult } from "../features/onboarding/onboarding.logic";
import type { LiveTabs } from "../features/sidebar/favicon";
import { hostOf } from "../features/sidebar/favicon";
import { applyIntent, type Intent } from "../features/sidebar/intents.logic";
import type { LokaSidebar, Panel } from "../features/sidebar/loka-sidebar";
import { SPACE_HUES } from "../features/sidebar/planet";
import {
	activateTab,
	activeSpace,
	activeTab,
	archiveStale,
	type BrowserState,
	closeTab,
	createFolder,
	createSpace,
	deleteSpace,
	focusOrOpen,
	importState,
	navigateTab,
	openTab,
	revealTab,
	type SpaceLook,
	stepTab,
	switchesForward,
	switchSpace,
	updateSpace,
} from "../features/sidebar/sidebar.logic";
import { seedState } from "../features/sidebar/sidebar.seed";
import { playCue, setSoundPrefs } from "../features/sound/sound";
import type { LookPreview } from "../features/spaces/loka-space-editor";
import { skyLayer, skyStyles, skyTurn } from "./sky";
import { reducedMotion, themeTokens } from "./theme";
import { resolveScheme, type Scheme } from "./theme.logic";
import { clampWidth, DEFAULT_UI, parseUiPrefs, type UiPrefs } from "./ui-prefs.logic";

const STORAGE_KEY = "loka.state.v1";
const UI_KEY = "loka.ui.v1";

function loadState(): BrowserState {
	const saved = localStorage.getItem(STORAGE_KEY);
	return (saved && importState(saved)) || seedState();
}

/** How the prototype changes its own spaces. */
type Update = (change: (state: BrowserState) => BrowserState) => void;
/** How a component asks for a change: an intent, as the browser's sidebar sends it (intents.logic.ts). */
export type Act = (intent: Intent) => void;

type Editing = { mode: "create"; look: SpaceLook } | { mode: "edit"; spaceId: string; look: SpaceLook };

const darkSystem = matchMedia("(prefers-color-scheme: dark)");

/**
 * The prototype's window: owns the spaces and the window prefs, saves them, lays out the sidebar beside a stand-in
 * page, and plays the browser's part through the fake bridge (prototype/src/demo), the way the real browser answers
 * the built-in sidebar.
 */
export class LokaApp extends LitElement {
	static override properties = {
		state: { state: true },
		ui: { state: true },
		command: { state: true },
		editing: { state: true },
		tourOpen: { state: true },
		preview: { state: true },
		peek: { state: true },
		pinned: { state: true },
		systemDark: { state: true },
		media: { state: true },
		tabs: { state: true },
		popup: { state: true },
	};

	state: BrowserState = loadState();
	ui: UiPrefs = parseUiPrefs(localStorage.getItem(UI_KEY));
	/** The open command bar: what it's for, and the address it starts with. */
	command: { mode: BrowserCommand; query: string } | null = null;
	editing: Editing | null = null;
	/**
	 * The tour shows on first launch, and again from the command bar or the `...` menu. `?skip-tour` leaves it closed
	 * for tools that load the prototype in a fresh browser (Critly), so they see the window instead.
	 */
	tourOpen = !this.ui.onboarded && !new URLSearchParams(location.search).has("skip-tour");
	/** While the space editor or the tour is choosing a look, the window shows it before it's saved. */
	preview: LookPreview | null = null;
	/** The hidden sidebar is sliding in over the page. */
	peek = false;
	/** The browser keeps whether the sidebar is pinned; it starts pinned until the browser says otherwise. */
	pinned = true;
	systemDark = darkSystem.matches;
	/** The browser's media sessions and tabs, as the fake bridge reports them. */
	media: NativeMedia[] = [];
	tabs: NativeTab[] = [];
	/** Where the stand-in for an extension's popup shows, after a click on its button. */
	popup: { id: string; x: number; y: number } | null = null;
	private archiveTimer = 0;
	private sentScheme: string | null = null;
	private stops: (() => void)[] = [];

	/**
	 * A change saved but not yet drawn, while the crossfade captures the old look (one frame). Later changes build on
	 * it, never on what's on screen.
	 */
	private pending: BrowserState | null = null;

	apply: Update = (change) => {
		const before = this.pending ?? this.state;
		const next = change(before);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		this.followScheme(next);
		if (this.pending) {
			this.pending = next;
			return;
		}
		// A space in the other scheme crossfades the whole window rather than snapping every color at once.
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

	/** The prototype applies an intent to its own spaces, the way the browser applies one to the saved spaces. */
	act: Act = (intent) => this.apply((s) => applyIntent(s, intent));

	setUi = (change: Partial<UiPrefs>) => {
		this.ui = { ...this.ui, ...change, sidebarWidth: clampWidth(change.sidebarWidth ?? this.ui.sidebarWidth) };
		localStorage.setItem(UI_KEY, JSON.stringify(this.ui));
		if ("archiveAfterHours" in change) this.archiveNow();
	};

	/** Light or dark for a state's current space, or for the look being previewed. */
	private schemeOf(state: BrowserState, preview = this.preview): Scheme {
		return resolveScheme(preview?.scheme ?? activeSpace(state).scheme, this.systemDark);
	}

	private run(action: ActionId) {
		const space = activeSpace(this.state);
		if (action === "toggle-sound") {
			this.setUi({ sound: !this.ui.sound });
			return;
		}
		if (action === "new-space") {
			const hue = SPACE_HUES[this.state.spaces.length % SPACE_HUES.length] ?? 200;
			this.editing = {
				mode: "create",
				look: { name: `Space ${this.state.spaces.length + 1}`, hue, planet: "banded", scheme: "system" },
			};
		} else if (action === "edit-space") {
			this.editSpace(space.id);
		} else if (action === "new-folder") {
			this.apply((s) => createFolder(s, space.id, null, "New folder")[0]);
		} else if (action === "toggle-sidebar") {
			fakeBrowser.setSidebarPinned(!this.pinned);
		} else if (action === "settings") {
			this.apply((s) => focusOrOpen(s, "loka://settings", "Settings"));
		} else if (action === "history" || action === "library") {
			this.openLibrary(action === "history" ? "history" : "spaces");
		} else if (action === "downloads" || action === "extensions" || action === "archive") {
			this.showPanel(action);
		} else if (action === "search-sidebar") {
			this.showPanel("search");
		} else if (action === "onboarding") {
			this.tourOpen = true;
		}
	}

	/**
	 * Shows the Library at a section in its one tab, wherever that tab is, or opens it: the browser keeps one
	 * chrome://history tab and takes it to the address asked for.
	 */
	private openLibrary(section: Section) {
		const url = sectionUrl("loka://history", section);
		const title = sectionTitle(section);
		this.apply((s) => {
			const shown = Object.values(s.tabs).find((t) => t.url.startsWith("loka://history"));
			return shown ? revealTab(navigateTab(s, shown.id, url, title), shown.id) : openTab(s, url, title);
		});
	}

	/** Opens a sidebar panel, sliding a hidden sidebar in first so the panel can be seen. */
	private showPanel(panel: Panel) {
		if (!this.pinned) this.peek = true;
		this.renderRoot.querySelector<LokaSidebar>("loka-sidebar")?.openPanel(panel);
	}

	/** Runs what was picked in the command bar, as the real sidebar does for the browser's floating bar. */
	private runPick(pick: CommandPick) {
		if (pick.kind === "open") {
			const title = pick.search ?? hostOf(pick.url);
			const shown = activeTab(this.state);
			if (!pick.newTab && shown) this.apply((s) => navigateTab(s, shown.id, pick.url, title));
			else this.apply((s) => openTab(s, pick.url, title));
		} else if (pick.kind === "tab") {
			this.apply((s) => activateTab(switchSpace(s, pick.spaceId), pick.tabId));
		} else if (pick.kind === "space") {
			this.apply((s) => switchSpace(s, pick.spaceId));
		} else if (pick.kind === "action" && isActionId(pick.action)) {
			this.run(pick.action);
		}
	}

	/** The browser's shortcut (or the sidebar asking for the bar) opens it, ready for that job. */
	private openCommandBar = (mode: BrowserCommand) => {
		if (!this.command) playCue("command");
		const shown = activeTab(this.state);
		this.command = { mode, query: mode === "focus-location" && shown ? shown.url : "" };
	};

	/** The Loka tab a browser tab shows, through the demo's links. */
	private lokaTabOf(browserId: number): string | undefined {
		return Object.entries(DEMO_LINKS).find(([, id]) => id === browserId)?.[0];
	}

	private onMedia(action: MediaAction) {
		const playing = this.nowPlaying();
		if (!playing) return;
		const { tabId } = playing.media;
		if (action === "go" && playing.tab) {
			const lokaId = playing.tab.id;
			this.apply((s) => revealTab(s, lokaId));
		} else if (action === "toggle") fakeBrowser.mediaAction(tabId, playing.media.playing ? "pause" : "play");
		else if (action === "previous" || action === "next") fakeBrowser.mediaAction(tabId, action);
		else if (action === "mute") fakeBrowser.setMuted(tabId, !playing.muted);
	}

	private nowPlaying(): NowPlaying | null {
		const shownId = activeSpace(this.state).activeTabId;
		const media = nowPlaying(this.media, shownId ? DEMO_LINKS[shownId] : undefined);
		if (!media) return null;
		const lokaId = this.lokaTabOf(media.tabId);
		const tab = lokaId ? (this.state.tabs[lokaId] ?? null) : null;
		return { media, tab, muted: this.tabs.find((t) => t.id === media.tabId)?.muted ?? false };
	}

	/** Runs the archive now and every minute after, using the setting in Settings > Tabs. */
	private archiveNow = () => {
		const hours = this.ui.archiveAfterHours;
		if (!hours) return;
		const audible = new Set(
			Object.keys(DEMO_LINKS).filter((id) => this.tabs.find((t) => t.id === DEMO_LINKS[id])?.audible),
		);
		const next = archiveStale(this.state, Date.now(), hours * 60 * 60 * 1000, audible);
		if (next !== this.state) this.apply(() => next);
	};

	private editSpace(spaceId: string) {
		const s = this.state.spaces.find((x) => x.id === spaceId);
		if (s) {
			this.editing = { mode: "edit", spaceId, look: { name: s.name, hue: s.hue, planet: s.planet, scheme: s.scheme } };
		}
	}

	private saveSpace(look: SpaceLook) {
		const editing = this.editing;
		if (!editing) return;
		this.editing = null;
		this.preview = null;
		if (editing.mode === "create") {
			playCue("space-new");
			this.apply((s) => createSpace(s, look)[0]);
		} else this.apply((s) => updateSpace(s, editing.spaceId, look));
	}

	private deleteEditedSpace() {
		const editing = this.editing;
		if (editing?.mode !== "edit") return;
		this.editing = null;
		this.preview = null;
		this.apply((s) => deleteSpace(s, editing.spaceId));
	}

	/**
	 * The tour's spaces replace the first ones in order; extra ones are added; spaces it didn't list are kept.
	 * Imported bookmarks go into the first space as closed folders, and Arc's spaces become new spaces.
	 */
	private finishTour(result: TourResult) {
		this.apply((s) => applyTour(s, result));
		this.closeTour();
	}

	private closeTour() {
		this.tourOpen = false;
		this.preview = null;
		this.setUi({ onboarded: true });
	}

	private onKey = (e: KeyboardEvent) => {
		if (this.tourOpen || this.editing || !(e.ctrlKey || e.metaKey)) return;
		// Next and previous tab in sidebar order. Arc's keys; the real browser also maps Ctrl+Tab and Ctrl+PgDn here.
		if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
			e.preventDefault();
			this.apply((s) => stepTab(s, e.key === "ArrowDown" ? 1 : -1));
			return;
		}
		if (e.shiftKey && e.key.toLowerCase() === "f") {
			e.preventDefault();
			this.showPanel("search");
			return;
		}
		// The browser's own shortcuts: it hands them to the sidebar, which opens the command bar.
		if (e.key === "t" || e.key === "l") {
			e.preventDefault();
			pressBrowserShortcut(e.key === "t" ? "new-tab" : "focus-location");
			return;
		}
		if (e.key === "k") {
			e.preventDefault();
			fakeBrowser.openCommandBar("new-tab");
			return;
		}
		if (e.key === "s" || e.key === "h") {
			e.preventDefault();
			this.run(e.key === "s" ? "toggle-sidebar" : "history");
			return;
		}
		if (e.key === "e") {
			// Ctrl+W can't be caught by a web page, so the prototype closes tabs with Ctrl+E.
			e.preventDefault();
			const tab = activeTab(this.state);
			if (tab) {
				playCue("tab-close");
				this.apply((s) => closeTab(s, tab.id));
			}
			return;
		}
		const n = Number(e.key);
		if (Number.isInteger(n) && n >= 1 && n <= 9) {
			const target = this.state.spaces[n - 1];
			if (!target) return;
			e.preventDefault();
			if (target.id !== this.state.activeSpaceId) playCue("space");
			this.apply((s) => switchSpace(s, target.id));
		}
	};

	/** Dragging the sidebar's inner edge sets its width. Listens on the window so a fast drag can't outrun the handle. */
	private startResize(e: PointerEvent) {
		e.preventDefault();
		const { left, right } = this.getBoundingClientRect();
		const move = (ev: PointerEvent) =>
			this.setUi({ sidebarWidth: this.ui.sidebarSide === "left" ? ev.clientX - left : right - ev.clientX });
		const stop = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", stop);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", stop);
	}

	private onSystemScheme = (e: MediaQueryListEvent) => {
		this.systemDark = e.matches;
	};

	private onVisibility = () => this.requestUpdate();

	/** A page opened from the stand-in History page, as the browser would open it. */
	private onHistoryOpen = (e: Event) => {
		const { url, newTab } = (e as CustomEvent<{ url: string; newTab: boolean }>).detail;
		this.runPick({ kind: "open", url, newTab });
	};

	override connectedCallback() {
		super.connectedCallback();
		// Save what was loaded, so a first visit stores the seed data and an invalid save gets replaced.
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
		window.addEventListener("keydown", this.onKey);
		darkSystem.addEventListener("change", this.onSystemScheme);
		document.addEventListener("visibilitychange", this.onVisibility);
		window.addEventListener("loka-demo-open", this.onHistoryOpen);
		this.archiveNow();
		this.archiveTimer = window.setInterval(this.archiveNow, 60_000);
		void fakeBrowser.sidebarPinned().then((pinned) => {
			this.pinned = pinned;
		});
		void fakeBrowser.media().then((m) => {
			this.media = m;
		});
		void fakeBrowser.tabs().then((t) => {
			this.tabs = t;
		});
		this.stops = [
			fakeBrowser.onSidebarPinnedChanged((pinned) => {
				this.pinned = pinned;
				this.peek = false;
			}),
			fakeBrowser.onCommand(this.openCommandBar),
			fakeBrowser.onCommandPicked((pick) => this.runPick(pick)),
			fakeBrowser.onMediaChanged((m) => {
				this.media = m;
			}),
			fakeBrowser.onTabsChanged((t) => {
				this.tabs = t;
			}),
			onDemoPopup((id, anchor) => {
				// After the click that asked for it has finished bubbling, or the window's click would close it again.
				window.setTimeout(() => {
					this.popup = this.popup?.id === id ? null : { id, x: anchor.x, y: anchor.y + anchor.height + 6 };
				});
			}),
		];
	}

	protected override updated(changed: Map<string, unknown>) {
		const before = changed.get("state") as BrowserState | undefined;
		if (before && before.activeSpaceId !== this.state.activeSpaceId) {
			const forward = switchesForward(this.state, before.activeSpaceId, this.state.activeSpaceId);
			skyTurn(this.renderRoot, forward, activeSpace(before).hue, this.schemeOf(before, null));
		}
		this.followScheme(this.pending ?? this.state);
	}

	/** The browser and its pages follow the space's own choice; "system" hands it back to the computer. */
	private followScheme(state: BrowserState) {
		const scheme = activeSpace(state).scheme;
		if (scheme === this.sentScheme) return;
		this.sentScheme = scheme;
		fakeBrowser.setColorScheme(scheme);
	}

	override disconnectedCallback() {
		window.removeEventListener("keydown", this.onKey);
		darkSystem.removeEventListener("change", this.onSystemScheme);
		document.removeEventListener("visibilitychange", this.onVisibility);
		window.removeEventListener("loka-demo-open", this.onHistoryOpen);
		window.clearInterval(this.archiveTimer);
		for (const stop of this.stops) stop();
		super.disconnectedCallback();
	}

	override render() {
		const space = activeSpace(this.state);
		const { sidebarSide: side, sidebarWidth: width } = this.ui;
		const hidden = !this.pinned;
		const scheme = this.schemeOf(this.state);
		const hue = this.preview?.hue ?? space.hue;
		setSoundPrefs({ on: this.ui.sound, volume: this.ui.soundVolume });
		document.documentElement.style.colorScheme = scheme;
		const layout = `${side} ${hidden ? "hidden" : ""} ${hidden && this.peek ? "peek" : ""} ${this.tourOpen ? "touring" : ""}`;
		// Each linked demo tab's page: its sound, as the browser's tab strip reports it.
		const live: LiveTabs = {};
		for (const [lokaId, browserId] of Object.entries(DEMO_LINKS)) {
			const tab = this.tabs.find((t) => t.id === browserId);
			if (tab) live[lokaId] = { audible: tab.audible, muted: tab.muted };
		}
		const popupExtension = this.popup && DEMO_EXTENSIONS.find((x) => x.id === this.popup?.id);
		return html`
			<div
				class="window theme-${scheme} ${layout}"
				style="--hue: ${hue}; --sidebar: ${width}px"
				@loka-action=${(e: CustomEvent<ActionId>) => this.run(e.detail)}
				@loka-edit-space=${(e: CustomEvent<string>) => this.editSpace(e.detail)}
				@loka-preview=${(e: CustomEvent<LookPreview | number>) => {
					this.preview = typeof e.detail === "number" ? { hue: e.detail } : e.detail;
				}}
				@click=${() => {
					this.popup = null;
				}}
			>
				${skyLayer(hue, scheme)}
				${
					hidden
						? html`<div class="edge-zone" aria-hidden="true" @pointerenter=${() => (this.peek = true)}></div>`
						: html`<div
								class="resize"
								role="separator"
								aria-orientation="vertical"
								aria-label="Resize sidebar"
								aria-valuenow=${width}
								title="Drag to resize. Double-click to reset."
								@pointerdown=${(e: PointerEvent) => this.startResize(e)}
								@dblclick=${() => this.setUi({ sidebarWidth: DEFAULT_UI.sidebarWidth })}
							></div>`
				}
				<loka-sidebar
					.state=${this.state}
					.apply=${this.act}
					.playing=${this.nowPlaying()}
					.live=${live}
					.browser=${fakeBrowser}
					.pinned=${this.pinned}
					.soundOn=${this.ui.sound}
					@loka-media=${(e: CustomEvent<MediaAction>) => this.onMedia(e.detail)}
					@loka-tab-mute=${(e: CustomEvent<string>) => {
						const browserId = DEMO_LINKS[e.detail];
						const tab = this.tabs.find((t) => t.id === browserId);
						if (tab) fakeBrowser.setMuted(tab.id, !tab.muted);
					}}
					@loka-tab-reload=${(e: CustomEvent<string>) => this.apply((s) => activateTab(s, e.detail))}
					@pointerleave=${() => (this.peek = false)}
					@loka-command=${(e: CustomEvent<BrowserCommand>) => fakeBrowser.openCommandBar(e.detail)}
					@loka-reset=${() => this.apply(() => seedState())}
				></loka-sidebar>
				<loka-page
					.tab=${activeTab(this.state)}
					.spaceName=${space.name}
					.state=${this.state}
					.apply=${this.act}
					.ui=${this.ui}
					.setUi=${this.setUi}
					.pinned=${this.pinned}
					.scheme=${scheme}
					.historyBridge=${fakeHistory}
					.browser=${fakeBrowser}
				></loka-page>
				${
					popupExtension && this.popup
						? html`<div
								class="ext-popup"
								role="dialog"
								aria-label="${popupExtension.name} popup"
								style="left: ${this.popup.x}px; top: ${this.popup.y}px"
								@click=${(e: Event) => e.stopPropagation()}
							>
								<img src=${popupExtension.icon} alt="" />
								<b>${popupExtension.name}</b>
								<small>The extension's own popup opens here, beside its button.</small>
							</div>`
						: nothing
				}
				${
					this.command
						? html`<loka-command-bar
								.state=${this.state}
								.live=${live}
								.browser=${fakeBrowser}
								.links=${DEMO_LINKS}
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
								.deletable=${this.state.spaces.length > 1}
								@loka-save=${(e: CustomEvent<SpaceLook>) => this.saveSpace(e.detail)}
								@loka-delete=${() => this.deleteEditedSpace()}
								@loka-close=${() => {
									this.editing = null;
									this.preview = null;
								}}
							></loka-space-editor>`
						: nothing
				}
				${
					this.tourOpen
						? html`<loka-onboarding
								.spaces=${this.state.spaces.slice(0, 3).map((s) => ({ name: s.name, hue: s.hue, planet: s.planet }))}
								@loka-finish=${(e: CustomEvent<TourResult>) => this.finishTour(e.detail)}
								@loka-skip=${() => this.closeTour()}
							></loka-onboarding>`
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
			height: 100%;
		}
		.window {
			position: relative;
			display: grid;
			grid-template-columns: var(--sidebar) 1fr;
			/* One row the window's height, so long pages (Settings, History) scroll inside it instead of growing it. */
			grid-template-rows: minmax(0, 1fr);
			grid-template-areas: "side page";
			height: 100%;
			/* clip, not hidden: nothing (a focus, a scroll into view) can scroll the window itself. */
			overflow: clip;
			isolation: isolate;
		}
		.window.right {
			grid-template-columns: 1fr var(--sidebar);
			grid-template-areas: "page side";
		}
		loka-sidebar {
			grid-area: side;
		}
		loka-page {
			grid-area: page;
		}
		.window.right loka-page {
			padding: 8px 0 8px 8px;
		}
		/* Hidden: the page takes the whole window and the sidebar floats over it when the pointer reaches the edge. */
		.window.hidden {
			grid-template-columns: 1fr;
			grid-template-areas: "page";
		}
		.window.hidden loka-page {
			padding: 8px;
		}
		.window.hidden loka-sidebar {
			position: absolute;
			z-index: 15;
			top: 8px;
			bottom: 8px;
			left: 8px;
			width: var(--sidebar);
			border-radius: 12px;
			box-shadow: 0 20px 60px #0007;
			translate: calc(-100% - 16px) 0;
		}
		.theme-dark.hidden loka-sidebar {
			background: hsl(var(--hue) 30% 8% / 0.97);
		}
		.theme-light.hidden loka-sidebar {
			background: hsl(var(--hue) 55% 93% / 0.97);
			box-shadow: 0 20px 60px hsl(var(--hue) 50% 20% / 0.3);
		}
		.window.hidden.right loka-sidebar {
			left: auto;
			right: 8px;
			translate: calc(100% + 16px) 0;
		}
		/* No translate at all once shown, so the sidebar's fixed-position menus stay relative to the window. */
		.window.hidden.peek loka-sidebar {
			translate: none;
		}
		.edge-zone {
			position: absolute;
			z-index: 14;
			top: 0;
			bottom: 0;
			left: 0;
			width: 10px;
		}
		.window.right .edge-zone {
			left: auto;
			right: 0;
		}
		.resize {
			position: absolute;
			z-index: 5;
			top: 0;
			bottom: 0;
			left: calc(var(--sidebar) - 4px);
			width: 8px;
			cursor: col-resize;
			touch-action: none;
		}
		.window.right .resize {
			left: auto;
			right: calc(var(--sidebar) - 4px);
		}
		.resize:hover {
			background: linear-gradient(transparent, var(--loka-accent), transparent) no-repeat center / 2px 100%;
		}
		/* The stand-in for an extension's own popup. */
		.ext-popup {
			position: absolute;
			z-index: 25;
			display: grid;
			grid-template-columns: 28px 1fr;
			column-gap: 10px;
			align-items: center;
			width: 240px;
			padding: 12px;
			border-radius: 12px;
			background: var(--loka-surface);
			box-shadow: var(--loka-surface-edge);
			font: 13px/1.4 system-ui, "Segoe UI", sans-serif;
		}
		.ext-popup img {
			width: 28px;
			height: 28px;
			grid-row: span 2;
		}
		.ext-popup small {
			color: var(--loka-ink-2);
		}
		/* During the tour the window is only the sky; the sidebar and page wait underneath. */
		.window.touring > :is(loka-sidebar, loka-page, .resize, .edge-zone) {
			visibility: hidden;
		}

		/* No transition on --hue: animating the number sweeps through every hue in between. The sky crossfades. */
		@media (prefers-reduced-motion: no-preference) {
			.window.hidden loka-sidebar {
				transition: translate 260ms cubic-bezier(0.2, 0, 0, 1);
			}
		}
	`,
	];
}

customElements.define("loka-app", LokaApp);
