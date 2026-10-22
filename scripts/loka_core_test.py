#!/usr/bin/env python3
"""Builds and runs the C++ model's tests (components/loka/core) against a model-cases.json.

  python scripts/loka_core_test.py <model-cases.json> [-j N]

The target links only //base and gtest, so it builds in minutes. It takes build.lock like any build, so it refuses
while chrome is building and nothing builds chrome meanwhile. `bun run model:cases -- --cpp` runs it.
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'scripts'))
import build  # noqa: E402  Helium's build.py, for the compiler's environment
import build_log  # noqa: E402

BUILD_DIR = Path(os.environ.get('LOKA_BUILD_DIR', r'C:\src\loka'))
SOURCE_TREE = BUILD_DIR / 'build' / 'src'
TARGET = 'components/loka/core:loka_core_unittests'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('cases')
    parser.add_argument('-j', type=int, default=int(os.environ.get('LOKA_JOBS', '6')), dest='jobs')
    args = parser.parse_args()
    cases = Path(args.cases).resolve()
    lock = BUILD_DIR / 'build.lock'
    refused = build_log.take_lock(lock, 'loka_core_unittests')
    if refused:
        sys.exit(f'Not building: {refused}.')
    try:
        command = (sys.executable, 'third_party\\depot_tools\\autoninja.py', '-j', str(args.jobs), '-C', 'out\\Default',
                   TARGET)
        script = '\n'.join([
            f'call "{build._get_vcvars_path()}" >nul',
            'set DEPOT_TOOLS_WIN_TOOLCHAIN=0',
            ' '.join(map('"{}"'.format, command)),
            'exit %ERRORLEVEL%\n',
        ])
        env = {**os.environ, 'SISO_PATH': str(SOURCE_TREE / 'third_party/siso/cipd/siso.exe')}
        built = subprocess.run(['cmd.exe', '/k'], input=script, text=True, cwd=SOURCE_TREE, env=env)
        if built.returncode:
            sys.exit(built.returncode)
    finally:
        lock.unlink(missing_ok=True)
    tests = SOURCE_TREE / 'out' / 'Default' / 'loka_core_unittests.exe'
    ran = subprocess.run([str(tests)], env={**os.environ, 'LOKA_MODEL_CASES': str(cases)})
    sys.exit(ran.returncode)


if __name__ == '__main__':
    main()
