import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UX } from "./verify.mjs";

// The verify-loka feature map and `bun run verify -- --ux` must name the same features, and every recipe and flow the
// table names must exist, or `--ux` sends an agent to a check that isn't there.
const FEATURES = join(import.meta.dirname, "..", ".agents", "skills", "verify-loka", "features");
const files = readdirSync(FEATURES)
	.filter((f) => f.endsWith(".md") && f !== "README.md")
	.map((f) => f.slice(0, -3));

test("every feature file has a verify --ux entry, and every entry has a file", () => {
	expect(Object.keys(UX).sort()).toEqual(files.sort());
});

test("every feature file says how to run it: bun run verify -- --ux <id>", () => {
	const missing = files.filter(
		(id) => !readFileSync(join(FEATURES, `${id}.md`), "utf8").includes(`bun run verify -- --ux ${id}`),
	);
	expect(missing).toEqual([]);
});

/** The names a script lists when it's given one it doesn't know. @param {string} usage */
const listed = (usage: string) => usage.split(/[<|>:,\s]+/).filter(Boolean);

test("every prototype recipe the table names is in run.mjs", () => {
	const run = spawnSync("node", [join(FEATURES, "..", "scripts", "run.mjs"), "no-such-recipe"], { encoding: "utf8" });
	const recipes = listed(run.stderr);
	const named = Object.values(UX).flatMap((how) => how.prototype ?? []);
	expect(named.filter((r) => !recipes.includes(r))).toEqual([]);
});

test("every flow the table names is in verify:flows", () => {
	const run = spawnSync("bun", [join(import.meta.dirname, "verify-flows.mjs"), "--only", "no-such-flow"], {
		encoding: "utf8",
	});
	expect(run.status).toBe(1);
	const flows = listed(run.stderr);
	const named = Object.values(UX).flatMap((how) => how.flows ?? []);
	expect(named.filter((f) => !flows.includes(f))).toEqual([]);
});
