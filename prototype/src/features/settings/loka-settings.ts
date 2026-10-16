import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import type { Browser, NativeExtension } from "../../../../webui/src/bridge";
import type { Update } from "../../app/loka-app";
import { SIDEBAR_MAX, SIDEBAR_MIN, type UiPrefs } from "../../app/ui-prefs.logic";
import { ARCHIVE_CHOICES } from "../archive/archive.logic";
import { withPinned } from "../extensions/extensions.logic";
import "../extensions/loka-extensions";
import {
	addArcSpaces,
	addImportedFolder,
	countImported,
	parseArcSidebar,
	parseChromeBookmarks,
} from "../import/import.logic";
import { IMPORT_SOURCES, type ImportSource, pickFile } from "../import/pick-file";
import { planet, SPACE_HUES } from "../sidebar/planet";
import {
	type BrowserState,
	countTabs,
	SPACE_SCHEMES,
	type Space,
	type SpaceScheme,
	updateSpace,
} from "../sidebar/sidebar.logic";
import { playCue, setSoundPrefs } from "../sound/sound";
import "../sync/loka-sync-settings";
import { keys as shortcutKeys } from "../../app/platform";
import type { SyncHooks } from "../sync/loka-sync-settings";
import { takeSpaces } from "../sync/sync.logic";

export type SetUi = (change: Partial<UiPrefs>) => void;

/** The browser's own settings pages Loka points to for what the browser keeps. */
const BROWSER_PAGES = {
	privacy: "chrome://settings/privacy",
	search: "chrome://settings/search",
	passwords: "chrome://password-manager/settings",
	extensions: "chrome://extensions/",
	about: "chrome://settings/help",
};

const SCHEME_NAMES: Record<SpaceScheme, string> = { light: "Light", dark: "Dark", system: "System" };

/** Shortcuts in the real browser, and the prototype's stand-ins for the ones a web page can't catch. */
function shortcuts(native: boolean): [string, string][] {
	return [
		[native ? "Ctrl T" : "Ctrl T or Ctrl K", "Command bar for a new tab: search, open, find a tab, run a command"],
		["Ctrl L", "Command bar for this tab's address"],
		["Ctrl 1 to 9", "Go to a space"],
		["Ctrl H", "History"],
		...(native ? [] : ([["Ctrl S", "Hide or show the sidebar"]] as [string, string][])),
		[native ? "Ctrl W" : "Ctrl E", "Close the tab"],
		["Ctrl Alt ↓ / ↑", "Next or previous tab in sidebar order"],
		["Ctrl Shift F", "Search the sidebar"],
		["↑ ↓ ← →", "Move through the sidebar; right opens a folder, left closes it"],
		["Swipe sideways", "Next or previous space"],
	];
}

/** The browser this page runs in, from the browser itself rather than a version written down here. */
async function engineVersion(): Promise<string | null> {
	const data = (
		navigator as Navigator & {
			userAgentData?: {
				getHighEntropyValues(hints: string[]): Promise<{ fullVersionList?: { brand: string; version: string }[] }>;
			};
		}
	).userAgentData;
	const list = (await data?.getHighEntropyValues(["fullVersionList"]))?.fullVersionList;
	const chromium =
		list?.find((b) => b.brand === "Chromium")?.version ?? navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1];
	return chromium ? `Chromium ${chromium}` : null;
}

/**
 * Loka's Settings. In the real browser it's its own page (chrome://loka-settings, `native`); in the prototype it's
 * the stand-in page loka://settings. Both talk to the browser through `browser` (the real bridge, or the fake):
 * pinning the sidebar, the installed extensions, the browser's own settings pages. What only the prototype's window
 * has (sidebar side and width, mock privacy and search) shows only there.
 */
export class LokaSettings extends LitElement {
	static override properties = {
		state: { attribute: false },
		apply: { attribute: false },
		ui: { attribute: false },
		imported: { state: true },
		setUi: { attribute: false },
		pinned: { attribute: false },
		privacy: { state: true },
		engine: { state: true },
		browser: { attribute: false },
		native: { type: Boolean },
		sync: { attribute: false },
		extensions: { state: true },
		version: { state: true },
	};

