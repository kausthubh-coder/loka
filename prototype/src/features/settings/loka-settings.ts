import { css, html, LitElement, nothing, type PropertyValues, svg, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { Browser, NativeExtension } from "../../../../webui/src/bridge";
import type { Update } from "../../app/loka-app";
import { reducedMotion } from "../../app/theme";
import {
	AUTOPLAY_MODES,
	type Autoplay,
	SIDEBAR_MAX,
	SIDEBAR_MIN,
	STAR_MOTIONS,
	type StarMotion,
	type UiPrefs,
} from "../../app/ui-prefs.logic";
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
import {
	currentSection,
	type Found,
	findSettings,
	highlight,
	type SectionText,
	type SettingText,
} from "./settings.logic";

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

const STAR_MOTION_NAMES: Record<StarMotion, string> = {
	"while-using": "While I'm using Loka",
	always: "Always",
	off: "Off",
};

const AUTOPLAY_NAMES: Record<Autoplay, string> = {
	block: "Block video and sound until I click",
	"block-audible": "Block sound only",
	allow: "Allow",
};

/** Below this width the rail turns into a bar of section chips over the page (the same width as the CSS). */
const NARROW = 720;

/** The rail's icons, drawn on a 24 px grid. */
const ICONS = {
	sidebar: svg`<rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M9 4.5v15" />`,
	spaces: svg`<circle cx="12" cy="12" r="6.5" /><path d="M18.2 13.4c2.2 2 3.4 3.8 3 4.7-.7 1.4-5.6-.3-10.9-3.7S1.4 7 2.1 5.6c.5-.9 2.8-.5 5.6.7" />`,
	appearance: svg`<path d="M10 3.5c.5 4.2 2.3 6 6.5 6.5-4.2.5-6 2.3-6.5 6.5-.5-4.2-2.3-6-6.5-6.5 4.2-.5 6-2.3 6.5-6.5z" /><path d="M17.5 14.5c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3z" />`,
	sound: svg`<path d="M4 9h3l4.5-4v14L7 15H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12" />`,
	media: svg`<circle cx="12" cy="12" r="9" /><path d="M10 8.8v6.4c0 .5.5.8.9.5l5-3.2c.4-.2.4-.8 0-1l-5-3.2c-.4-.3-.9 0-.9.5z" />`,
	tabs: svg`<rect x="3" y="8.5" width="13" height="11.5" rx="2.5" /><path d="M8 4.5h10.5A2.5 2.5 0 0 1 21 7v8.5" />`,
	extensions: svg`<path d="M9.6 4.2h4.2v2.7a1.5 1.5 0 0 0 3 0v-.3h3.6v4.8h-.9a1.5 1.5 0 0 0 0 3h.9v5.4h-5.4v-.9a1.5 1.5 0 0 0-3 0v.9H4.2v-5.4h.9a1.5 1.5 0 0 0 0-3h-.9V6.6h5.4z" />`,
	sync: svg`<path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.3L20 15.5M20 20v-4.5h-4.5" />`,
	import: svg`<path d="M12 3.5v11M8 10.5l4 4 4-4" /><path d="M8 6H5.5a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H16" />`,
	privacy: svg`<path d="M12 3 5 5.8v5.7c0 4.3 2.9 7.7 7 9.5 4.1-1.8 7-5.2 7-9.5V5.8z" />`,
	search: svg`<circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" />`,
	keys: svg`<rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M6.5 9.5h.01M10 9.5h.01M14 9.5h.01M17.5 9.5h.01M6.5 12.5h.01M17.5 12.5h.01M10 12.5h4M8 15.5h8" />`,
	about: svg`<circle cx="12" cy="12" r="9" /><path d="M12 16.5v-5M12 7.8v.01" />`,
};

type SectionId = keyof typeof ICONS;

/** A row of Settings: its name and the line under it (what the search reads), and the control beside them. */
interface Setting extends SettingText {
	control: TemplateResult | typeof nothing;
	/** `column`: the control goes under the text. `keys`: a shortcut and what it does. `path`: the line is a file path. */
	look?: "column" | "keys" | "path" | "space";
	/** Drawn before the text: a space's planet. */
	before?: TemplateResult;
}

/** A section of the page, and its row in the rail. */
interface Section extends SectionText<Setting> {
	id: SectionId;
	/** What follows the rows, shown when the section shows whole (a search that matched only rows leaves it out). */
	more?: TemplateResult | typeof nothing;
}

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
 *
 * A rail beside the page (a bar of chips over it on a narrow window) lists the sections and marks the one in view;
 * its search keeps only the settings whose name or line has every word, and marks the words.
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
		query: { state: true },
		current: { state: true },
		bandTop: { state: true },
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
	query = "";
	/** The section the rail marks as current. */
	current: string | null = null;
	/**
	 * Where the band that picks the current section starts, in px from the top of the view. On a narrow window the
	 * chips cover the top, so it starts under them. A click scrolls its section's top to just above the band.
	 */
	bandTop = 8;
	private stops: (() => void)[] = [];
	/** Watches which sections cross the band. Made again when the sections or the band change (`spyKey`). */
	private spy: IntersectionObserver | null = null;
	private spyKey = "";
	/** Watches the page's top and end. */
	private edges: IntersectionObserver | null = null;
	private resize: ResizeObserver | null = null;
	private inBand = new Set<string>();
	private atTop = true;
	private atEnd = false;
	/** The section a click in the rail is scrolling to, current until the scroll ends. */
	private target: string | null = null;
	private targetTimer = 0;

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
		window.addEventListener("keydown", this.onWindowKey);
		// Coming back (the prototype puts the page away with its tab): the observers are made again after the render.
		this.requestUpdate();
	}

	override disconnectedCallback() {
		for (const stop of this.stops) stop();
		window.removeEventListener("keydown", this.onWindowKey);
		this.spy?.disconnect();
		this.edges?.disconnect();
		this.resize?.disconnect();
		this.spy = this.edges = this.resize = null;
		this.spyKey = "";
		window.clearTimeout(this.targetTimer);
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
	private pageRow(label: string, detail: string, url: string): Setting {
		return {
			label,
			detail,
			control: html`<button class="button" @click=${() => this.browser.openPage(url)}>Open</button>`,
		};
	}

	// ---- the sections -------------------------------------------------------------------------------------------

	private sidebarRows(): Setting[] {
		const ui = this.ui;
		const pin: Setting = {
			label: "Keep the sidebar open",
			detail: "Off, it slides away and comes back when the mouse reaches the window's edge.",
			control: this.toggle("Keep the sidebar open", this.pinned, (on) => this.browser.setSidebarPinned(on)),
		};
		if (this.native) return [pin];
		return [
			{
				label: "Sidebar side",
				detail: "Where the sidebar sits in the window",
				control: html`<div class="segmented" role="radiogroup" aria-label="Sidebar side">
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
				</div>`,
			},
			{
				label: "Sidebar width",
				detail: "Or drag the sidebar's edge. Double-click the edge to reset.",
				control: html`<label class="range">
					<input
						type="range"
						min=${SIDEBAR_MIN}
						max=${SIDEBAR_MAX}
						.value=${String(ui.sidebarWidth)}
						aria-label="Sidebar width"
						@input=${(e: Event) => this.setUi({ sidebarWidth: Number((e.target as HTMLInputElement).value) })}
					/>
					<span>${ui.sidebarWidth}&nbsp;px</span>
				</label>`,
			},
			pin,
		];
	}

	private spaceRows(): Setting[] {
		return this.state.spaces.map((s, i) => ({
			label: s.name,
			detail: `${countTabs(s)} ${countTabs(s) === 1 ? "tab" : "tabs"}. ${shortcutKeys(`Ctrl+${i + 1}`)}`,
			look: "space",
			before: planet(s.planet, s.hue, 30),
			control: html`<div class="segmented small" role="radiogroup" aria-label="${s.name}: light or dark">
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
				<button class="button" @click=${() => this.editSpace(s.id)}>Edit</button>`,
		}));
	}

	private soundRows(): Setting[] {
		const ui = this.ui;
		return [
			{
				label: "Sound effects",
				detail: "Soft cues when you switch spaces, open and close tabs and folders, and pin",
				control: this.toggle("Sound effects", ui.sound, (on) => {
					this.setUi({ sound: on });
					if (on) {
						setSoundPrefs({ on, volume: ui.soundVolume });
						playCue("pin");
					}
				}),
			},
			{
				label: "Volume",
				detail: "Plays a cue when you let go",
				control: html`<label class="range">
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
				</label>`,
			},
		];
	}

	private tabRows(): Setting[] {
		const ui = this.ui;
		return [
			{
				label: "Archive open tabs",
				detail: "Open tabs you haven't looked at move to Archived tabs. Pinned tabs and Essentials never do.",
				control: html`<select
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
				</select>`,
			},
			{
				label: "Archived tabs",
				detail: `${this.state.archive.length} archived. Find them in the sidebar's ... menu or with the command bar.`,
				control: this.native
					? nothing
					: html`<button class="button" @click=${() => this.action("archive")}>Show</button>`,
			},
		];
	}

	private importRows(): Setting[] {
		const sources = (Object.keys(IMPORT_SOURCES) as ImportSource[]).map((source): Setting => {
			const { name, file, where } = IMPORT_SOURCES[source];
			return {
				label: `From ${name}`,
				detail: `${file} in ${where}`,
				look: "path",
				control: html`<button class="button" @click=${() => this.importFrom(source)}>Choose file</button>`,
			};
		});
		const passwords =
			"Export them from Chrome or Edge as a CSV file, then import them in the browser's password settings.";
		return [
			...sources,
			this.native
				? this.pageRow("Passwords", passwords, BROWSER_PAGES.passwords)
				: { label: "Passwords", detail: passwords, control: html`<span class="tag">In the browser</span>` },
		];
	}

	private privacySections(): Section[] {
		if (this.native) {
			return [
				{
					id: "privacy",
					title: "Privacy and search",
					rows: [
						this.pageRow(
							"Privacy and security",
							"Cookies, site permissions, Helium's privacy settings",
							BROWSER_PAGES.privacy,
						),
						this.pageRow("Search engine", "Used by the address field and the command bar", BROWSER_PAGES.search),
						this.pageRow("All extensions", "Install, turn off or remove them", BROWSER_PAGES.extensions),
					],
				},
			];
		}
		return [
			{
				id: "privacy",
				title: "Privacy",
				rows: [
					{
						label: "Block ads and trackers",
						detail: "uBlock Origin, built in from Helium",
						control: this.toggle("Block ads and trackers", this.privacy.ads, (on) => {
							this.privacy = { ...this.privacy, ads: on };
						}),
					},
					{
						label: "No Google services",
						detail: "Removed at build time, so there is nothing to turn on",
						control: this.toggle("No Google services", true, () => {}, true),
					},
					{
						label: "Clear cookies when Loka closes",
						detail: "Sites you pin keep theirs",
						control: this.toggle("Clear cookies when Loka closes", this.privacy.clearOnExit, (on) => {
							this.privacy = { ...this.privacy, clearOnExit: on };
						}),
					},
				],
			},
			{
				id: "search",
				title: "Search",
				rows: [
					{
						label: "Search engine",
						detail: "Used by the command bar",
						control: html`<select
							aria-label="Search engine"
							@change=${(e: Event) => {
								this.engine = (e.target as HTMLSelectElement).value;
							}}
						>
							${["DuckDuckGo", "Brave Search", "Startpage", "Kagi"].map(
								(name) => html`<option ?selected=${name === this.engine}>${name}</option>`,
							)}
						</select>`,
					},
				],
			},
		];
	}

	/** Every section, top to bottom, as the page and the rail show them. */
	private sections(): Section[] {
		const ui = this.ui;
		return [
			{ id: "sidebar", title: "Sidebar", rows: this.sidebarRows() },
			{
				id: "spaces",
				title: "Spaces",
				lead: "Each space chooses light or dark for the sidebar, the browser and the pages you visit in it.",
				rows: this.spaceRows(),
				more: html`<button class="button add" @click=${() => this.action("new-space")}>New space</button>`,
			},
			{
				id: "appearance",
				title: "Appearance",
				keywords: "sky animation motion battery",
				rows: [
					{
						label: "Moving stars",
						detail:
							"The sidebar's stars drift slowly. While I'm using Loka stops them 15 seconds after you last touch the window.",
						look: "column",
						control: html`<div class="segmented" role="radiogroup" aria-label="Moving stars">
							${STAR_MOTIONS.map(
								(mode) => html`<button
									role="radio"
									aria-checked=${ui.starMotion === mode}
									class=${ui.starMotion === mode ? "on" : ""}
									@click=${() => {
										if (ui.starMotion !== mode) this.setUi({ starMotion: mode });
									}}
								>
									${STAR_MOTION_NAMES[mode]}
								</button>`,
							)}
						</div>`,
					},
				],
			},
			{ id: "sound", title: "Sound", rows: this.soundRows() },
			{
				id: "media",
				title: "Media",
				rows: [
					{
						label: "Autoplay",
						detail: "For pages you open from now on",
						look: "column",
						control: html`<div class="segmented" role="radiogroup" aria-label="Autoplay">
							${AUTOPLAY_MODES.map(
								(mode) => html`<button
									role="radio"
									aria-checked=${ui.autoplay === mode}
									class=${ui.autoplay === mode ? "on" : ""}
									@click=${() => {
										if (ui.autoplay === mode) return;
										this.setUi({ autoplay: mode });
										this.browser.setAutoplay(mode);
									}}
								>
									${AUTOPLAY_NAMES[mode]}
								</button>`,
							)}
						</div>`,
					},
				],
			},
			{ id: "tabs", title: "Tabs", rows: this.tabRows() },
			{
				id: "extensions",
				title: "Extensions",
				lead: "Pinned ones sit in the sidebar's address field, one click away.",
				rows: [],
				more: html`<div class="well">
					<loka-extensions .extensions=${this.extensions} .browser=${this.browser} .pin=${this.pinExtension}></loka-extensions>
				</div>`,
			},
			{
				id: "sync",
				title: "Sync",
				keywords: "encrypted passphrase folder computers",
				rows: this.sync
					? []
					: [
							{
								label: "Sync spaces between your computers",
								detail:
									"Spaces, folders and pinned tabs, end-to-end encrypted with a passphrase, kept in a folder you choose (OneDrive, Dropbox, a USB drive). No Loka account and no Loka server.",
								control: html`<span class="tag">First release</span>`,
							},
						],
				more: this.sync
					? html`<loka-sync-settings
							.hooks=${this.sync}
							@loka-take-spaces=${(e: CustomEvent<BrowserState>) => this.apply((s) => takeSpaces(s, e.detail))}
						></loka-sync-settings>`
					: nothing,
			},
			{
				id: "import",
				title: "Import",
				rows: this.importRows(),
				more: this.imported ? html`<p class="note" role="status">${this.imported}</p>` : nothing,
			},
			...this.privacySections(),
			{
				id: "keys",
				title: "Keyboard shortcuts",
				rows: shortcuts(this.native).map(
					([keys, what]): Setting => ({
						label: shortcutKeys(keys),
						detail: what,
						look: "keys",
						control: nothing,
					}),
				),
			},
			{
				id: "about",
				title: "About",
				keywords: "version engine license Helium Chromium GPL",
				rows: [],
				more: html`<dl>
						<dt>Loka</dt>
						<dd>${this.native ? "Built on Helium" : "Prototype, not a release"}</dd>
						${this.version ? html`<dt>Engine</dt><dd>${this.version}</dd>` : nothing}
						<dt>License</dt>
						<dd>GPL-3.0</dd>
					</dl>
					${this.native ? html`<button class="button add" @click=${() => this.browser.openPage(BROWSER_PAGES.about)}>About this browser</button>` : nothing}`,
			},
		];
	}

	// ---- search -------------------------------------------------------------------------------------------------

	/** Text with the search's words marked. */
	private marked(text: string): TemplateResult | string {
		if (!this.query.trim()) return text;
		return html`${highlight(text, this.query).map((p) => (p.hit ? html`<mark>${p.text}</mark>` : p.text))}`;
	}

	private searchField(): HTMLInputElement | null {
		return this.renderRoot.querySelector<HTMLInputElement>("input[type=search]");
	}

	private onSearch(value: string) {
		this.query = value;
		this.target = null;
		this.scroller()?.scrollTo({ top: 0 });
	}

	/** Clears the search and goes back to where the page was: the section that was current in the results. */
	private clearSearch() {
		const back = this.current;
		this.onSearch("");
		void this.updateComplete.then(() => {
			if (back) this.scrollToSection(back, false);
		});
	}

	/** `/` or Ctrl+F go to the search, Escape clears it. Keys pressed in something else on the page (the space editor) are its own. */
	private onWindowKey = (e: KeyboardEvent) => {
		const path = e.composedPath();
		if (!path.includes(this) && path[0] !== document.body) return;
		const inField = path[0] instanceof HTMLInputElement || path[0] instanceof HTMLSelectElement;
		if ((e.key === "/" && !inField) || ((e.ctrlKey || e.metaKey) && e.key === "f")) {
			e.preventDefault();
			this.searchField()?.focus();
			this.searchField()?.select();
		} else if (e.key === "Escape" && this.query) {
			e.preventDefault();
			this.clearSearch();
		}
	};

	// ---- the rail -----------------------------------------------------------------------------------------------

	private scroller(): HTMLElement | null {
		return this.renderRoot.querySelector<HTMLElement>(".scroller");
	}

	/** Scrolls a section's top to just above the band, so it's the current one when the scroll ends. */
	private scrollToSection(id: string, smooth: boolean) {
		const scroller = this.scroller();
		const section = this.renderRoot.querySelector<HTMLElement>(`[data-section="${id}"]`);
		if (!scroller || !section) return;
		const first = section === this.renderRoot.querySelector("[data-section]");
		const top = first
			? 0
			: scroller.scrollTop +
				section.getBoundingClientRect().top -
				scroller.getBoundingClientRect().top -
				this.bandTop +
				1;
		scroller.scrollTo({ top, behavior: smooth && !reducedMotion() ? "smooth" : "instant" });
	}

	/** A click in the rail: that section is current, the page scrolls to it, and focus goes to its heading. */
	private go(id: string) {
		this.target = id;
		this.current = id;
		this.scrollToSection(id, true);
		this.renderRoot.querySelector<HTMLElement>(`[data-section="${id}"] h2`)?.focus({ preventScroll: true });
		// A scroll that had nowhere to go never ends with a scrollend.
		window.clearTimeout(this.targetTimer);
		this.targetTimer = window.setTimeout(() => this.endTarget(), 1500);
	}

	private endTarget() {
		window.clearTimeout(this.targetTimer);
		this.target = null;
	}

	/** Up and Down (Left and Right on the chips), Home and End move between the rail's rows. */
	private onNavKey(e: KeyboardEvent) {
		const rows = [...this.renderRoot.querySelectorAll<HTMLElement>("nav button")];
		const at = rows.indexOf(this.shadowRoot?.activeElement as HTMLElement);
		if (at < 0) return;
		let next: number;
		if (e.key === "ArrowDown" || e.key === "ArrowRight") next = Math.min(at + 1, rows.length - 1);
		else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = Math.max(at - 1, 0);
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = rows.length - 1;
		else return;
		e.preventDefault();
		rows[next]?.focus();
	}

	private pick() {
		const order = [...this.renderRoot.querySelectorAll<HTMLElement>("[data-section]")].map(
			(el) => el.dataset.section ?? "",
		);
		this.current = currentSection({
			order,
			inBand: this.inBand,
			atTop: this.atTop,
			atEnd: this.atEnd,
			previous: this.current,
			target: this.target,
		});
	}

	/** On a narrow window the band starts under the bar of chips, which sticks to the top and covers the page there. */
	private measure() {
		const scroller = this.scroller();
		const rail = this.renderRoot.querySelector<HTMLElement>(".rail");
		if (!scroller || !rail) return;
		this.bandTop = scroller.clientWidth < NARROW ? rail.offsetHeight + 4 : 8;
	}

	/** On the chips, the current one scrolls into view when the page moves on to it. */
	private revealChip() {
		const list = this.renderRoot.querySelector<HTMLElement>("nav ul");
		const chip = list?.querySelector<HTMLElement>('[aria-current="true"]');
		if (!list || !chip || list.scrollWidth <= list.clientWidth) return;
		const left = chip.offsetLeft;
		const right = left + chip.offsetWidth;
		if (left >= list.scrollLeft && right <= list.scrollLeft + list.clientWidth) return;
		list.scrollTo({ left: left - 18, behavior: reducedMotion() ? "instant" : "smooth" });
	}

	protected override updated(changed: PropertyValues<this>) {
		const scroller = this.scroller();
		if (!scroller) return;
		if (!this.edges) {
			this.edges = new IntersectionObserver(
				(entries) => {
					for (const e of entries) {
						if (e.target.classList.contains("top")) this.atTop = e.isIntersecting;
						else this.atEnd = e.isIntersecting;
					}
					this.pick();
				},
				{ root: scroller },
			);
			for (const edge of this.renderRoot.querySelectorAll(".edge")) this.edges.observe(edge);
		}
		if (!this.resize) {
			this.resize = new ResizeObserver(() => this.measure());
			this.resize.observe(scroller);
			const rail = this.renderRoot.querySelector(".rail");
			if (rail) this.resize.observe(rail);
		}
		// The band: from bandTop down to 45% of the view. Sections that cross it are in the running for current.
		const sections = [...this.renderRoot.querySelectorAll<HTMLElement>("[data-section]")];
		const key = `${this.bandTop}|${sections.map((s) => s.dataset.section).join()}`;
		if (key !== this.spyKey) {
			this.spyKey = key;
			this.spy?.disconnect();
			this.inBand.clear();
			this.spy = new IntersectionObserver(
				(entries) => {
					for (const e of entries) {
						const id = (e.target as HTMLElement).dataset.section ?? "";
						if (e.isIntersecting) this.inBand.add(id);
						else this.inBand.delete(id);
					}
					this.pick();
				},
				{ root: scroller, rootMargin: `-${this.bandTop}px 0px -55% 0px` },
			);
			for (const s of sections) this.spy.observe(s);
		}
		if (changed.has("current")) this.revealChip();
	}

	// ---- drawing ------------------------------------------------------------------------------------------------

	private row(s: Setting): TemplateResult {
		if (s.look === "keys") {
			return html`<div class="row keys"><kbd>${this.marked(s.label)}</kbd><span>${this.marked(s.detail)}</span></div>`;
		}
		return html`<div class="row ${s.look ?? ""}">
			${s.before ?? nothing}
			<div><b>${this.marked(s.label)}</b><small class=${s.look === "path" ? "path" : ""}>${this.marked(s.detail)}</small></div>
			${s.control}
		</div>`;
	}

	private section({ section, whole, rows }: Found<Section>): TemplateResult {
		const { id, title, lead, more } = section;
		return html`<section data-section=${id} aria-labelledby="${id}-title">
			<h2 id="${id}-title" tabindex="-1">${this.marked(title)}</h2>
			${whole && lead ? html`<p class="lead">${this.marked(lead)}</p>` : nothing}
			${rows.length ? html`<div class="rows">${rows.map((r) => this.row(r))}</div>` : nothing}
			${whole ? (more ?? nothing) : nothing}
		</section>`;
	}

	private noMatch(): TemplateResult {
		return html`<div class="empty">
			<p><b>No settings match “${this.query.trim()}”</b>Try one word, like sound, tabs or dark.</p>
			<button class="quiet" @click=${() => this.clearSearch()}>Clear the search</button>
		</div>`;
	}

	override render() {
		const found = findSettings(this.sections(), this.query);
		const searching = this.query.trim() !== "";
		const count = found.reduce((n, f) => n + Math.max(f.rows.length, 1), 0);
		// Until the observers first report, the top section is the current one.
		const current = this.current ?? found[0]?.section.id;
		return html`
			<div class="scroller" @scrollend=${() => this.endTarget()}>
				<i class="edge top" aria-hidden="true"></i>
				<div class="layout">
					<aside class="rail">
						<div class="bar card">
						<h1>Settings</h1>
						<label class="search">
							<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>
							<input
								type="search"
								placeholder="Search settings"
								aria-label="Search settings"
								autocomplete="off"
								spellcheck="false"
								enterkeyhint="search"
								.value=${this.query}
								@input=${(e: Event) => this.onSearch((e.target as HTMLInputElement).value)}
								@keydown=${(e: KeyboardEvent) => {
									if (e.key === "ArrowDown") {
										e.preventDefault();
										this.renderRoot.querySelector<HTMLElement>("nav button")?.focus();
									}
								}}
							/>
							<kbd>/</kbd>
						</label>
						<nav aria-label="Settings sections" @keydown=${(e: KeyboardEvent) => this.onNavKey(e)}>
							<ul>
								${repeat(
									found,
									(f) => f.section.id,
									({ section }) => html`<li>
										<button aria-current=${section.id === current ? "true" : nothing} @click=${() => this.go(section.id)}>
											<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[section.id]}</svg>
											<span>${section.title}</span>
										</button>
									</li>`,
								)}
							</ul>
						</nav>
						</div>
					</aside>
					<main class="sheet card">
						${
							found.length
								? repeat(
										found,
										(f) => f.section.id,
										(f) => this.section(f),
									)
								: this.noMatch()
						}
						<p class="sr" role="status">
							${searching ? (found.length ? `${count} ${count === 1 ? "setting" : "settings"} found` : "No settings found") : ""}
						</p>
					</main>
				</div>
				<i class="edge end" aria-hidden="true"></i>
			</div>
		`;
	}

	static override styles = css`
		/* The host fills the page (or the prototype's frame) and its .scroller scrolls, so the rail sticks to its top
		   and the scrollbar sits at the window's edge. */
		:host {
			display: block;
			height: 100%;
			color: var(--loka-ink);
			font: 14px/1.45 system-ui, "Segoe UI", sans-serif;
			/* Washes made from the ink, so they read on the light glass and the dark one alike. */
			--wash: color-mix(in srgb, var(--loka-ink) 5.5%, transparent);
			--wash-press: color-mix(in srgb, var(--loka-ink) 10%, transparent);
		}
		.scroller {
			position: relative;
			display: flex;
			flex-direction: column;
			height: 100%;
			overflow-y: auto;
			container-type: size;
			scrollbar-color: color-mix(in srgb, var(--loka-ink) 28%, transparent) transparent;
		}
		/* Markers at the page's top and end, for the scroll spy. */
		.edge {
			flex: none;
			display: block;
			height: 1px;
			margin-bottom: -1px;
		}
		.edge.end {
			margin: -1px 0 0;
		}
		/* The rail and the page, side by side and centered as one composition. */
		.layout {
			flex: 1 0 auto;
			box-sizing: border-box;
			display: grid;
			grid-template-columns: 248px minmax(0, 680px);
			justify-content: center;
			align-items: start;
			gap: 20px;
			width: calc(100% - 64px);
			margin: 32px auto;
		}
		/* The sidebar's glass, as on History: the space's sky shows through, frosted. Only these two cards blur
		   (never a row), and the blur never animates. */
		.card {
			border-radius: 20px;
			background: color-mix(in srgb, var(--loka-surface) 76%, transparent);
			backdrop-filter: blur(20px) saturate(1.3);
			box-shadow:
				inset 0 0 0 1px var(--loka-fill-hover),
				0 0 0 0.5px var(--loka-line),
				0 18px 48px -20px hsl(var(--hue, 200) 50% 6% / 0.5);
		}
		@supports not (backdrop-filter: blur(1px)) {
			.card {
				background: var(--loka-surface);
			}
		}
		@media (prefers-reduced-transparency: reduce) {
			.card {
				background: var(--loka-surface);
				backdrop-filter: none;
			}
		}
		button,
		select {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
			cursor: default;
		}

		/* The rail: title, search and the sections, staying in view while the page scrolls. On a short window its
		   list scrolls on its own. It's a scroll-state container so the narrow bar can tell when it's stuck. */
		.rail {
			position: sticky;
			top: 32px;
			z-index: 2;
			container-type: scroll-state;
		}
		.bar {
			display: flex;
			flex-direction: column;
			gap: 16px;
			max-height: calc(100cqh - 64px);
			box-sizing: border-box;
			padding: 22px 14px 14px;
			font-size: 15px;
		}
		h1 {
			flex: none;
			margin: 0 0 4px 4px;
			font-size: 26px;
			line-height: 1.2;
			font-weight: 650;
			letter-spacing: -0.015em;
		}
		.search {
			flex: none;
			display: flex;
			align-items: center;
			gap: 10px;
			height: 40px;
			padding: 0 8px 0 12px;
			border-radius: 11px;
			background: var(--wash);
			box-shadow: inset 0 0 0 1px var(--loka-line);
			color: var(--loka-ink-3);
		}
		.search:focus-within {
			box-shadow: inset 0 0 0 1.5px var(--loka-accent);
		}
		.search svg {
			flex: none;
			width: 16px;
			height: 16px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.5;
			stroke-linecap: round;
		}
		.search input {
			flex: 1;
			min-width: 0;
			height: 100%;
			padding: 0;
			border: 0;
			outline: none;
			background: none;
			font: inherit;
			color: var(--loka-ink);
		}
		.search input::placeholder {
			color: var(--loka-ink-3);
		}
		.search input::-webkit-search-cancel-button {
			display: none;
		}
		.search kbd {
			font: 12px/1.5 system-ui, "Segoe UI", sans-serif;
			padding: 0 7px;
			border-radius: 6px;
			box-shadow: inset 0 0 0 1px var(--loka-line);
			color: var(--loka-ink-3);
		}
		.search:focus-within kbd {
			visibility: hidden;
		}
		nav {
			display: flex;
			min-height: 0;
		}
		/* The list scrolls when the window is short; its 3px of padding keeps the rows' focus rings inside the clip. */
		nav ul {
			position: relative;
			display: flex;
			flex-direction: column;
			gap: 2px;
			flex: 1;
			min-width: 0;
			margin: -3px;
			padding: 3px;
			list-style: none;
			overflow-y: auto;
			scrollbar-width: none;
		}
		nav button {
			display: flex;
			align-items: center;
			gap: 12px;
			width: 100%;
			height: 36px;
			padding: 0 12px 0 10px;
			border-radius: 9px;
			text-align: left;
			color: var(--loka-ink-2);
		}
		nav button span {
			min-width: 0;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		nav svg {
			flex: none;
			width: 18px;
			height: 18px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.75;
			stroke-linecap: round;
			stroke-linejoin: round;
			color: var(--loka-ink-3);
		}
		nav button:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		nav button:active {
			background: var(--wash-press);
		}
		/* The current section is lit the way the sidebar lights its active tab, and its icon takes the space's color. */
		nav button[aria-current="true"] {
			background: var(--loka-selected);
			box-shadow: var(--loka-selected-edge);
			color: var(--loka-ink);
			font-weight: 600;
		}
		nav button[aria-current="true"] svg {
			color: var(--loka-accent-ink);
		}

		/* The page: one sheet of glass, its sections one after another. */
		.sheet {
			min-width: 0;
			padding: 2px 28px 22px;
		}
		section {
			padding-top: 22px;
		}
		section + section {
			padding-top: 30px;
		}
		h2 {
			width: fit-content;
			margin: 0 0 4px;
			font-size: 15px;
			font-weight: 600;
			color: var(--loka-accent-ink);
		}
		h2:focus {
			outline: none;
		}
		h2:focus-visible {
			outline: 2px solid var(--loka-accent);
			outline-offset: 3px;
			border-radius: 4px;
		}
		.lead {
			margin: 0 0 6px;
			color: var(--loka-ink-2);
			font-size: 13px;
		}
		mark {
			color: inherit;
			background: color-mix(in srgb, var(--loka-accent) 30%, transparent);
			border-radius: 3px;
			box-shadow: 0 0 0 1px color-mix(in srgb, var(--loka-accent) 30%, transparent);
		}
		.row {
			display: flex;
			align-items: center;
			gap: 14px;
			min-height: 56px;
			padding: 8px 0;
			border-bottom: 1px solid var(--loka-line);
		}
		/* The section's space ends it; a line under its last row would only box it in. */
		.rows > .row:last-child {
			border-bottom: 0;
		}
		/* A row whose choices are too long to sit beside its label puts them under it. */
		.row.column {
			flex-direction: column;
			align-items: stretch;
			gap: 10px;
			padding: 12px 0;
		}
		.row.column .segmented {
			flex-wrap: wrap;
			align-self: flex-start;
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
			padding: 0 12px;
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
			padding: 0 8px;
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
			padding: 0;
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
		.well {
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
		/* Shortcuts are a list to read down, so their rows are tighter than a setting's. */
		.row.keys {
			min-height: 0;
			padding: 10px 0;
		}
		.keys kbd {
			flex: none;
			min-width: 130px;
			font: 13px system-ui, "Segoe UI", sans-serif;
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
		.empty {
			display: grid;
			justify-items: center;
			gap: 16px;
			padding: 88px 16px 72px;
			text-align: center;
			color: var(--loka-ink-2);
		}
		.empty p {
			margin: 0;
		}
		.empty b {
			display: block;
			margin-bottom: 4px;
			font-size: 17px;
			font-weight: 600;
			color: var(--loka-ink);
			text-wrap: balance;
		}
		.quiet {
			position: relative;
			height: 36px;
			padding: 0 14px;
			border-radius: 9px;
			font-weight: 550;
			background: var(--wash);
		}
		.quiet:hover {
			background: var(--wash-press);
		}
		.quiet::after {
			content: "";
			position: absolute;
			inset: -4px 0;
		}
		.sr {
			position: absolute;
			width: 1px;
			height: 1px;
			margin: 0;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		:focus-visible {
			outline: 2px solid var(--loka-accent);
			outline-offset: 2px;
		}
		nav button:focus-visible {
			outline-offset: 1px;
		}

		/* A middling window: a narrower rail, so the page keeps room for its rows. */
		@container (width < 960px) {
			.layout {
				grid-template-columns: 208px minmax(0, 1fr);
				gap: 16px;
				width: calc(100% - 40px);
				margin: 20px auto;
			}
			.rail {
				top: 20px;
			}
			.bar {
				max-height: calc(100cqh - 40px);
			}
			.sheet {
				padding: 2px 22px 20px;
			}
		}
		/* A narrow window: the rail becomes a bar over the page (title and search on one line, the sections as
		   chips under them), and the page takes nearly the whole width. Scrolled, the bar sticks to the top and
		   widens to the window's edges, so nothing shows above it. */
		@container (width < 720px) {
			.layout {
				grid-template-columns: minmax(0, 1fr);
				gap: 12px;
				width: calc(100% - 24px);
				margin: 12px auto;
			}
			.card {
				border-radius: 18px;
			}
			.rail {
				top: 0;
			}
			.bar {
				--pad-left: 18px;
				--pad-right: 12px;
				display: grid;
				grid-template-columns: auto minmax(0, 1fr);
				align-items: center;
				gap: 12px 16px;
				max-height: none;
				padding: 12px var(--pad-right) 10px var(--pad-left);
			}
			@container scroll-state(stuck: top) {
				.bar {
					--pad-left: 30px;
					--pad-right: 24px;
					margin: 0 -12px;
					border-radius: 0 0 18px 18px;
				}
			}
			h1 {
				margin: 0;
				font-size: 22px;
			}
			nav {
				grid-column: 1 / -1;
				margin: 0 calc(-1 * var(--pad-right)) 0 calc(-1 * var(--pad-left));
			}
			/* Chips that run past the edge fade out there. */
			nav ul {
				flex-direction: row;
				gap: 4px;
				margin: -3px 0;
				padding: 3px var(--pad-right) 3px calc(var(--pad-left) - 4px);
				overflow: auto hidden;
				mask-image: linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 20px), transparent);
			}
			nav li {
				flex: none;
			}
			nav button {
				height: 34px;
				padding: 0 14px;
				border-radius: 999px;
			}
			nav svg {
				display: none;
			}
			.sheet {
				padding: 0 18px 18px;
			}
		}
		@container (width < 460px) {
			.bar {
				grid-template-columns: minmax(0, 1fr);
			}
			h1 {
				margin-left: 2px;
			}
		}
		@container (width < 560px) {
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
