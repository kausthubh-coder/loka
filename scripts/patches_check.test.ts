import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// A fake build checkout: one Chromium file Loka edits (saved original in patch-orig) and one new Loka file.
const PATCH = `--- a/chrome/app/thing.cc
+++ b/chrome/app/thing.cc
@@ -1,3 +1,3 @@
 one
-two
+TWO
 three
--- /dev/null
+++ b/chrome/browser/ui/webui/loka_sidebar/new.h
@@ -0,0 +1 @@
+// new
`;

let root = "";
afterEach(() => rmSync(root, { recursive: true, force: true }));

function put(path: string, text: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

function checkout() {
	root = mkdtempSync(join(tmpdir(), "loka-patches-check-"));
	put("patch-orig/chrome/app/thing.cc", "one\ntwo\nthree\n");
	put("build/src/chrome/app/thing.cc", "one\nTWO\nthree\n");
	put("build/src/chrome/browser/ui/webui/loka_sidebar/new.h", "// new\n");
	put("build/src/components/loka_sidebar/dist/sidebar.html", "<built page, not source>");
	put("patches/series", "helium/core.patch\nloka/x.patch\n");
	put("patches/loka/x.patch", PATCH);
}

function check() {
	const python = process.platform === "win32" ? "python" : "python3";
	const run = spawnSync(python, [join(import.meta.dirname, "patches_check.py"), "--patches", join(root, "patches")], {
		encoding: "utf8",
		env: { ...process.env, LOKA_BUILD_DIR: root },
	});
	const tree = join(root, "build", "src");
	return { code: run.status, lines: run.stdout.replaceAll(tree, "<tree>").trim().split(/\r?\n/) };
}

test("a tree that is exactly the original plus the patches passes", () => {
	checkout();
	expect(check()).toEqual({ code: 0, lines: ["patches:check: 2 files in <tree> match patches/loka."] });
});

test("an edit made after the export, a new Loka file and an edited original are each named, with the fix", () => {
	checkout();
	put("build/src/chrome/app/thing.cc", "one\nTWO\nthree\nfour\n");
	put("build/src/chrome/browser/ui/webui/loka_sidebar/extra.cc", "// not exported\n");
	put("patch-orig/components/other/page.ts", "a\n");
	put("build/src/components/other/page.ts", "b\n");
	expect(check()).toEqual({
		code: 1,
		lines: [
			"patches:check: 3 of 4 files in <tree> differ from patches/loka:",
			"  chrome/app/thing.cc: edited since x.patch was exported",
			"  chrome/browser/ui/webui/loka_sidebar/extra.cc: edited in the source tree, in no Loka patch",
			"  components/other/page.ts: edited in the source tree, in no Loka patch",
			"",
			"Export them into the patch that owns them (a file in no patch needs a patch chosen for it), e.g.:",
			"  python scripts/export_patch.py x chrome/app/thing.cc chrome/browser/ui/webui/loka_sidebar/new.h",
			"  python scripts/export_patch.py <patch name> chrome/browser/ui/webui/loka_sidebar/extra.cc components/other/page.ts",
		],
	});
});

test("a file copied to patch-orig but never edited is fine", () => {
	checkout();
	put("patch-orig/components/other/page.ts", "same\n");
	put("build/src/components/other/page.ts", "same\n");
	expect(check().code).toBe(0);
});
