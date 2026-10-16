"""Runs a build command while keeping a status file and a log of build times. Used by loka_build.py.

While a build runs, build-status.json in the build checkout says what it is doing:
  {"phase": "compiling" | "done" | "failed", "mode", "jobs", "pid", "started", "ended", "seconds", "exit",
   "last_error"}
When it ends, one line is appended to build-times.log:
  start=2026-10-15T15:35:54 end=2026-10-15T15:37:15 seconds=81 exit=0 jobs=6 mode=incremental
`bun run build:status` prints both.

build.lock in the build checkout holds {"pid", "started", "mode", "from"} while a build runs, so a second build (another
agent, compile.bat, browser:build) refuses instead of fighting over out/Default. A lock whose pid is gone is stale and
is taken over.
"""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ANSI = re.compile(r'\x1b\[[0-9;]*m')
# Clang's "file(line,col): error: ..." and siso/ninja's "FAILED: <step>".
ERROR = re.compile(r'(: (fatal )?error: |^FAILED: |^ninja: error: |^siso: error)')


def _stamp(seconds: float) -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(seconds))


def _write_status(path: Path, status: dict):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(status, indent=2) + '\n', encoding='utf-8')
    # Windows refuses the swap while a reader (build:status) has the file open. The status is a convenience, so a
    # build never fails over it: retry briefly, then leave the previous status in place.
    for _ in range(20):
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.05)


def _alive(pid: int) -> bool:
    if sys.platform == 'win32':
        # os.kill(pid, 0) on Windows sends CTRL_C_EVENT, so ask for the process's exit code instead.
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return False
        code = ctypes.c_ulong()
        kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
        kernel32.CloseHandle(handle)
        return code.value == 259  # STILL_ACTIVE
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def take_lock(lock: Path, mode: str) -> str | None:
    """Creates build.lock, or returns why it can't (another build holds it)."""
    record = json.dumps({'pid': os.getpid(), 'started': _stamp(time.time()), 'mode': mode, 'from': os.getcwd()})
    for _ in range(2):
        try:
            with open(lock, 'x', encoding='utf-8') as f:
                f.write(record + '\n')
            return None
        except FileExistsError:
            try:
                held = json.loads(lock.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                held = {}
            if held.get('pid') and _alive(int(held['pid'])):
                return f"build.lock is held by pid {held['pid']} ({held.get('mode')} build since {held.get('started')})"
            lock.unlink(missing_ok=True)  # stale: its build is gone
    return 'build.lock could not be created'


def run(argv: list[str], stdin_text: str, *, build_dir: Path, mode: str, jobs: int) -> int:
    """Runs argv with stdin_text as its input, passing its output through, and returns its exit code (1 without
    running anything when another build holds build.lock)."""
    lock = build_dir / 'build.lock'
    refused = take_lock(lock, mode)
    if refused:
        print(f'Not building: {refused}. One build at a time; `bun run build:status` says how it is going.', flush=True)
        return 1
    try:
        return _run(argv, stdin_text, build_dir=build_dir, mode=mode, jobs=jobs)
    finally:
        lock.unlink(missing_ok=True)


def _run(argv: list[str], stdin_text: str, *, build_dir: Path, mode: str, jobs: int) -> int:
    status_path = build_dir / 'build-status.json'
    started = time.time()
    status = {'phase': 'compiling', 'mode': mode, 'jobs': jobs, 'pid': os.getpid(), 'started': _stamp(started),
              'ended': None, 'seconds': None, 'exit': None, 'last_error': None}
    _write_status(status_path, status)

    proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    assert proc.stdin and proc.stdout
    proc.stdin.write(stdin_text.encode())
    proc.stdin.close()
    pending = b''
    out = sys.stdout.buffer
    # Chunks, not lines: the build prints its progress dots without newlines.
    while chunk := proc.stdout.read1(65536):
        out.write(chunk)
        out.flush()
        *lines, pending = (pending + chunk).split(b'\n')
        for raw in lines:
            line = ANSI.sub('', raw.decode('utf-8', 'replace')).strip().lstrip('.')
            if ERROR.search(line):
                status['last_error'] = line[:500]
                _write_status(status_path, status)
    code = proc.wait()

    ended = time.time()
    seconds = round(ended - started)
    status.update(phase='done' if code == 0 else 'failed', ended=_stamp(ended), seconds=seconds, exit=code)
    _write_status(status_path, status)
    with open(build_dir / 'build-times.log', 'a', encoding='utf-8', newline='\n') as log:
        log.write(f'start={_stamp(started)} end={_stamp(ended)} seconds={seconds} exit={code} jobs={jobs} mode={mode}\n')
    return code
