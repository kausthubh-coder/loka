import { css, html, LitElement } from "lit";
import "../features/sidebar/loka-sidebar";
import "../features/page/loka-page";
import "../features/command-bar/loka-command-bar";
import {
	activeSpace,
	activeTab,
	type BrowserState,
	closeTab,
	importState,
	switchSpace,
} from "../features/sidebar/sidebar.logic";
import { seedState } from "../features/sidebar/sidebar.seed";

const STORAGE_KEY = "loka.state.v1";

function loadState(): BrowserState {
	const saved = localStorage.getItem(STORAGE_KEY);
	return (saved && importState(saved)) || seedState();
}

export type Update = (change: (state: BrowserState) => BrowserState) => void;

/** The window: owns the state, saves it, and handles window-wide shortcuts. */
export class LokaApp extends LitElement {
	static override properties = {
		state: { state: true },
		commandOpen: { state: true },
	};

	state: BrowserState = loadState();
	commandOpen = false;

	apply: Update = (change) => {
		this.state = change(this.state);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
	};

	private onKey = (e: KeyboardEvent) => {
		if (!(e.ctrlKey || e.metaKey)) return;
		if (e.key === "k" || e.key === "l") {
			e.preventDefault();
			this.commandOpen = true;
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

	override connectedCallback() {
		super.connectedCallback();
		window.addEventListener("keydown", this.onKey);
	}

	override disconnectedCallback() {
		window.removeEventListener("keydown", this.onKey);
		super.disconnectedCallback();
	}

	override render() {
		const space = activeSpace(this.state);
		return html`
			<div class="window" style="--hue: ${space.hue}">
				<loka-sidebar
					.state=${this.state}
					.apply=${this.apply}
					@loka-command=${() => {
						this.commandOpen = true;
					}}
					@loka-reset=${() => this.apply(() => seedState())}
				></loka-sidebar>
				<loka-page .tab=${activeTab(this.state)} .spaceName=${space.name}></loka-page>
				${
					this.commandOpen
						? html`<loka-command-bar
								.apply=${this.apply}
								@loka-close=${() => {
									this.commandOpen = false;
								}}
							></loka-command-bar>`
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
			grid-template-columns: 272px 1fr;
			height: 100%;
			overflow: hidden;
			/* Deep-space backdrop, tinted by the active space. */
			background:
				radial-gradient(900px 520px at 0% 0%, hsl(var(--hue) 65% 32% / 0.42), transparent 65%),
				radial-gradient(700px 460px at 100% 100%, hsl(calc(var(--hue) + 50) 55% 26% / 0.3), transparent 60%),
				hsl(var(--hue) 28% 7%);
		}
		.window::before {
			/* A sparse star field: three offset dot layers. */
			content: "";
			position: absolute;
			inset: 0;
			pointer-events: none;
			opacity: 0.5;
			background-image:
				radial-gradient(1px 1px at 20px 30px, #fff9, transparent),
				radial-gradient(1px 1px at 140px 90px, #fff6, transparent),
				radial-gradient(1.5px 1.5px at 90px 160px, #fff8, transparent);
			background-size: 230px 210px, 310px 270px, 410px 380px;
		}
		@media (prefers-reduced-motion: no-preference) {
			.window {
				transition: --hue 420ms cubic-bezier(0.2, 0, 0, 1);
			}
		}
	`;
}

customElements.define("loka-app", LokaApp);
