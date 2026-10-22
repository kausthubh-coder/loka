import { css, unsafeCSS } from "lit";
import { inkCss } from "./theme.logic";

// Loka's two themes as role tokens. A window shell (the prototype's loka-app, the browser's sidebar and command bar
// pages) puts `theme-dark` or `theme-light` on its root element next to `--hue`; custom properties inherit into
// every component's shadow root, so components only ever use these names.
//
// Dark is the night sky the sidebar was designed in. Light is a day sky: the same hue as a pale atmosphere, white
// glass surfaces, ink tinted by the space, and the active row raised like a card instead of lit up. The space's hue
// stays the identity in both. Text (inkCss, theme.logic.ts) and light's accent are set by perceptual lightness
// (OKLCH), so every hue keeps its contrast.

export const themeTokens = css`
	.theme-dark {
		color-scheme: dark;
		--loka-ink: ${unsafeCSS(inkCss("dark", "ink"))};
		--loka-ink-2: ${unsafeCSS(inkCss("dark", "ink-2"))};
		--loka-ink-3: ${unsafeCSS(inkCss("dark", "ink-3"))};
		--loka-hover: hsl(var(--hue) 30% 80% / 0.08);
		--loka-selected: hsl(var(--hue) 40% 85% / 0.16);
		--loka-selected-edge: 0 0 0 0 transparent;
		--loka-fill: hsl(var(--hue) 30% 85% / 0.07);
		--loka-fill-hover: hsl(var(--hue) 30% 85% / 0.12);
		/* Pressed: the ink itself, faintly, so a press shows on any surface in either scheme. */
		--loka-pressed: color-mix(in srgb, var(--loka-ink) 12%, transparent);
		/* The sky's color at the bottom of the window (sky.ts), for what fades into it there. */
		--loka-sky-floor: hsl(calc(var(--hue) - 20) 40% 5%);
		--loka-line: hsl(var(--hue) 30% 85% / 0.12);
		--loka-accent: hsl(var(--hue) 85% 72%);
		--loka-accent-ink: hsl(var(--hue) 85% 76%);
		--loka-on-accent: hsl(var(--hue) 45% 10%);
		--loka-surface: hsl(var(--hue) 22% 13% / 0.97);
		--loka-surface-edge: 0 0 0 1px hsl(var(--hue) 30% 85% / 0.12), 0 16px 40px #0009;
		--loka-dialog: hsl(var(--hue) 24% 11% / 0.97);
		--loka-dialog-edge: 0 0 0 1px hsl(var(--hue) 50% 80% / 0.16), 0 28px 72px #000b;
		--loka-scrim: #0008;
		--loka-danger: #ff9b8f;
		--loka-on-danger: hsl(5 70% 12%);
		--loka-label-shadow: 0 1px 3px #000a, 0 0 10px #0006;
	}
	.theme-light {
		color-scheme: light;
		--loka-ink: ${unsafeCSS(inkCss("light", "ink"))};
		--loka-ink-2: ${unsafeCSS(inkCss("light", "ink-2"))};
		--loka-ink-3: ${unsafeCSS(inkCss("light", "ink-3"))};
		--loka-hover: hsl(var(--hue) 50% 25% / 0.07);
		--loka-selected: hsl(0 0% 100% / 0.8);
		--loka-selected-edge: 0 1px 2px hsl(var(--hue) 50% 20% / 0.14), 0 0 0 0.5px hsl(var(--hue) 40% 20% / 0.1);
		--loka-fill: hsl(0 0% 100% / 0.42);
		--loka-fill-hover: hsl(0 0% 100% / 0.66);
		--loka-pressed: color-mix(in srgb, var(--loka-ink) 12%, transparent);
		--loka-sky-floor: hsl(calc(var(--hue) - 20) 48% 82%);
		--loka-line: hsl(var(--hue) 40% 20% / 0.13);
		--loka-accent: oklch(from hsl(var(--hue) 80% 50%) 0.52 0.15 h);
		--loka-accent-ink: oklch(from hsl(var(--hue) 80% 50%) 0.45 0.14 h);
		--loka-on-accent: #fff;
		--loka-surface: hsl(var(--hue) 45% 98.5% / 0.97);
		--loka-surface-edge: 0 0 0 1px hsl(var(--hue) 40% 20% / 0.1), 0 14px 36px hsl(var(--hue) 50% 20% / 0.18);
		--loka-dialog: hsl(var(--hue) 45% 98.5% / 0.98);
		--loka-dialog-edge: 0 0 0 1px hsl(var(--hue) 40% 20% / 0.1), 0 28px 72px hsl(var(--hue) 50% 18% / 0.28);
		--loka-scrim: hsl(var(--hue) 40% 12% / 0.26);
		--loka-danger: #b3261e;
		--loka-on-danger: #fff;
		--loka-label-shadow: 0 1px 2px hsl(var(--hue) 60% 15% / 0.7), 0 0 12px hsl(var(--hue) 60% 15% / 0.45);
	}
	.theme-dark,
	.theme-light {
		color: var(--loka-ink);
	}
`;

// Lists fade at an edge while there's more to scroll past it, with a scroll-driven animation of these two lengths.
// @property is ignored inside shadow roots, so they're registered here, once per page, which lets them animate.
if (typeof CSS !== "undefined" && "registerProperty" in CSS) {
	for (const name of ["--fade-top", "--fade-bottom"]) {
		try {
			CSS.registerProperty({ name, syntax: "<length>", inherits: false, initialValue: "0px" });
		} catch {
			// Already registered by another module on this page.
		}
	}
}

/** The motion every component shares: ease-out for what people start, ease-in for what leaves. */
export const EASE_OUT = "cubic-bezier(0.2, 0, 0, 1)";
export const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

export function reducedMotion(): boolean {
	return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Plays an element's exit before it's taken away: a quick fade with a slight shrink (just the fade with reduced
 * motion). Resolves when it's done, at once if the element is already gone.
 */
export async function leave(el: Element | null | undefined, duration = 110): Promise<void> {
	if (!el?.isConnected) return;
	const to = reducedMotion() ? { opacity: 0 } : { opacity: 0, transform: "scale(0.98)" };
	await el.animate([{ opacity: 1 }, to], { duration, easing: EASE_IN, fill: "forwards" }).finished.catch(() => {});
}
