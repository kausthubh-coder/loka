import { css, html, LitElement, nothing } from "lit";
import type { NativeMedia } from "../../../../webui/src/bridge";
import { faviconBackground, faviconInner, hostOf, type LiveTab } from "../sidebar/favicon";
import type { Tab } from "../sidebar/sidebar.logic";

/** What the window gives the card: the media session, the Loka tab playing it (if the sidebar holds it), mute. */
export interface NowPlaying {
	media: NativeMedia;
	tab: Tab | null;
	muted: boolean;
}

export type MediaAction = "toggle" | "previous" | "next" | "mute" | "go";

/**
 * The now-playing card above the horizon, shown while something plays in a tab that isn't on screen. Title, artist
 * and artwork come from the page's media session; the tab's own title and icon stand in for what it doesn't say.
 * Sends `loka-media` with a MediaAction; the window talks to the browser.
 */
export class LokaMediaCard extends LitElement {
	static override properties = {
		playing: { attribute: false },
		live: { attribute: false },
	};

	declare playing: NowPlaying;
	/** The playing tab's page, for its own icon when there's no artwork. */
	declare live: LiveTab | undefined;

	private send(action: MediaAction) {
		this.dispatchEvent(new CustomEvent("loka-media", { detail: action, bubbles: true, composed: true }));
	}

