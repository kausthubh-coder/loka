import { expect, test } from "bun:test";
import { importState } from "../sidebar/sidebar.logic";
import { seedState } from "../sidebar/sidebar.seed";
import { openSyncFile, sealState, syncFileName, takeSpaces } from "./sync.logic";

const NOW = Date.UTC(2026, 9, 15, 4, 0);

test("a sealed file opens with the passphrase and gives back the same spaces", async () => {
	const state = seedState(NOW);
	const file = await sealState(state, "correct horse battery", "Laptop", NOW);
	expect(file.data).not.toContain("Build");
	const opened = await openSyncFile(JSON.stringify(file), "correct horse battery");
	expect(opened.ok && opened.state).toEqual(state);
});

test("a wrong passphrase or an edited file is refused, never half-loaded", async () => {
	const file = await sealState(seedState(NOW), "right", "Laptop", NOW);
	expect(await openSyncFile(JSON.stringify(file), "wrong")).toEqual({ ok: false, reason: "wrong-passphrase" });
	const flipped = { ...file, data: `${file.data[0] === "A" ? "B" : "A"}${file.data.slice(1)}` };
	expect((await openSyncFile(JSON.stringify(flipped), "right")).ok).toBe(false);
	expect(await openSyncFile('{"hello": 1}', "right")).toEqual({ ok: false, reason: "not-a-sync-file" });
});

test("sealing twice gives different files, so a copy says nothing about whether the spaces changed", async () => {
	const state = seedState(NOW);
	const [a, b] = await Promise.all([sealState(state, "p", "Laptop", NOW), sealState(state, "p", "Laptop", NOW)]);
	expect(a.data).not.toBe(b.data);
	expect(a.salt).not.toBe(b.salt);
});

test("each computer gets a file name every cloud folder accepts", () => {
	expect([syncFileName("Kaustubh's Laptop"), syncFileName("  "), syncFileName("DESKTOP-9F2K")]).toEqual([
		"loka-kaustubh-s-laptop.lokasync",
		"loka-computer.lokasync",
		"loka-desktop-9f2k.lokasync",
	]);
});

test("taking another computer's spaces keeps every tab open here", () => {
	const mine = seedState(NOW);
	const theirs = {
		...seedState(NOW),
		spaces: seedState(NOW).spaces.map((s) => ({ ...s, open: [], name: `${s.name}!` })),
	};
	const state = takeSpaces(mine, theirs);
	expect(state.spaces.map((s) => s.name)).toEqual(["Build!", "School!", "Home!"]);
	const showing = state.spaces.find((s) => s.id === state.activeSpaceId);
	expect(showing?.open.map((id) => state.tabs[id]?.title)).toEqual([
		"Hacker News",
		"Arc: what we learned",
		"Zen Browser",
		"Lo-fi beats",
	]);
	expect(importState(JSON.stringify(state))).not.toBeNull();
});
