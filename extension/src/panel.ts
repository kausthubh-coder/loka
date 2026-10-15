// The Loka sidebar in the browser's side panel: the prototype's sidebar, with the browser behind it. Clicks change
// the spaces (saved to storage); the background worker makes the real tabs follow.

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
import { browserDownloads, browserExtensions, openUrl } from "./browser";
import { faviconUrl, readSession, readState, readUi, watch, writeState } from "./store";

setFaviconSource(faviconUrl);
setDownloadSource(browserDownloads);
setExtensionSource(browserExtensions);

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
		void writeState(this.state);
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
		return (await readSession()).live[tabId];
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
			window.close();
		} else if (action === "settings") {
			void chrome.runtime.openOptionsPage();
		} else if (action === "onboarding") {
			void chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
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
		else if (action === "stop") await chrome.storage.session.set({ "loka.media": null });
		if (browserId === undefined) return;
		if (action === "mute") await chrome.tabs.update(browserId, { muted: !media.muted });
		if (action === "toggle") {
			// Pages don't expose their players to other pages, so this plays or pauses the page's own media elements.
			const [result] = await chrome.scripting.executeScript({
				target: { tabId: browserId },
				func: () => {
					const players = [...document.querySelectorAll<HTMLMediaElement>("video, audio")];
					const playing = players.some((p) => !p.paused);
					for (const p of players) playing ? p.pause() : void p.play();
					return !playing;
				},
			});
			await chrome.storage.session.set({ "loka.media": { ...media, playing: Boolean(result?.result) } });
		}
	}

	private async onNav(action: "back" | "forward" | "reload") {
		const state = this.state;
		const shown = state && activeSpace(state).activeTabId;
		const browserId = shown ? await this.browserTab(shown) : undefined;
		if (browserId === undefined) return;
		if (action === "back") await chrome.tabs.goBack(browserId);
		else if (action === "forward") await chrome.tabs.goForward(browserId);
		else await chrome.tabs.reload(browserId);
	}

	private async unload(tabId: string) {
		const browserId = await this.browserTab(tabId);
		if (browserId !== undefined) await chrome.tabs.remove(browserId);
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
				<loka-sidebar .state=${state} .apply=${this.apply} .media=${this.media} .demo=${false}></loka-sidebar>
				${
					this.commandOpen
						? html`<loka-command-bar
								.state=${state}
								.apply=${this.apply}
								.go=${openUrl("new-tab")}
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
			}
			loka-sidebar {
				height: 100%;
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
