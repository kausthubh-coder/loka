import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EVENTS, MESSAGES, PLANNED_EVENTS, PLANNED_MESSAGES } from "./messages";

// The handler (loka_sidebar_handler*.cc) as it is in the build checkout when there is one, since it may be ahead of
// the patch, else as loka-native-sidebar.patch adds it. Only the patch's added lines count, so both read as C++.
const BUILT = String.raw`C:\src\loka\build\src\chrome\browser\ui\webui\loka_sidebar`;
const PATCH = join(import.meta.dirname, "..", "..", "patches", "loka", "loka-native-sidebar.patch");
const HANDLER_FILE = /^loka_sidebar_handler.*\.cc$/;

function handlerSource(): { from: string; code: string } {
	if (existsSync(BUILT)) {
		const files = readdirSync(BUILT).filter((f) => HANDLER_FILE.test(f));
		return { from: BUILT, code: files.map((f) => readFileSync(join(BUILT, f), "utf8")).join("\n") };
	}
	const code: string[] = [];
	let inHandler = false;
	for (const line of readFileSync(PATCH, "utf8").split("\n")) {
		if (line.startsWith("+++ ")) {
			const file = line.slice(4).split("/").at(-1) ?? "";
			inHandler = line.includes("/loka_sidebar/") && HANDLER_FILE.test(file);
		} else if (inHandler && line.startsWith("+")) code.push(line.slice(1));
	}
	return { from: PATCH, code: code.join("\n") };
}

const { from, code } = handlerSource();
const registered = [...code.matchAll(/\badd\("(\w+)",/g)].map((m) => m[1] ?? "");
const fired = [...new Set([...code.matchAll(/FireWebUIListener\(\s*"([\w-]+)"/g)].map((m) => m[1] ?? ""))];
/** The names in `names` that none of the lists has. */
const missing = (names: readonly string[], ...lists: (readonly string[])[]) =>
	names.filter((name) => !lists.some((list) => list.includes(name)));

test(`every live message is registered by the handler (${from})`, () => {
	expect(missing(MESSAGES, registered)).toEqual([]);
});

test("every live event is fired by the handler", () => {
	expect(missing(EVENTS, fired)).toEqual([]);
});

test("every name the handler answers or fires is in the table, live or planned", () => {
	expect(missing(registered, MESSAGES, PLANNED_MESSAGES)).toEqual([]);
	expect(missing(fired, EVENTS, PLANNED_EVENTS)).toEqual([]);
});
