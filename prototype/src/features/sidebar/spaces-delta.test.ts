import { describe, expect, test } from "bun:test";
import { applyIntent, type Intent } from "./intents.logic";
import { modelCases } from "./model-cases";
import { activateTab, type BrowserState, deleteSpace, moveItem } from "./sidebar.logic";
import { seedState } from "./sidebar.seed";
import { applyDelta, toDelta } from "./spaces-delta.logic";

const NOW = Date.UTC(2026, 9, 15, 3, 0);

describe("what the sidebar hears of a change", () => {
	test("applying it to the old spaces gives the new ones, for every shared case", () => {
		const { states, cases } = modelCases();
		let checked = 0;
		for (const c of cases) {
			const before = c.state ? states[c.state] : undefined;
			const after = c.expect.state as BrowserState | undefined;
			if (!before || !after || !c.expect.delta) continue;
			expect(applyDelta(before, toDelta(before, after))).toEqual(after);
			checked++;
		}
		// Every intent case: 74 today.
		expect(checked).toBeGreaterThanOrEqual(74);
	});

	test("a click sends the one tab and the one space it changed", () => {
		const seed = seedState(NOW);
		const delta = toDelta(seed, activateTab(seed, "t-hn", NOW + 1));
		expect(Object.keys(delta).sort()).toEqual(["spaces", "tabs"]);
		expect(Object.keys(delta.tabs ?? {})).toEqual(["t-hn"]);
		expect(delta.spaces?.map((s) => s.id)).toEqual(["s-build"]);
	});

	test("unchanged tabs and spaces stay the same objects, so their rows don't redraw", () => {
		const seed = seedState(NOW);
		const next = applyDelta(seed, toDelta(seed, moveItem(seed, "t-hn", { area: "essentials", index: 0 })));
		expect(next.tabs["t-hn"]).toBe(seed.tabs["t-hn"] as never);
		expect(next.spaces[1]).toBe(seed.spaces[1] as never);
		expect(next.spaces[0]).not.toBe(seed.spaces[0] as never);
	});

	test("a deleted space and its tabs go, and the order follows", () => {
		const seed = seedState(NOW);
		const after = deleteSpace(seed, "s-school");
		const delta = toDelta(seed, after);
		expect(delta.spaceOrder).toEqual(["s-build", "s-home"]);
		expect(delta.tabs?.["t-canvas"]).toBeNull();
		expect(applyDelta(seed, delta)).toEqual(after);
	});

	test("an intent that changes nothing sends nothing", () => {
		const seed = seedState(NOW);
		const intent: Intent = { op: "switchSpace", spaceId: "s-build" };
		expect(toDelta(seed, applyIntent(seed, intent))).toEqual({});
	});
});