	declare state: BrowserState;
	declare apply: Update;
	declare ui: UiPrefs;
	/** The last import's result, shown under the buttons. */
	imported = "";
	declare setUi: SetUi;
	/** Whether the sidebar is pinned open; the browser keeps that, not the window prefs. */
	declare pinned: boolean;
	privacy = { ads: true, clearOnExit: false };
	engine = "DuckDuckGo";
	declare browser: Browser;
	native = false;
	/** Folder sync, where a host can give it the folder access it needs. */
	sync: SyncHooks | null = null;
	extensions: NativeExtension[] | null = null;
	version: string | null = null;
	private stops: (() => void)[] = [];

	override connectedCallback() {
		super.connectedCallback();
		this.stops = [
			this.browser.onExtensionsChanged((list) => {
				this.extensions = list;
			}),
		];
		void this.browser.extensions().then((list) => {
			this.extensions = list;
		});
		void engineVersion().then((v) => {
			this.version = v;
		});
	}

	override disconnectedCallback() {
		for (const stop of this.stops) stop();
		super.disconnectedCallback();
	}

	private pinExtension = (id: string, pinned: boolean) => {
		playCue(pinned ? "pin" : "unpin");
		this.extensions = withPinned(this.extensions ?? [], id, pinned);
		this.browser.setExtensionPinned(id, pinned);
	};

	private async importFrom(source: ImportSource) {
		const text = await pickFile();
		if (text === null) return;
		const { name, file } = IMPORT_SOURCES[source];
		if (source === "arc") {
			const arc = parseArcSidebar(text);
			if (!arc) {
				this.imported = `That isn't ${name}'s ${file} file.`;
				return;
			}
			this.apply((s) => addArcSpaces(s, arc, SPACE_HUES));
			const tabs = arc.spaces.reduce((n, s) => n + countImported(s.pinned), 0);
			this.imported = `Added ${arc.spaces.length} spaces with ${tabs} pinned tabs, and ${arc.favorites.length} Favorites.`;
			return;
		}
		const nodes = parseChromeBookmarks(text);
		if (!nodes) {
			this.imported = `That isn't ${name}'s ${file} file.`;
			return;
		}
		this.apply((s) => addImportedFolder(s, s.activeSpaceId, `${name} bookmarks`, nodes));
		this.imported = `Added ${countImported(nodes)} bookmarks as a folder in this space.`;
	}

	private action(action: string) {
		this.dispatchEvent(new CustomEvent("loka-action", { detail: action, bubbles: true, composed: true }));
	}

	private editSpace(spaceId: string) {
		this.dispatchEvent(new CustomEvent("loka-edit-space", { detail: spaceId, bubbles: true, composed: true }));
	}

	private setScheme(space: Space, scheme: SpaceScheme) {
		this.apply((s) => updateSpace(s, space.id, { name: space.name, hue: space.hue, planet: space.planet, scheme }));
	}

	private toggle(label: string, on: boolean, change: (on: boolean) => void, disabled = false) {
		return html`<button
			class="switch ${on ? "on" : ""}"
			role="switch"
			aria-checked=${on}
			aria-label=${label}
			?disabled=${disabled}
			@click=${() => change(!on)}
		></button>`;
	}

	/** A row that sends the user to the browser's own settings for something the browser keeps. */
	private pageRow(title: string, detail: string, url: string): TemplateResult {
		return html`<div class="row">
			<div><b>${title}</b><small>${detail}</small></div>
			<button class="button" @click=${() => this.browser.openPage(url)}>Open</button>
		</div>`;
	}

