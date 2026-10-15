import { css, html, LitElement } from "lit";
import { faviconBackground, faviconInner, hostOf, type LiveTab } from "../sidebar/favicon";
import type { BrowserState } from "../sidebar/sidebar.logic";

/** What's playing. In the real browser this comes from Chromium's media sessions; the prototype has one sample. */
export interface Media {
	tabId: string;
	artist: string;
	playing: boolean;
	muted: boolean;
}

export type MediaAction = "toggle" | "previous" | "next" | "mute" | "go" | "stop";

/**
 * The now-playing card above the horizon, shown when the playing tab isn't the one on screen. Sends `loka-media`
 * with a MediaAction; the window owns the media state.
 */
export class LokaMediaCard extends LitElement {
	static override properties = {
		media: { attribute: false },
		state: { attribute: false },
		live: { attribute: false },
	};

	declare media: Media;
	declare state: BrowserState;
	/** The playing tab's page, for its own icon. */
	declare live: LiveTab | undefined;

	private send(action: MediaAction) {
		this.dispatchEvent(new CustomEvent("loka-media", { detail: action, bubbles: true, composed: true }));
	}

	override render() {
		const tab = this.state.tabs[this.media.tabId];
		if (!tab) return null;
		const { playing, muted } = this.media;
		return html`
			<section aria-label="Now playing: ${tab.title}">
				<button class="art" style="--fav: ${faviconBackground(tab.url, this.live)}" title="Go to ${tab.title}" @click=${() => this.send("go")}>
					<span aria-hidden="true">${faviconInner(tab.url, this.live)}</span>
					${playing ? html`<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>` : null}
				</button>
				<button class="info" title="Go to ${tab.title}" @click=${() => this.send("go")}>
					<span class="title">${tab.title}</span>
					<small>${this.media.artist || hostOf(tab.url)}</small>
				</button>
				<div class="controls">
					<button aria-label="Previous track" @click=${() => this.send("previous")}>
						<svg viewBox="0 0 16 16"><path d="M4 3.5v9M12 3.5 6.5 8l5.5 4.5z" /></svg>
					</button>
					<button aria-label=${playing ? "Pause" : "Play"} @click=${() => this.send("toggle")}>
						${
							playing
								? html`<svg viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9" /></svg>`
								: html`<svg viewBox="0 0 16 16"><path class="fill" d="M5 3.5v9l7.5-4.5z" /></svg>`
						}
					</button>
					<button aria-label="Next track" @click=${() => this.send("next")}>
						<svg viewBox="0 0 16 16"><path d="M12 3.5v9M4 3.5 9.5 8 4 12.5z" /></svg>
					</button>
					<button aria-label=${muted ? "Unmute" : "Mute"} aria-pressed=${muted} @click=${() => this.send("mute")}>
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
			color: #ececf1;
			font: 13px/1.35 system-ui, "Segoe UI", sans-serif;
		}
		section {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 8px;
			border-radius: 12px;
			background: hsl(var(--hue) 30% 85% / 0.08);
			box-shadow: inset 0 0 0 1px hsl(var(--hue) 30% 85% / 0.08);
		}
		button {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
			padding: 0;
		}
		.art {
			position: relative;
			flex: none;
			display: grid;
			place-items: center;
			width: 38px;
			height: 38px;
			border-radius: 8px;
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
		small {
			color: #a7a8b4;
			font-size: 12px;
		}
		.controls {
			display: flex;
			flex: none;
		}
		.controls button {
			display: grid;
			place-items: center;
			width: 26px;
			height: 28px;
			border-radius: 7px;
			color: #d9dae2;
		}
		.controls button:hover {
			background: hsl(var(--hue) 30% 85% / 0.12);
			color: #fff;
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
			outline: 2px solid hsl(var(--hue) 85% 72%);
			outline-offset: 1px;
			border-radius: 7px;
		}
		@media (prefers-reduced-motion: no-preference) {
			.eq i {
				animation: bounce 900ms ease-in-out infinite alternate;
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
