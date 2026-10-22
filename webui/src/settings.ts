// Loka's Settings page: chrome://loka-settings, served from settings.html by the same handler as the sidebar (it
// finds this tab's window), so it uses bridge.ts as-is. The spaces and prefs are the profile's, shared with every
// window's sidebar, which redraws when they change here.

import { css, html, LitElement, nothing } from "lit";
import { skyLayer, skyStyles } from "../../prototype/src/app/sky";
import { themeTokens } from "../../prototype/src/app/theme";
import { resolveScheme } from "../../prototype/src/app/theme.logic";
import { DEFAULT_UI, type UiPrefs } from "../../prototype/src/app/ui-prefs.logic";
import "../../prototype/src/features/settings/loka-settings";
import type { Act } from "../../prototype/src/app/loka-app";
import { SPACE_HUES } from "../../prototype/src/features/sidebar/planet";
import {
	activeSpace,
	type BrowserState,
	newId,
	type SpaceLook,
} from "../../prototype/src/features/sidebar/sidebar.logic";
import { playCue, setSoundPrefs } from "../../prototype/src/features/sound/sound";
import "../../prototype/src/features/spaces/loka-space-editor";
import type { LookPreview } from "../../prototype/src/features/spaces/loka-space-editor";
import { browser } from "./bridge";
import { act, readState, readUi, watch, writeUi } from "./store";

type Editing = { mode: "create"; look: SpaceLook } | { mode: "edit"; spaceId: string; look: SpaceLook };

const darkSystem = matchMedia("(prefers-color-scheme: dark)");

export class LokaSettingsPage extends LitElement {
	static override properties = {
		state: { state: true },
		ui: { state: true },
		pinned: { state: true },
		editing: { state: true },
		preview: { state: true },
		systemDark: { state: true },
	};

	state: BrowserState | null = null;
	ui: UiPrefs = DEFAULT_UI;
	pinned = true;
	editing: Editing | null = null;
	preview: LookPreview | null = null;
	systemDark = darkSystem.matches;

	private apply: Act = (intent) => {
		const next = act(intent);
		if (next) this.state = next;
	};

	private setUi = (change: Partial<UiPrefs>) => {
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
		void browser.sidebarPinned().then((pinned) => {
			this.pinned = pinned;
		});
		browser.onSidebarPinnedChanged((pinned) => {
			this.pinned = pinned;
		});
		darkSystem.addEventListener("change", (e) => {
			this.systemDark = e.matches;
		});
	}

	private run(action: string) {
		const state = this.state;
		if (!state || action !== "new-space") return;
		const hue = SPACE_HUES[state.spaces.length % SPACE_HUES.length] ?? 200;
		this.editing = {
			mode: "create",
			look: { name: `Space ${state.spaces.length + 1}`, hue, planet: "banded", scheme: "system" },
		};
	}

	private edit(spaceId: string) {
		const s = this.state?.spaces.find((x) => x.id === spaceId);
		if (s) {
			this.editing = { mode: "edit", spaceId, look: { name: s.name, hue: s.hue, planet: s.planet, scheme: s.scheme } };
		}
	}

	private save(look: SpaceLook) {
		const editing = this.editing;
		if (!editing) return;
		this.editing = null;
		this.preview = null;
		if (editing.mode === "create") {
			playCue("space-new");
			// A space made here joins the list; the sidebars keep showing the space they're in.
			const showing = this.state?.activeSpaceId;
			this.apply({ op: "createSpace", look, id: newId() });
			if (showing) this.apply({ op: "switchSpace", spaceId: showing });
		} else this.apply({ op: "updateSpace", spaceId: editing.spaceId, look });
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
		if (!state) return nothing;
		const space = activeSpace(state);
		const scheme = resolveScheme(this.preview?.scheme ?? space.scheme, this.systemDark);
		const hue = this.preview?.hue ?? space.hue;
		setSoundPrefs({ on: this.ui.sound, volume: this.ui.soundVolume });
		document.documentElement.style.colorScheme = scheme;
		return html`<div
			class="page theme-${scheme}"
			style="--hue: ${hue}"
			@loka-action=${(e: CustomEvent<string>) => this.run(e.detail)}
			@loka-edit-space=${(e: CustomEvent<string>) => this.edit(e.detail)}
			@loka-preview=${(e: CustomEvent<LookPreview>) => {
				this.preview = e.detail;
			}}
		>
			${skyLayer(hue, scheme, "still")}
			<loka-settings
				native
				.state=${state}
				.apply=${this.apply}
				.ui=${this.ui}
				.setUi=${this.setUi}
				.pinned=${this.pinned}
				.browser=${browser}
			></loka-settings>
			${
				this.editing
					? html`<loka-space-editor
							.look=${this.editing.look}
							.mode=${this.editing.mode}
							.deletable=${state.spaces.length > 1}
							@loka-save=${(e: CustomEvent<SpaceLook>) => this.save(e.detail)}
							@loka-delete=${() => this.deleteEditedSpace()}
							@loka-close=${() => {
								this.editing = null;
								this.preview = null;
							}}
						></loka-space-editor>`
					: nothing
			}
		</div>`;
	}

	static override styles = [
		themeTokens,
		skyStyles,
		css`
			:host {
				display: block;
				height: 100vh;
			}
			.page {
				position: relative;
				isolation: isolate;
				height: 100%;
				overflow: clip;
			}
			loka-settings {
				height: 100%;
			}
		`,
	];
}

customElements.define("loka-settings-page", LokaSettingsPage);
