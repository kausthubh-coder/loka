import { css, html, svg, type TemplateResult } from "lit";

// Loka's night sky, shared by the prototype's window and the real browser's sidebar and new tab page.
// Put skyLayer() first inside an element with `position: relative; isolation: isolate` and `--hue` set, and add
// skyStyles to that component's styles.

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

/** The sky behind everything: tinted glows, a faint band of light, and the star field. */
export function skyLayer(): TemplateResult {
	return html`<div class="sky" aria-hidden="true">
		<svg viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice">
			${STARS.map((s) => svg`<circle cx=${s.x} cy=${s.y} r=${s.r} fill=${s.fill} opacity=${s.opacity} />`)}
		</svg>
	</div>`;
}

export const skyStyles = css`
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
`;
