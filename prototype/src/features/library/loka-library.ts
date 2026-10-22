import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import type { Browser } from "../../../../webui/src/bridge";
import type { HistoryBridge } from "../../../../webui/src/history-bridge";
import type { Act } from "../../app/loka-app";
import "../history/loka-history";
import type { BrowserState } from "../sidebar/sidebar.logic";
import { SECTIONS, type Section } from "./library.logic";
import "./loka-library-archive";
import "./loka-library-downloads";
import "./loka-library-spaces";

const ICONS: Record<Section, TemplateResult> = {
	spaces: html`<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" /><path d="M2.2 10.6c-.9 1.3-1 2.2-.5 2.6.9.8 4.3-.9 7.6-3.8s5.2-5.9 4.4-6.7c-.4-.4-1.3-.3-2.5.3" /></svg>`,
	archive: html`<svg viewBox="0 0 16 16"><path d="M2.5 3.5h11v3h-11zM3.5 6.5v6h9v-6M6.5 9h3" /></svg>`,
	history: html`<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.5" /></svg>`,
	downloads: html`<svg viewBox="0 0 16 16"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>`,
};

/**
 * Loka's Library, one page (chrome://history) for the spaces, archived tabs, history and downloads. `section` is the
 * one showing; the switcher at the top of each section's rail asks the page to show another with a
 * `loka-library-section` event, and the page changes its address (its hash) and sets `section`. History is the
 * existing <loka-history>; the others are drawn with its styles, so the four read as one page.
 */
export class LokaLibrary extends LitElement {
	static override properties = {
		section: {},
		state: { attribute: false },
		act: { attribute: false },
		historyBridge: { attribute: false },
		browser: { attribute: false },
	};

	section: Section = "history";
	/** The spaces, as the browser last said: null until it has answered. */
	declare state: BrowserState | null;
	declare act: Act;
	declare historyBridge: HistoryBridge;
	declare browser: Browser;

	private pick(e: MouseEvent, section: Section) {
		// Ctrl, Shift or a middle click open the section in a new tab or window, as any link does.
		if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
		e.preventDefault();
		if (section === this.section) return;
		this.dispatchEvent(
			new CustomEvent<Section>("loka-library-section", { detail: section, bubbles: true, composed: true }),
		);
	}

	private nav(): TemplateResult {
		return html`<nav slot="nav" class="sections" aria-label="Library">
			${SECTIONS.map(
				(s) => html`<a
					href="#${s.id}"
					aria-current=${s.id === this.section ? "page" : nothing}
					@click=${(e: MouseEvent) => this.pick(e, s.id)}
				>
					${ICONS[s.id]}<span>${s.label}</span>
				</a>`,
			)}
		</nav>`;
	}

	override render() {
		switch (this.section) {
			case "spaces":
				return html`<loka-library-spaces .state=${this.state} .act=${this.act}>${this.nav()}</loka-library-spaces>`;
			case "archive":
				return html`<loka-library-archive .state=${this.state} .act=${this.act}>${this.nav()}</loka-library-archive>`;
			case "downloads":
				return html`<loka-library-downloads .browser=${this.browser}>${this.nav()}</loka-library-downloads>`;
			case "history":
				return html`<loka-history .bridge=${this.historyBridge}>${this.nav()}</loka-history>`;
		}
	}

	static override styles = css`
		:host {
			display: block;
			height: 100%;
		}
		/* The four sections as tiles at the top of the rail, the one showing lit the way the sidebar lights its
		   active tab. */
		.sections {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 2px;
			padding-bottom: 14px;
			border-bottom: 1px solid var(--loka-line);
		}
		/* Tight enough that "Downloads" fits half of the rail. */
		a {
			display: flex;
			align-items: center;
			gap: 7px;
			min-width: 0;
			height: 38px;
			padding: 0 6px 0 7px;
			border-radius: 10px;
			color: var(--loka-ink-2);
			font-size: 14px;
			text-decoration: none;
			cursor: default;
		}
		a span {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		a:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		a:active {
			background: color-mix(in srgb, var(--loka-ink) 10%, transparent);
		}
		a[aria-current="page"] {
			background: var(--loka-selected);
			box-shadow: var(--loka-selected-edge);
			color: var(--loka-ink);
			font-weight: 600;
		}
		a[aria-current="page"] svg {
			color: var(--loka-accent-ink);
		}
		a:focus-visible {
			outline: 2px solid var(--loka-accent);
			outline-offset: 1px;
		}
		svg {
			flex: none;
			width: 16px;
			height: 16px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.5;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		/* A narrow window: the sections sit in one row across the header. Narrower still, each is its icon over
		   its name. (The query finds the section's scroller, which holds this nav in its slot.) */
		@container (width < 820px) {
			.sections {
				grid-template-columns: repeat(4, minmax(0, 1fr));
				padding-bottom: 12px;
			}
			a {
				justify-content: center;
			}
		}
		@container (width < 560px) {
			a {
				flex-direction: column;
				gap: 3px;
				height: 52px;
				padding: 0 4px;
				font-size: 12px;
			}
		}
	`;
}

customElements.define("loka-library", LokaLibrary);
