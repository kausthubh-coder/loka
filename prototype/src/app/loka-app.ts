import { css, html, LitElement, svg } from "lit";
import "../features/sidebar/loka-sidebar";
import "../features/page/loka-page";
import "../features/command-bar/loka-command-bar";
import "../features/spaces/loka-space-editor";
import "../features/onboarding/loka-onboarding";
import type { ActionId } from "../features/command-bar/command-bar.logic";
import { addArcSpaces, addImportedFolder } from "../features/import/import.logic";
import type { Media, MediaAction } from "../features/media/loka-media-card";
import type { TourResult } from "../features/onboarding/loka-onboarding";
import type { LokaSidebar, Panel } from "../features/sidebar/loka-sidebar";
import { SPACE_HUES } from "../features/sidebar/planet";
import {
	activeSpace,
	activeTab,
	archiveStale,
	type BrowserState,
	closeTab,
	createFolder,
	createSpace,
	focusOrOpen,
	importState,
	revealTab,
	type SpaceLook,
	stepTab,
	switchSpace,
	updateSpace,
} from "../features/sidebar/sidebar.logic";
import { seedState } from "../features/sidebar/sidebar.seed";
import { clampWidth, DEFAULT_UI, parseUiPrefs, type UiPrefs } from "./ui-prefs.logic";

const STORAGE_KEY = "loka.state.v1";
const UI_KEY = "loka.ui.v1";

// The star field: seeded, so the sky is the same every launch. Drawn once in a 1280x800 box that scales to the window.
const STARS = (() => {
	let seed = 7919;
	const rand = () => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647;
	};
	return Array.from({ length: 160 }, () => {
		const bright = rand() > 0.92;
		return {
			x: (rand() * 1280).toFixed(1),
			y: (rand() * 800).toFixed(1),
			r: (bright ? 1 + rand() * 0.8 : 0.35 + rand() * 0.6).toFixed(2),
			fill: rand() > 0.8 ? "hsl(200 90% 88%)" : "#fff",
			opacity: (0.25 + rand() * 0.65).toFixed(2),
		};
	});
})();

function loadState(): BrowserState {
	const saved = localStorage.getItem(STORAGE_KEY);
	return (saved && importState(saved)) || seedState();
}

export type Update = (change: (state: BrowserState) => BrowserState) => void;

type Editing = { mode: "create"; look: SpaceLook } | { mode: "edit"; spaceId: string; look: SpaceLook };

/** The window: owns the state and the window prefs, saves them, lays out the sidebar, and handles commands. */
export class LokaApp extends LitElement {
	static override properties = {
		state: { state: true },
		ui: { state: true },
		commandOpen: { state: true },
		editing: { state: true },
		tourOpen: { state: true },
		previewHue: { state: true },
		peek: { state: true },
		media: { state: true },
	};

	state: BrowserState = loadState();
	ui: UiPrefs = parseUiPrefs(localStorage.getItem(UI_KEY));
	commandOpen = false;
	editing: Editing | null = null;
	/**
	 * The tour shows on first launch, and again from the command bar or the `...` menu. `?skip-tour` leaves it closed
	 * for tools that load the prototype in a fresh browser (Critly), so they see the window instead.
	 */
	tourOpen = !this.ui.onboarded && !new URLSearchParams(location.search).has("skip-tour");
	/** While the space editor or the tour is choosing a color, the sky shows it before it's saved. */
	previewHue: number | null = null;
	/** The hidden sidebar is sliding in over the page. */
	peek = false;
	/**
	 * What's playing. The real browser reads this from Chromium's media sessions; the prototype starts with the
	 * Lo-fi tab in Home playing, so the card shows in the other spaces.
	 */
	media: Media | null = this.state.tabs["t-music"]
		? { tabId: "t-music", artist: "Lofi Girl", playing: true, muted: false }
		: null;
	private archiveTimer = 0;

	apply: Update = (change) => {
		this.state = change(this.state);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
	};

	setUi = (change: Partial<UiPrefs>) => {
		this.ui = { ...this.ui, ...change, sidebarWidth: clampWidth(change.sidebarWidth ?? this.ui.sidebarWidth) };
		localStorage.setItem(UI_KEY, JSON.stringify(this.ui));
		if ("archiveAfterHours" in change) this.archiveNow();
	};

