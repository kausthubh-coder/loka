import { css, html, LitElement } from "lit";
import { timeAgo } from "../archive/archive.logic";
import type { BrowserState } from "../sidebar/sidebar.logic";

/** One computer's file in the sync folder, read without opening it. */
export interface SyncPeer {
	file: string;
	device: string;
	savedAt: number;
}

export interface SyncStatus {
	folder: string | null;
	device: string;
	hasPassphrase: boolean;
	lastSaved: number | null;
	/** The browser forgot the folder permission (it does after a restart); a click asks again. */
	needsPermission: boolean;
}

/** What the browser does for sync: the folder, the files in it, and the passphrase kept on this computer. */
export interface SyncHooks {
	status(): Promise<SyncStatus>;
	chooseFolder(): Promise<void>;
	setup(device: string, passphrase: string): Promise<void>;
	saveNow(): Promise<void>;
	peers(): Promise<SyncPeer[]>;
	/** Opens another computer's file; the caller decides whether to take its spaces. */
	open(file: string, passphrase: string): Promise<{ ok: true; state: BrowserState } | { ok: false; reason: string }>;
	turnOff(): Promise<void>;
}

const REASONS: Record<string, string> = {
	"wrong-passphrase": "That passphrase doesn't open this file.",
	"not-a-sync-file": "That file isn't a Loka sync file.",
	damaged: "That file is damaged.",
};

/** Settings > Sync in the real browser. Sends `loka-take-spaces` with another computer's spaces when chosen. */
export class LokaSyncSettings extends LitElement {
	static override properties = {
		hooks: { attribute: false },
		status: { state: true },
		peers: { state: true },
		message: { state: true },
	};

	declare hooks: SyncHooks;
	status: SyncStatus | null = null;
	peers: SyncPeer[] = [];
	message = "";

	override connectedCallback() {
		super.connectedCallback();
		void this.refresh();
	}

	private async refresh() {
		this.status = await this.hooks.status();
		this.peers = this.status.folder && !this.status.needsPermission ? await this.hooks.peers() : [];
	}

	private async run(work: () => Promise<void>, done = "") {
		try {
			await work();
			this.message = done;
		} catch (error) {
			this.message = error instanceof Error ? error.message : String(error);
		}
		await this.refresh();
	}

	private field(name: string): string {
		return (this.renderRoot.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? "").trim();
	}

	private async take(peer: SyncPeer) {
		const passphrase = this.field("passphrase") || "";
		const opened = await this.hooks.open(peer.file, passphrase);
		if (!opened.ok) {
			this.message = REASONS[opened.reason] ?? opened.reason;
			return;
		}
		this.dispatchEvent(new CustomEvent("loka-take-spaces", { detail: opened.state, bubbles: true, composed: true }));
		this.message = `This computer now has ${peer.device}'s spaces.`;
	}

	override render() {
		const s = this.status;
		if (!s) return null;
		const now = Date.now();
		const ready = s.folder && s.hasPassphrase;
		return html`
			${
				!s.folder
					? html`<div class="row">
							<div>
								<b>Sync spaces between your computers</b>
								<small>Spaces, folders and pinned tabs, encrypted with your passphrase, in a folder you pick (OneDrive, Dropbox, a USB drive). No account, no Loka server.</small>
							</div>
							<button class="button" @click=${() => this.run(() => this.hooks.chooseFolder())}>Choose folder</button>
						</div>`
					: html`<div class="row">
							<div>
								<b>Folder: ${s.folder}</b>
								<small>
									${
										s.needsPermission
											? "The browser needs your OK to use it again."
											: s.lastSaved
												? `This computer saved ${timeAgo(s.lastSaved, now)}.`
												: "Not saved yet."
									}
								</small>
							</div>
							${
								s.needsPermission
									? html`<button class="button" @click=${() => this.run(() => this.hooks.saveNow(), "Saved.")}>Allow</button>`
									: ready
										? html`<button class="button" @click=${() => this.run(() => this.hooks.saveNow(), "Saved.")}>Save now</button>`
										: null
							}
						</div>`
			}
			${
				s.folder && !s.hasPassphrase
					? html`<div class="row setup">
							<label><span>This computer's name</span><input name="device" .value=${s.device} /></label>
							<label><span>Passphrase (kept on this computer only)</span><input name="passphrase" type="password" autocomplete="new-password" /></label>
							<button
								class="button"
								@click=${() =>
									this.run(async () => {
										const passphrase = this.field("passphrase");
										if (passphrase.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
										await this.hooks.setup(this.field("device") || s.device, passphrase);
										await this.hooks.saveNow();
									}, "Sync is on. Other computers can now take these spaces.")}
							>
								Turn on
							</button>
						</div>`
					: null
			}
			${
				ready && this.peers.length
					? html`<div class="peers">
							<small>Other computers in this folder</small>
							<label class="pass"><span>Their passphrase, if it's different</span><input name="passphrase" type="password" /></label>
							${this.peers.map(
								(p) => html`<div class="row">
									<div><b>${p.device}</b><small>Saved ${timeAgo(p.savedAt, now)}</small></div>
									<button class="button" @click=${() => this.take(p)}>Use its spaces</button>
								</div>`,
							)}
						</div>`
					: null
			}
			${s.folder ? html`<button class="quiet" @click=${() => this.run(() => this.hooks.turnOff(), "Sync is off.")}>Turn sync off</button>` : null}
			${this.message ? html`<p class="note" role="status">${this.message}</p>` : null}
		`;
	}

	static override styles = css`
		:host {
			display: block;
		}
		.row {
			display: flex;
			align-items: center;
			gap: 14px;
			min-height: 56px;
			padding: 8px 0;
			border-bottom: 1px solid hsl(var(--hue) 30% 85% / 0.08);
		}
		.row > div {
			flex: 1;
			display: grid;
		}
		.row b {
			font-weight: 550;
		}
		small {
			color: #a3a5b2;
			font-size: 13px;
		}
		.setup {
			flex-wrap: wrap;
			align-items: end;
		}
		label {
			display: grid;
			gap: 4px;
			flex: 1;
			min-width: 180px;
			font-size: 13px;
			color: #a3a5b2;
		}
		input {
			height: 34px;
			padding: 0 10px;
			font: inherit;
			color: #e6e7ee;
			border: 0;
			border-radius: 8px;
			background: hsl(var(--hue) 30% 85% / 0.08);
			outline: none;
		}
		input:focus {
			box-shadow: inset 0 0 0 1.5px hsl(var(--hue) 85% 72%);
		}
		button {
			font: inherit;
			color: inherit;
			border: 0;
			background: none;
		}
		.button {
			height: 32px;
			padding: 0 14px;
			border-radius: 8px;
			background: hsl(var(--hue) 30% 85% / 0.1);
		}
		.button:hover {
			background: hsl(var(--hue) 30% 85% / 0.16);
		}
		.peers {
			margin-top: 12px;
		}
		.pass {
			margin: 8px 0;
			max-width: 320px;
		}
		.quiet {
			margin-top: 10px;
			color: #a3a5b2;
		}
		.note {
			margin: 10px 0 0;
			color: hsl(150 60% 72%);
		}
		:focus-visible {
			outline: 2px solid hsl(var(--hue) 85% 72%);
			outline-offset: 2px;
		}
	`;
}

customElements.define("loka-sync-settings", LokaSyncSettings);
