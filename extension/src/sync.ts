// Folder sync in the browser: the folder the user picked (a File System Access handle, kept in IndexedDB because
// handles can't go in chrome.storage), this computer's name and passphrase (chrome.storage.local, this computer
// only), and reading and writing the per-computer files. The encryption is sync.logic.ts.

import type { BrowserState } from "../../prototype/src/features/sidebar/sidebar.logic";
import type { SyncHooks, SyncPeer, SyncStatus } from "../../prototype/src/features/sync/loka-sync-settings";
import { openSyncFile, type SyncFile, sealState, syncFileName } from "../../prototype/src/features/sync/sync.logic";
import { readState } from "./store";

// The parts of the File System Access API Loka uses, which TypeScript's DOM types don't include yet.
interface DirectoryHandle {
	name: string;
	values(): AsyncIterable<{ kind: "file" | "directory"; name: string; getFile(): Promise<File> }>;
	getFileHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<{
		createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
		getFile(): Promise<File>;
	}>;
	queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
	requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
}
declare global {
	interface Window {
		showDirectoryPicker(options?: { mode?: "readwrite"; id?: string }): Promise<DirectoryHandle>;
	}
}

const SETTINGS_KEY = "loka.sync";
interface Settings {
	device: string;
	passphrase: string;
	lastSaved: number | null;
}

function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("loka-sync", 1);
		request.onupgradeneeded = () => request.result.createObjectStore("handles");
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function handle(): Promise<DirectoryHandle | null> {
	const db = await database();
	return new Promise((resolve) => {
		const get = db.transaction("handles").objectStore("handles").get("folder");
		get.onsuccess = () => resolve((get.result as DirectoryHandle | undefined) ?? null);
		get.onerror = () => resolve(null);
	});
}

async function keepHandle(folder: DirectoryHandle | null) {
	const db = await database();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction("handles", "readwrite");
		if (folder) tx.objectStore("handles").put(folder, "folder");
		else tx.objectStore("handles").delete("folder");
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function settings(): Promise<Settings | null> {
	const saved = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
	return (saved as Settings | undefined) ?? null;
}

async function writable(folder: DirectoryHandle, ask: boolean): Promise<boolean> {
	if ((await folder.queryPermission({ mode: "readwrite" })) === "granted") return true;
	return ask && (await folder.requestPermission({ mode: "readwrite" })) === "granted";
}

/** Writes this computer's file. `ask` lets a click re-grant the folder permission the browser drops on restart. */
async function save(state: BrowserState, ask: boolean): Promise<void> {
	const [folder, own] = await Promise.all([handle(), settings()]);
	if (!folder || !own?.passphrase) return;
	if (!(await writable(folder, ask))) throw new Error("The browser needs your OK to use the sync folder.");
	const now = Date.now();
	const file = await sealState(state, own.passphrase, own.device, now);
	const out = await (await folder.getFileHandle(syncFileName(own.device), { create: true })).createWritable();
	await out.write(JSON.stringify(file));
	await out.close();
	await chrome.storage.local.set({ [SETTINGS_KEY]: { ...own, lastSaved: now } });
}

export const browserSync: SyncHooks = {
	async status(): Promise<SyncStatus> {
		const [folder, own] = await Promise.all([handle(), settings()]);
		return {
			folder: folder?.name ?? null,
			device: own?.device ?? "This computer",
			hasPassphrase: Boolean(own?.passphrase),
			lastSaved: own?.lastSaved ?? null,
			needsPermission: folder ? (await folder.queryPermission({ mode: "readwrite" })) !== "granted" : false,
		};
	},
	async chooseFolder() {
		await keepHandle(await window.showDirectoryPicker({ mode: "readwrite", id: "loka-sync" }));
	},
	async setup(device, passphrase) {
		await chrome.storage.local.set({ [SETTINGS_KEY]: { device, passphrase, lastSaved: null } satisfies Settings });
	},
	async saveNow() {
		await save(await readState(), true);
	},
	async peers(): Promise<SyncPeer[]> {
		const [folder, own] = await Promise.all([handle(), settings()]);
		if (!folder || !(await writable(folder, false))) return [];
		const mine = own ? syncFileName(own.device) : "";
		const peers: SyncPeer[] = [];
		for await (const entry of folder.values()) {
			if (entry.kind !== "file" || !entry.name.endsWith(".lokasync") || entry.name === mine) continue;
			try {
				const file = JSON.parse(await (await entry.getFile()).text()) as Partial<SyncFile>;
				if (file.format === "loka-sync")
					peers.push({ file: entry.name, device: file.device ?? entry.name, savedAt: file.savedAt ?? 0 });
			} catch {
				// Not a Loka file, or half-written by the cloud client; it'll be read next time.
			}
		}
		return peers.sort((a, b) => b.savedAt - a.savedAt);
	},
	async open(file, passphrase) {
		const [folder, own] = await Promise.all([handle(), settings()]);
		if (!folder) return { ok: false, reason: "not-a-sync-file" };
		const text = await (await (await folder.getFileHandle(file)).getFile()).text();
		return openSyncFile(text, passphrase || own?.passphrase || "");
	},
	async turnOff() {
		await keepHandle(null);
		await chrome.storage.local.remove(SETTINGS_KEY);
	},
};

let timer = 0;

/** Saves a few seconds after the spaces stop changing, while a Loka page is open; quietly skips when sync is off. */
export function saveSoon(state: BrowserState) {
	window.clearTimeout(timer);
	timer = window.setTimeout(() => {
		void save(state, false).catch(() => {});
	}, 4000);
}
