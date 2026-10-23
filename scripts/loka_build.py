#!/usr/bin/env python3
"""
Loka's local (developer) build, on top of Helium's build.py.

  python scripts/loka_build.py first [-j N]        unpack Chromium, apply every patch, build chrome
  python scripts/loka_build.py incremental [-j N]  rebuild chrome after editing build/src
  python scripts/loka_build.py ci <started> [-j N] one stage of the CI build (loka-build.yml)

An incremental build keeps build-status.json and appends to build-times.log in the build checkout
(see build_log.py; `bun run build:status` prints them).

Run it from the build checkout (C:\\src\\loka by default), never from OneDrive.
Helium's `build.py --dev` stops and waits for someone to apply patches with quilt. `first` answers
that prompt by applying the same series a release build applies: Helium core, then patches/series
(which ends with Loka's own patches).
"""
import argparse
import builtins
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'scripts'))
import build  # noqa: E402  Helium's build.py, imported so its helpers and toolchain setup are reused
import build_log  # noqa: E402

SOURCE_TREE = ROOT / 'build' / 'src'


def apply_all_patches(_prompt=''):
    patch_bin = SOURCE_TREE / build._PATCH_BIN_RELPATH
    for series_dir in (ROOT / 'helium-chromium' / 'patches', ROOT / 'patches'):
        print(f'Applying patches from {series_dir}', flush=True)
        build.patches.apply_patches(
            build.patches.generate_patches_from_series(series_dir, resolve=True),
            SOURCE_TREE,
            patch_bin_path=patch_bin,
        )
    # Loka's built-in pages (webui/, packed into components/loka_sidebar) and its brand images aren't patches:
    # build and copy them in before GN runs. The full name substitution is skipped; `apply --no-names` renames only
    # the product's strings (loka_brand.BRANDED_STRINGS).
    subprocess.run(['bun', 'run', 'webui:build'], cwd=ROOT, check=True, shell=True)
    subprocess.run(
        [sys.executable, str(ROOT / 'scripts' / 'loka_brand.py'), 'apply', '--no-names'],
        cwd=ROOT, check=True, env={**os.environ, 'LOKA_SOURCE_TREE': str(SOURCE_TREE)},
    )
    return ''


def first(jobs):
    if (SOURCE_TREE / 'BUILD.gn').exists():
        sys.exit(f'{SOURCE_TREE} already exists. Use "incremental", or delete build\\src (keep build\\download_cache) to start over.')
    builtins.input = apply_all_patches
    sys.argv = ['build.py', '--dev', '-j', str(jobs)]
    lock = ROOT / 'build.lock'
    refused = build_log.take_lock(lock, 'first')
    if refused:
        sys.exit(f'Not building: {refused}.')
    try:
        build.main()
    finally:
        lock.unlink(missing_ok=True)


def ci(started_at, jobs):
    # One stage of .github/workflows/loka-build.yml: first's build under build.py's CI budget (5.5 hours from
    # started_at). It exits 42 when time runs out; the next stage restores the saved tree, and build.py then skips
    # the setup and patching it already finished. A fresh runner holds no other build, so there is no lock.
    builtins.input = apply_all_patches
    sys.argv = ['build.py', '--dev', '--ci', str(started_at), '-j', str(jobs)]
    build.main()


def incremental(jobs):
    if not (SOURCE_TREE / 'out' / 'Default' / 'build.ninja').exists():
        sys.exit('No previous build found. Run "first" before "incremental".')
    os.chdir(SOURCE_TREE)
    os.environ.setdefault('SISO_PATH', str(SOURCE_TREE / 'third_party/siso/cipd/siso.exe'))
    command = (sys.executable, 'third_party\\depot_tools\\autoninja.py', '-j', str(jobs), '-C', 'out\\Default', 'chrome')
    # What Helium's build._run_build_process sends cmd.exe (the compiler's environment, then the build), run through
    # build_log so build-status.json and build-times.log say how it is going and how long it took.
    cmd_input = '\n'.join([
        f'call "{build._get_vcvars_path()}" >nul',
        'set DEPOT_TOOLS_WIN_TOOLCHAIN=0',
        ' '.join(map('"{}"'.format, command)),
        'exit\n',
    ])
    code = build_log.run(['cmd.exe', '/k'], cmd_input, build_dir=ROOT, mode='incremental', jobs=jobs)
    if code:
        sys.exit(code)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('mode', choices=['first', 'incremental', 'ci'])
    # ci: when the stage's job started (Unix seconds); the build stops 5.5 hours after it.
    parser.add_argument('started_at', type=int, nargs='?')
    # About 2.5 GB of RAM per compile job; 6 fits a 16 GB laptop with room for the linker.
    parser.add_argument('-j', type=int, default=int(os.environ.get('LOKA_JOBS', '6')), dest='jobs')
    args = parser.parse_args()
    if args.mode == 'ci':
        if args.started_at is None:
            parser.error('ci needs the job start time: loka_build.py ci <unix seconds>')
        ci(args.started_at, args.jobs)
    elif args.mode == 'first':
        first(args.jobs)
    else:
        incremental(args.jobs)


if __name__ == '__main__':
    main()