	private run(action: ActionId) {
		const space = activeSpace(this.state);
		if (action === "new-space") {
			const hue = SPACE_HUES[this.state.spaces.length % SPACE_HUES.length] ?? 200;
			this.editing = { mode: "create", look: { name: `Space ${this.state.spaces.length + 1}`, hue, planet: "banded" } };
		} else if (action === "edit-space") {
			this.editSpace(space.id);
		} else if (action === "new-folder") {
			this.apply((s) => createFolder(s, space.id, null, "New folder")[0]);
		} else if (action === "toggle-sidebar") {
			this.setUi({ sidebarHidden: !this.ui.sidebarHidden });
			this.peek = false;
		} else if (action === "settings") {
			this.apply((s) => focusOrOpen(s, "loka://settings", "Settings"));
		} else if (action === "downloads") {
			this.showPanel("downloads");
		} else if (action === "search-sidebar") {
			this.showPanel("search");
		} else if (action === "archive") {
			this.showPanel("archive");
		} else if (action === "onboarding") {
			this.tourOpen = true;
		}
	}

	/** Opens a sidebar panel, sliding a hidden sidebar in first so the panel can be seen. */
	private showPanel(panel: Panel) {
		if (this.ui.sidebarHidden) this.peek = true;
		this.renderRoot.querySelector<LokaSidebar>("loka-sidebar")?.openPanel(panel);
	}

	private onMedia(action: MediaAction) {
		const media = this.media;
		if (!media) return;
		if (action === "go") this.apply((s) => revealTab(s, media.tabId));
		else if (action === "toggle") this.media = { ...media, playing: !media.playing };
		else if (action === "mute") this.media = { ...media, muted: !media.muted };
		else if (action === "stop") this.media = null;
		// previous and next go to the page's own media session in the real browser; the sample has one track.
	}

	/** Runs the opt-in archive now and every minute after, using the setting in Settings > Tabs. */
	private archiveNow = () => {
		const hours = this.ui.archiveAfterHours;
		if (!hours) return;
		const next = archiveStale(this.state, Date.now(), hours * 60 * 60 * 1000);
		if (next !== this.state) this.apply(() => next);
	};

	private editSpace(spaceId: string) {
		const s = this.state.spaces.find((x) => x.id === spaceId);
		if (s) this.editing = { mode: "edit", spaceId, look: { name: s.name, hue: s.hue, planet: s.planet } };
	}

	private saveSpace(look: SpaceLook) {
		const editing = this.editing;
		if (!editing) return;
		if (editing.mode === "create") this.apply((s) => createSpace(s, look)[0]);
		else this.apply((s) => updateSpace(s, editing.spaceId, look));
		this.editing = null;
		this.previewHue = null;
	}

	/**
	 * The tour's spaces replace the first ones in order; extra ones are added; spaces it didn't list are kept.
	 * Imported bookmarks go into the first space as closed folders, and Arc's spaces become new spaces.
	 */
	private finishTour({ worlds, bookmarks, arc }: TourResult) {
		const firstId = this.state.spaces[0]?.id;
		this.apply((start) =>
			worlds.reduce((s, look, i) => {
				const existing = s.spaces[i];
				return existing ? updateSpace(s, existing.id, look) : createSpace(s, look)[0];
			}, start),
		);
		if (firstId) {
			this.apply((s) => switchSpace(s, firstId));
			for (const b of bookmarks) this.apply((s) => addImportedFolder(s, firstId, b.name, b.nodes));
		}
		if (arc) this.apply((s) => addArcSpaces(s, arc, SPACE_HUES));
		this.closeTour();
	}