	private appearance(): TemplateResult {
		const ui = this.ui;
		const pin = html`<div class="row">
			<div>
				<b>Keep the sidebar open</b>
				<small>Off, it slides away and comes back when the mouse reaches the window's edge.</small>
			</div>
			${this.toggle("Keep the sidebar open", this.pinned, (on) => this.browser.setSidebarPinned(on))}
		</div>`;
		if (this.native) return pin;
		return html`<div class="row">
				<div><b>Sidebar side</b><small>Where the sidebar sits in the window</small></div>
				<div class="segmented" role="radiogroup" aria-label="Sidebar side">
					${(["left", "right"] as const).map(
						(side) => html`<button
							role="radio"
							aria-checked=${ui.sidebarSide === side}
							class=${ui.sidebarSide === side ? "on" : ""}
							@click=${() => this.setUi({ sidebarSide: side })}
						>
							${side === "left" ? "Left" : "Right"}
						</button>`,
					)}
				</div>
			</div>
			<div class="row">
				<div><b>Sidebar width</b><small>Or drag the sidebar's edge. Double-click the edge to reset.</small></div>
				<label class="range">
					<input
						type="range"
						min=${SIDEBAR_MIN}
						max=${SIDEBAR_MAX}
						.value=${String(ui.sidebarWidth)}
						aria-label="Sidebar width"
						@input=${(e: Event) => this.setUi({ sidebarWidth: Number((e.target as HTMLInputElement).value) })}
					/>
					<span>${ui.sidebarWidth}&nbsp;px</span>
				</label>
			</div>
			${pin}`;
	}

