import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EVENTS, MESSAGES, PLANNED_EVENTS, PLANNED_MESSAGES } from "./messages";

// The handler as it is in the build checkout when there is one (it may be ahead of the patch), else as the patch
// adds it. Only the patch's added lines count, so the test reads the same C++ either way.
const BUILT = String.raw`C:\src\loka\build\src\chrome\browser\ui\webui\loka_sidebar\loka_sidebar_handler.cc`;
const PATCH = join(import.meta.dirname, "..", "..", "patches", "loka", "loka-native-sidebar.patch");

function handlerSource(): { from: string; code: string } {
	if (existsSync(BUILT)) return { from: BUILT, code: readFileSync(BUILT, "utf8") };
	const patch = readFileSync(PATCH, "utf8");
	const start = patch.indexOf("+++ b/chrome/browser/ui/webui/loka_sidebar/loka_sidebar_handler.cc");
	const end = patch.indexOf("\n--- ", start);
	const added = patch
		.slice(start, end === -1 ? undefined : end)
		.split("\n")
		.filter((line) => line.startsWith("+") && !line.startsWith("+++"))
		.map((line) => line.slice(1));
	return { from: PATCH, code: added.join("\n") };
}

const { from, code } = handlerSource();
const registered = [...code.matchAll(/\badd\("(\w+)",/g)].map((m) => m[1]);
const fired = [...new Set([...code.matchAll(/FireWebUIListener\(\s*"([\w-]+)"/g)].map((m) => m[1]))];

test(`the handler registers exactly the messages the table lists as live (${from})`, () => {
	expect(registered.sort()).toEqual([...MESSAGES].sort());
});

test("the handler fires exactly the events the table lists as live", () => {
	expect(fired.sort()).toEqual([...EVENTS].sort());
});

test("planned names aren't answered yet, so moving one to the live list is a conscious step", () => {
	expect(PLANNED_MESSAGES.filter((name) => registered.includes(name))).toEqual([]);
	expect(PLANNED_EVENTS.filter((name) => fired.includes(name))).toEqual([]);
});
