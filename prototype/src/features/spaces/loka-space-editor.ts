import { css, html, LitElement } from "lit";
import { planet, SPACE_HUES } from "../sidebar/planet";
import {
	PLANET_KINDS,
	type PlanetKind,
	SPACE_SCHEMES,
	type SpaceLook,
	type SpaceScheme,
} from "../sidebar/sidebar.logic";

const PLANET_NAMES: Record<PlanetKind, string> = {
	banded: "Gas giant",
	ringed: "Ringed",
	cratered: "Moon",
	ocean: "Ocean world",
};

const SCHEME_NAMES: Record<SpaceScheme, string> = { light: "Light", dark: "Dark", system: "System" };

const SCHEME_ICONS = {
	light: html`<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></svg>`,
	dark: html`<svg viewBox="0 0 16 16"><path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z" /></svg>`,
	system: html`<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="8.5" rx="1.5" /><path d="M6 14h4M8 11.5V14" /><path class="fill" d="M8 4.5v5.5a2.75 2.75 0 0 0 0-5.5z" /></svg>`,
};

/** What the window previews while the editor is open: the hue, and light or dark when one is being chosen. */
export interface LookPreview {
	hue: number;
	scheme?: SpaceScheme;
}

/**
 * The dialog for a new space or for changing one: name, color, planet and light or dark, with a live preview.
 * Sends `loka-preview` (a LookPreview) while choosing, so the window can follow, then `loka-save` or `loka-close`.
 */
export class LokaSpaceEditor extends LitElement {
	static override properties = {
		look: { attribute: false },
		mode: {},
		draft: { state: true },
	};

	/** The look to start from. Read once: the window re-sends it on every render, which must not undo typing. */
	declare look: SpaceLook;
	declare mode: "create" | "edit";
	declare draft: SpaceLook;

	protected override willUpdate() {
		if (!this.draft) this.draft = { ...this.look, scheme: this.look.scheme ?? "system" };
	}

	private change(next: Partial<SpaceLook>) {
		this.draft = { ...this.draft, ...next };
		const preview: LookPreview = { hue: this.draft.hue, scheme: this.draft.scheme };
		this.dispatchEvent(new CustomEvent("loka-preview", { detail: preview, bubbles: true, composed: true }));
	}

	private close() {
		this.dispatchEvent(new CustomEvent("loka-close", { bubbles: true, composed: true }));
	}

	private save(e: Event) {
		e.preventDefault();
		if (!this.draft.name.trim()) return;
		this.dispatchEvent(new CustomEvent("loka-save", { detail: this.draft, bubbles: true, composed: true }));
	}

	protected override firstUpdated() {
		const input = this.renderRoot.querySelector("input");
		input?.focus();
		input?.select();
	}

	override render() {
		const { name, hue, planet: kind, scheme = "system" } = this.draft;
		return html`
			<div class="scrim" @click=${() => this.close()}></div>
			<form
				role="dialog"
				aria-label=${this.mode === "create" ? "New space" : `Edit ${this.look.name}`}
				@submit=${this.save}
				@keydown=${(e: KeyboardEvent) => e.key === "Escape" && this.close()}
			>
				<div class="preview">${planet(kind, hue, 112)}</div>
				<h2>${this.mode === "create" ? "New space" : "Edit space"}</h2>

				<label class="field">
					<span>Name</span>
					<input
						.value=${name}
						maxlength="32"
						aria-label="Space name"
						@input=${(e: Event) => this.change({ name: (e.target as HTMLInputElement).value })}
					/>
				</label>

				<fieldset>
					<legend>Color</legend>
					<div class="swatches">
						${SPACE_HUES.map(
							(h) => html`<button
								type="button"
								class="swatch ${h === hue ? "on" : ""}"
								style="--s: ${h}"
								aria-label="Hue ${h}"
								aria-pressed=${h === hue}
								@click=${() => this.change({ hue: h })}
							></button>`,
						)}
					</div>
				</fieldset>

				<fieldset>
					<legend>Planet</legend>
					<div class="kinds">
						${PLANET_KINDS.map(
							(k) => html`<button
								type="button"
								class="kind ${k === kind ? "on" : ""}"
								aria-pressed=${k === kind}
								@click=${() => this.change({ planet: k })}
							>
								${planet(k, hue, 40)}
								<span>${PLANET_NAMES[k]}</span>
							</button>`,
						)}
					</div>
				</fieldset>

				<fieldset>
					<legend>Light or dark</legend>
					<div class="schemes" role="radiogroup" aria-label="Light or dark">
						${SPACE_SCHEMES.map(
							(sc) => html`<button
								type="button"
								role="radio"
								class="scheme ${sc === scheme ? "on" : ""}"
								aria-checked=${sc === scheme}
								@click=${() => this.change({ scheme: sc })}
							>
								${SCHEME_ICONS[sc]}<span>${SCHEME_NAMES[sc]}</span>
							</button>`,
						)}
					</div>
					<p class="hint">The browser and websites follow it while this space is showing.</p>
				</fieldset>

				<div class="actions">
					<button type="button" class="quiet" @click=${() => this.close()}>Cancel</button>
					<button type="submit" class="primary" ?disabled=${!name.trim()}>
						${this.mode === "create" ? "Create space" : "Save"}
					</button>
				</div>
			</form>
		`;
	}

