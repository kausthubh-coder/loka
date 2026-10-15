import { css, html, LitElement, nothing } from "lit";
import { keyed } from "lit/directives/keyed.js";

import { planet, SPACE_HUES } from "../sidebar/planet";
import { PLANET_KINDS, type SpaceLook } from "../sidebar/sidebar.logic";

const BROWSERS = [
	{ id: "chrome", name: "Chrome", detail: "Bookmarks, history and passwords" },
	{ id: "arc", name: "Arc", detail: "Spaces, folders and pinned tabs" },
	{ id: "edge", name: "Edge", detail: "Bookmarks and history" },
];

/**
 * The first-run tour: welcome, import, make your spaces, three things to know.
 * Sends `loka-preview` (a hue) while a space is being edited, `loka-finish` with the chosen spaces, or `loka-skip`.
 */
export class LokaOnboarding extends LitElement {
	static override properties = {
		spaces: { attribute: false },
		worlds: { state: true },
		step: { state: true },
		imports: { state: true },
		tried: { state: true },
	};

	/**
	 * The user's current spaces, so the tour edits what's there instead of adding duplicates. Read once into `worlds`:
	 * the window re-sends it on every render, which must not undo typing.
	 */
	declare spaces: SpaceLook[];
	declare worlds: SpaceLook[];
	step = 0;
	imports = new Set(["chrome"]);
	tried = false;

	private onKey = (e: KeyboardEvent) => {
		if (this.step === 3 && (e.ctrlKey || e.metaKey) && e.key === "k") {
			e.preventDefault();
			this.tried = true;
		}
	};

	protected override willUpdate() {
		if (!this.worlds) this.worlds = this.spaces;
	}

	override connectedCallback() {
		super.connectedCallback();
		window.addEventListener("keydown", this.onKey);
	}

	override disconnectedCallback() {
		window.removeEventListener("keydown", this.onKey);
		super.disconnectedCallback();
	}

	private go(step: number) {
		this.step = Math.max(0, Math.min(3, step));
		if (this.step === 2) this.preview(this.worlds[0]?.hue ?? 200);
	}

	private preview(hue: number) {
		this.dispatchEvent(new CustomEvent("loka-preview", { detail: hue, bubbles: true, composed: true }));
	}

	private setWorld(index: number, change: Partial<SpaceLook>) {
		this.worlds = this.worlds.map((w, i) => (i === index ? { ...w, ...change } : w));
		const hue = this.worlds[index]?.hue;
		if (hue !== undefined) this.preview(hue);
	}

	private finish() {
		const worlds = this.worlds.filter((w) => w.name.trim());
		this.dispatchEvent(new CustomEvent("loka-finish", { detail: worlds, bubbles: true, composed: true }));
	}

	private stepWelcome() {
		return html`
			<div class="hero">${planet("ringed", 200, 150)}</div>
			<h1>Welcome to Loka</h1>
			<p>Every space is its own world. Keep one for work, one for school, one for home.</p>
			<button class="primary" @click=${() => this.go(1)}>Get started</button>
			<p class="quiet">Takes under a minute</p>
		`;
	}

	private stepImport() {
		const count = this.imports.size;
		return html`
			<h1>Bring your browser along</h1>
			<p>Only browsers found on this PC are listed.</p>
			<div class="list" role="group" aria-label="Browsers to import from">
				${BROWSERS.map(
					(b) => html`<button
						class="option ${this.imports.has(b.id) ? "on" : ""}"
						role="checkbox"
						aria-checked=${this.imports.has(b.id)}
						@click=${() => {
							const next = new Set(this.imports);
							if (!next.delete(b.id)) next.add(b.id);
							this.imports = next;
						}}
					>
						<span class="box" aria-hidden="true">
							<svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7" /></svg>
						</span>
						<span><b>${b.name}</b><small>${b.detail}</small></span>
					</button>`,
				)}
			</div>
			<button class="primary" @click=${() => this.go(2)}>
				${count === 0 ? "Continue without importing" : `Import from ${count} browser${count > 1 ? "s" : ""}`}
			</button>
		`;
	}

