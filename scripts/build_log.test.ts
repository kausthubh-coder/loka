import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const python = process.platform === "win32" ? "python" : "python3";
let dir = "";
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// A stand-in for the compile: prints progress, a clang error and siso's FAILED line, reads the status file while it
// is still running, then exits 3 like a failed build.
const FAKE_BUILD = String.raw`
import json, sys, pathlib, time
print("[1/3] CXX obj/a.obj", flush=True)
print("....\x1b[31;1m../../chrome/x.cc(4,2): error: use of undeclared identifier 'foo'\x1b[0m", flush=True)
print("FAILED: 1a2b obj/x.obj", flush=True)
for _ in range(100):  # build_log sees the line a moment after it is printed
    try:
        status = json.loads((pathlib.Path(sys.argv[1]) / "build-status.json").read_text())
    except (OSError, ValueError):  # caught mid-swap
        continue
    if (status["last_error"] or "").startswith("FAILED"): break
    time.sleep(0.02)
print("MID-RUN", status["phase"], status["last_error"], flush=True)
sys.exit(3)
`;

const DRIVER = `
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import build_log
sys.exit(build_log.run([sys.executable, "-c", sys.argv[3], sys.argv[2]], "", build_dir=Path(sys.argv[2]), mode="incremental", jobs=6))
`;

/** Runs a fake build through build_log.run in a new build checkout folder, or again in the same one. */
function build(again = false, code = FAKE_BUILD) {
	if (!again) dir = mkdtempSync(join(tmpdir(), "loka-build-log-"));
	return spawnSync(python, ["-c", DRIVER, import.meta.dirname, dir, code], { encoding: "utf8" });
}

// A build that prints build.lock as it sees it while running.
const PEEK_LOCK = `
import json, sys, pathlib
lock = json.loads((pathlib.Path(sys.argv[1]) / "build.lock").read_text())
print("LOCK", lock["mode"], sorted(lock), flush=True)
`;

test("build.lock names the build while it runs and is gone when it ends", () => {
	const run = build(false, PEEK_LOCK);
	expect(run.status).toBe(0);
	expect(run.stdout).toContain("LOCK incremental ['from', 'mode', 'pid', 'started']");
	expect(existsSync(join(dir, "build.lock"))).toBe(false);
});

test("a second build refuses while another live build holds build.lock", () => {
	dir = mkdtempSync(join(tmpdir(), "loka-build-log-"));
	const held = JSON.stringify({ pid: process.pid, started: "2026-10-15T20:00:00", mode: "first", from: "elsewhere" });
	writeFileSync(join(dir, "build.lock"), held);
	const run = build(true);
	expect(run.status).toBe(1);
	expect(run.stdout.trim()).toBe(
		`Not building: build.lock is held by pid ${process.pid} (first build since 2026-10-15T20:00:00). One build at a time; \`bun run build:status\` says how it is going.`,
	);
	expect(readFileSync(join(dir, "build.lock"), "utf8")).toBe(held);
	expect(existsSync(join(dir, "build-status.json"))).toBe(false);
});

test("a lock left by a build that is gone is taken over", () => {
	dir = mkdtempSync(join(tmpdir(), "loka-build-log-"));
	const gone = spawnSync(python, ["-c", "import os; print(os.getpid())"], { encoding: "utf8" }).stdout.trim();
	writeFileSync(join(dir, "build.lock"), JSON.stringify({ pid: Number(gone), started: "x", mode: "incremental" }));
	const run = build(true, PEEK_LOCK);
	expect(run.status).toBe(0);
	expect(run.stdout).toContain("LOCK incremental");
	expect(existsSync(join(dir, "build.lock"))).toBe(false);
});

test("a build passes its output through, and the status file names the last error while it runs", () => {
	const run = build();
	expect(run.status).toBe(3);
	expect(run.stdout).toContain("FAILED: 1a2b obj/x.obj");
	expect(run.stdout).toContain("MID-RUN compiling FAILED: 1a2b obj/x.obj");
});

