import { expect, test } from "bun:test";
import { arrivePath, leavePath, ORBIT, orbitFrames, orbitPoint } from "./orbit.logic";

// A sidebar 272 px wide: its horizon reaches 18 px past it.
const WIDTH = 290;
const NEIGHBOUR_SCALE = 22 / 360;

test("the places: the big planet across the middle, its neighbours 33 px in from each side", () => {
	expect(orbitPoint("horizon", WIDTH)).toEqual({ x: 145, top: 216 - 165.6, s: 1, off: false });
	expect(orbitPoint("left", WIDTH)).toMatchObject({ x: 33, s: NEIGHBOUR_SCALE, off: false });
	expect(orbitPoint("right", WIDTH)).toMatchObject({ x: 257, off: false });
	expect(orbitPoint("offRight", WIDTH)).toMatchObject({ x: 323, off: true });
});

test("the planet you were on shrinks into its neighbour place, and lands before the switch ends", () => {
	const { body } = orbitFrames(leavePath(orbitPoint("left", WIDTH), WIDTH), WIDTH, 10);
	expect(body[0]).toMatchObject({ transform: "translate3d(0.00px, 0.00px, 0) scale(1.0000)", opacity: 1 });
	// The left neighbour's centre is (33, 31); the big planet's (145, 216).
	const landed = `translate3d(-112.00px, -185.00px, 0) scale(${NEIGHBOUR_SCALE.toFixed(4)})`;
	expect(body[8]?.transform).toBe(landed);
	expect(body[10]?.transform).toBe(landed);
});

test("the one you picked grows out of its place into the horizon", () => {
	const { body, horizon, round } = orbitFrames(arrivePath(orbitPoint("right", WIDTH), WIDTH), WIDTH, 10);
	expect(body[0]?.transform).toBe(`translate3d(112.00px, -185.00px, 0) scale(${NEIGHBOUR_SCALE.toFixed(4)})`);
	expect(body[10]).toMatchObject({ transform: "translate3d(0.00px, 0.00px, 0) scale(1.0000)", opacity: 1 });
	// It starts as the round planet and ends as the horizon's drawing.
	expect([horizon[0]?.opacity, round[0]?.opacity]).toEqual([0, 1]);
	expect([horizon[10]?.opacity, round[10]?.opacity]).toEqual([1, 0]);
});

test("a planet with no place on screen fades on its way off or in from past the edge", () => {
	const leaving = leavePath(orbitPoint("offLeft", WIDTH), WIDTH);
	expect(leaving(0).o).toBe(1);
	expect(leaving(ORBIT.leaveEnd).o).toBe(0);
	const arriving = arrivePath(orbitPoint("offRight", WIDTH), WIDTH);
	expect(arriving(0).o).toBe(0);
	expect(arriving(1).o).toBe(1);
});

test("it grows without shrinking back on the way", () => {
	const path = arrivePath(orbitPoint("left", WIDTH), WIDTH);
	const scales = Array.from({ length: 21 }, (_, k) => path(k / 20).s);
	expect(scales.every((s, i) => i === 0 || s >= (scales[i - 1] ?? 0))).toBe(true);
});
