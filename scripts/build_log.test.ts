import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

const DRIVER = String.raw`
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import build_log
sys.exit(build_log.run([sys.executable, "-c", sys.argv[3], sys.argv[2]], "", build_dir=Path(sys.argv[2]), mode="incremental", jobs=6))
`;

/** Runs the fake build through build_log.run in a new build checkout folder, or again in the same one. */
function build(again = false) {
	if (!again) dir = mkdtempSync(join(tmpdir(), "loka-build-log-"));
	return spawnSync(python, ["-c", DRIVER, import.meta.dirname, dir, FAKE_BUILD], { encoding: "utf8" });
}

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
	]);
});
