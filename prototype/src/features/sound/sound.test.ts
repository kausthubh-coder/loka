import { describe, expect, test } from "bun:test";
import { CUES, type Cue, CueGate, cueLength } from "./sound.logic";

describe("interface sounds", () => {
	test("every cue is over in under 300ms and stays quiet", () => {
		for (const cue of Object.keys(CUES) as Cue[]) {
			expect(cueLength(cue)).toBeLessThan(0.3);
			for (const layer of CUES[cue]) expect(layer.gain).toBeLessThanOrEqual(0.08);
		}
		expect(cueLength("tab-close")).toBeCloseTo(0.104);
	});

	test("clicking fast doesn't stack sounds: repeats and near-simultaneous cues are dropped", () => {
		const gate = new CueGate();
		expect(gate.allow("tab-close", 0)).toBe(true);
		expect(gate.allow("tab-open", 20)).toBe(false); // 20ms after another cue
		expect(gate.allow("tab-close", 100)).toBe(false); // the same cue 100ms later
		expect(gate.allow("tab-close", 130)).toBe(true);
		expect(gate.allow("pin", 200)).toBe(true);
		expect(gate.allow("unpin", 300)).toBe(false); // a fourth cue inside 600ms
		expect(gate.allow("unpin", 700)).toBe(true);
	});
});
