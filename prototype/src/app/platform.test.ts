import { expect, test } from "bun:test";
import { platformFrom, shortcutLabel } from "./platform.logic";

test("the platform comes from userAgentData where it exists, else navigator.platform", () => {
	expect(platformFrom("macOS", "MacIntel")).toBe("mac");
	expect(platformFrom("Windows", "Win32")).toBe("windows");
	expect(platformFrom(undefined, "MacIntel")).toBe("mac");
	expect(platformFrom("", "Win32")).toBe("windows");
	expect(platformFrom(undefined, "Linux x86_64")).toBe("linux");
});

test("on a Mac shortcuts say ⌘, ⌥ and ⇧ in macOS's order; elsewhere they stay as written", () => {
	expect(shortcutLabel("Ctrl+H", "mac")).toBe("⌘H");
	expect(shortcutLabel("Ctrl Shift F", "mac")).toBe("⇧⌘F");
	expect(shortcutLabel("Ctrl+Shift+F", "mac")).toBe("⇧⌘F");
	expect(shortcutLabel("Ctrl Alt ↓ / ↑", "mac")).toBe("⌥⌘↓ / ↑");
	expect(shortcutLabel("Ctrl 1 to 9", "mac")).toBe("⌘1 to 9");
	expect(shortcutLabel("Ctrl T or Ctrl K", "mac")).toBe("⌘T or ⌘K");
	expect(shortcutLabel("Change the address (Ctrl+L)", "mac")).toBe("Change the address (⌘L)");
	expect(shortcutLabel("Ctrl+H", "windows")).toBe("Ctrl+H");
	expect(shortcutLabel("Ctrl Shift F", "linux")).toBe("Ctrl Shift F");
});
