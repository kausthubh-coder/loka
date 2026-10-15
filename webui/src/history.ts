// Loka's History page: chrome://history (Ctrl+H), served from history.html by its own handler. It follows the
// browser's light or dark (which each space sets) and shows the day or night sky in Loka's blue.

import { css, html, LitElement } from "lit";
import { skyLayer, skyStyles } from "../../prototype/src/app/sky";
import { themeTokens } from "../../prototype/src/app/theme";
import "../../prototype/src/features/history/loka-history";
import { setFaviconSource } from "../../prototype/src/features/sidebar/favicon";
import { faviconUrl } from "./favicon-url";
import { history } from "./history-bridge";

setFaviconSource(faviconUrl);

const darkSystem = matchMedia("(prefers-color-scheme: dark)");

export class LokaHistoryPage extends LitElement {
	static override properties = { dark: { state: true } };

	dark = darkSystem.matches;

	override connectedCallback() {
		super.connectedCallback();
		darkSystem.addEventListener("change", (e) => {
			this.dark = e.matches;
		});
	}

	override render() {
		const scheme = this.dark ? "dark" : "light";
		document.documentElement.style.colorScheme = scheme;
		return html`<div class="page theme-${scheme}" style="--hue: 200">
			${skyLayer(200, scheme)}
			<loka-history .bridge=${history}></loka-history>
		</div>`;
	}

	static override styles = [
		themeTokens,
		skyStyles,
		css`
			:host {
				display: block;
				height: 100vh;
			}
			/* The page is the window's height and <loka-history> scrolls inside it, so the sky stays put behind. */
			.page {
				position: relative;
				isolation: isolate;
				height: 100%;
				overflow: hidden;
			}
		`,
	];
}

customElements.define("loka-history-page", LokaHistoryPage);
