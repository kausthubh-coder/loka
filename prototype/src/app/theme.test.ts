import { expect, test } from "bun:test";
import { resolveScheme } from "./theme.logic";

test("a space's own choice wins; system follows the computer", () => {
	expect([resolveScheme("light", true), resolveScheme("dark", false)]).toEqual(["light", "dark"]);
	expect([resolveScheme("system", true), resolveScheme("system", false)]).toEqual(["dark", "light"]);
});
