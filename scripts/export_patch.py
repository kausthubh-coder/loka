"""Writes a Loka patch from edits made directly in the build checkout's source tree.

  python scripts/export_patch.py <patch name> <file>... [--orig DIR]

Each file is a path under build/src. Edited files are diffed against their saved original in --orig (default
C:\\src\\loka\\patch-orig, where a copy is kept before the first edit); files with no original there are new and
diff against nothing. The patch lands in patches/loka/<name>.patch, in the a/ b/ form quilt applies, and the name is
added to the end of patches/series once.
"""
import argparse
import difflib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_TREE = Path(r'C:\src\loka\build\src')


def read(path: Path) -> list[str]:
    return path.read_text(encoding='utf-8').splitlines(keepends=True) if path.exists() else []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('name')
    parser.add_argument('files', nargs='+')
    parser.add_argument('--orig', default=r'C:\src\loka\patch-orig')
    args = parser.parse_args()

    out = []
    for file in sorted(set(args.files)):
        rel = file.replace('\\', '/')
        before = read(Path(args.orig) / rel)
        after = read(SOURCE_TREE / rel)
        if not after:
            sys.exit(f'{rel} is missing from the source tree')
        diff = list(difflib.unified_diff(before, after, f'a/{rel}' if before else '/dev/null', f'b/{rel}', n=3))
        for line in diff:
            out.append(line if line.endswith('\n') else line + '\n\\ No newline at end of file\n')
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