	private closeTour() {
		this.tourOpen = false;
		this.previewHue = null;
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
		if (e.key === "k" || e.key === "l") {
			e.preventDefault();
			this.commandOpen = true;
			return;
		}
		if (e.key === "s") {
			e.preventDefault();
			this.run("toggle-sidebar");
			return;
		}
		if (e.key === "e") {
			// Ctrl+W can't be caught by a web page, so the prototype closes tabs with Ctrl+E.
			e.preventDefault();
			const tab = activeTab(this.state);
			if (tab) this.apply((s) => closeTab(s, tab.id));
			return;
		}
		const n = Number(e.key);
		if (Number.isInteger(n) && n >= 1 && n <= 9) {
			const target = this.state.spaces[n - 1];
			if (!target) return;
			e.preventDefault();
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

	override connectedCallback() {
		super.connectedCallback();
		// Save what was loaded, so a first visit stores the seed data and an invalid save gets replaced.
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
		window.addEventListener("keydown", this.onKey);
		this.archiveNow();
		this.archiveTimer = window.setInterval(this.archiveNow, 60_000);
	}

	override disconnectedCallback() {
		window.removeEventListener("keydown", this.onKey);
		window.clearInterval(this.archiveTimer);
		super.disconnectedCallback();
	}

	override render() {
		const space = activeSpace(this.state);
		const { sidebarSide: side, sidebarHidden: hidden, sidebarWidth: width } = this.ui;
		const layout = `${side} ${hidden ? "hidden" : ""} ${hidden && this.peek ? "peek" : ""} ${this.tourOpen ? "touring" : ""}`;
		return html`
			<div
				class="window ${layout}"
				style="--hue: ${this.previewHue ?? space.hue}; --sidebar: ${width}px"
				@loka-action=${(e: CustomEvent<ActionId>) => this.run(e.detail)}
				@loka-edit-space=${(e: CustomEvent<string>) => this.editSpace(e.detail)}
				@loka-preview=${(e: CustomEvent<number>) => {
					this.previewHue = e.detail;
				}}
			>
				<div class="sky" aria-hidden="true">
					<svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice">
						${STARS.map((s) => svg`<circle cx=${s.x} cy=${s.y} r=${s.r} fill=${s.fill} opacity=${s.opacity} />`)}
					</svg>
				</div>
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
					.apply=${this.apply}
					.media=${this.media}
					@loka-media=${(e: CustomEvent<MediaAction>) => this.onMedia(e.detail)}
					@pointerleave=${() => (this.peek = false)}
					@loka-command=${() => {
						this.commandOpen = true;
					}}
					@loka-reset=${() => this.apply(() => seedState())}
				></loka-sidebar>
				<loka-page
					.tab=${activeTab(this.state)}
					.spaceName=${space.name}
					.state=${this.state}
					.apply=${this.apply}
					.ui=${this.ui}
					.setUi=${this.setUi}
				></loka-page>
				${
					this.commandOpen
						? html`<loka-command-bar
								.state=${this.state}
								.apply=${this.apply}
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
				${
					this.tourOpen
						? html`<loka-onboarding
								.spaces=${this.state.spaces.slice(0, 3).map((s) => ({ name: s.name, hue: s.hue, planet: s.planet }))}
								@loka-finish=${(e: CustomEvent<TourResult>) => this.finishTour(e.detail)}
								@loka-skip=${() => this.closeTour()}
							></loka-onboarding>`
						: null
				}
			</div>
		`;
	}

	static override styles = css`
		:host {
			display: block;
			height: 100%;
			color: #e9e9ef;
		}
		.window {
			position: relative;
			display: grid;
			grid-template-columns: var(--sidebar) 1fr;
			grid-template-areas: "side page";
			height: 100%;
			overflow: hidden;
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
			background: hsl(var(--hue) 30% 8% / 0.96);
			box-shadow:
				0 0 0 1px hsl(var(--hue) 40% 80% / 0.14),
				0 20px 60px #000a;
			translate: calc(-100% - 16px) 0;
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
			background: linear-gradient(transparent, hsl(var(--hue) 80% 72% / 0.5), transparent) no-repeat center / 2px 100%;
		}
		/* During the tour the window is only the sky; the sidebar and page wait underneath. */
		.window.touring > :is(loka-sidebar, loka-page, .resize, .edge-zone) {
			visibility: hidden;
		}
		/* Night sky tinted by the active space: a glow top-left, a faint band of light, a deep ground, stars. */
		.sky {
			position: absolute;
			inset: 0;
			z-index: -1;
			pointer-events: none;
			background:
				radial-gradient(60% 50% at 6% 0%, hsl(var(--hue) 58% 34% / 0.45), transparent 70%),
				radial-gradient(38% 34% at 26% 58%, hsl(calc(var(--hue) + 40) 45% 32% / 0.18), transparent 70%),
				radial-gradient(55% 55% at 100% 100%, hsl(calc(var(--hue) - 35) 42% 26% / 0.28), transparent 70%),
				linear-gradient(165deg, hsl(var(--hue) 32% 8%), hsl(var(--hue) 38% 4%));
		}
		.sky::after {
			content: "";
			position: absolute;
			inset: 0;
			background: linear-gradient(
				118deg,
				transparent 38%,
				hsl(var(--hue) 70% 85% / 0.06) 47%,
				hsl(calc(var(--hue) + 30) 70% 85% / 0.08) 52%,
				transparent 62%
			);
		}
		.sky svg {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
		}
		@media (prefers-reduced-motion: no-preference) {
			.window {
				transition: --hue 420ms cubic-bezier(0.2, 0, 0, 1);
			}
			.window.hidden loka-sidebar {
				transition: translate 220ms cubic-bezier(0.2, 0, 0, 1);
			}
		}
	`;
}

customElements.define("loka-app", LokaApp);