	private stepWorlds() {
		return html`
			<h1>Make your first spaces</h1>
			<p>Each one has its own pinned tabs and folders. Click a planet to change its kind.</p>
			<div class="worlds">
				${this.worlds.map(
					(w, i) => html`<div class="world" @focusin=${() => this.preview(w.hue)}>
						<button
							class="planet-pick"
							aria-label="${w.name || "Space"}: change planet (now ${w.planet})"
							@click=${() => {
								const next = PLANET_KINDS[(PLANET_KINDS.indexOf(w.planet) + 1) % PLANET_KINDS.length];
								if (next) this.setWorld(i, { planet: next });
							}}
						>
							${planet(w.planet, w.hue, 84)}
						</button>
						<input
							.value=${w.name}
							maxlength="24"
							aria-label="Space ${i + 1} name"
							@input=${(e: Event) => this.setWorld(i, { name: (e.target as HTMLInputElement).value })}
						/>
						<div class="hues" role="radiogroup" aria-label="Space ${i + 1} color">
							${SPACE_HUES.slice(0, 6).map(
								(h) => html`<button
									class="hue ${h === w.hue ? "on" : ""}"
									style="--s: ${h}"
									role="radio"
									aria-checked=${h === w.hue}
									aria-label="Hue ${h}"
									@click=${() => this.setWorld(i, { hue: h })}
								></button>`,
							)}
						</div>
						${
							this.worlds.length > 1
								? html`<button
										class="remove"
										aria-label="Remove ${w.name || `space ${i + 1}`}"
										@click=${() => (this.worlds = this.worlds.filter((_, j) => j !== i))}
									>
										<svg viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg>
									</button>`
								: nothing
						}
					</div>`,
				)}
				${
					this.worlds.length < 5
						? html`<button
								class="add"
								aria-label="Add a space"
								@click=${() => {
									const hue = SPACE_HUES[this.worlds.length % SPACE_HUES.length] ?? 200;
									this.worlds = [...this.worlds, { name: "", hue, planet: "cratered" }];
								}}
							>
								+
							</button>`
						: nothing
				}
			</div>
			<button class="primary" @click=${() => this.go(3)}>Next</button>
		`;
	}

	private stepKeys() {
		return html`
			<h1>Three things to know</h1>
			<div class="keys">
				<div class="key ${this.tried ? "done" : ""}">
					<span><kbd>Ctrl</kbd><kbd>K</kbd></span>
					<span>Open or search anything ${this.tried ? html`<b class="check">Done</b>` : html`<em>Try it now</em>`}</span>
				</div>
				<div class="key"><span><kbd>Ctrl</kbd><kbd>1–9</kbd></span><span>Jump to a space</span></div>
				<div class="key"><span><kbd>Swipe</kbd></span><span>Two fingers sideways on the sidebar to turn to the next space</span></div>
			</div>
			<button class="primary" @click=${() => this.finish()}>Open Loka</button>
		`;
	}

	override render() {
		const steps = [this.stepWelcome(), this.stepImport(), this.stepWorlds(), this.stepKeys()];
		return html`
			<div class="tour" role="dialog" aria-label="Welcome to Loka">
				<button
					class="skip"
					@click=${() => this.dispatchEvent(new CustomEvent("loka-skip", { bubbles: true, composed: true }))}
				>
					Skip
				</button>
				${keyed(this.step, html`<div class="step">${steps[this.step]}</div>`)}
				<nav class="dots" aria-label="Steps">
					${steps.map(
						(_, i) => html`<button
							class=${i === this.step ? "on" : ""}
							aria-label="Step ${i + 1} of 4"
							aria-current=${i === this.step ? "step" : "false"}
							@click=${() => this.go(i)}
						></button>`,
					)}
				</nav>
				${this.step > 0 ? html`<button class="back" @click=${() => this.go(this.step - 1)}>Back</button>` : nothing}
			</div>
		`;
	}

