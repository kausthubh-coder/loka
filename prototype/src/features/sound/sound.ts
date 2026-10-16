// Plays Loka's interface sounds with WebAudio. One module for every page (sidebar, command bar, settings, tour), so
// they share one volume, one mute and one throttle. Call playCue() from the handler of the action it confirms.

import { CUES, type Cue, CueGate, type Layer } from "./sound.logic";

let prefs = { on: true, volume: 0.5 };
let context: AudioContext | null = null;
let output: GainNode | null = null;
let noise: AudioBuffer | null = null;
const gate = new CueGate();
/** Suspends the audio context once the cues have played out: a running one renders silence on a thread forever. */
let sleepTimer = 0;

/**
 * The context, made once. Making one opens the audio device, which held the sidebar's main thread for 340 ms in
 * the real browser, so it's never made inside an action a cue confirms: after the first input on the page (sound
 * needs one anyway), it's made once the person has left the page alone for a few seconds and the browser is idle.
 * Cues before then stay silent; the action itself is what matters.
 */
function audio(): AudioContext {
	context ??= new AudioContext({ latencyHint: "interactive" });
	output ??= chain(context);
	return context;
}
const QUIET_BEFORE_AUDIO = 3000;
if (typeof window !== "undefined" && "requestIdleCallback" in window) {
	let timer = 0;
	const inputs = ["pointerdown", "pointermove", "keydown", "wheel"] as const;
	const make = () =>
		requestIdleCallback(() => {
			if (context || !prefs.on) return;
			for (const type of inputs) window.removeEventListener(type, wait, true);
			try {
				void audio().suspend();
			} catch {}
		});
	// Every input (after the first) puts the moment off again, until the page has been quiet for long enough.
	const wait = () => {
		window.clearTimeout(timer);
		if (navigator.userActivation?.hasBeenActive) timer = window.setTimeout(make, QUIET_BEFORE_AUDIO);
	};
	for (const type of inputs) window.addEventListener(type, wait, { capture: true, passive: true });
}

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
	if (!context) return;
	try {
		const ctx = audio();
		if (ctx.state === "suspended") void ctx.resume();
		// A few milliseconds ahead, so the first layer's envelope isn't cut by scheduling jitter.
		const at = ctx.currentTime + 0.005;
		if (output) for (const l of CUES[cue]) layer(ctx, output, l, at);
		// The longest cue and its echo are over in about a second and a half.
		window.clearTimeout(sleepTimer);
		sleepTimer = window.setTimeout(() => void ctx.suspend(), 2000);
	} catch {}
}
