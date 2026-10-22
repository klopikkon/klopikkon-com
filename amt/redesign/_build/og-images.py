#!/usr/bin/env python3
"""One-shot Open Graph cards for product pages.

Draws 1200×630 PNG files into amt/redesign/og/. Each card shows the AMT logo,
the published name, SKU, CAS, and family. Prices are not read and not drawn.
The files are then palette-quantised (pngquant --quality=55-80, then oxipng)
so the folder stays under 20 MB. Install the tools with:

    npm install pngquant-bin oxipng-bin

and put that package's node_modules/.bin on PATH. Without them, the script
falls back to a 32-colour Pillow quantise.

Run from the repo root:

    python3 amt/redesign/_build/og-images.py
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "og"
WIDTH = 1200
HEIGHT = 630
BG = (243, 240, 232)
INK = (28, 25, 23)
ACCENT = (11, 63, 134)
MUTED = (70, 64, 58)
RULE = (210, 204, 194)
WHITE = (255, 255, 255)
FONT_BOLD = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
FONT_MEDIUM = "/usr/share/fonts/truetype/macos/Inter-Medium.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/macos/Inter-Regular.ttf"
CAS_RE = re.compile(r"\d{2,7}-\d{2}-\d")
UNPUBLISHED = {"", "n/a", "na", "none", "not published", "unknown", "no cas#"}
FAMILY_FALLBACK = {
    "lipids": "Lipids",
    "peg": "PEG reagents and linkers",
    "fluorophores": "Fluorophores and dyes",
    "organoborons": "Organoborons",
    "other": "Other",
}


def load_json(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text())


def family_titles() -> dict[str, str]:
    titles = dict(FAMILY_FALLBACK)
    fixture = load_json(ROOT / "_build" / "fixtures" / "site.json") or {}
    data = load_json(ROOT / "data" / "site.json") or {}
    rows = data.get("families") if isinstance(data.get("families"), list) else fixture.get("families") or []
    for row in rows:
        if isinstance(row, dict) and row.get("id") and row.get("title"):
            titles[str(row["id"])] = str(row["title"]).strip()
    return titles


def published_cas(value) -> str:
    text = str(value or "").strip()
    if text.lower() in UNPUBLISHED or not CAS_RE.search(text):
        return "Not published"
    return text


def display_name(product: dict) -> str:
    name = str(product.get("name") or "").strip()
    if name:
        return name
    return str(product.get("sku") or product.get("id") or "").strip()


def wrap(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        trial = word if not current else f"{current} {word}"
        if font.getlength(trial) <= max_width:
            current = trial
            continue
        if current:
            lines.append(current)
            current = ""
        if font.getlength(word) <= max_width:
            current = word
            continue
        chunk = ""
        for char in word:
            if font.getlength(chunk + char) <= max_width:
                chunk += char
            else:
                if chunk:
                    lines.append(chunk)
                chunk = char
        current = chunk
    if current:
        lines.append(current)
    return lines or [""]


def fit_name(text: str, max_width: int, max_height: int):
    chosen = None
    for size in range(52, 20, -2):
        font = ImageFont.truetype(FONT_BOLD, size)
        lines = wrap(text, font, max_width)
        line_height = int(size * 1.22)
        if len(lines) * line_height <= max_height:
            return font, lines, line_height
        chosen = (font, lines, line_height)
    font, lines, line_height = chosen
    max_lines = max(1, max_height // line_height)
    lines = lines[:max_lines]
    if lines:
        lines[-1] = lines[-1].rstrip(" -") + "…"
    return font, lines, line_height


def load_logo() -> Image.Image:
    logo = Image.open(ROOT / "assets" / "amt-logo.png").convert("RGBA")
    height = 108
    width = max(1, round(logo.width * height / logo.height))
    return logo.resize((width, height), Image.Resampling.LANCZOS)


def assert_no_price(*values: str) -> None:
    for value in values:
        if "$" in value or "€" in value or "£" in value or re.search(r"\bquote\b", value, re.I):
            raise SystemExit(f"Refusing to draw a price onto a preview: {value!r}")


def draw_card(product: dict, titles: dict[str, str], logo: Image.Image) -> Image.Image:
    name = display_name(product)
    sku = str(product.get("sku") or "Not published").strip() or "Not published"
    cas = published_cas(product.get("cas"))
    family = titles.get(str(product.get("family") or "other"), "Other")
    assert_no_price(name, sku, cas, family)

    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 18, HEIGHT), fill=ACCENT)

    plate = Image.new("RGB", (logo.width + 28, logo.height + 28), WHITE)
    plate.paste(logo, (14, 14), logo)
    image.paste(plate, (52, 40))

    family_font = ImageFont.truetype(FONT_MEDIUM, 26)
    label_font = ImageFont.truetype(FONT_MEDIUM, 22)
    value_font = ImageFont.truetype(FONT_REGULAR, 32)
    draw.text((52, 196), family, font=family_font, fill=ACCENT)

    name_top = 248
    name_limit = 430
    font, lines, line_height = fit_name(name, WIDTH - 104, name_limit - name_top)
    y = name_top
    for line in lines:
        draw.text((52, y), line, font=font, fill=INK)
        y += line_height

    meta_top = 470
    draw.line((52, meta_top, WIDTH - 52, meta_top), fill=RULE, width=2)
    draw.text((52, meta_top + 28), "SKU", font=label_font, fill=MUTED)
    draw.text((160, meta_top + 22), sku, font=value_font, fill=INK)
    draw.text((52, meta_top + 88), "CAS", font=label_font, fill=MUTED)
    draw.text((160, meta_top + 82), cas, font=value_font, fill=INK)
    return image


def main() -> None:
    products = load_json(ROOT / "data" / "products.json")
    if not isinstance(products, list) or not products:
        raise SystemExit("data/products.json is missing")
    titles = family_titles()
    logo = load_logo()
    OUT.mkdir(parents=True, exist_ok=True)
    keep = set()
    for product in products:
        product_id = str(product.get("id") or "")
        if not product_id or "/" in product_id or ".." in product_id:
            raise SystemExit(f"Unsafe product id: {product_id!r}")
        card = draw_card(product, titles, logo)
        dest = OUT / f"{product_id}.png"
        card.save(dest, "PNG", optimize=True)
        keep.add(dest.name)
    for stale in OUT.glob("*.png"):
        if stale.name not in keep:
            stale.unlink()
    quantise_cards(OUT)
    total = sum(path.stat().st_size for path in OUT.glob("*.png"))
    print(f"og cards: {len(keep)} files, {total} bytes")


def quantise_cards(directory: Path) -> None:
    """Palette PNG via pngquant (npx pngquant-bin) then oxipng, so the folder stays small."""
    files = sorted(directory.glob("*.png"))
    if not files:
        return
    pngquant = shutil.which("pngquant")
    oxipng = shutil.which("oxipng")
    if pngquant:
        for path in files:
            subprocess.run(
                [pngquant, "--quality=55-80", "--speed", "1", "-f", "-o", str(path), str(path)],
                check=True,
            )
        if oxipng:
            subprocess.run([oxipng, "-o", "2", "--strip", "safe", "-q", *map(str, files)], check=True)
        return
    # Fallback when the dev binaries are not installed. 32 colours keeps text readable.
    for path in files:
        image = Image.open(path).convert("RGB")
        image.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(
            path, "PNG", optimize=True
        )


if __name__ == "__main__":
    main()
