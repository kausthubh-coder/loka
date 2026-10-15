// Loka's full-tab pages in the browser: the new tab page (the command bar on the night sky), Settings, and the tour.
// Each is the prototype's component with the browser behind it.

import { css, html, LitElement, type TemplateResult } from "lit";
import type { Update } from "../../prototype/src/app/loka-app";
import { skyLayer, skyStyles } from "../../prototype/src/app/sky";
import { DEFAULT_UI, type UiPrefs } from "../../prototype/src/app/ui-prefs.logic";
import type { ActionId } from "../../prototype/src/features/command-bar/command-bar.logic";
import "../../prototype/src/features/command-bar/loka-command-bar";
import "../../prototype/src/features/onboarding/loka-onboarding";
import { applyTour, type TourResult } from "../../prototype/src/features/onboarding/onboarding.logic";
import "../../prototype/src/features/settings/loka-settings";
import { setFaviconSource } from "../../prototype/src/features/sidebar/favicon";
import { SPACE_HUES } from "../../prototype/src/features/sidebar/planet";
import {
	activeSpace,
	type BrowserState,
	createSpace,
	type SpaceLook,
	updateSpace,
} from "../../prototype/src/features/sidebar/sidebar.logic";
import { playCue, setSoundPrefs } from "../../prototype/src/features/sound/sound";
import "../../prototype/src/features/spaces/loka-space-editor";
import { browserBookmarks, openBrowserSettings, openUrl } from "./browser";
import { faviconUrl, readState, readUi, watch, writeState, writeUi } from "./store";
import { browserSync } from "./sync";

setFaviconSource(faviconUrl);

/** Opens the Loka sidebar in this window. Needs a click to have just happened, which every caller has. */
async function openSidebar() {
	const win = await chrome.windows.getCurrent();
	if (win.id !== undefined) await chrome.sidePanel.open({ windowId: win.id });
}

/** Shared by the pages: the spaces and prefs from storage, kept current, and a way to change them. */
abstract class LokaPage extends LitElement {
	static override properties = {
		state: { state: true },
		ui: { state: true },
		previewHue: { state: true },
		editing: { state: true },
	};

	state: BrowserState | null = null;
	ui: UiPrefs = DEFAULT_UI;
	previewHue: number | null = null;
	editing: { mode: "create" | "edit"; spaceId?: string; look: SpaceLook } | null = null;

	apply: Update = (change) => {
		if (!this.state) return;
		this.state = change(this.state);
		void writeState(this.state);
	};

	setUi = (change: Partial<UiPrefs>) => {
		this.ui = { ...this.ui, ...change };
		void writeUi(this.ui);
	};

	override connectedCallback() {
		super.connectedCallback();
		void Promise.all([readState(), readUi()]).then(([state, ui]) => {
			this.state = state;
			this.ui = ui;
		});
		watch(({ state, ui }) => {
			if (state) this.state = state;
			if (ui) this.ui = ui;
		});
	}

	protected editSpace(spaceId: string | null) {
		const state = this.state;
		if (!state) return;
		const space = spaceId ? state.spaces.find((s) => s.id === spaceId) : null;
		if (space) {
			this.editing = {
				mode: "edit",
				spaceId: space.id,
				look: { name: space.name, hue: space.hue, planet: space.planet },
			};
		} else {
			const hue = SPACE_HUES[state.spaces.length % SPACE_HUES.length] ?? 200;
			this.editing = { mode: "create", look: { name: `Space ${state.spaces.length + 1}`, hue, planet: "banded" } };
		}
	}

	protected editor(): TemplateResult | null {
		const editing = this.editing;
		if (!editing) return null;
		return html`<loka-space-editor
			.look=${editing.look}
			.mode=${editing.mode}
			@loka-save=${(e: CustomEvent<SpaceLook>) => {
				const look = e.detail;
				const id = editing.spaceId;
				if (!id) playCue("space-new");
				this.apply((s) => (id ? updateSpace(s, id, look) : createSpace(s, look)[0]));
				this.editing = null;
				this.previewHue = null;
			}}
			@loka-close=${() => {
				this.editing = null;
				this.previewHue = null;
			}}
		></loka-space-editor>`;
	}

