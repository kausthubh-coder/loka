// The prototype's planets (prototype/src/features/sidebar/planet.ts), as React SVG: a 100x100 box, body radius 46,
// lit from the top left. Kept to the same numbers so the site draws the same worlds as the browser.

export type PlanetKind = "ringed" | "banded" | "cratered" | "ocean";

/**
 * `horizon` is the big planet at the bottom of the sidebar, of which only the top cap shows: the surface is squeezed
 * into that cap, and a ring, seen from just above its plane, shows only its far side as an arc behind the planet.
 */
export function Planet({
	kind,
	hue,
	size,
	horizon = false,
}: {
	kind: PlanetKind;
	hue: number;
	size: number;
	horizon?: boolean;
}) {
	const id = `pl-${kind}-${hue}${horizon ? "-h" : ""}`;
	const ring = (front: boolean) => {
		if (kind !== "ringed") return null;
		if (horizon) {
			return front ? null : (
				<g clipPath={`url(#${id}-back)`}>
					<ellipse
						cx="50"
						cy="50"
						rx="78"
						ry="53"
						fill="none"
						stroke={`hsl(${hue + 30} 70% 82% / 0.6)`}
						strokeWidth="2.4"
					/>
					<ellipse
						cx="50"
						cy="50"
						rx="72"
						ry="49.5"
						fill="none"
						stroke={`hsl(${hue + 30} 60% 75% / 0.4)`}
						strokeWidth="1"
					/>
				</g>
			);
		}
		return (
			<g transform="rotate(-16 50 50)" clipPath={front ? `url(#${id}-front)` : undefined}>
				<ellipse
					cx="50"
					cy="50"
					rx="76"
					ry="15"
					fill="none"
					stroke={`hsl(${hue + 30} 70% 82% / 0.7)`}
					strokeWidth="5"
				/>
				<ellipse
					cx="50"
					cy="50"
					rx="66"
					ry="13"
					fill="none"
					stroke={`hsl(${hue + 30} 60% 75% / 0.45)`}
					strokeWidth="2"
				/>
			</g>
		);
	};

	return (
		<svg className="planet" width={size} height={size} viewBox="0 0 100 100" overflow="visible" aria-hidden="true">
			<defs>
				<clipPath id={`${id}-body`}>
					<circle cx="50" cy="50" r="46" />
				</clipPath>
				<clipPath id={`${id}-front`} clipPathUnits="userSpaceOnUse">
					<rect x="-60" y="50" width="220" height="120" />
				</clipPath>
				<clipPath id={`${id}-back`} clipPathUnits="userSpaceOnUse">
					<rect x="-60" y="-60" width="220" height="110" />
				</clipPath>
				<radialGradient id={`${id}-lit`} cx="0.35" cy="0.28" r="0.85">
					<stop offset="0" stopColor={`hsl(${hue} 90% 82%)`} />
					<stop offset="0.38" stopColor={`hsl(${hue} 62% 55%)`} />
					<stop offset="1" stopColor={`hsl(${hue} 55% 18%)`} />
				</radialGradient>
				<radialGradient id={`${id}-shade`} cx="0.3" cy="0.24" r="0.95">
					<stop offset="0.5" stopColor="#000" stopOpacity="0" />
					<stop offset="1" stopColor="#000" stopOpacity="0.7" />
				</radialGradient>
			</defs>
			{ring(false)}
			<circle cx="50" cy="50" r="46" fill={`url(#${id}-lit)`} />
			<g clipPath={`url(#${id}-body)`}>
				{horizon ? (
					<g transform="translate(0 4) scale(1 0.2) translate(0 -4)">
						<Surface kind={kind} hue={hue} />
					</g>
				) : (
					<Surface kind={kind} hue={hue} />
				)}
			</g>
			<circle cx="50" cy="50" r="46" fill={`url(#${id}-shade)`} />
			<circle cx="50" cy="50" r="45.5" fill="none" stroke={`hsl(${hue} 90% 88% / 0.3)`} strokeWidth="1" />
			{ring(true)}
		</svg>
	);
}

const CRATERS: [number, number, number][] = [
	[32, 38, 8],
	[61, 28, 5],
	[62, 61, 10],
	[38, 70, 4.5],
	[78, 46, 3.5],
	[22, 58, 3],
];

function Surface({ kind, hue }: { kind: PlanetKind; hue: number }) {
	if (kind === "banded" || kind === "ringed") {
		const light = `hsl(${hue + 20} 75% 80% / 0.32)`;
		const dark = `hsl(${hue - 15} 60% 28% / 0.38)`;
		return (
			<g transform="rotate(-14 50 50)">
				<rect x="-10" y="18" width="120" height="6" fill={light} />
				<rect x="-10" y="31" width="120" height="9" fill={dark} />
				<rect x="-10" y="47" width="120" height="5" fill={light} />
				<rect x="-10" y="58" width="120" height="11" fill={dark} />
				<rect x="-10" y="76" width="120" height="6" fill={light} />
				{kind === "banded" ? <ellipse cx="64" cy="62" rx="8" ry="4" fill={`hsl(${hue + 35} 85% 82% / 0.55)`} /> : null}
			</g>
		);
	}
	if (kind === "cratered") {
		return (
			<>
				{CRATERS.map(([x, y, r]) => (
					<circle
						key={`${x}-${y}`}
						cx={x}
						cy={y}
						r={r}
						fill={`hsl(${hue} 45% 22% / 0.42)`}
						stroke={`hsl(${hue} 85% 86% / 0.28)`}
						strokeWidth="1"
					/>
				))}
			</>
		);
	}
	// Ocean world: the space's color is the sea, with land in a neighbouring hue and a few clouds.
	const land = `hsl(${hue + 70} 45% 46% / 0.75)`;
	return (
		<>
			<path d="M18 36 C26 24 44 26 46 38 S36 58 26 54 S12 46 18 36 Z" fill={land} />
			<path d="M57 55 C65 47 82 51 80 63 S66 80 58 72 S51 62 57 55 Z" fill={land} />
			<path d="M60 18 C66 14 77 19 72 27 S59 29 60 18 Z" fill={land} />
			<g transform="rotate(-10 50 50)" fill="#fff" fillOpacity="0.5">
				<ellipse cx="42" cy="30" rx="17" ry="2.6" />
				<ellipse cx="66" cy="47" rx="12" ry="2.2" />
				<ellipse cx="34" cy="65" rx="15" ry="2.4" />
			</g>
		</>
	);
}

/**
 * The mark from the look report: a lit planet and its moon. Its colors come from `--hue` in CSS, so it takes the
 * color of the space the page is showing.
 */
export function Mark({ size }: { size: number }) {
	return (
		<svg className="mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
			<clipPath id={`mark-disk-${size}`}>
				<circle cx="30" cy="34" r="25" />
			</clipPath>
			<circle cx="30" cy="34" r="25" fill="var(--mark-shade)" />
			<circle cx="19" cy="24" r="31" fill="var(--mark-lit)" clipPath={`url(#mark-disk-${size})`} />
			<circle cx="55" cy="10" r="4.5" fill="var(--mark-lit)" />
		</svg>
	);
}