	override render() {
		const { media, tab, muted } = this.playing;
		const url = tab?.url ?? "";
		const title = media.title || tab?.title || "Playing";
		const host = hostOf(url);
		const artist = media.artist || host;
		const where = tab?.title ?? title;
		// The buttons don't take focus from a click (their pressed state says enough); the keyboard still reaches them.
		const keepFocus = (e: PointerEvent) => e.preventDefault();
		return html`
			<section aria-label="Now playing: ${title}">
				<button class="art ${media.artwork ? "" : "tile"}" title="Go to ${where}" @pointerdown=${keepFocus} @click=${() => this.send("go")}>
					${
						media.artwork
							? html`<img src=${media.artwork} alt="" draggable="false" />`
							: // No artwork: the site's icon at icon size on a soft tile in its space's color, never stretched.
								html`<span class="fav" style="--fav: ${faviconBackground(url, this.live)}">${faviconInner(url, this.live)}</span>`
					}
					${media.playing ? html`<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>` : nothing}
				</button>
				<button class="info" title="Go to ${where}" @pointerdown=${keepFocus} @click=${() => this.send("go")}>
					<span class="title">${title}</span>
					<small>${artist}</small>
				</button>
				<div class="controls" role="group" aria-label="Playback" @pointerdown=${keepFocus}>
					<button aria-label="Previous track" title="Previous" @click=${() => this.send("previous")}>
						<svg viewBox="0 0 16 16"><path d="M4 3.5v9M12 3.5 6.5 8l5.5 4.5z" /></svg>
					</button>
					<button
						class="play"
						aria-label=${media.playing ? "Pause" : "Play"}
						title=${media.playing ? "Pause" : "Play"}
						@click=${() => this.send("toggle")}
					>
						${
							media.playing
								? html`<svg viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9" /></svg>`
								: html`<svg viewBox="0 0 16 16"><path class="fill" d="M5 3.5v9l7.5-4.5z" /></svg>`
						}
					</button>
					<button aria-label="Next track" title="Next" @click=${() => this.send("next")}>
						<svg viewBox="0 0 16 16"><path d="M12 3.5v9M4 3.5 9.5 8 4 12.5z" /></svg>
					</button>
					<button
						aria-label=${muted ? "Unmute" : "Mute"}
						title=${muted ? "Unmute" : "Mute"}
						aria-pressed=${muted}
						@click=${() => this.send("mute")}
					>
						${
							muted
								? html`<svg viewBox="0 0 16 16"><path d="M3 6h2.5L9 3v10L5.5 10H3zM11.5 6l3 4m0-4-3 4" /></svg>`
								: html`<svg viewBox="0 0 16 16"><path d="M3 6h2.5L9 3v10L5.5 10H3zM11.5 5.5a3.5 3.5 0 0 1 0 5" /></svg>`
						}
					</button>
				</div>
			</section>
		`;
	}

	static override styles = css`
		:host {
			display: block;
			font: 13px/1.35 system-ui, "Segoe UI", sans-serif;
			/* Pressed is a deeper hover in both themes. --loka-fill-hover lightens, which vanishes on light glass. */
			--press: color-mix(in srgb, var(--loka-ink) 12%, transparent);
		}
		/* Frosted glass over the sky and the planet's glow: the surface tint keeps the text readable on any of them.
		   One small blurred box, never animated; light-dark() follows the color-scheme the theme class sets. */
		section {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 7px 6px 7px 7px;
			border-radius: 12px;
			background: color-mix(in srgb, var(--loka-surface) 68%, transparent);
			box-shadow:
				inset 0 0 0 1px light-dark(hsl(var(--hue) 40% 20% / 0.1), hsl(0 0% 100% / 0.12)),
				0 6px 20px light-dark(hsl(var(--hue) 50% 20% / 0.14), rgb(0 0 0 / 0.32));
			backdrop-filter: blur(20px) saturate(1.4);
		}
		/* No blur to read through, or the user asked for less of it: the same surface, solid. */
		@supports not (backdrop-filter: blur(1px)) {
			section {
				background: hsl(from var(--loka-surface) h s l / 1);
			}
		}
		@media (prefers-reduced-transparency: reduce) {
			section {
				background: hsl(from var(--loka-surface) h s l / 1);
				backdrop-filter: none;
			}
		}
		button {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
			padding: 0;
			cursor: default;
		}
		.art {
			position: relative;
			flex: none;
			display: grid;
			place-items: center;
			width: 40px;
			height: 40px;
			border-radius: 8px;
			overflow: hidden;
		}
		.art img {
			width: 100%;
			height: 100%;
			object-fit: cover;
		}
		.art.tile {
			background: color-mix(in srgb, var(--loka-accent) 18%, var(--loka-fill));
		}
		/* The faint inner edge frames artwork on any background. */
		.art::after {
			content: "";
			position: absolute;
			inset: 0;
			border-radius: inherit;
			box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
			pointer-events: none;
		}
		.fav {
			display: grid;
			place-items: center;
			width: 22px;
			height: 22px;
			border-radius: 5px;
			overflow: hidden;
			background: var(--fav);
			color: #0b0c10;
			font-weight: 700;
			font-size: 13px;
		}
		.eq {
			position: absolute;
			right: 3px;
			bottom: 3px;
			display: flex;
			align-items: flex-end;
			gap: 1.5px;
			height: 10px;
			padding: 2px;
			border-radius: 3px;
			background: #0b0c10b0;
		}
		.eq i {
			width: 2px;
			height: 100%;
			border-radius: 1px;
			background: #fff;
			transform-origin: bottom;
		}
		.eq i:nth-child(2) {
			transform: scaleY(0.6);
		}
		.eq i:nth-child(3) {
			transform: scaleY(0.35);
		}
		.info {
			flex: 1;
			display: grid;
			min-width: 0;
			text-align: left;
		}
		/* Two lines for a long title, then the artist or site, small and quiet. */
		.title {
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			overflow: hidden;
			font-weight: 550;
			line-height: 1.3;
			overflow-wrap: anywhere;
		}
		small {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--loka-ink-3);
			font-size: 11.5px;
			margin-top: 1px;
		}
		/* The four controls as one group on a faint pill. */
		.controls {
			display: flex;
			flex: none;
			gap: 1px;
			padding: 2px;
			border-radius: 10px;
			background: var(--loka-fill);
		}
		.controls button {
			display: grid;
			place-items: center;
			width: 28px;
			height: 28px;
			border-radius: 8px;
			color: var(--loka-ink-2);
		}
		.controls button:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
		}
		.controls button:active {
			background: var(--press);
		}
		/* The artwork and the title go to the tab: hover says so, a press dims them. */
		.art:hover {
			filter: brightness(1.08);
		}
		.info:hover .title {
			text-decoration: underline;
			text-decoration-color: var(--loka-ink-3);
			text-underline-offset: 2px;
		}
		.art:active,
		.info:active {
			opacity: 0.75;
		}
		.controls .play {
			color: var(--loka-ink);
		}
		svg {
			width: 14px;
			height: 14px;
			fill: none;
			stroke: currentColor;
			stroke-width: 1.6;
			stroke-linecap: round;
			stroke-linejoin: round;
		}
		svg .fill {
			fill: currentColor;
		}
		:focus-visible {
			outline: 2px solid var(--loka-accent);
			outline-offset: 1px;
			border-radius: 7px;
		}
		@media (prefers-reduced-motion: no-preference) {
			/* On the glass itself, not the host: a fading ancestor would cut the blur off from what's behind it. */
			section {
				animation: card-in 260ms cubic-bezier(0.2, 0, 0, 1);
			}
			.controls button {
				transition: background-color 120ms;
			}
			@keyframes card-in {
				from {
					opacity: 0;
					transform: translateY(6px);
				}
			}
			.eq i {
				/* A few steps, not every frame: an equaliser reads the same, and the compositor rests between. */
				animation: bounce 900ms steps(4) infinite alternate;
				animation-play-state: var(--loka-play, running);
			}
			.eq i:nth-child(2) {
				animation-delay: -300ms;
			}
			.eq i:nth-child(3) {
				animation-delay: -600ms;
			}
			@keyframes bounce {
				from {
					transform: scaleY(0.25);
				}
				to {
					transform: scaleY(1);
				}
			}
		}
	`;
}

customElements.define("loka-media-card", LokaMediaCard);