	protected hue(): number {
		return this.previewHue ?? (this.state ? activeSpace(this.state).hue : 200);
	}

	protected override willUpdate() {
		setSoundPrefs({ on: this.ui.sound, volume: this.ui.soundVolume });
	}

	protected run(action: ActionId) {
		if (action === "new-space") this.editSpace(null);
		else if (action === "edit-space" && this.state) this.editSpace(activeSpace(this.state).id);
		else if (action === "settings") void chrome.runtime.openOptionsPage();
		else if (action === "onboarding") void chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
		else void openSidebar();
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
		`,
	];
}

/** The new tab page: just the command bar on the sky. What's chosen opens in this same tab. */
export class LokaNewTab extends LokaPage {
	/** A tab chosen from the bar is already open elsewhere: go there and close this empty one. */
	private applyAndClose: Update = (change) => {
		this.apply(change);
		void chrome.tabs.getCurrent().then((tab) => {
			if (tab?.id !== undefined) void chrome.tabs.remove(tab.id);
		});
	};

	override render() {
		if (!this.state) return null;
		return html`<div
			class="window"
			style="--hue: ${this.hue()}"
			@loka-action=${(e: CustomEvent<ActionId>) => this.run(e.detail)}
			@loka-preview=${(e: CustomEvent<number>) => {
				this.previewHue = e.detail;
			}}
		>
			${skyLayer()}
			<loka-command-bar .state=${this.state} .apply=${this.applyAndClose} .go=${openUrl("this-tab")}></loka-command-bar>
			${this.editor()}
		</div>`;
	}
}

/** loka://settings in the browser: the prototype's Settings, with the browser's own settings where it owns them. */
export class LokaSettingsPage extends LokaPage {
	override render() {
		if (!this.state) return null;
		const hooks = {
			openBrowserSettings,
			bookmarks: browserBookmarks,
			sync: browserSync,
			version: `Loka ${chrome.runtime.getManifest().version}, on ${navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? "Chromium"}`,
		};
		return html`<div
			class="window"
			style="--hue: ${this.hue()}"
			@loka-action=${(e: CustomEvent<ActionId>) => this.run(e.detail)}
			@loka-edit-space=${(e: CustomEvent<string>) => this.editSpace(e.detail)}
			@loka-preview=${(e: CustomEvent<number>) => {
				this.previewHue = e.detail;
			}}
		>
			${skyLayer()}
			<loka-settings .state=${this.state} .apply=${this.apply} .ui=${this.ui} .setUi=${this.setUi} .browser=${hooks}></loka-settings>
			${this.editor()}
		</div>`;
	}
}

/** The first-run tour. Finishing applies it, opens the sidebar and closes the tour's tab. */
export class LokaTourPage extends LokaPage {
	private async finish(result: TourResult | null) {
		if (result) this.apply((s) => applyTour(s, result));
		this.setUi({ onboarded: true });
		await openSidebar();
		const tab = await chrome.tabs.getCurrent();
		if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
	}

	override render() {
		if (!this.state) return null;
		return html`<div
			class="window"
			style="--hue: ${this.hue()}"
			@loka-preview=${(e: CustomEvent<number>) => {
				this.previewHue = e.detail;
			}}
		>
			${skyLayer()}
			<loka-onboarding
				.spaces=${this.state.spaces.slice(0, 3).map((s) => ({ name: s.name, hue: s.hue, planet: s.planet }))}
				@loka-finish=${(e: CustomEvent<TourResult>) => this.finish(e.detail)}
				@loka-skip=${() => this.finish(null)}
			></loka-onboarding>
		</div>`;
	}
}

customElements.define("loka-newtab", LokaNewTab);
customElements.define("loka-settings-page", LokaSettingsPage);
customElements.define("loka-tour-page", LokaTourPage);
