import { css, html, LitElement } from "lit";
import { planet, SPACE_HUES } from "../sidebar/planet";
import { PLANET_KINDS, type PlanetKind, type SpaceLook } from "../sidebar/sidebar.logic";

const PLANET_NAMES: Record<PlanetKind, string> = {
	banded: "Gas giant",
	ringed: "Ringed",
	cratered: "Moon",
	ocean: "Ocean world",
};

/**
 * The dialog for a new space or for changing one: name, color and planet, with a live preview.
 * Sends `loka-preview` (the hue) while choosing, so the window's sky can follow, then `loka-save` or `loka-close`.
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
		if (!this.draft) this.draft = this.look;
	}

	private change(next: Partial<SpaceLook>) {
		this.draft = { ...this.draft, ...next };
		this.dispatchEvent(new CustomEvent("loka-preview", { detail: this.draft.hue, bubbles: true, composed: true }));
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
		const { name, hue, planet: kind } = this.draft;
		return html`
			<div class="scrim" @click=${() => this.close()}></div>
			<form
				role="dialog"
				aria-label=${this.mode === "create" ? "New space" : `Edit ${this.look.name}`}
				style="--h: ${hue}"
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
			background: #0008;
		}
		form {
			position: relative;
			width: 380px;
			box-sizing: border-box;
			padding: 28px 28px 22px;
			border-radius: 18px;
			background: hsl(var(--h) 24% 11% / 0.97);
			box-shadow:
				0 0 0 1px hsl(var(--h) 50% 80% / 0.14),
				0 30px 80px #000c;
			color: #ececf1;
			font: 14px/1.4 system-ui, "Segoe UI", sans-serif;
		}
		.preview {
			display: grid;
			place-items: center;
			height: 128px;
			margin: -8px 0 6px;
		}
		h2 {
			margin: 0 0 18px;
			font-size: 20px;
			font-weight: 650;
			text-align: center;
		}
		.field {
			display: grid;
			gap: 6px;
			margin-bottom: 18px;
		}
		.field span,
		legend {
			font-size: 13px;
			color: #b4b6c2;
		}
		input {
			height: 40px;
			padding: 0 12px;
			font: inherit;
			font-size: 15px;
			color: inherit;
			border: 0;
			border-radius: 10px;
			background: hsl(var(--h) 30% 85% / 0.08);
			box-shadow: inset 0 0 0 1px hsl(var(--h) 30% 85% / 0.14);
			outline: none;
		}
		input:focus {
			box-shadow: inset 0 0 0 1.5px hsl(var(--h) 85% 72%);
		}
		fieldset {
			border: 0;
			padding: 0;
			margin: 0 0 18px;
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
		}
		.swatches {
			display: flex;
			gap: 10px;
		}
		.swatch {
			width: 28px;
			height: 28px;
			border-radius: 50%;
			background: hsl(var(--s) 75% 62%);
		}
		.swatch.on {
			box-shadow:
				0 0 0 2.5px hsl(var(--h) 24% 11%),
				0 0 0 4.5px hsl(var(--s) 85% 75%);
		}
		.kinds {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 8px;
		}
		.kind {
			display: grid;
			justify-items: center;
			gap: 8px;
			padding: 12px 4px 10px;
			border-radius: 12px;
			font-size: 12px;
			color: #c9cad4;
		}
		.kind:hover {
			background: hsl(var(--h) 30% 85% / 0.06);
		}
		.kind.on {
			background: hsl(var(--h) 40% 85% / 0.12);
			box-shadow: inset 0 0 0 1.5px hsl(var(--h) 85% 72% / 0.8);
			color: #fff;
		}
		.actions {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
			margin-top: 6px;
		}
		.actions button {
			height: 38px;
			padding: 0 16px;
			border-radius: 10px;
			font-weight: 600;
		}
		.quiet:hover {
			background: hsl(var(--h) 30% 85% / 0.08);
		}
		.primary {
			background: hsl(var(--h) 80% 72%);
			color: hsl(var(--h) 45% 10%);
		}
		.primary:disabled {
			opacity: 0.45;
		}
		:focus-visible {
			outline: 2px solid hsl(var(--h) 85% 72%);
			outline-offset: 2px;
		}
	`;
}

customElements.define("loka-space-editor", LokaSpaceEditor);