	static override styles = css`
		:host {
			position: absolute;
			inset: 0;
			z-index: 30;
			display: grid;
			place-items: center;
		}
		.scrim {
			position: absolute;
			inset: 0;
			background: var(--loka-scrim);
		}
		form {
			position: relative;
			/* Fits the browser's 300px sidebar as well as a full window. */
			width: min(380px, calc(100vw - 24px));
			max-height: calc(100vh - 24px);
			overflow-y: auto;
			box-sizing: border-box;
			padding: 24px 24px 20px;
			border-radius: 18px;
			background: var(--loka-dialog);
			box-shadow: var(--loka-dialog-edge);
			color: var(--loka-ink);
			font: 14px/1.4 system-ui, "Segoe UI", sans-serif;
		}
		.preview {
			display: grid;
			place-items: center;
			height: 120px;
			margin: -6px 0 4px;
		}
		h2 {
			margin: 0 0 16px;
			font-size: 20px;
			font-weight: 650;
			letter-spacing: -0.01em;
			text-align: center;
		}
		.field {
			display: grid;
			gap: 6px;
			margin-bottom: 16px;
		}
		.field span,
		legend {
			font-size: 13px;
			color: var(--loka-ink-2);
		}
		input {
			height: 40px;
			padding: 0 12px;
			font: inherit;
			font-size: 15px;
			color: inherit;
			border: 0;
			border-radius: 10px;
			background: var(--loka-fill);
			box-shadow: inset 0 0 0 1px var(--loka-line);
			outline: none;
		}
		/* One ring: the field's own edge turns the accent, with a soft halo, instead of an outline around it. */
		input:focus {
			box-shadow:
				inset 0 0 0 1.5px var(--loka-accent),
				0 0 0 3px color-mix(in srgb, var(--loka-accent) 22%, transparent);
		}
		input:focus-visible {
			outline: none;
		}
		fieldset {
			border: 0;
			padding: 0;
			margin: 0 0 16px;
			min-width: 0;
		}
		legend {
			padding: 0;
			margin-bottom: 8px;
		}
		button {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
			cursor: default;
		}
		.swatches {
			display: flex;
			flex-wrap: wrap;
			gap: 10px;
		}
		.swatch {
			position: relative;
			width: 28px;
			height: 28px;
			border-radius: 50%;
			background: hsl(var(--s) 75% 62%);
			box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
		}
		.swatch::after {
			content: "";
			position: absolute;
			inset: -3px;
			border-radius: 50%;
		}
		.swatch:not(.on):hover {
			box-shadow:
				0 0 0 2.5px var(--loka-dialog),
				0 0 0 4.5px color-mix(in srgb, hsl(var(--s) 75% 55%) 45%, transparent);
		}
		.swatch.on {
			box-shadow:
				0 0 0 2.5px var(--loka-dialog),
				0 0 0 4.5px hsl(var(--s) 75% 55%);
		}
		.kinds {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 6px;
		}
		/* Planet on top, name under it; names that wrap in a narrow sidebar still start on the same line. */
		.kind {
			display: grid;
			justify-items: center;
			align-content: start;
			gap: 8px;
			padding: 12px 2px 10px;
			border-radius: 12px;
			font-size: 12px;
			line-height: 1.25;
			text-align: center;
			color: var(--loka-ink-2);
		}
		.kind:hover,
		.scheme:hover {
			background: var(--loka-hover);
		}
		.kind.on {
			background: var(--loka-selected);
			box-shadow:
				inset 0 0 0 1.5px var(--loka-accent),
				var(--loka-selected-edge);
			color: var(--loka-ink);
		}
		/* A segmented control: one track, the chosen side raised. */
		.schemes {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 2px;
			padding: 3px;
			border-radius: 11px;
			background: var(--loka-fill);
			box-shadow: inset 0 0 0 1px var(--loka-line);
		}
		.scheme {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			height: 32px;
			border-radius: 8px;
			font-size: 13px;
			color: var(--loka-ink-2);
		}
		.scheme.on {
			background: var(--loka-selected);
			box-shadow: var(--loka-selected-edge);
			color: var(--loka-ink);
			font-weight: 600;
		}
		.scheme svg {
			width: 15px;
			height: 15px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.4;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		.scheme svg .fill {
			fill: currentColor;
			stroke: none;
		}
		.hint {
			margin: 8px 2px 0;
			font-size: 12px;
			color: var(--loka-ink-3);
			text-wrap: pretty;
		}
		.actions {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
			margin-top: 4px;
		}
		.actions button {
			height: 38px;
			padding: 0 16px;
			border-radius: 10px;
			font-weight: 600;
		}
		.quiet:hover {
			background: var(--loka-hover);
		}
		.quiet:active,
		.kind:active,
		.scheme:not(.on):active {
			background: var(--loka-fill-hover);
		}
		.primary {
			background: var(--loka-accent);
			color: var(--loka-on-accent);
		}
		.primary:hover {
			filter: brightness(1.06);
		}
		.primary:not(:disabled):active {
			filter: brightness(0.94);
		}
		.primary:disabled {
			opacity: 0.45;
			filter: none;
		}
		:focus-visible {
			outline: 2px solid var(--loka-accent);
			outline-offset: 2px;
		}
		@media (prefers-reduced-motion: no-preference) {
			.scrim {
				transition: opacity 150ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
				}
			}
			form {
				transition:
					opacity 180ms cubic-bezier(0.2, 0, 0, 1),
					transform 240ms cubic-bezier(0.2, 0, 0, 1);
				@starting-style {
					opacity: 0;
					transform: translateY(8px) scale(0.98);
				}
			}
		}
	`;
}

customElements.define("loka-space-editor", LokaSpaceEditor);
