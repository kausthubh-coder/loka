"""Writes a Loka patch from edits made directly in the build checkout's source tree.

  python scripts/export_patch.py <patch name> <file>... [--orig DIR]

Each file is a path under build/src. Edited files are diffed against their saved original in --orig (default
C:\\src\\loka\\patch-orig, where a copy is kept before the first edit); files with no original there are new and
diff against nothing. The patch lands in patches/loka/<name>.patch, in the a/ b/ form quilt applies, and the name is
added to the end of patches/series once. `python scripts/patches_check.py` lists edits no patch has captured yet.
"""
import argparse
import difflib
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = Path(os.environ.get('LOKA_BUILD_DIR', r'C:\src\loka'))
SOURCE_TREE = BUILD_DIR / 'build' / 'src'
ORIG_DIR = BUILD_DIR / 'patch-orig'


def read(path: Path) -> list[str]:
    return path.read_text(encoding='utf-8').splitlines(keepends=True) if path.exists() else []


def file_diff(rel: str, orig: Path) -> list[str]:
    """The patch section for one file: its saved original (or nothing, for a new file) against the source tree."""
    before = read(orig / rel)
    after = read(SOURCE_TREE / rel)
    diff = difflib.unified_diff(before, after, f'a/{rel}' if before else '/dev/null', f'b/{rel}', n=3)
    return [line if line.endswith('\n') else line + '\n\\ No newline at end of file\n' for line in diff]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('name')
    parser.add_argument('files', nargs='+')
    parser.add_argument('--orig', default=str(ORIG_DIR))
    args = parser.parse_args()

    out = []
    for file in sorted(set(args.files)):
        rel = file.replace('\\', '/')
        if not (SOURCE_TREE / rel).exists():
            sys.exit(f'{rel} is missing from the source tree')
        out += file_diff(rel, Path(args.orig))
    patch = ROOT / 'patches' / 'loka' / f'{args.name}.patch'
    patch.parent.mkdir(exist_ok=True)
    patch.write_text(''.join(out), encoding='utf-8', newline='\n')

    series = ROOT / 'patches' / 'series'
    entry = f'loka/{args.name}.patch'
    lines = series.read_text(encoding='utf-8').splitlines()
    if entry not in lines:
        series.write_text('\n'.join(lines + [entry]) + '\n', encoding='utf-8', newline='\n')
    print(f'{patch} ({len(out)} lines)')


if __name__ == '__main__':
    main()
