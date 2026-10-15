// Folder sync: each computer writes its spaces to a folder the user picks (OneDrive, Dropbox, a USB drive), as one
// file per computer, encrypted with the user's passphrase. One file per computer means the cloud never has to merge
// two edits of the same file. Another computer reads those files and can take one computer's spaces as its own.
// AES-GCM with a key from PBKDF2-SHA-256 (310,000 rounds), both from WebCrypto, so nothing extra ships.

import { type BrowserState, importState } from "../sidebar/sidebar.logic";

const ROUNDS = 310_000;
const encoder = new TextEncoder();

export interface SyncFile {
	format: "loka-sync";
	version: 1;
	device: string;
	savedAt: number;
	salt: string;
	iv: string;
	data: string;
}

function toBase64(bytes: Uint8Array): string {
	let text = "";
	for (const b of bytes) text += String.fromCharCode(b);
	return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function keyFor(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations: ROUNDS },
		base,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

/** Seals the spaces into a file only someone with the passphrase can open. A fresh salt and nonce every time. */
export async function sealState(
	state: BrowserState,
	passphrase: string,
	device: string,
	now: number,
): Promise<SyncFile> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await keyFor(passphrase, salt);
	const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(state)));
	return {
		format: "loka-sync",
		version: 1,
		device,
		savedAt: now,
		salt: toBase64(salt),
		iv: toBase64(iv),
		data: toBase64(new Uint8Array(sealed)),
	};
}

export type OpenResult =
	| { ok: true; state: BrowserState }
	| { ok: false; reason: "not-a-sync-file" | "wrong-passphrase" | "damaged" };

/** Opens a sync file. A wrong passphrase and a tampered file both fail AES-GCM's check; neither ever half-loads. */
export async function openSyncFile(text: string, passphrase: string): Promise<OpenResult> {
	let file: Partial<SyncFile>;
	try {
		file = JSON.parse(text);
	} catch {
		return { ok: false, reason: "not-a-sync-file" };
	}
	if (file.format !== "loka-sync" || file.version !== 1 || !file.salt || !file.iv || !file.data) {
		return { ok: false, reason: "not-a-sync-file" };
	}
	let plain: ArrayBuffer;
	try {
		const key = await keyFor(passphrase, fromBase64(file.salt));
		plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(file.iv) }, key, fromBase64(file.data));
	} catch {
		return { ok: false, reason: "wrong-passphrase" };
	}
	const state = importState(new TextDecoder().decode(plain));
	return state ? { ok: true, state } : { ok: false, reason: "damaged" };
}

/** The file name for a computer, from its name: letters, digits and dashes only, so every cloud folder accepts it. */
export function syncFileName(device: string): string {
	const safe =
		device
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "computer";
	return `loka-${safe}.lokasync`;
}

/**
 * This computer takes another computer's spaces: their spaces, folders, pinned tabs and Essentials replace its own,
 * but the tabs open here stay open, moved to the top of the space that will be showing. Nothing open is closed.
 */
export function takeSpaces(mine: BrowserState, theirs: BrowserState): BrowserState {
	const pinnedIds = (nodes: BrowserState["spaces"][number]["pinned"]): string[] =>
		nodes.flatMap((n) => (n.kind === "tab" ? [n.id] : pinnedIds(n.children)));
	const placedThere = new Set([
		...theirs.essentials,
		...theirs.spaces.flatMap((s) => [...s.open, ...pinnedIds(s.pinned)]),
	]);
	const openHere = mine.spaces.flatMap((s) => s.open).filter((id) => mine.tabs[id] && !placedThere.has(id));
	const tabs = { ...theirs.tabs };
	for (const id of openHere) {
		const tab = mine.tabs[id];
		if (tab) tabs[id] = tab;
	}
	return {
		...theirs,
		tabs,
		spaces: theirs.spaces.map((s) => (s.id === theirs.activeSpaceId ? { ...s, open: [...openHere, ...s.open] } : s)),
	};
}
