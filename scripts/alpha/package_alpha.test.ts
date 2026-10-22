import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("the alpha zip ships Loka's licenses and NOTICE.txt beside Loka.exe", () => {
	// package.json runs the packager with node; --list needs no build, so it runs on any machine.
	const listed = spawnSync("node", [join(import.meta.dirname, "package_alpha.mjs"), "--list"], {
		encoding: "utf8",
		env: { ...process.env, LOKA_VERSION: "0.1.0-alpha.9" },
	});
	expect(listed.stderr).toBe("");
	expect(listed.status).toBe(0);
	expect(listed.stdout.split(/\r?\n/)).toEqual([
		"Loka-0.1.0-alpha.9-windows-x64.zip",
		"  Loka-0.1.0-alpha.9-windows-x64\\Loka.exe",
		"  Loka-0.1.0-alpha.9-windows-x64\\README.txt",
		"  Loka-0.1.0-alpha.9-windows-x64\\LICENSE",
		"  Loka-0.1.0-alpha.9-windows-x64\\LICENSE.ungoogled_chromium",
		"  Loka-0.1.0-alpha.9-windows-x64\\NOTICE.txt",
		"  Loka-0.1.0-alpha.9-windows-x64\\app\\",
		"",
	]);
});
