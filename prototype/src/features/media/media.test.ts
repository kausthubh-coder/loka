import { expect, test } from "bun:test";
import type { NativeMedia } from "../../../../webui/src/bridge";
import { nowPlaying } from "./media.logic";

const media = (tabId: number, playing: boolean): NativeMedia => ({
	tabId,
	title: `Track in ${tabId}`,
	artist: "",
	artwork: "",
	playing,
});

test("the card shows what's playing in another tab, before anything paused", () => {
	expect(nowPlaying([media(1, false), media(2, true)], 9)?.tabId).toBe(2);
	expect(nowPlaying([media(1, false), media(3, false)], 9)?.tabId).toBe(1);
});

test("the tab on screen never gets the card, and nothing playing means no card", () => {
	expect(nowPlaying([media(1, true)], 1)).toBeNull();
	expect(nowPlaying([media(1, true), media(2, false)], 1)?.tabId).toBe(2);
	expect(nowPlaying([], undefined)).toBeNull();
	expect(nowPlaying(null, undefined)).toBeNull();
});
