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
		const artist = media.artist || hostOf(url);
		const where = tab?.title ?? title;
		return html`
			<section aria-label="Now playing: ${title}">
				<button class="art" title="Go to ${where}" @click=${() => this.send("go")}>
					${
						media.artwork
							? html`<img src=${media.artwork} alt="" draggable="false" />`
							: html`<span class="fav" style="--fav: ${faviconBackground(url, this.live)}">${faviconInner(url, this.live)}</span>`
					}
					${media.playing ? html`<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>` : nothing}
				</button>
				<button class="info" title="Go to ${where}" @click=${() => this.send("go")}>
					<span class="title">${title}</span>
					<small>${artist}</small>
				</button>
				<div class="controls">
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
		}
		section {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 7px 6px 7px 7px;
			border-radius: 12px;
			background: var(--loka-fill);
			box-shadow:
				inset 0 0 0 1px var(--loka-line),
				var(--loka-selected-edge);
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
			width: 100%;
			height: 100%;
			background: var(--fav);
			color: #0b0c10;
			font-weight: 700;
			font-size: 16px;
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
		.title,
		small {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
		.title {
			font-weight: 550;
		}
		small {
			color: var(--loka-ink-2);
			font-size: 12px;
		}
		.controls {
			display: flex;
			flex: none;
		}
		.controls button {
			display: grid;
			place-items: center;
			width: 28px;
			height: 32px;
			border-radius: 7px;
			color: var(--loka-ink-2);
		}
		.controls button:hover {
			background: var(--loka-hover);
			color: var(--loka-ink);
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
			:host {
				animation: card-in 260ms cubic-bezier(0.2, 0, 0, 1);
			}
			@keyframes card-in {
				from {
					opacity: 0;
					transform: translateY(6px);
				}
			}
			.eq i {
				animation: bounce 900ms ease-in-out infinite alternate;
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