	override render() {
		const ui = this.ui;
		return html`
			<div class="page">
				<h1>Settings</h1>

				<section aria-labelledby="appearance">
					<h2 id="appearance">Sidebar</h2>
					${this.appearance()}
				</section>

				<section aria-labelledby="spaces">
					<h2 id="spaces">Spaces</h2>
					<p class="lead">Each space chooses light or dark for the sidebar, the browser and the pages you visit in it.</p>
					${this.state.spaces.map(
						(s, i) => html`<div class="row space">
							${planet(s.planet, s.hue, 30)}
							<div><b>${s.name}</b><small>${countTabs(s)} ${countTabs(s) === 1 ? "tab" : "tabs"}. ${shortcutKeys(`Ctrl+${i + 1}`)}</small></div>
							<div class="segmented small" role="radiogroup" aria-label="${s.name}: light or dark">
								${SPACE_SCHEMES.map(
									(scheme) => html`<button
										role="radio"
										aria-checked=${s.scheme === scheme}
										class=${s.scheme === scheme ? "on" : ""}
										@click=${() => this.setScheme(s, scheme)}
									>
										${SCHEME_NAMES[scheme]}
									</button>`,
								)}
							</div>
							<button class="button" @click=${() => this.editSpace(s.id)}>Edit</button>
						</div>`,
					)}
					<button class="button add" @click=${() => this.action("new-space")}>New space</button>
				</section>

				<section aria-labelledby="sound">
					<h2 id="sound">Sound</h2>
					<div class="row">
						<div><b>Sound effects</b><small>Soft cues when you switch spaces, open and close tabs and folders, and pin</small></div>
						${this.toggle("Sound effects", ui.sound, (on) => {
							this.setUi({ sound: on });
							if (on) {
								setSoundPrefs({ on, volume: ui.soundVolume });
								playCue("pin");
							}
						})}
					</div>
					<div class="row">
						<div><b>Volume</b><small>Plays a cue when you let go</small></div>
						<label class="range">
							<input
								type="range"
								min="0"
								max="100"
								.value=${String(Math.round(ui.soundVolume * 100))}
								aria-label="Sound volume"
								?disabled=${!ui.sound}
								@input=${(e: Event) => this.setUi({ soundVolume: Number((e.target as HTMLInputElement).value) / 100 })}
								@change=${(e: Event) => {
									setSoundPrefs({ on: ui.sound, volume: Number((e.target as HTMLInputElement).value) / 100 });
									playCue("tab-open");
								}}
							/>
							<span>${Math.round(ui.soundVolume * 100)}%</span>
						</label>
					</div>
				</section>

				<section aria-labelledby="tabs">
					<h2 id="tabs">Tabs</h2>
					<div class="row">
						<div>
							<b>Archive open tabs</b>
							<small>Open tabs you haven't looked at move to Archived tabs. Pinned tabs and Essentials never do.</small>
						</div>
						<select
							aria-label="Archive open tabs"
							@change=${(e: Event) => {
								const value = (e.target as HTMLSelectElement).value;
								this.setUi({ archiveAfterHours: value ? Number(value) : null });
							}}
						>
							${ARCHIVE_CHOICES.map(
								(c) =>
									html`<option value=${c.hours ?? ""} ?selected=${c.hours === ui.archiveAfterHours}>${c.label}</option>`,
							)}
						</select>
					</div>
					<div class="row">
						<div>
							<b>Archived tabs</b>
							<small>${this.state.archive.length} archived. Find them in the sidebar's ... menu or with the command bar.</small>
						</div>
						${this.native ? nothing : html`<button class="button" @click=${() => this.action("archive")}>Show</button>`}
					</div>
				</section>

				<section aria-labelledby="extensions">
					<h2 id="extensions">Extensions</h2>
					<p class="lead">Pinned ones sit in the sidebar's address field, one click away.</p>
					<div class="card">
						<loka-extensions .extensions=${this.extensions} .browser=${this.browser} .pin=${this.pinExtension}></loka-extensions>
					</div>
				</section>

				<section aria-labelledby="sync">
					<h2 id="sync">Sync</h2>
					${
						this.sync
							? html`<loka-sync-settings
									.hooks=${this.sync}
									@loka-take-spaces=${(e: CustomEvent<BrowserState>) => this.apply((s) => takeSpaces(s, e.detail))}
								></loka-sync-settings>`
							: html`
					<div class="row">
						<div>
							<b>Sync spaces between your computers</b>
							<small>
								Spaces, folders and pinned tabs, end-to-end encrypted with a passphrase, kept in a folder you choose
								(OneDrive, Dropbox, a USB drive). No Loka account and no Loka server.
							</small>
						</div>
						<span class="tag">First release</span>
					</div>`
					}
				</section>

				<section aria-labelledby="import">
					<h2 id="import">Import</h2>
					${(Object.keys(IMPORT_SOURCES) as ImportSource[]).map((source) => {
						const { name, file, where } = IMPORT_SOURCES[source];
						return html`<div class="row">
							<div>
								<b>From ${name}</b>
								<small class="path">${file} in ${where}</small>
							</div>
							<button class="button" @click=${() => this.importFrom(source)}>Choose file</button>
						</div>`;
					})}
					${
						this.native
							? this.pageRow(
									"Passwords",
									"Export them from Chrome or Edge as a CSV file, then import them in the browser's password settings.",
									BROWSER_PAGES.passwords,
								)
							: html`<div class="row">
									<div>
										<b>Passwords</b>
										<small>Export them from Chrome or Edge as a CSV file, then import them in the browser's password settings.</small>
									</div>
									<span class="tag">In the browser</span>
								</div>`
					}
					${this.imported ? html`<p class="note" role="status">${this.imported}</p>` : nothing}
				</section>

				${
					this.native
						? html`<section aria-labelledby="privacy">
								<h2 id="privacy">Privacy and search</h2>
								${this.pageRow("Privacy and security", "Cookies, site permissions, Helium's privacy settings", BROWSER_PAGES.privacy)}
								${this.pageRow("Search engine", "Used by the address field and the command bar", BROWSER_PAGES.search)}
								${this.pageRow("All extensions", "Install, turn off or remove them", BROWSER_PAGES.extensions)}
							</section>`
						: html`
				<section aria-labelledby="privacy">
					<h2 id="privacy">Privacy</h2>
					<div class="row">
						<div><b>Block ads and trackers</b><small>uBlock Origin, built in from Helium</small></div>
						${this.toggle("Block ads and trackers", this.privacy.ads, (on) => {
							this.privacy = { ...this.privacy, ads: on };
						})}
					</div>
					<div class="row">
						<div><b>No Google services</b><small>Removed at build time, so there is nothing to turn on</small></div>
						${this.toggle("No Google services", true, () => {}, true)}
					</div>
					<div class="row">
						<div><b>Clear cookies when Loka closes</b><small>Sites you pin keep theirs</small></div>
						${this.toggle("Clear cookies when Loka closes", this.privacy.clearOnExit, (on) => {
							this.privacy = { ...this.privacy, clearOnExit: on };
						})}
					</div>
				</section>

				<section aria-labelledby="search">
					<h2 id="search">Search</h2>
					<div class="row">
						<div><b>Search engine</b><small>Used by the command bar</small></div>
						<select
							aria-label="Search engine"
							@change=${(e: Event) => {
								this.engine = (e.target as HTMLSelectElement).value;
							}}
						>
							${["DuckDuckGo", "Brave Search", "Startpage", "Kagi"].map(
								(name) => html`<option ?selected=${name === this.engine}>${name}</option>`,
							)}
						</select>
					</div>
				</section>`
				}

				<section aria-labelledby="keys">
					<h2 id="keys">Keyboard shortcuts</h2>
					${shortcuts(this.native).map(([keys, what]) => html`<div class="row keys"><kbd>${shortcutKeys(keys)}</kbd><span>${what}</span></div>`)}
				</section>

				<section aria-labelledby="about">
					<h2 id="about">About</h2>
					<dl>
						<dt>Loka</dt>
						<dd>${this.native ? "Built on Helium" : "Prototype, not a release"}</dd>
						${this.version ? html`<dt>Engine</dt><dd>${this.version}</dd>` : nothing}
						<dt>License</dt>
						<dd>GPL-3.0</dd>
					</dl>
					${this.native ? html`<button class="button add" @click=${() => this.browser.openPage(BROWSER_PAGES.about)}>About this browser</button>` : nothing}
				</section>
			</div>
		`;
	}

