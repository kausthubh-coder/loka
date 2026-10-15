import { css, html, LitElement, svg } from "lit";
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
		// Save what was loaded, so a first visit stores the seed data and an invalid save gets replaced.
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
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
				<div class="sky" aria-hidden="true">
					<svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice">
						${STARS.map((s) => svg`<circle cx=${s.x} cy=${s.y} r=${s.r} fill=${s.fill} opacity=${s.opacity} />`)}
					</svg>
				</div>
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
			isolation: isolate;
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
		}
	`;
}

customElements.define("loka-app", LokaApp);