	static override styles = css`
		:host {
			position: absolute;
			inset: 0;
			z-index: 40;
			display: block;
			color: #ececf1;
			font: 15px/1.45 system-ui, "Segoe UI", sans-serif;
		}
		.tour {
			position: absolute;
			inset: 0;
			display: grid;
			place-items: center;
			/* The window's own sky shows through; this only adds a glow behind the content. */
			background: radial-gradient(50% 45% at 50% 34%, hsl(var(--hue) 60% 30% / 0.32), transparent 70%);
		}
		.step {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 16px;
			width: min(620px, 90vw);
			text-align: center;
		}
		h1 {
			margin: 6px 0 0;
			font-size: 38px;
			font-weight: 650;
			letter-spacing: -0.01em;
		}
		p {
			margin: 0;
			max-width: 46ch;
			font-size: 17px;
			color: #c3c5d0;
		}
		.quiet {
			font-size: 14px;
			color: #9fa1ae;
		}
		button {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
		}
		svg {
			width: 14px;
			height: 14px;
			fill: none;
			stroke: currentColor;
			stroke-width: 2;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		.primary {
			height: 50px;
			margin-top: 12px;
			padding: 0 30px;
			border-radius: 12px;
			font-size: 17px;
			font-weight: 600;
			background: hsl(var(--hue) 80% 72%);
			color: hsl(var(--hue) 45% 10%);
		}
		.primary:hover {
			filter: brightness(1.06);
		}
		.skip,
		.back {
			position: absolute;
			height: 36px;
			padding: 0 14px;
			border-radius: 9px;
			color: #b9bbc7;
		}
		.skip {
			top: 20px;
			right: 20px;
		}
		.back {
			bottom: 30px;
			left: 30px;
		}
		.skip:hover,
		.back:hover {
			background: hsl(var(--hue) 30% 85% / 0.08);
			color: #fff;
		}
		.dots {
			position: absolute;
			bottom: 40px;
			display: flex;
			gap: 8px;
		}
		.dots button {
			width: 8px;
			height: 8px;
			padding: 0;
			border-radius: 4px;
			background: hsl(var(--hue) 30% 85% / 0.25);
		}
		.dots button.on {
			width: 24px;
			background: hsl(var(--hue) 80% 72%);
		}
		.list {
			display: grid;
			gap: 10px;
			width: 100%;
			margin-top: 6px;
		}
		.option {
			display: flex;
			align-items: center;
			gap: 16px;
			padding: 14px 18px;
			border-radius: 12px;
			text-align: left;
			background: hsl(var(--hue) 30% 85% / 0.06);
		}
		.option:hover {
			background: hsl(var(--hue) 30% 85% / 0.1);
		}
		.option b,
		.option small {
			display: block;
		}
		.option small {
			color: #a7a9b6;
			font-size: 14px;
		}
		.box {
			display: grid;
			place-items: center;
			flex: none;
			width: 22px;
			height: 22px;
			border-radius: 6px;
			box-shadow: inset 0 0 0 1.5px #ffffff66;
			color: transparent;
		}
		.option.on .box {
			background: hsl(var(--hue) 80% 72%);
			box-shadow: none;
			color: hsl(var(--hue) 45% 10%);
		}
		.worlds {
			display: flex;
			flex-wrap: wrap;
			justify-content: center;
			align-items: flex-start;
			gap: 18px;
			margin: 14px 0 4px;
		}
		.world {
			position: relative;
			display: grid;
			justify-items: center;
			gap: 10px;
			width: 132px;
		}
		.planet-pick {
			padding: 6px;
			border-radius: 50%;
		}
		.planet-pick:hover {
			filter: brightness(1.12);
		}
		.planet-pick svg {
			width: 84px;
			height: 84px;
			stroke: none;
		}
		.world input {
			width: 120px;
			height: 34px;
			box-sizing: border-box;
			padding: 0 10px;
			font: inherit;
			color: inherit;
			text-align: center;
			border: 0;
			border-radius: 8px;
			background: hsl(var(--hue) 30% 85% / 0.08);
			outline: none;
		}
		.world input:focus {
			box-shadow: inset 0 0 0 1.5px hsl(var(--hue) 85% 72%);
		}
		.hues {
			display: flex;
			gap: 6px;
		}
		.hue {
			width: 14px;
			height: 14px;
			padding: 0;
			border-radius: 50%;
			background: hsl(var(--s) 75% 62%);
		}
		.hue.on {
			box-shadow:
				0 0 0 2px hsl(var(--hue) 40% 6%),
				0 0 0 3.5px hsl(var(--s) 85% 75%);
		}
		.remove {
			position: absolute;
			top: 0;
			right: 6px;
			display: grid;
			place-items: center;
			width: 26px;
			height: 26px;
			padding: 0;
			border-radius: 50%;
			color: #b9bbc7;
			opacity: 0;
		}
		.world:hover .remove,
		.remove:focus-visible {
			opacity: 1;
		}
		.remove:hover {
			background: hsl(var(--hue) 30% 85% / 0.12);
		}
		.add {
			width: 84px;
			height: 84px;
			margin: 6px 24px;
			border-radius: 50%;
			font-size: 30px;
			color: #b9bbc7;
			box-shadow: inset 0 0 0 1.5px #ffffff44;
		}
		.add:hover {
			color: #fff;
			box-shadow: inset 0 0 0 1.5px #ffffff88;
		}
		.keys {
			display: grid;
			gap: 12px;
			width: 100%;
			margin-top: 8px;
		}
		.key {
			display: flex;
			align-items: center;
			gap: 18px;
			padding: 14px 20px;
			border-radius: 12px;
			text-align: left;
			background: hsl(var(--hue) 30% 85% / 0.06);
		}
		.key.done {
			box-shadow: inset 0 0 0 1.5px hsl(150 60% 60% / 0.7);
		}
		.key > span:first-child {
			display: flex;
			gap: 6px;
			min-width: 140px;
		}
		kbd {
			display: inline-grid;
			place-items: center;
			min-width: 40px;
			height: 34px;
			padding: 0 10px;
			box-sizing: border-box;
			font: 600 14px system-ui;
			border-radius: 8px;
			box-shadow: inset 0 0 0 1px #ffffff44;
			border-bottom: 3px solid #ffffff22;
		}
		em {
			margin-left: 8px;
			font-style: normal;
			font-size: 13px;
			color: hsl(var(--hue) 85% 76%);
		}
		.check {
			margin-left: 8px;
			font-size: 13px;
			color: hsl(150 65% 70%);
		}
		:focus-visible {
			outline: 2px solid hsl(var(--hue) 85% 72%);
			outline-offset: 2px;
		}
		@media (prefers-reduced-motion: no-preference) {
			.step {
				animation: step-in 360ms cubic-bezier(0.2, 0, 0, 1);
			}
			@keyframes step-in {
				from {
					opacity: 0;
					translate: 0 14px;
				}
			}
		}
	`;
}

customElements.define("loka-onboarding", LokaOnboarding);
