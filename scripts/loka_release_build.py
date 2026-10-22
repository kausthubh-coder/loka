#!/usr/bin/env python3
"""
Loka's release build, on top of Helium's build.py, for CI runners.

  python scripts/loka_release_build.py --ci <unix start time> [-j N]

Everything is Helium's build.py (unpack Chromium, apply Helium's patches then patches/series, substitute domains
and names, write args.gn, gn gen, autoninja chrome chromedriver setup mini_installer) plus Loka's two steps that
loka_build.py runs for the dev build: build webui/ into components/loka_sidebar/dist and apply Loka's brand images
and name. Both must run after the patches and Helium's name substitution and before gn gen; build.py's last call
before gn gen in that block is _configure_remoteexec, so that is where they hook in.

Set WINSPARKLE_ED_KEY and WINSPARKLE_AUTHENTICODE_ORG to build the updater in (build.py reads them). Run it from
the repo root on the runner; build/src is made beside it, the same layout as the build checkout.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402  Helium's build.py, run whole; only its last setup step is wrapped

SOURCE_TREE = ROOT / 'build' / 'src'


def loka_steps_then_remoteexec(source_tree):
    env = {**os.environ, 'LOKA_BUILD_DIR': str(ROOT), 'LOKA_SOURCE_TREE': str(source_tree)}
    print('Loka: building webui/ into components/loka_sidebar/dist', flush=True)
    subprocess.run(['bun', 'run', 'webui:build'], cwd=ROOT, check=True, shell=True, env=env)
    print('Loka: applying brand images and the Loka name', flush=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts' / 'loka_brand.py'), 'apply'], cwd=ROOT, check=True, env=env)
    _configure_remoteexec(source_tree)


_configure_remoteexec = build._configure_remoteexec
build._configure_remoteexec = loka_steps_then_remoteexec

if __name__ == '__main__':
    if (SOURCE_TREE / 'BUILD.gn').exists() and '--ci' not in sys.argv:
        sys.exit(f'{SOURCE_TREE} already exists; pass --ci <start> to resume it, or delete it to start over.')
    build.main()
