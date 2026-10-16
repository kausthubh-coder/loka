import { css, html, type TemplateResult } from "lit";
import { ref } from "lit/directives/ref.js";
import type { Scheme } from "./theme.logic";

// Loka's night sky, shared by the prototype's window and the real browser's sidebar and new tab page.
// Put skyLayer() first inside an element with `position: relative; isolation: isolate` and `--hue` set, and add
// skyStyles to that component's styles. Call skyTurn() when the space changes.
//
// Everything that moves is a transform or opacity on a layer painted once, so the compositor runs it and a busy
// page (or a scrolling tab list) can't make it stutter: three star layers drift at different speeds for depth, the
// nebula breathes, and now and then a shooting star crosses. With reduced motion the sky holds still.
//
// In a light space it's the day sky instead: the space's hue as a pale atmosphere with soft clouds and the sun's
// glow at the top left, where the planets are lit from. The stars are gone, as they are by day.

/** One star layer: a seeded tile (the same sky every launch) that repeats, drawn once as an SVG image. */
function starTile(seed: number, width: number, height: number, count: number, size: [number, number]): string {
	let s = seed;
	const rand = () => {
		s = (s * 16807) % 2147483647;
		return s / 2147483647;
	};
	const stars = Array.from({ length: count }, () => {
		const r = (size[0] + rand() * (size[1] - size[0])).toFixed(2);
		const fill = rand() > 0.8 ? "hsl(200 90% 88%)" : "#fff";
		const opacity = (0.25 + rand() * 0.65).toFixed(2);
		return `<circle cx="${(rand() * width).toFixed(1)}" cy="${(rand() * height).toFixed(1)}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
	});
	const image = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${stars.join("")}</svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(image)}")`;
}

// Far: many faint pinpricks, slowest. Near: a few brighter stars, fastest. Tile widths match the drift keyframes.
const FAR = starTile(7919, 480, 320, 70, [0.3, 0.7]);
const MID = starTile(104729, 640, 420, 34, [0.5, 1]);
const NEAR = starTile(1299709, 820, 540, 12, [0.9, 1.6]);

const skies = new Set<HTMLElement>();
if (typeof document !== "undefined") {
	// Hidden pages don't draw, but say so anyway: nothing in the sky keeps running behind another tab.
	document.addEventListener("visibilitychange", () => {
		for (const sky of skies) sky.classList.toggle("paused", document.hidden);
	});
}

function track(el: Element | undefined) {
	if (el instanceof HTMLElement) {
		skies.add(el);
		el.classList.toggle("paused", document.hidden);
	}
	// Lit calls back with undefined when the sky leaves the page; drop skies that are gone.
	for (const sky of skies) if (!sky.isConnected) skies.delete(sky);
}

/**
 * The sky behind everything: the deep ground, a nebula in the space's color, three star layers, shooting stars.
 * It takes the hue itself rather than inheriting the window's animated --hue: animating a hue number from blue to
 * orange passes through green and yellow, which on the whole sky reads as a rainbow. skyTurn() crossfades instead.
 */
export function skyLayer(hue: number, scheme: Scheme): TemplateResult {
	return html`<div class="sky ${scheme}" aria-hidden="true" style="--hue: ${hue}" ${ref(track)}>
		<div class="nebula"></div>
		<div class="sweep far"><div class="stars far" style="background-image: ${FAR}"></div></div>
		<div class="sweep mid"><div class="stars mid" style="background-image: ${MID}"></div></div>
		<div class="sweep near"><div class="stars near" style="background-image: ${NEAR}"></div></div>
		<i class="meteor one"></i>
		<i class="meteor two"></i>
	</div>`;
}

/**
 * Switching spaces: the old space's sky (ground and nebula, held where it was) fades away over the new one, and the
 * view turns, the star layers sweeping sideways and settling, the near ones further than the far ones, towards the
 * side the new space came from. The sweep moves a wrapper around each layer: on the layer itself, beside its drift,
 * Chrome would run both on the main thread. With reduced motion only the fade happens.
 */
export function skyTurn(root: ParentNode, forward: boolean, fromHue: number, fromScheme: Scheme) {
	const sky = root.querySelector<HTMLElement>(".sky");
	const nebula = sky?.querySelector<HTMLElement>(".nebula");
	if (!sky || !nebula) return;
	const old = Object.assign(document.createElement("div"), { className: `sky-was ${fromScheme}` });
	old.style.setProperty("--hue", String(fromHue));
	const oldNebula = Object.assign(document.createElement("div"), { className: "nebula held" });
	oldNebula.style.transform = getComputedStyle(nebula).transform;
	oldNebula.style.opacity = getComputedStyle(nebula).opacity;
	old.append(oldNebula);
	nebula.after(old);
	void old
		.animate([{ opacity: 1 }, { opacity: 0 }], {
			duration: 650,
			easing: "cubic-bezier(0.4, 0, 0.6, 1)",
			// Held at 0 until it's removed, so it can't flash back for a frame.
			fill: "forwards",
		})
		.finished.then(() => old.remove());

	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const layers: [string, number][] = [
		["far", 8],
		["mid", 18],
		["near", 34],
	];
	for (const [name, distance] of layers) {
		const x = forward ? -distance : distance;
		root
			.querySelector(`.sky .sweep.${name}`)
			?.animate([{ translate: "0 0" }, { translate: `${x}px 0`, offset: 0.35 }, { translate: "0 0" }], {
				duration: 1100,
				easing: "cubic-bezier(0.2, 0, 0, 1)",
			});
	}
}

export const skyStyles = css`
		/* Night sky tinted by the active space: a deep ground, a nebula, a faint band of light, stars. */
		.sky {
			position: absolute;
			inset: 0;
			z-index: -1;
			overflow: hidden;
			pointer-events: none;
		}
		/* The space's own color as the whole sky, like Arc's sidebar: deepest at the horizon, where the planet rises. */
		.sky,
		.sky-was {
			background: linear-gradient(
				172deg,
				hsl(var(--hue) 44% 16%),
				hsl(var(--hue) 40% 9%) 55%,
				hsl(calc(var(--hue) - 20) 40% 5%)
			);
		}
		/* Day: a pale atmosphere, brightest under the sun at the top left, deepening towards the horizon. */
		.sky.light,
		.sky-was.light {
			background:
				radial-gradient(70% 45% at 6% 0%, hsl(calc(var(--hue) + 25) 100% 98%), transparent 70%),
				linear-gradient(172deg, hsl(var(--hue) 62% 93%), hsl(var(--hue) 52% 87%) 62%, hsl(calc(var(--hue) - 20) 48% 82%));
		}
		/* The space being left, fading out over the new one. */
		.sky-was {
			position: absolute;
			inset: 0;
		}
		.sky-was .nebula {
			animation: none;
		}
		/* Painted once, then only scaled and faded. Its glows follow the space's hue as it changes. */
		.nebula {
			position: absolute;
			inset: -10%;
			background:
				radial-gradient(48% 40% at 10% 6%, hsl(var(--hue) 62% 38% / 0.55), transparent 70%),
				radial-gradient(30% 22% at 32% 30%, hsl(calc(var(--hue) + 40) 60% 45% / 0.16), transparent 70%),
				radial-gradient(34% 28% at 30% 60%, hsl(calc(var(--hue) + 40) 45% 32% / 0.22), transparent 70%),
				radial-gradient(26% 40% at 72% 38%, hsl(calc(var(--hue) - 50) 50% 40% / 0.15), transparent 70%),
				radial-gradient(46% 46% at 96% 96%, hsl(calc(var(--hue) - 35) 42% 26% / 0.3), transparent 70%);
		}
		/* Clouds instead of a nebula: white drifts and faint washes of neighbouring hues. */
		.light .nebula {
			background:
				radial-gradient(40% 16% at 22% 18%, hsl(0 0% 100% / 0.75), transparent 70%),
				radial-gradient(30% 12% at 70% 32%, hsl(0 0% 100% / 0.55), transparent 70%),
				radial-gradient(46% 20% at 40% 58%, hsl(0 0% 100% / 0.4), transparent 70%),
				radial-gradient(34% 28% at 80% 70%, hsl(calc(var(--hue) + 40) 70% 85% / 0.35), transparent 70%),
				radial-gradient(40% 30% at 10% 90%, hsl(calc(var(--hue) - 35) 60% 80% / 0.3), transparent 70%);
		}
		.sky.light .stars,
		.sky.light .meteor {
			display: none;
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
		.sky.light::after {
			background: linear-gradient(118deg, transparent 38%, hsl(0 0% 100% / 0.22) 50%, transparent 62%);
		}
		.sweep {
			position: absolute;
			inset: 0;
		}
		.stars {
			position: absolute;
			top: 0;
			left: 0;
			height: 100%;
			background-repeat: repeat;
		}
		.stars.far {
			width: calc(100% + 480px);
			background-size: 480px 320px;
		}
		.stars.mid {
			width: calc(100% + 640px);
			background-size: 640px 420px;
		}
		.stars.near {
			width: calc(100% + 820px);
			background-size: 820px 540px;
		}
		.meteor {
			position: absolute;
			width: 130px;
			height: 1.5px;
			border-radius: 1px;
			background: linear-gradient(90deg, hsl(var(--hue) 80% 92% / 0.9), transparent);
			opacity: 0;
			rotate: -28deg;
			transform-origin: 0 50%;
		}
		.meteor.one {
			top: 14%;
			left: 62%;
		}
		.meteor.two {
			top: 38%;
			left: 84%;
			rotate: -20deg;
		}
		@media (prefers-reduced-motion: no-preference) {
			/* Each layer slides left by exactly one tile, so the loop has no seam. */
			/* They move a pixel at a time (steps), not every frame: at two pixels a second a smooth slide looks the
			   same, and each step is the only frame the compositor has to draw, where a smooth one draws sixty a
			   second for ever. */
			.stars.far {
				animation: drift-far 260s steps(480) infinite;
			}
			.stars.mid {
				animation: drift-mid 210s steps(640) infinite;
			}
			.stars.near {
				animation: drift-near 150s steps(820) infinite;
			}
			@keyframes drift-far {
				to {
					transform: translateX(-480px);
				}
			}
			@keyframes drift-mid {
				to {
					transform: translateX(-640px);
				}
			}
			@keyframes drift-near {
				to {
					transform: translateX(-820px);
				}
			}
			.nebula {
				/* In steps too, two a second: the change between two is far too small to see. */
				animation: breathe 40s steps(80) infinite alternate;
			}
			@keyframes breathe {
				to {
					transform: scale(1.06) translate(-1.5%, 1%);
					opacity: 0.8;
				}
			}
			/* Each visible for about a second of a long, uneven cycle: roughly one shooting star a minute. */
			.meteor.one {
				animation: meteor 83s linear -61s infinite;
			}
			.meteor.two {
				animation: meteor 127s linear -20s infinite;
			}
			@keyframes meteor {
				0%,
				98.6% {
					opacity: 0;
					transform: translateX(0) scaleX(0.3);
				}
				99% {
					opacity: 1;
				}
				100% {
					opacity: 0;
					transform: translateX(-280px) scaleX(1);
				}
			}
			.sky.paused * {
				animation-play-state: paused;
			}
		}
`;
