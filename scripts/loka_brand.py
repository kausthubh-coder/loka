#!/usr/bin/env python3
"""
Loka's name and icons in the browser, on top of Helium's branding.

  python scripts/loka_brand.py assets   draw Loka's brand images into resources/loka/ (committed)
  python scripts/loka_brand.py apply    in the build checkout, after `first`: rename to Loka, copy the images,
                                        then rebuild with `loka_build.py incremental`
  python scripts/loka_brand.py apply --no-names
                                        BRANDING, images and the product's strings (BRANDED_STRINGS) only. The
                                        full name substitution rewrites thousands of source files (a near-full
                                        rebuild); the product's own strings are the ones a user reads

Helium's release builds run a name substitution ("Chrome"/"Chromium" -> "Helium") that dev builds skip. `apply` runs
the same substitution with "Loka", rewrites BRANDING, and copies Loka's images over every place Helium's go, using
Helium's own resource lists so nothing is missed when Helium adds one.
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from pathlib import Path
from typing import TYPE_CHECKING

# Pillow only draws the images (`assets`, `apply`): patches_check.py imports the strings renaming from here on
# machines without it, such as CI.
if TYPE_CHECKING:
    from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE_TREE = Path(os.environ.get("LOKA_SOURCE_TREE", ROOT / "build" / "src"))
ASSETS = ROOT / 'resources' / 'loka'
HELIUM_RESOURCES = ROOT / 'helium-chromium' / 'resources'

# The mark: a lit planet with its moon, on a night-sky tile (the same drawing as the reports and the extension icon).
SKY_TOP, SKY_BOTTOM = (22, 52, 74), (9, 16, 24)
SHADE, LIT = (34, 72, 89), (120, 205, 245)


def mark(size: int, tile: bool = True) -> Image.Image:
    """The mark at `size` px, drawn at 4x and scaled down so edges stay smooth."""
    from PIL import Image, ImageDraw, ImageFilter

    s = size * 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    u = s / 64  # the mark is designed on a 64-unit grid
    if tile:
        sky = Image.new('RGBA', (s, s))
        draw = ImageDraw.Draw(sky)
        for y in range(s):
            t = y / s
            draw.line([(0, y), (s, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(SKY_TOP, SKY_BOTTOM)))
        rounded = Image.new('L', (s, s), 0)
        ImageDraw.Draw(rounded).rounded_rectangle([0, 0, s - 1, s - 1], radius=round(15 * u), fill=255)
        img.paste(sky, (0, 0), rounded)
    body = Image.new('L', (s, s), 0)
    ImageDraw.Draw(body).ellipse([(30 - 22) * u, (34 - 22) * u, (30 + 22) * u, (34 + 22) * u], fill=255)
    lit = Image.new('L', (s, s), 0)
    ImageDraw.Draw(lit).ellipse([(20 - 27) * u, (25 - 27) * u, (20 + 27) * u, (25 + 27) * u], fill=255)
    lit = Image.composite(lit, Image.new('L', (s, s), 0), body)
    img.paste(Image.new('RGBA', (s, s), SHADE + (255,)), (0, 0), body)
    img.paste(Image.new('RGBA', (s, s), LIT + (255,)), (0, 0), lit.filter(ImageFilter.GaussianBlur(u * 0.06)))
    moon = Image.new('L', (s, s), 0)
    ImageDraw.Draw(moon).ellipse([(51 - 4.5) * u, (12.5 - 4.5) * u, (51 + 4.5) * u, (12.5 + 4.5) * u], fill=255)
    img.paste(Image.new('RGBA', (s, s), LIT + (255,)), (0, 0), moon)
    return img.resize((size, size), Image.LANCZOS)


def mono(size: int) -> Image.Image:
    """A one-color mark for monochrome spots (the 22 px menu glyph): the planet and moon as white shapes."""
    from PIL import Image

    full = mark(size * 4, tile=False)
    alpha = full.getchannel('A')
    white = Image.new('RGBA', full.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    return white.resize((size, size), Image.LANCZOS)


def wordmark(width: int, height: int, color: tuple[int, int, int]) -> Image.Image:
    """The mark followed by "loka", sized like Helium's product_logo images (140x32 and 280x64)."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    img.paste(mark(height, tile=False), (0, 0), mark(height, tile=False))
    font_path = Path('C:/Windows/Fonts/seguisb.ttf')
    font = ImageFont.truetype(str(font_path), round(height * 0.78)) if font_path.exists() else ImageFont.load_default()
    ImageDraw.Draw(img).text((round(height * 1.2), height // 2), 'loka', font=font, fill=color + (255,), anchor='lm')
    return img


SVG = """<svg width="256" height="256" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16344a"/><stop offset="1" stop-color="#091018"/></linearGradient>
<clipPath id="b"><circle cx="30" cy="34" r="22"/></clipPath></defs>
<rect width="64" height="64" rx="15" fill="url(#s)"/>
<circle cx="30" cy="34" r="22" fill="#224859"/>
<circle cx="20" cy="25" r="27" fill="#78cdf5" clip-path="url(#b)"/>
<circle cx="51" cy="12.5" r="4.5" fill="#78cdf5"/>
</svg>
"""


def assets():
    """Writes Loka's versions of Helium's brand images, under the same names Helium's resource lists use."""
    branding = ASSETS / 'branding'
    (branding / 'app_icon').mkdir(parents=True, exist_ok=True)
    mark(1024).save(branding / 'app_icon' / 'raw.png', optimize=True)
    mark(512).save(branding / 'app_icon' / 'file.png', optimize=True)
    wordmark(140, 32, (24, 28, 34)).save(branding / 'product_logo.png', optimize=True)
    wordmark(280, 64, (24, 28, 34)).save(branding / 'product_logo_200.png', optimize=True)
    wordmark(140, 32, (255, 255, 255)).save(branding / 'product_logo_white.png', optimize=True)
    wordmark(280, 64, (255, 255, 255)).save(branding / 'product_logo_white_200.png', optimize=True)
    mono(22).save(branding / 'product_logo_22_mono.png', optimize=True)
    (branding / 'product_logo.svg').write_text(SVG, encoding='utf-8')
    print(f'Loka brand images written to {ASSETS}')


BRANDING = {
    'COMPANY_FULLNAME': 'The Loka Authors',
    'COMPANY_SHORTNAME': 'The Loka Authors',
    'PRODUCT_FULLNAME': 'Loka',
    'PRODUCT_SHORTNAME': 'Loka',
    'PRODUCT_INSTALLER_FULLNAME': 'Loka Installer',
    'PRODUCT_INSTALLER_SHORTNAME': 'Loka Installer',
    'COPYRIGHT': 'Copyright @LASTCHANGE_YEAR@ The Loka Authors. All rights reserved.',
    'MAC_BUNDLE_ID': 'dev.loka.browser',
}


def rewrite_branding():
    path = SOURCE_TREE / 'chrome' / 'app' / 'theme' / 'chromium' / 'BRANDING'
    lines = []
    for line in path.read_text(encoding='utf-8').splitlines():
        key = line.split('=', 1)[0]
        lines.append(f'{key}={BRANDING[key]}' if key in BRANDING else line)
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')


# The strings files the product's name comes from, renamed on every apply (also with --no-names). Generated rather
# than kept as a patch: a saved copy of a renamed file conflicts with every Chromium or Helium change to it, while
# renaming the file as it is never does. patches_check.py compares them with this renaming of their original.
BRANDED_STRINGS = ['chrome/app/chromium_strings.grd']


def loka_substitution(tree: Path = SOURCE_TREE):
    """Helium's name substitution utilities, pointed at "Loka". Its chrome:// -> helium:// rule is Helium's to keep.
    `tree` is a Chromium tree, for its grit."""
    sys.path.insert(0, str(ROOT / 'helium-chromium' / 'utils'))
    import name_substitution_utils as nsu  # noqa: E402
    nsu.REPLACEMENT_REGEXES = [
        (re.compile(pattern), 'Loka' if replacement == 'Helium' else replacement)
        for pattern, replacement in nsu.REPLACEMENT_REGEXES_STR
        if 'chrome://' not in pattern
    ]
    nsu.add_grit_to_path(tree)
    return nsu


def branded_strings(text: str, tree: Path = SOURCE_TREE) -> str:
    """A grit strings file's text with the product named Loka. Renaming it again changes nothing. Translations
    (.xtb) aren't renamed: a renamed message's fingerprint changes, so other languages show it in English, as they
    did under the old patch."""
    renamed, _fingerprints = loka_substitution(tree).replace_grit_tree(text)
    return renamed


def brand_strings():
    # The first rename keeps the file as it came in patch-orig (export_patch.py's originals), so patches_check.py can
    # tell this renaming from a hand edit on any machine, not only where someone saved an original by hand.
    orig_dir = SOURCE_TREE.parent.parent / 'patch-orig'
    for rel in BRANDED_STRINGS:
        path = SOURCE_TREE / rel
        text = path.read_text(encoding='utf-8')
        orig = orig_dir / rel
        if not orig.exists():
            orig.parent.mkdir(parents=True, exist_ok=True)
            orig.write_text(text, encoding='utf-8', newline='\n')
        path.write_text(branded_strings(text), encoding='utf-8', newline='\n')


def substitute_names():
    """Helium's own name substitution over the whole tree, pointed at "Loka"."""
    loka_substitution()
    import name_substitution  # noqa: E402
    name_substitution.do_substitution(SOURCE_TREE, tarpath=None, workers=4, dry_run=False)


def copy_images():
    """Copies Loka's images to every destination Helium's resource lists give its brand images."""
    sys.path.insert(0, str(ROOT / 'helium-chromium' / 'utils'))
    import generate_resources  # noqa: E402
    import replace_resources  # noqa: E402
    # Helium's generate lists turn raw.png into each size, and into app.ico and document.ico.
    windows_list = (ROOT / 'resources' / 'generate_resources.txt').read_text(encoding='utf-8')
    local = ASSETS / 'generate_resources.txt'
    local.write_text(windows_list.replace('../helium-chromium/resources/', ''), encoding='utf-8')
    generate_resources.generate_resources(local, ASSETS)
    generate_resources.generate_resources(HELIUM_RESOURCES / 'generate_resources.txt', ASSETS)
    for listing in (ROOT / 'resources' / 'platform_resources.txt', HELIUM_RESOURCES / 'helium_resources.txt'):
        brand_lines = [
            line for line in listing.read_text(encoding='utf-8').splitlines()
            if line.startswith(('branding/', 'generated/')) and not line.split()[0].endswith('.icon')
            and (ASSETS / line.split()[0]).exists()
        ]
        filtered = ASSETS / f'{listing.stem}.loka.txt'
        filtered.write_text('\n'.join(brand_lines) + '\n', encoding='utf-8')
        replace_resources.copy_resources(filtered, ASSETS, SOURCE_TREE)


def apply(names: bool = True):
    if not (SOURCE_TREE / 'BUILD.gn').exists():
        sys.exit(f'No source tree at {SOURCE_TREE}; run loka_build.py first.')
    if not (ASSETS / 'branding' / 'app_icon' / 'raw.png').exists():
        sys.exit('No Loka images yet; run: python scripts/loka_brand.py assets')
    rewrite_branding()
    copy_images()
    if names:
        substitute_names()
    else:
        brand_strings()
    print('Loka branding applied. Rebuild: python scripts/loka_build.py incremental')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('step', choices=['assets', 'apply'])
    parser.add_argument('--no-names', action='store_true', help='skip the name substitution (see above)')
    args = parser.parse_args()
    assets() if args.step == 'assets' else apply(names=not args.no_names)


if __name__ == '__main__':
    main()