test("when it ends, the status says how and one line is added to build-times.log", () => {
	build();
	const status = JSON.parse(readFileSync(join(dir, "build-status.json"), "utf8"));
	expect({ ...status, pid: 0, started: "", ended: "" }).toEqual({
		phase: "failed",
		mode: "incremental",
		jobs: 6,
		pid: 0,
		started: "",
		ended: "",
		seconds: 0,
		exit: 3,
		last_error: "FAILED: 1a2b obj/x.obj",
	});
	build(true);
	const lines = readFileSync(join(dir, "build-times.log"), "utf8").trim().split("\n");
	expect(lines.map((l) => l.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/g, "<time>"))).toEqual([
		"start=<time> end=<time> seconds=0 exit=3 jobs=6 mode=incremental",
		"start=<time> end=<time> seconds=0 exit=3 jobs=6 mode=incremental",
	]);
});

test("build:status reads both files back", () => {
	build();
	const run = spawnSync("bun", [join(import.meta.dirname, "browser.mjs"), "status"], {
		encoding: "utf8",
		env: { ...process.env, LOKA_BUILD_DIR: dir },
	});
	const out = run.stdout
		.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/g, "<time>")
		.trim()
		.split(/\r?\n/);
	expect(out).toEqual([
		"Last build: incremental, -j 6, failed (exit 3) at <time> after 0 s",
		"Last error: FAILED: 1a2b obj/x.obj",
		"",
		"Recent builds (build-times.log):",
		"  start=<time> end=<time> seconds=0 exit=3 jobs=6 mode=incremental",
		"",
		"Tests drive: nothing (no build)",
	]);
});

/** build:status's last line in a build checkout made of `files` (path -> content). */
function testsDrive(files: Record<string, string>, env: Record<string, string> = {}) {
	dir = mkdtempSync(join(tmpdir(), "loka-build-log-"));
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(join(dir, file, ".."), { recursive: true });
		writeFileSync(join(dir, file), text);
	}
	const run = spawnSync("bun", [join(import.meta.dirname, "browser.mjs"), "status"], {
		encoding: "utf8",
		env: { ...process.env, LOKA_CHROME: "", ...env, LOKA_BUILD_DIR: dir },
	});
	return (run.stdout.trim().split(/\r?\n/).at(-1) ?? "").replaceAll(dir, "<build>");
}

const DEV_BUILD = join("build", "src", "out", "Default", process.platform === "win32" ? "chrome.exe" : "chrome");
const SNAPSHOT = join("dist", "snapshot", "chrome.exe");

test("tests drive the dev build when no build is running", () => {
	expect(testsDrive({ [DEV_BUILD]: "", [SNAPSHOT]: "", "compile.log": "compile exited with 0\n" })).toBe(
		`Tests drive: ${join("<build>", DEV_BUILD)} (the dev build (no build running))`,
	);
});

test("tests drive the snapshot while a build runs, and nothing when there is none", () => {
	expect(testsDrive({ [DEV_BUILD]: "", [SNAPSHOT]: "", "compile.log": "compile started\n" })).toBe(
		`Tests drive: ${join("<build>", SNAPSHOT)} (the snapshot, since a build is running (compile.log has no exit line yet))`,
	);
	expect(testsDrive({ [DEV_BUILD]: "", "compile.log": "compile started\n" })).toBe(
		"Tests drive: nothing (a build is running (compile.log has no exit line yet) and there is no snapshot)",
	);
});

test("LOKA_CHROME wins", () => {
	expect(testsDrive({ [DEV_BUILD]: "" }, { LOKA_CHROME: join(tmpdir(), "other", "chrome.exe") })).toBe(
		`Tests drive: ${join(tmpdir(), "other", "chrome.exe")} (LOKA_CHROME)`,
	);
});
