// Whether a hidden sidebar that is showing must stay open: the browser slides it away when the mouse leaves, which
// must not happen while someone is typing in it, has a menu open, or is dragging a tab. Each reason comes and goes
// on its own; the browser hears only when the answer changes (holdSidebar).

export type HoldReason = "menu" | "drag" | "input";

export interface Hold {
	reasons: ReadonlySet<HoldReason>;
	/** What the browser was last told. */
	held: boolean;
}

export const NO_HOLD: Hold = { reasons: new Set(), held: false };

/** One reason starts or stops. `send` is the new answer when it changed, else null. */
export function holdChanged(hold: Hold, reason: HoldReason, on: boolean): { hold: Hold; send: boolean | null } {
	const reasons = new Set(hold.reasons);
	if (on) reasons.add(reason);
	else reasons.delete(reason);
	const held = reasons.size > 0;
	return { hold: { reasons, held }, send: held === hold.held ? null : held };
}
