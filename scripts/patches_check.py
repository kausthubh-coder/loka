"""Lists edits in the build checkout's source tree that patches/loka doesn't capture.

  python scripts/patches_check.py [--patches DIR]

Loka's C++ is written in C:\\src\\loka\\build\\src and saved as patches with export_patch.py. An edit that was never
exported lives only in that folder: the next fresh unpack (a Helium merge, a new machine) loses it. This checks each
file Loka touches, which is every file with a saved original in patch-orig, every file a Loka patch changes, and every
file in a Loka-only folder (loka_sidebar and the like), against what applying patches/loka to the original gives.

Exit code 0 when the tree matches the patches, 1 when something is missing (each line says what and how to fix it),
2 when there is no source tree to check.
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_patch import ORIG_DIR, ROOT, SOURCE_TREE, read  # noqa: E402
from loka_brand import BRANDED_STRINGS, branded_strings  # noqa: E402

# Folders only Loka writes, searched for new files no patch lists. components/loka_sidebar/dist is the built page
# that `bun run webui:build` copies in, so it isn't source.
LOKA_FOLDERS = ['chrome/browser/ui/webui/loka_sidebar', 'components/loka_sidebar']
GENERATED = ['components/loka_sidebar/dist/']


def loka_patches(patches_dir: Path) -> list[Path]:
    series = (patches_dir / 'series').read_text(encoding='utf-8').splitlines()
    return [patches_dir / line.strip() for line in series if line.strip().startswith('loka/')]


def parse_patch(text: str) -> dict[str, tuple[bool, list[tuple[int, list[str]]]]]:
    """file -> (is new, hunks). Each hunk is (old start line, its lines with their ' ', '-', '+' prefix)."""
    files: dict[str, tuple[bool, list[tuple[int, list[str]]]]] = {}
    lines = text.splitlines(keepends=True)
    i = 0
    while i < len(lines):
        if lines[i].startswith('--- ') and i + 1 < len(lines) and lines[i + 1].startswith('+++ '):
            new = lines[i][4:].strip() == '/dev/null'
            name = lines[i + 1][4:].strip().split('\t')[0]
            name = name[2:] if name.startswith('b/') else name
            hunks: list[tuple[int, list[str]]] = []
            files[name] = (new, hunks)
            i += 2
            while i < len(lines) and lines[i].startswith('@@'):
                m = re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@', lines[i])
                if not m:
                    break
                old_left = int(m.group(2) or 1)
                new_left = int(m.group(4) or 1)
                body: list[str] = []
                i += 1
                while i < len(lines) and (old_left > 0 or new_left > 0):
                    line = lines[i]
                    if line.startswith('\\'):
                        body[-1] = body[-1].rstrip('\n')
                    else:
                        body.append(line if line.endswith('\n') else line + '\n')
                        if line[0] in ' -':
                            old_left -= 1
                        if line[0] in ' +':
                            new_left -= 1
                    i += 1
                if i < len(lines) and lines[i].startswith('\\'):
                    body[-1] = body[-1].rstrip('\n')
                    i += 1
                hunks.append((int(m.group(1)), body))
        else:
            i += 1
    return files


def apply(original: list[str], hunks: list[tuple[int, list[str]]]) -> list[str] | None:
    """The original with the hunks applied, or None when a hunk's context doesn't match."""
    out: list[str] = []
    at = 0
    for start, body in hunks:
        old = [line[1:] for line in body if line[0] in ' -']
        new = [line[1:] for line in body if line[0] in ' +']
        pos = start - 1 if old else start
        if original[pos:pos + len(old)] != old:
            return None
        out += original[at:pos] + new
        at = pos + len(old)
    return out + original[at:]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--patches', default=str(ROOT / 'patches'))
    args = parser.parse_args()
    if not SOURCE_TREE.exists():
        print(f'patches:check: no source tree at {SOURCE_TREE}; nothing to check.')
        sys.exit(2)

    owner: dict[str, str] = {}
    expected: dict[str, tuple[bool, list[tuple[int, list[str]]]]] = {}
    problems: list[str] = []
    for patch in loka_patches(Path(args.patches)):
        for name, parsed in parse_patch(patch.read_text(encoding='utf-8')).items():
            if name in owner:
                problems.append(f'{name}: changed by both {owner[name]} and {patch.name}; keep each file in one patch')
            owner[name] = patch.name
            expected[name] = parsed

    saved = {p.relative_to(ORIG_DIR).as_posix() for p in ORIG_DIR.rglob('*') if p.is_file()} if ORIG_DIR.exists() else set()
    in_folders = {
        p.relative_to(SOURCE_TREE).as_posix()
        for folder in LOKA_FOLDERS
        if (SOURCE_TREE / folder).exists()
        for p in (SOURCE_TREE / folder).rglob('*')
        if p.is_file()
    }
    in_folders = {f for f in in_folders if not any(f.startswith(g) for g in GENERATED)}

    unexported: list[str] = []
    branded = {rel for rel in BRANDED_STRINGS if (SOURCE_TREE / rel).exists()}
    for rel in sorted(saved | set(expected) | in_folders | branded):
        current = read(SOURCE_TREE / rel)
        if not (SOURCE_TREE / rel).exists():
            problems.append(f'{rel}: in {owner.get(rel, "patch-orig")} but missing from {SOURCE_TREE}')
            continue
        if rel in BRANDED_STRINGS and rel not in expected:
            # loka_brand.py renames it on every apply: it must be the renaming of its original (of itself when there
            # is no saved original; renaming twice changes nothing).
            source = ''.join(read(ORIG_DIR / rel) if rel in saved else current)
            if branded_strings(source, SOURCE_TREE) != ''.join(current):
                problems.append(f'{rel}: not loka_brand.py\'s renaming of it; run python scripts/loka_brand.py apply --no-names')
            continue
        if rel not in expected:
            if rel in saved and read(ORIG_DIR / rel) == current:
                continue  # copied to patch-orig, never edited
            problems.append(f'{rel}: edited in the source tree, in no Loka patch')
            unexported.append(rel)
            continue
        new, hunks = expected[rel]
        original = [] if new else read(ORIG_DIR / rel)
        if not new and rel not in saved:
            problems.append(f'{rel}: changed by {owner[rel]} but has no saved original in {ORIG_DIR}')
            continue
        result = apply(original, hunks)
        if result is None:
            problems.append(f'{rel}: {owner[rel]} no longer applies to its saved original in {ORIG_DIR}')
        elif result != current:
            problems.append(f'{rel}: edited since {owner[rel]} was exported')
            unexported.append(rel)

    checked = len(saved | set(expected) | in_folders)
    if not problems:
        print(f'patches:check: {checked} files in {SOURCE_TREE} match patches/loka.')
        return
    print(f'patches:check: {len(problems)} of {checked} files in {SOURCE_TREE} differ from patches/loka:')
    for line in problems:
        print(f'  {line}')
    if unexported:
        print('\nExport them into the patch that owns them (a file in no patch needs a patch chosen for it), e.g.:')
        by_patch: dict[str, list[str]] = {}
        for rel in unexported:
            by_patch.setdefault(owner.get(rel, '<patch name>.patch'), []).append(rel)
        for patch_name, files in by_patch.items():
            # export_patch rewrites the whole patch, so it needs every file the patch already has.
            all_files = sorted(set(files) | {f for f, p in owner.items() if p == patch_name})
            print(f'  python scripts/export_patch.py {patch_name.removesuffix(".patch")} {" ".join(all_files)}')
    sys.exit(1)


if __name__ == '__main__':
    main()
