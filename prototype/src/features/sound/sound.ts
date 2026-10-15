// Plays Loka's interface sounds with WebAudio. One module for every page (sidebar, command bar, settings, tour), so
// they share one volume, one mute and one throttle. Call playCue() from the handler of the action it confirms.

import { CUES, type Cue, CueGate, type Layer } from "./sound.logic";

let prefs = { on: true, volume: 0.5 };
let context: AudioContext | null = null;
let output: GainNode | null = null;
let noise: AudioBuffer | null = null;
const gate = new CueGate();

/** The window passes the user's Settings in; the module only remembers them. */
export function setSoundPrefs(next: { on: boolean; volume: number }) {
	prefs = next;
	if (output) output.gain.value = next.volume;
}

/**
 * The output chain, made on the first cue: everything goes through one volume, then straight out and through a
 * short, dark echo. The echo is what makes the cues sound distant and spacey; it fades below hearing in about half
 * a second.
 */
function chain(ctx: AudioContext): GainNode {
	const volume = ctx.createGain();
	volume.gain.value = prefs.volume;
	const tone = ctx.createBiquadFilter();
	tone.type = "lowpass";
	tone.frequency.value = 6000;
	volume.connect(tone).connect(ctx.destination);

	const send = ctx.createGain();
	send.gain.value = 0.22;
	const delay = ctx.createDelay(1);
	delay.delayTime.value = 0.13;
	const feedback = ctx.createGain();
	feedback.gain.value = 0.28;
	const dark = ctx.createBiquadFilter();
	dark.type = "lowpass";
	dark.frequency.value = 2200;
	tone.connect(send).connect(delay).connect(dark).connect(feedback).connect(delay);
	dark.connect(ctx.destination);
	return volume;
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
	const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.3), ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	return buffer;
}

function layer(ctx: AudioContext, out: AudioNode, l: Layer, at: number) {
	const start = at + (l.delay ?? 0);
	const end = start + l.attack + l.decay;
	const env = ctx.createGain();
	env.gain.setValueAtTime(0, start);
	env.gain.linearRampToValueAtTime(l.gain, start + l.attack);
	env.gain.exponentialRampToValueAtTime(0.0001, end);
	env.connect(out);
	if (l.wave === "noise") {
		noise ??= noiseBuffer(ctx);
		const source = ctx.createBufferSource();
		source.buffer = noise;
		const band = ctx.createBiquadFilter();
		band.type = "bandpass";
		band.frequency.value = l.from;
		band.Q.value = 1.2;
		source.connect(band).connect(env);
		source.start(start);
		source.stop(end + 0.02);
		return;
	}
	const osc = ctx.createOscillator();
	osc.type = l.wave;
	osc.frequency.setValueAtTime(l.from, start);
	if (l.to) osc.frequency.exponentialRampToValueAtTime(l.to, end);
	osc.connect(env);
	osc.start(start);
	osc.stop(end + 0.02);
}

/**
 * Plays a cue, unless sound is off, the page is hidden, the person hasn't touched this page yet (so nothing ever
 * plays as a page loads), or another cue just played. Never throws: without audio the visual change still happens.
 */
export function playCue(cue: Cue) {
	if (!prefs.on || prefs.volume <= 0) return;
	if (typeof document === "undefined" || document.visibilityState !== "visible") return;
	if (!navigator.userActivation?.hasBeenActive) return;
	if (!gate.allow(cue, performance.now())) return;
	try {
		context ??= new AudioContext({ latencyHint: "interactive" });
		output ??= chain(context);
		if (context.state === "suspended") void context.resume();
		// A few milliseconds ahead, so the first layer's envelope isn't cut by scheduling jitter.
		const at = context.currentTime + 0.005;
		for (const l of CUES[cue]) layer(context, output, l, at);
	} catch {}
}
