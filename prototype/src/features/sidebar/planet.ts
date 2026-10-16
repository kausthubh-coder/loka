import { html, nothing, svg, type TemplateResult } from "lit";
import type { PlanetKind } from "./sidebar.logic";

/**
 * A space's planet, drawn in a 100x100 box (body radius 46) and lit from the top left.
 * `horizon` is the large planet at the bottom of the sidebar, of which only the top fifth shows. There the surface is
 * squeezed into that cap, the way detail foreshortens near a planet's edge, and a ring is seen from just above its
 * plane: only its far side shows, as an arc behind the planet. IDs repeat for the same kind and hue, which is fine:
 * their contents are identical.
 */
export function planet(kind: PlanetKind, hue: number, size: number, horizon = false): TemplateResult {
	const id = `pl-${kind}-${hue}${horizon ? "-h" : ""}`;
	const ring = (front: boolean) => {
		if (kind !== "ringed") return null;
		if (horizon) {
			return front
				? null
				: svg`<g clip-path="url(#${id}-back)">
						<ellipse cx="50" cy="50" rx="78" ry="53" fill="none" stroke="hsl(${hue + 30} 70% 82% / 0.6)" stroke-width="2.4" />
						<ellipse cx="50" cy="50" rx="72" ry="49.5" fill="none" stroke="hsl(${hue + 30} 60% 75% / 0.4)" stroke-width="1" />
					</g>`;
		}
		return svg`<g transform="rotate(-16 50 50)" clip-path=${front ? `url(#${id}-front)` : nothing}>
				<ellipse cx="50" cy="50" rx="76" ry="15" fill="none" stroke="hsl(${hue + 30} 70% 82% / 0.7)" stroke-width="5" />
				<ellipse cx="50" cy="50" rx="66" ry="13" fill="none" stroke="hsl(${hue + 30} 60% 75% / 0.45)" stroke-width="2" />
			</g>`;
	};

	const defs = svg`<defs>
			<clipPath id="${id}-body"><circle cx="50" cy="50" r="46" /></clipPath>
			<clipPath id="${id}-front" clipPathUnits="userSpaceOnUse"><rect x="-60" y="50" width="220" height="120" /></clipPath>
			<clipPath id="${id}-back" clipPathUnits="userSpaceOnUse"><rect x="-60" y="-60" width="220" height="110" /></clipPath>
			<radialGradient id="${id}-lit" cx="0.35" cy="0.28" r="0.85">
				<stop offset="0" stop-color="hsl(${hue} 90% 82%)" />
				<stop offset="0.38" stop-color="hsl(${hue} 62% 55%)" />
				<stop offset="1" stop-color="hsl(${hue} 55% 18%)" />
			</radialGradient>
			<radialGradient id="${id}-shade" cx="0.3" cy="0.24" r="0.95">
				<stop offset="0.5" stop-color="#000" stop-opacity="0" />
				<stop offset="1" stop-color="#000" stop-opacity="0.7" />
			</radialGradient>
		</defs>`;

	if (horizon) {
		// Three layers so the planet can turn without repainting: the lit body (and the ring behind it), its surface
		// on a strip twice as wide that slides sideways under a round clip (`.turn`, a transform the compositor runs: on
		// an HTML box, since Chrome runs an SVG element's transform animation on the main thread, every frame),
		// and the shading and rim on top, which stay put like the light does.
		const box = `position: absolute; inset: 0; width: 100%; height: 100%; stroke: none; fill: none`;
		return html`<span class="planet-h" style="position: relative; display: block; width: ${size}px; height: ${size}px" aria-hidden="true">
			<svg class="planet" style=${box} viewBox="0 0 100 100" overflow="visible">
				${defs}${ring(false)}
				<circle cx="50" cy="50" r="46" fill="url(#${id}-lit)" />
			</svg>
			<span style="position: absolute; left: 4%; top: 4%; width: 92%; height: 92%; border-radius: 50%; overflow: hidden">
				<span class="turn" style="display: block; width: 200%; height: 100%">
					<svg style="display: block; width: 100%; height: 100%; stroke: none" viewBox="4 4 184 92">
						<g transform="translate(0 4) scale(1 0.2) translate(0 -4)">${horizonSurface(kind, hue)}</g>
					</svg>
				</span>
			</span>
			<svg style=${box} viewBox="0 0 100 100">
				<defs>
					<radialGradient id="${id}-shade-h" cx="0.3" cy="0.24" r="0.95">
						<stop offset="0.5" stop-color="#000" stop-opacity="0" />
						<stop offset="1" stop-color="#000" stop-opacity="0.7" />
					</radialGradient>
				</defs>
				<circle cx="50" cy="50" r="46" fill="url(#${id}-shade-h)" />
				<circle cx="50" cy="50" r="45.5" fill="none" stroke="hsl(${hue} 90% 88% / 0.3)" stroke-width="1" />
			</svg>
		</span>`;
	}

	// Inline size and stroke, so a component's own icon styles (svg { width: 16px; stroke: ... }) can't shrink or outline it.
	return html`<svg
		class="planet"
		style="width: ${size}px; height: ${size}px; stroke: none; fill: none"
		viewBox="0 0 100 100"
		overflow="visible"
		aria-hidden="true"
	>
		${defs}
		${ring(false)}
		<circle cx="50" cy="50" r="46" fill="url(#${id}-lit)" />
		<g clip-path="url(#${id}-body)">${surface(kind, hue)}</g>
		<circle cx="50" cy="50" r="46" fill="url(#${id}-shade)" />
		<circle cx="50" cy="50" r="45.5" fill="none" stroke="hsl(${hue} 90% 88% / 0.3)" stroke-width="1" />
		${ring(true)}
	</svg>`;
}

function surface(kind: PlanetKind, hue: number): TemplateResult {
	if (kind === "banded" || kind === "ringed") {
		const light = `hsl(${hue + 20} 75% 80% / 0.32)`;
		const dark = `hsl(${hue - 15} 60% 28% / 0.38)`;
		return svg`<g transform="rotate(-14 50 50)">
			<rect x="-10" y="18" width="120" height="6" fill=${light} />
			<rect x="-10" y="31" width="120" height="9" fill=${dark} />
			<rect x="-10" y="47" width="120" height="5" fill=${light} />
			<rect x="-10" y="58" width="120" height="11" fill=${dark} />
			<rect x="-10" y="76" width="120" height="6" fill=${light} />
			${kind === "banded" ? svg`<ellipse cx="64" cy="62" rx="8" ry="4" fill="hsl(${hue + 35} 85% 82% / 0.55)" />` : null}
		</g>`;
	}
	if (kind === "cratered") {
		const craters: [number, number, number][] = [
			[32, 38, 8],
			[61, 28, 5],
			[62, 61, 10],
			[38, 70, 4.5],
			[78, 46, 3.5],
			[22, 58, 3],
		];
		return svg`${craters.map(
			([x, y, r]) =>
				svg`<circle cx=${x} cy=${y} r=${r} fill="hsl(${hue} 45% 22% / 0.42)" stroke="hsl(${hue} 85% 86% / 0.28)" stroke-width="1" />`,
		)}`;
	}
	// Ocean world: the space's color is the sea, with land in a neighbouring hue and a few clouds.
	const land = `hsl(${hue + 70} 45% 46% / 0.75)`;
	return svg`
		<path d="M18 36 C26 24 44 26 46 38 S36 58 26 54 S12 46 18 36 Z" fill=${land} />
		<path d="M57 55 C65 47 82 51 80 63 S66 80 58 72 S51 62 57 55 Z" fill=${land} />
		<path d="M60 18 C66 14 77 19 72 27 S59 29 60 18 Z" fill=${land} />
		<g transform="rotate(-10 50 50)" fill="#fff" fill-opacity="0.5">
			<ellipse cx="42" cy="30" rx="17" ry="2.6" />
			<ellipse cx="66" cy="47" rx="12" ry="2.2" />
			<ellipse cx="34" cy="65" rx="15" ry="2.4" />
		</g>`;
}

/**
 * The horizon planet's surface, on a strip two bodies wide (x 4 to 188) that repeats every 92 units, so sliding it
 * left by half its width brings it back where it started. Bands run level and span the whole strip once (drawn
 * twice they'd overlap and darken at the seam); spots, craters and land are drawn in both halves.
 */
function horizonSurface(kind: PlanetKind, hue: number): TemplateResult {
	const twice = (part: TemplateResult) => svg`${part}<g transform="translate(92 0)">${part}</g>`;
	if (kind === "banded" || kind === "ringed") {
		const light = `hsl(${hue + 20} 75% 80% / 0.32)`;
		const dark = `hsl(${hue - 15} 60% 28% / 0.38)`;
		const spot =
			kind === "banded"
				? svg`<ellipse cx="64" cy="62" rx="8" ry="4" fill="hsl(${hue + 35} 85% 82% / 0.55)" />
					<ellipse cx="24" cy="36" rx="5" ry="2.5" fill="hsl(${hue + 35} 85% 82% / 0.3)" />`
				: svg`<ellipse cx="40" cy="64" rx="7" ry="3" fill="hsl(${hue - 15} 60% 28% / 0.4)" />`;
		return svg`
			<rect x="4" y="18" width="184" height="6" fill=${light} />
			<rect x="4" y="31" width="184" height="9" fill=${dark} />
			<rect x="4" y="47" width="184" height="5" fill=${light} />
			<rect x="4" y="58" width="184" height="11" fill=${dark} />
			<rect x="4" y="76" width="184" height="6" fill=${light} />
			${twice(spot)}`;
	}
	return twice(surface(kind, hue));
}

/** The colors a space can take, in the order new spaces get them. */
export const SPACE_HUES = [200, 30, 150, 330, 260, 175, 0, 90];