	static override styles = css`
		:host {
			display: block;
			height: 100%;
			overflow-y: auto;
			color: var(--loka-ink);
			font: 14px/1.45 system-ui, "Segoe UI", sans-serif;
		}
		.page {
			max-width: 680px;
			margin: 0 auto;
			padding: 48px 32px 80px;
		}
		h1 {
			margin: 0 0 24px;
			font-size: 28px;
			font-weight: 650;
			letter-spacing: -0.015em;
		}
		h2 {
			margin: 36px 0 6px;
			font-size: 15px;
			font-weight: 600;
			color: var(--loka-accent-ink);
		}
		.lead {
			margin: 0 0 6px;
			color: var(--loka-ink-2);
			font-size: 13px;
		}
		.row {
			display: flex;
			align-items: center;
			gap: 14px;
			min-height: 56px;
			padding: 8px 0;
			border-bottom: 1px solid var(--loka-line);
		}
		/* The label column; the controls on the right (like the Left / Right switch) keep their own layout. */
		.row > div:not(.segmented) {
			flex: 1;
			display: grid;
			min-width: 0;
		}
		.row b {
			font-weight: 550;
		}
		small {
			color: var(--loka-ink-2);
			font-size: 13px;
		}
		button,
		select {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
			cursor: default;
		}
		.segmented {
			display: flex;
			flex: none;
			padding: 3px;
			border-radius: 10px;
			background: var(--loka-fill);
			box-shadow: inset 0 0 0 1px var(--loka-line);
		}
		.segmented button {
			position: relative;
			min-width: 64px;
			height: 30px;
			border-radius: 8px;
			color: var(--loka-ink-2);
		}
		.segmented button:not(.on):hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		.segmented button:not(.on):active {
			background: var(--loka-fill-hover);
		}
		.segmented.small button {
			min-width: 56px;
			height: 28px;
			font-size: 13px;
		}
		.segmented button.on {
			background: var(--loka-selected);
			box-shadow: var(--loka-selected-edge);
			color: var(--loka-ink);
			font-weight: 600;
		}
		.range {
			display: flex;
			align-items: center;
			gap: 10px;
			font-variant-numeric: tabular-nums;
			color: var(--loka-ink-2);
		}
		/* Taller than its track, so the thumb can be grabbed from a little above or below the line. */
		input[type="range"] {
			width: 150px;
			height: 32px;
			margin: -8px 0;
			accent-color: var(--loka-accent);
		}
		.switch {
			flex: none;
			position: relative;
			width: 40px;
			height: 24px;
			border-radius: 12px;
			background: var(--loka-fill-hover);
			box-shadow: inset 0 0 0 1px var(--loka-line);
		}
		.switch::after {
			content: "";
			position: absolute;
			top: 3px;
			left: 3px;
			width: 18px;
			height: 18px;
			border-radius: 50%;
			background: #fff;
			box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
			transition: translate 160ms cubic-bezier(0.2, 0, 0, 1);
		}
		.switch:not(.on):not(:disabled):hover {
			background: var(--loka-selected);
		}
		.switch.on:not(:disabled):hover {
			filter: brightness(1.06);
		}
		.switch.on {
			background: var(--loka-accent);
			box-shadow: none;
		}
		.switch.on::after {
			translate: 16px 0;
		}
		.switch:disabled {
			opacity: 0.55;
		}
		.button {
			flex: none;
			height: 32px;
			padding: 0 14px;
			border-radius: 8px;
			background: var(--loka-fill-hover);
			box-shadow: inset 0 0 0 1px var(--loka-line);
		}
		.button:hover {
			background: var(--loka-selected);
		}
		.button:active {
			background: var(--loka-fill);
		}
		/* Settings has room: every control takes clicks across a 44px band, however small it's drawn. The switch's
		   ::after is its knob, so its band is ::before. */
		.button,
		.switch {
			position: relative;
		}
		.button::after,
		.segmented button::after,
		.switch::before {
			content: "";
			position: absolute;
			inset: -6px 0;
		}
		.segmented button::after {
			inset: -8px 0;
		}
		.switch::before {
			inset: -10px -2px;
		}
		.button.add {
			margin-top: 12px;
		}
		.card {
			margin-top: 8px;
			padding: 6px;
			border-radius: 14px;
			background: var(--loka-fill);
			box-shadow: inset 0 0 0 1px var(--loka-line);
		}
		.path {
			overflow-wrap: anywhere;
		}
		.note {
			margin: 10px 0 0;
			color: var(--loka-accent-ink);
		}
		.tag {
			flex: none;
			padding: 3px 9px;
			border-radius: 999px;
			font-size: 12px;
			color: var(--loka-accent-ink);
			background: color-mix(in srgb, var(--loka-accent) 16%, transparent);
		}
		.space svg {
			flex: none;
		}
		select {
			height: 36px;
			padding: 0 10px;
			border-radius: 8px;
			background: var(--loka-fill-hover);
			box-shadow: inset 0 0 0 1px var(--loka-line);
		}
		select:hover {
			background: var(--loka-selected);
		}
		.keys {
			min-height: 44px;
		}
		kbd {
			flex: none;
			min-width: 130px;
			font: 12px system-ui, "Segoe UI", sans-serif;
			color: var(--loka-ink);
		}
		dl {
			display: grid;
			grid-template-columns: 120px 1fr;
			gap: 8px;
			margin: 12px 0 0;
		}
		dt {
			color: var(--loka-ink-2);
		}
		dd {
			margin: 0;
		}
		:focus-visible {
			outline: 2px solid var(--loka-accent);
			outline-offset: 2px;
		}
		@media (max-width: 560px) {
			.segmented.small {
				display: none;
			}
		}
		@media (prefers-reduced-motion: reduce) {
			.switch::after {
				transition: none;
			}
		}
	`;
}

customElements.define("loka-settings", LokaSettings);
