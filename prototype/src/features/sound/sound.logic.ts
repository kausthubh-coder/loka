// Loka's interface sounds as data: which cues exist, how each is built, and when one may play.
// Synthesized at play time (sound.ts), so there are no audio files and nothing to license.

/** The moments that make a sound. Each confirms something already visible; none carries a message alone. */
export type Cue =
	| "space"
	| "space-new"
	| "tab-open"
	| "tab-close"
	| "folder-open"
	| "folder-close"
	| "pin"
	| "unpin"
	| "into-folder"
	| "command"
	| "clear";

/** One source in a cue: a tone gliding from `from` to `to` Hz, or a burst of noise through a band-pass at `from`. */
export interface Layer {
	wave: "sine" | "triangle" | "noise";
	from: number;
	to?: number;
	/** Seconds after the cue starts. */
	delay?: number;
	attack: number;
	decay: number;
	/** Peak gain before the volume setting; 0.04 to 0.08 keeps a cue a confirmation, not an alert. */
	gain: number;
}

// Notes from one pentatonic scale on A, so every cue sounds like it belongs with the others.
const E4 = 329.6;
const B4 = 493.9;
const D5 = 587.3;
const E5 = 659.3;
const G5 = 784;
const A5 = 880;
const B5 = 987.8;
const D6 = 1174.7;
const E6 = 1318.5;
const A6 = 1760;
const E7 = 2637;

/**
 * Soft and airy: sines and triangles with quick attacks and short tails, a little noise for the touch of a press,
 * and pitch that rises for things arriving or opening and falls for things leaving or closing. The player adds a
 * faint echo, which is what makes them sound far away.
 */
export const CUES: Record<Cue, Layer[]> = {
	space: [
		{ wave: "sine", from: D5, to: A5, attack: 0.012, decay: 0.2, gain: 0.06 },
		{ wave: "triangle", from: D6, delay: 0.05, attack: 0.01, decay: 0.15, gain: 0.025 },
		{ wave: "noise", from: 1800, attack: 0.03, decay: 0.13, gain: 0.02 },
	],
	"space-new": [
		{ wave: "sine", from: E5, attack: 0.006, decay: 0.14, gain: 0.06 },
		{ wave: "sine", from: A5, delay: 0.06, attack: 0.006, decay: 0.14, gain: 0.05 },
		{ wave: "sine", from: E6, delay: 0.12, attack: 0.006, decay: 0.16, gain: 0.04 },
		{ wave: "triangle", from: E4, attack: 0.01, decay: 0.26, gain: 0.03 },
	],
	"tab-open": [
		{ wave: "sine", from: E5, to: B5, attack: 0.004, decay: 0.09, gain: 0.055 },
		{ wave: "triangle", from: E6, delay: 0.03, attack: 0.004, decay: 0.06, gain: 0.02 },
		{ wave: "noise", from: 2600, attack: 0.001, decay: 0.02, gain: 0.025 },
	],
	"tab-close": [
		{ wave: "sine", from: A5, to: D5, attack: 0.004, decay: 0.1, gain: 0.05 },
		{ wave: "noise", from: 2000, attack: 0.001, decay: 0.02, gain: 0.02 },
	],
	"folder-open": [
		{ wave: "triangle", from: G5, attack: 0.004, decay: 0.08, gain: 0.05 },
		{ wave: "sine", from: D6, delay: 0.045, attack: 0.004, decay: 0.1, gain: 0.04 },
	],
	"folder-close": [
		{ wave: "triangle", from: D6, attack: 0.004, decay: 0.07, gain: 0.04 },
		{ wave: "sine", from: G5, delay: 0.045, attack: 0.004, decay: 0.1, gain: 0.045 },
	],
	pin: [
		{ wave: "sine", from: E6, attack: 0.002, decay: 0.05, gain: 0.04 },
		{ wave: "sine", from: E5, delay: 0.03, attack: 0.002, decay: 0.12, gain: 0.055 },
		{ wave: "noise", from: 3000, attack: 0.001, decay: 0.015, gain: 0.025 },
	],
	unpin: [
		{ wave: "sine", from: E5, attack: 0.003, decay: 0.06, gain: 0.045 },
		{ wave: "sine", from: B5, delay: 0.04, attack: 0.003, decay: 0.08, gain: 0.035 },
	],
	"into-folder": [
		{ wave: "sine", from: B5, to: B4, attack: 0.003, decay: 0.12, gain: 0.05 },
		{ wave: "triangle", from: B4 / 2, delay: 0.06, attack: 0.004, decay: 0.12, gain: 0.04 },
		{ wave: "noise", from: 1400, delay: 0.06, attack: 0.001, decay: 0.025, gain: 0.02 },
	],
	command: [
		{ wave: "sine", from: A6, attack: 0.015, decay: 0.12, gain: 0.025 },
		{ wave: "sine", from: E7, delay: 0.02, attack: 0.015, decay: 0.1, gain: 0.015 },
		{ wave: "noise", from: 4000, attack: 0.02, decay: 0.08, gain: 0.012 },
	],
	clear: [
		{ wave: "sine", from: B5, to: E4, attack: 0.006, decay: 0.22, gain: 0.045 },
		{ wave: "noise", from: 1200, attack: 0.03, decay: 0.18, gain: 0.025 },
	],
};

/** How long a cue sounds before its echo, in seconds. */
export function cueLength(cue: Cue): number {
	return Math.max(...CUES[cue].map((l) => (l.delay ?? 0) + l.attack + l.decay));
}

/**
 * Decides whether a cue may play now, so fast clicking doesn't stack sounds into noise: the same cue again within
 * 120ms is dropped, any cue within 40ms of the last one is dropped, and at most three play in any 600ms.
 */
export class CueGate {
	private played: { cue: Cue; at: number }[] = [];

	allow(cue: Cue, now: number): boolean {
		this.played = this.played.filter((p) => now - p.at < 600);
		const last = this.played.at(-1);
		if (last && now - last.at < 40) return false;
		if (this.played.some((p) => p.cue === cue && now - p.at < 120)) return false;
		if (this.played.length >= 3) return false;
		this.played.push({ cue, at: now });
		return true;
	}
}
