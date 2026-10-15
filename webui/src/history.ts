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
				min-height: 100vh;
			}
			.page {
				position: relative;
				isolation: isolate;
				min-height: 100vh;
			}
			/* The sky stays put behind the list as it scrolls. */
			.sky {
				position: fixed;
			}
			.theme-dark {
				--history-bg: hsl(200 36% 6%);
			}
			.theme-light {
				--history-bg: hsl(200 60% 92%);
			}
		`,
	];
}

customElements.define("loka-history-page", LokaHistoryPage);
