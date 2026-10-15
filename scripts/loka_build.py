#!/usr/bin/env python3
"""
Loka's local (developer) build, on top of Helium's build.py.

  python scripts/loka_build.py first [-j N] [--restart]  get Chromium, apply every patch, build chrome
  python scripts/loka_build.py incremental [-j N]  rebuild chrome after editing build/src

Run it from the build checkout (C:\\src\\loka by default), never from OneDrive.
Helium's `build.py --dev` stops and waits for someone to apply patches with quilt. `first` answers
that prompt by applying the same series a release build applies: Helium core, then patches/series
(which ends with Loka's own patches).
"""
import argparse
import builtins
import os
import shutil
import stat
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402  Helium's build.py, imported so its helpers and toolchain setup are reused

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
    return ''


def find_7z():
    """build.py looks 7-Zip up in the registry by default, which installs like scoop's don't write."""
    for candidate in (shutil.which('7z'), r'C:\Program Files\7-Zip\7z.exe'):
        if candidate and Path(candidate).exists():
            return candidate
    sys.exit('7-Zip not found. Install it (winget install 7zip.7zip) and rerun.')


_rmtree = shutil.rmtree


def rmtree_clearing_readonly(path, *args, **kwargs):
    """CIPD writes read-only files, and on a rerun build.py rmtrees folders holding them, which fails on Windows."""
    def onexc(func, failed_path, _exc):
        os.chmod(failed_path, stat.S_IWRITE)
        func(failed_path)
    if not args and not kwargs:
        kwargs['onexc'] = onexc
    return _rmtree(path, *args, **kwargs)


def first(jobs, restart):
    built = (SOURCE_TREE / 'out' / 'Default' / 'build.ninja').exists()
    if built or ((SOURCE_TREE / 'BUILD.gn').exists() and not restart):
        sys.exit(f'{SOURCE_TREE} already exists. Use "incremental", or pass --restart to reset it and start over.')
    # On rerun, clone.py fetches, `git reset --hard`s and cleans the existing tree, so a first build that failed
    # part way restarts from pristine sources; gclient's cache in build\src\uc_staging saves redownloading deps.
    builtins.input = apply_all_patches
    shutil.rmtree = rmtree_clearing_readonly
    sys.argv = ['build.py', '--dev', '-j', str(jobs), '--7z-path', find_7z()]
    build.main()


def incremental(jobs):
    if not (SOURCE_TREE / 'out' / 'Default' / 'build.ninja').exists():
        sys.exit('No previous build found. Run "first" before "incremental".')
    os.chdir(SOURCE_TREE)
    os.environ.setdefault('SISO_PATH', str(SOURCE_TREE / 'third_party/siso/cipd/siso.exe'))
    build._run_build_process(
        sys.executable, 'third_party\\depot_tools\\autoninja.py', '-j', str(jobs), '-C', 'out\\Default', 'chrome')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('mode', choices=['first', 'incremental'])
    parser.add_argument('--restart', action='store_true', help='first: reset a source tree whose first build never reached gn gen')
    # About 2.5 GB of RAM per compile job; 6 fits a 16 GB laptop with room for the linker.
    parser.add_argument('-j', type=int, default=int(os.environ.get('LOKA_JOBS', '6')), dest='jobs')
    args = parser.parse_args()
    # vcvars64.bat runs vswhere.exe by bare name, and the Visual Studio installer doesn't add its folder to PATH.
    installer = Path(os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')) / 'Microsoft Visual Studio' / 'Installer'
    os.environ['PATH'] = f"{installer};{os.environ.get('PATH', '')}"
    if args.mode == 'first':
        first(args.jobs, args.restart)
    else:
        incremental(args.jobs)


if __name__ == '__main__':
    main()
