#!/usr/bin/env python3
"""Extract AMT catalogue rows from the PDFs linked on https://www.amtechpl.com/.

Reads the crawl cache under /tmp/amt-crawl (PDFs, homepage HTML, WP JSON, page text).
Writes products, site copy, counts, raw pdftotext, and downloads logos/structure images.

Not part of the static site build. Re-run only after refreshing that cache.
Values are copied from the text layer. Formula and molecular weight are not
catalogue columns; structure drawings are not OCR'd into those fields.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import statistics
import subprocess
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path("/workspace/amt/redesign")
CACHE = Path("/tmp/amt-crawl")
PDF_DIR = CACHE / "pdf"
RAW = ROOT / "data" / "raw"
ASSETS = ROOT / "assets"

UA = "Mozilla/5.0 (compatible; klopikkon-research/1.0; catalogue research)"
SKU_RE = re.compile(r"^AMT[A-Z]{1,6}\d{2,5}-[A-Za-z0-9]+$")
CAS_RE = re.compile(r"^\d{2,8}-\d{2}-\d$")
QTY_RE = re.compile(r"^(\d+(?:\.\d+)?)(mg|g|kg|ug|µg|μg|ml|mL|L)$", re.I)
PRICE_RE = re.compile(r"^\$[\d,]+(?:\.\d{2})?$")
PURITY_LINE_RE = re.compile(r"^High [Pp]urity \d+%$")
ZW_RE = re.compile(r"[\u200b\u200c\u200d\ufeff]")

CATALOGUES = [
    {
        "id": "lipids-20260826",
        "family": "lipids",
        "date": "2026-08-26",
        "file": "AMT-Lipids-20260826.pdf",
        "raw": "lipids-20260826.txt",
        "url": "https://www.amtechpl.com/wp-content/uploads/2026/08/AMT-Lipids-20260826.pdf",
        "title": "AMT Lipid Products – 2026",
    },
    {
        "id": "peg-20260903",
        "family": "peg",
        "date": "2026-09-03",
        "file": "AMT-PEG-Reagents-and-Linkers-Catalogue-List-20260903.pdf",
        "raw": "peg-20260903.txt",
        "url": "https://www.amtechpl.com/wp-content/uploads/2026/09/AMT-PEG-Reagents-and-Linkers-Catalogue-List-20260903.pdf",
        "title": "AMT PEG Reagents & Linkers Catalogue Selection – 2026",
    },
    {
        "id": "fluorophores-2026",
        "family": "fluorophores",
        "date": "2026-01-09",
        "file": "AMT-FluorophoresDyes-Catalogue-List-2026.pdf",
        "raw": "fluorophores-2026.txt",
        "url": "https://www.amtechpl.com/wp-content/uploads/2026/01/AMT-FluorophoresDyes-Catalogue-List-2026.pdf",
        "title": "AMT Fluorophores & Dyes Catalogue Selection – 2026",
    },
    {
        "id": "organoborons-20260421",
        "family": "organoborons",
        "date": "2026-04-21",
        "file": "AMT-Organoboron-Compounds-List-20260421.pdf",
        "raw": "organoborons-20260421.txt",
        "url": "https://www.amtechpl.com/wp-content/uploads/2026/04/AMT-Organoboron-Compounds-List-20260421.pdf",
        "title": "AMT Organoborons Catalogue Selection – 2026",
    },
]


def clean_token(text: str) -> str:
    text = html.unescape(text)
    text = ZW_RE.sub("", text)
    text = text.replace("\u00a0", " ").replace("\u2009", " ").replace("\u202f", " ")
    return re.sub(r"\s+", " ", text).strip()


def pages_bbox(pdf_path: Path):
    html_path = pdf_path.with_suffix(".bbox.html")
    subprocess.check_call(
        ["pdftotext", "-bbox-layout", str(pdf_path), str(html_path)],
        stdout=subprocess.DEVNULL,
    )
    raw = html_path.read_text(errors="replace")
    marks = list(re.finditer(r'<page width="([\d.]+)" height="([\d.]+)"', raw))
    pages = []
    for i, mark in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(raw)
        chunk = raw[mark.start() : end]
        words = []
        for m in re.finditer(
            r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>',
            chunk,
            re.S,
        ):
            x0, y0, x1, y1 = map(float, m.groups()[:4])
            token = clean_token(m.group(5))
            if not token:
                continue
            words.append(
                {
                    "x0": x0,
                    "x1": x1,
                    "y0": y0,
                    "y1": y1,
                    "y": (y0 + y1) / 2,
                    "h": y1 - y0,
                    "t": token,
                }
            )
        pages.append(words)
    html_path.unlink(missing_ok=True)
    return pages


def median(values):
    return statistics.median(values) if values else 0


def is_purity_token(token: str) -> bool:
    if token in {"≥", ">", ">=", "~", "≤", "<"}:
        return True
    return bool(re.fullmatch(r"[>≥~≤]=?\s*\d+(?:\.\d+)?%", token)) or bool(re.fullmatch(r"\d+(?:\.\d+)?%", token))


def parse_price(token: str):
    if token.upper() == "POA" or token.lower() == "price on application":
        return None, "quote", token
    match = PRICE_RE.match(token)
    if not match:
        return None, None, token
    number = float(token.replace("$", "").replace(",", ""))
    if number == int(number):
        number = int(number)
    else:
        number = round(number, 2)
    return number, token, token


# A following line is the rest of a word the PDF wrapped with no hyphen.
# Real wrapped words (acid, ester, ether, …) stay spaced.
_WRAP_FRAGMENT = re.compile(r"^[a-z]{1,6}(?:[^A-Za-z]|$)")
_WHOLE_WORD = {
    "acid",
    "amide",
    "amine",
    "azide",
    "benzo",
    "bis",
    "boronic",
    "ester",
    "ether",
    "iodide",
    "methyl",
    "oxime",
    "phenyl",
    "pinacol",
    "salt",
    "tert",
    "tris",
}


def continues_wrapped_word(line):
    token = line.split(" ", 1)[0]
    if not _WRAP_FRAGMENT.match(token):
        return False
    prefix = re.match(r"^[a-z]+", token).group(0)
    if prefix in _WHOLE_WORD or token.rstrip(",") in _WHOLE_WORD:
        return False
    return True


def join_lines(lines):
    name = ""
    for line in lines:
        if not name:
            name = line
        elif name.endswith("-") or name.endswith("(") or line.startswith(")"):
            name += line
        elif name[-1:].isalnum() and continues_wrapped_word(line):
            name += line
        else:
            name += " " + line
    return re.sub(r"\s+", " ", name).strip()


def lines_from(words):
    grouped = []
    for word in sorted(words, key=lambda w: (w["y"], w["x0"])):
        if not grouped or abs(word["y"] - grouped[-1][0]["y"]) > 1.8:
            grouped.append([word])
        else:
            grouped[-1].append(word)
    return [join_line_words(line) for line in grouped]


def join_line_words(words):
    ordered = sorted(words, key=lambda w: w["x0"])
    text = ""
    prev = None
    for word in ordered:
        if prev is None:
            text = word["t"]
        else:
            gap = word["x0"] - prev["x1"]
            if (
                word.get("subscript")
                or (prev or {}).get("subscript")
                or text.endswith("-")
                or text.endswith("(")
                or word["t"].startswith("-")
            ):
                text += word["t"]
            else:
                text += " " + word["t"]
        prev = word
    return text


def keep_name_column(words):
    """Keep the left-hand name and drop structure-drawing labels.

    Catalogue rows print the name on a shared left margin. Atom labels from
    the structure drawing (O, OH, CH2, …) sit further right, still left of
    the SKU, and use a similar font size, so a plain x-cutoff pulls them
    into the name. A word stays only when it starts on that left margin or
    continues a kept word on the same line across a small gap.
    """
    if len(words) < 2:
        return words
    origin = min(word["x0"] for word in words)
    kept_ids = {id(word) for word in words if word["x0"] <= origin + 18}
    if not kept_ids:
        return words
    pool = [word for word in words if id(word) not in kept_ids]
    changed = True
    while changed:
        changed = False
        still = []
        for word in pool:
            attached = False
            for anchor in words:
                if id(anchor) not in kept_ids:
                    continue
                if abs(word["y"] - anchor["y"]) <= 2.0 and 0 <= word["x0"] - anchor["x1"] <= 8:
                    kept_ids.add(id(word))
                    attached = True
                    changed = True
                    break
            if not attached:
                still.append(word)
        pool = still
    return [word for word in words if id(word) in kept_ids]


def add_subscripts(name_words, nearby):
    chosen = list(name_words)
    seen = {id(word) for word in chosen}
    for word in nearby:
        if id(word) in seen or not re.fullmatch(r"\d", word["t"]):
            continue
        if not 3 <= word["h"] <= 6:
            continue
        for name_word in name_words:
            if abs(word["y"] - name_word["y"]) < 4 and name_word["x0"] - 3 <= word["x0"] <= name_word["x1"] + 6:
                copied = dict(word)
                copied["y"] = name_word["y"]
                copied["subscript"] = True
                chosen.append(copied)
                seen.add(id(word))
                break
    return chosen


def join_cas(parts):
    if not parts:
        return None
    out = []
    i = 0
    while i < len(parts):
        token = parts[i]
        if token == "No" and i + 2 < len(parts) and parts[i + 1] == "CAS" and parts[i + 2] == "#":
            out.append("No CAS#")
            i += 3
            continue
        if token == "No" and i + 1 < len(parts) and parts[i + 1] in {"CAS#", "CAS"}:
            out.append("No CAS#")
            i += 2
            continue
        if token in {"CAS:", "CAS"}:
            i += 1
            continue
        if token == "&" and out and i + 1 < len(parts) and CAS_RE.match(parts[i + 1]):
            out[-1] = out[-1] + " & " + parts[i + 1]
            i += 2
            continue
        if CAS_RE.match(token) and out and CAS_RE.match(out[-1]):
            out.append(token)
            i += 1
            continue
        out.append(token)
        i += 1
    cas = " & ".join(out) if len(out) > 1 else out[0]
    return cas or None


UNITS = {"mg", "g", "kg", "ug", "µg", "μg", "ml", "mL", "l", "L"}
BOILER_TOKENS = {"*", "(All", "prices", "are", "in", "US", "Dollars)"}


def masked_price(token: str) -> bool:
    return bool(re.fullmatch(r"#+", token))


def line_groups(words, tolerance=2.0):
    lines = []
    for word in sorted(words, key=lambda w: (w["y"], w["x0"])):
        if not lines or word["y"] - lines[-1][0]["y"] > tolerance:
            lines.append([word])
        else:
            lines[-1].append(word)
    return lines


def merge_split_qty(words):
    ordered = sorted(words, key=lambda w: w["x0"])
    merged = []
    index = 0
    while index < len(ordered):
        word = ordered[index]
        if index + 1 < len(ordered):
            nxt = ordered[index + 1]
            if re.fullmatch(r"\d+(?:\.\d+)?", word["t"]) and nxt["t"] in UNITS and nxt["x0"] - word["x1"] < 12:
                combined = dict(word)
                combined["t"] = word["t"] + nxt["t"]
                combined["x1"] = nxt["x1"]
                merged.append(combined)
                index += 2
                continue
        merged.append(word)
        index += 1
    return merged


def parse_right(words, sku, page_no):
    cas_parts = []
    purity_parts = []
    packs = []
    unknown = []
    pending_qty = None
    kept = []
    for word in words:
        token = word["t"]
        if token == sku or token in {"Page", "of"}:
            continue
        kept.append(word)
    flat = []
    for line in line_groups(kept):
        flat.extend(merge_split_qty(line))
    index = 0
    while index < len(flat):
        word = flat[index]
        token = word["t"]
        nxt = flat[index + 1]["t"] if index + 1 < len(flat) else ""
        if is_purity_token(token):
            purity_parts.append(token)
            index += 1
            continue
        if token == "#" and cas_parts and not packs and pending_qty is None:
            cas_parts.append("#")
            index += 1
            continue
        if CAS_RE.match(token) or token in {"&", "No", "CAS#", "CAS:", "CAS"}:
            cas_parts.append(token)
            index += 1
            continue
        if re.fullmatch(r"\d{1,3}", token) and (PRICE_RE.match(nxt) or nxt.upper() == "POA" or masked_price(nxt)):
            pending_qty = token
            index += 1
            continue
        if (
            re.fullmatch(r"\d{1,3}", token)
            and word["x0"] > 470
            and token in {str(page_no), "4", "17", "120"}
            and not (PRICE_RE.match(nxt) or nxt.upper() == "POA" or masked_price(nxt))
        ):
            index += 1
            continue
        if QTY_RE.match(token):
            if pending_qty:
                packs.append(pack(pending_qty, None, "quote", None))
            pending_qty = token
            index += 1
            continue
        if PRICE_RE.match(token) or token.upper() == "POA" or (masked_price(token) and len(token) >= 2):
            if masked_price(token):
                price, price_text, raw = None, "quote", token
            else:
                price, price_text, raw = parse_price(token)
            if pending_qty is None:
                unknown.append(f"price-without-qty:{token}")
                packs.append(pack(None, price, price_text, raw))
            else:
                packs.append(pack(pending_qty, price, price_text, raw))
                pending_qty = None
            index += 1
            continue
        unknown.append(token)
        index += 1
    if pending_qty:
        packs.append(pack(pending_qty, None, "quote", None))
    note = None
    alpha = [token for token in unknown if re.fullmatch(r"[A-Za-z]+", token)]
    if alpha and len(alpha) == len(unknown):
        note = " ".join(alpha)
        unknown = []
    purity = re.sub(r"\s+", " ", " ".join(purity_parts)).strip() or None
    return join_cas(cas_parts), purity, packs, unknown, note


def pack(size, price, price_text, raw=None, currency="USD"):
    if price is None and price_text != "quote":
        price_text = "quote"
    return {
        "size": size,
        "price": price,
        "currency": currency,
        "priceText": price_text if price_text else "quote",
        "priceRaw": raw if raw is not None else price_text,
    }


def stitch_catalogue_numbers(words):
    """Join a catalogue number Excel wrapped onto two words, e.g. AMTGC207- + NAB16."""
    prefix_re = re.compile(r"^AMT[A-Z]{1,6}\d{2,5}-$")
    suffix_re = re.compile(r"^[A-Za-z][A-Za-z0-9]{2,}$")
    existing = {w["t"] for w in words if SKU_RE.match(w["t"])}
    consumed = set()
    synthetic = []
    ordered = sorted(words, key=lambda w: (w["y"], w["x0"]))
    for word in ordered:
        if not prefix_re.match(word["t"]):
            continue
        partner = None
        for other in ordered:
            if other is word or not suffix_re.match(other["t"]):
                continue
            if abs(other["x0"] - word["x0"]) < 90 and -2 <= other["y"] - word["y"] < 18:
                partner = other
                break
        if partner is None:
            continue
        sku = word["t"] + partner["t"]
        if not SKU_RE.match(sku) or sku in existing:
            continue
        made = dict(word)
        made["t"] = sku
        made["x1"] = max(word["x1"], partner["x1"])
        synthetic.append(made)
        existing.add(sku)
        consumed.add(id(word))
        consumed.add(id(partner))
    if not synthetic:
        return words
    return [w for w in words if id(w) not in consumed] + synthetic


def parse_table_pdf(spec):
    pdf_path = PDF_DIR / spec["file"]
    pages = pages_bbox(pdf_path)
    rows = []
    anomalies = []
    for page_no, words in enumerate(pages, start=1):
        words = stitch_catalogue_numbers(words)
        skus = [w for w in words if SKU_RE.match(w["t"])]
        if not skus:
            continue
        body_h = median([w["h"] for w in skus])
        body = [w for w in words if abs(w["h"] - body_h) <= 0.25]
        skus = sorted(skus, key=lambda w: w["y"])
        for index, sku in enumerate(skus):
            top = 0 if index == 0 else (skus[index - 1]["y"] + sku["y"]) / 2
            bot = 10000 if index + 1 == len(skus) else (sku["y"] + skus[index + 1]["y"]) / 2
            band = [w for w in body if top <= w["y"] < bot and not (w["x0"] == sku["x0"] and w["t"] == sku["t"])]
            left = [
                w
                for w in band
                if w["x0"] < sku["x0"] - 4 and not (w["t"] in BOILER_TOKENS and w["y"] < 120)
            ]
            right = [w for w in band if w["x0"] >= sku["x0"] - 1]
            list_no = None
            name_words = []
            for word in left:
                if re.fullmatch(r"\d{1,4}", word["t"]) and any(other["x0"] > word["x1"] + 2 for other in left):
                    if word["x0"] < sku["x0"] - 40:
                        list_no = int(word["t"])
                        continue
                name_words.append(word)
            name_words = keep_name_column(name_words)
            nearby = [w for w in words if top <= w["y"] < bot]
            name_words = add_subscripts(name_words, nearby)
            name_lines = lines_from(name_words)
            purity_left = None
            kept = []
            for line in name_lines:
                if PURITY_LINE_RE.fullmatch(line):
                    purity_left = line
                else:
                    kept.append(line)
            name = join_lines(kept) or None
            if name:
                name = re.sub(r"^\* \(All prices are in US Dollars\)\s*", "", name).strip() or None
            cas, purity_right, packs, unknown, note = parse_right(right, sku["t"], page_no)
            purity = purity_right or purity_left
            if purity_right and purity_left and purity_right != purity_left:
                anomalies.append({"sku": sku["t"], "page": page_no, "issue": "two-purities", "left": purity_left, "right": purity_right})
            if unknown:
                anomalies.append({"sku": sku["t"], "page": page_no, "issue": "unknown-tokens", "tokens": unknown})
            if not name:
                anomalies.append({"sku": sku["t"], "page": page_no, "issue": "missing-name"})
            if not packs:
                anomalies.append({"sku": sku["t"], "page": page_no, "issue": "missing-packs"})
            rows.append(
                {
                    "sku": sku["t"],
                    "name": name,
                    "cas": cas,
                    "purity": purity,
                    "packs": packs,
                    "page": page_no,
                    "listNo": list_no,
                    "sourceId": spec["id"],
                    "family": spec["family"],
                    "date": spec["date"],
                    "pdf": spec["url"],
                    "alsoPages": [],
                    "note": note,
                }
            )
    return rows, anomalies


def signature(row):
    packs = tuple((p["size"], p["price"], p["priceText"], p["priceRaw"]) for p in row["packs"])
    return (norm(row["name"]), row["cas"], row["purity"], packs)


def norm(text):
    if text is None:
        return None
    return re.sub(r"\s+", " ", text).strip().lower()


def collapse_identical(rows):
    kept = []
    index = {}
    notes = []
    for row in rows:
        sig = (row["sourceId"],) + signature(row)
        prev = index.get(sig)
        if prev is None:
            index[sig] = row
            kept.append(row)
            continue
        prev["alsoPages"].append(row["page"])
        same_page = row["page"] == prev["page"]
        next_page = row["page"] == prev["page"] + 1 or row["page"] in prev["alsoPages"]
        kind = "same-page duplicate row" if same_page else "repeated row"
        if next_page and not same_page:
            kind = "repeated at a page boundary"
        notes.append({"sku": row["sku"], "pages": [prev["page"], row["page"]], "kind": kind, "sourceId": row["sourceId"]})
    return kept, notes


def size_key(size):
    if size is None:
        return None
    return re.sub(r"\s+", "", size).lower()


def packs_differ(a, b):
    left = [(size_key(p["size"]), p["price"], p["priceText"]) for p in a]
    right = [(size_key(p["size"]), p["price"], p["priceText"]) for p in b]
    return left != right


def choose_number(token):
    token = token.replace("$", "").replace(",", "")
    if "." in token:
        value = round(float(token), 2)
        return int(value) if value == int(value) else value
    return int(token)


def parse_flyer():
    pdf = PDF_DIR / "New_Products_20250516.pdf"
    pages = pages_bbox(pdf)
    words = [w for w in pages[0] if w["h"] >= 10.5 and w["y"] < 760]
    skus = [w for w in words if SKU_RE.match(w["t"])]
    skus.sort(key=lambda w: (w["y"], w["x0"]))
    rows_of = []
    for sku in skus:
        if not rows_of or sku["y"] - rows_of[-1][0]["y"] > 40:
            rows_of.append([sku])
        else:
            rows_of[-1].append(sku)
    parsed = []
    for r_index, row in enumerate(rows_of):
        row = sorted(row, key=lambda w: w["x0"])
        next_y = rows_of[r_index + 1][0]["y"] - 8 if r_index + 1 < len(rows_of) else 740
        xs = [w["x0"] for w in row]
        bounds = []
        for i, sku in enumerate(row):
            left = 0 if i == 0 else (xs[i - 1] + xs[i]) / 2
            right = 1000 if i + 1 == len(row) else (xs[i] + xs[i + 1]) / 2
            bounds.append((left, right, sku))
        for left, right, sku in bounds:
            cell = [
                w
                for w in words
                if left <= w["x0"] < right and sku["y"] - 5 <= w["y"] < next_y and w["t"] != sku["t"]
            ]
            cas = None
            packs = []
            pending_size = []
            quote_words = []
            for word in sorted(cell, key=lambda w: (w["y"], w["x0"])):
                token = word["t"]
                if token == "CAS:":
                    continue
                if CAS_RE.match(token):
                    cas = token
                    continue
                if token in {"Price", "on", "application"}:
                    quote_words.append(token)
                    continue
                if re.fullmatch(r"\d+(?:\.\d+)?", token) or token.lower() in {"mg", "g", "kg"} or QTY_RE.match(token) or PRICE_RE.match(token):
                    if quote_words:
                        packs.append(pack(None, None, "quote", "Price on application"))
                        quote_words = []
                    if QTY_RE.match(token):
                        pending_size = [token]
                        continue
                    if PRICE_RE.match(token) and pending_size:
                        size = "".join(pending_size) if not any(QTY_RE.match(p) for p in pending_size) else pending_size[0]
                        if len(pending_size) == 2:
                            size = pending_size[0] + " " + pending_size[1]
                        elif len(pending_size) == 1:
                            size = pending_size[0]
                        price, price_text, raw = parse_price(token)
                        packs.append(pack(size, price, price_text, raw))
                        pending_size = []
                        continue
                    pending_size.append(token)
                    continue
            if quote_words:
                packs.append(pack(None, None, "quote", "Price on application"))
            parsed.append(
                {
                    "sku": sku["t"],
                    "name": None,
                    "cas": cas,
                    "purity": None,
                    "packs": packs,
                    "page": 1,
                    "listNo": None,
                    "sourceId": "new-products-20250516",
                    "family": "other",
                    "date": "2025-05-16",
                    "pdf": "https://www.amtechpl.com/wp-content/uploads/2025/05/New_Products_20250516.pdf",
                    "alsoPages": [],
                }
            )
    return parsed


def parse_homepage(path: Path):
    raw = path.read_text(errors="replace")
    chunks = re.split(r"<h4>", raw)[1:]
    found = []
    for chunk in chunks:
        name_match = re.match(r"(.*?)</h4>", chunk, re.S)
        if not name_match:
            continue
        chunk = chunk.split("Contract Synthesis")[0]
        name = clean_token(re.sub(r"<[^>]+>", " ", name_match.group(1)))
        sku_match = re.search(r"\b(AMT[A-Z]{1,6}\d{2,5}-[A-Z0-9]+)\b", chunk)
        if not sku_match or name.startswith("Locate"):
            continue
        # stop at the next slide boundary already handled by split
        labels = []
        packs = []
        for strong in re.findall(r"<strong[^>]*>(.*?)</strong>", chunk, re.S):
            text = clean_token(re.sub(r"<[^>]+>", " ", strong))
            if not text or text == sku_match.group(1):
                continue
            price_match = re.match(r"^(.+?):\s*(\$[\d,]+(?:\.\d{2})?)$", text)
            if price_match:
                size = price_match.group(1).strip()
                raw_price = price_match.group(2)
                price, price_text, raw_p = parse_price(raw_price)
                item = pack(size, price, price_text, raw_p, currency=None)
                packs.append(item)
            else:
                labels.append(text)
        img = re.search(r'src="?(https://www\.amtechpl\.com/[^"\s>]+\.(?:png|jpe?g))"?', chunk, re.I)
        found.append(
            {
                "sku": sku_match.group(1),
                "name": name,
                "labels": labels,
                "packs": packs,
                "image": img.group(1).rstrip('"') if img else None,
            }
        )
    # The split can capture the same slide twice if the h4 is echoed. Dedup by sku keeping first full pack list.
    by_sku = {}
    for item in found:
        current = by_sku.get(item["sku"])
        if current is None or len(item["packs"]) > len(current["packs"]):
            by_sku[item["sku"]] = item
    return list(by_sku.values())


def listing_from(row):
    return {
        "sourceId": row["sourceId"],
        "pdf": row["pdf"],
        "page": row["page"],
        "alsoPages": row["alsoPages"],
        "listNo": row["listNo"],
        "name": row["name"],
        "cas": row["cas"],
        "purity": row["purity"],
        "packs": row["packs"],
        "note": row.get("note"),
    }


def canonical_packs(listings):
    if len(listings) == 1:
        return listings[0]["packs"], listings[0]["purity"]
    packs = []
    purities = []
    for index, listing in enumerate(listings, start=1):
        purities.append(listing["purity"])
        for item in listing["packs"]:
            copied = dict(item)
            copied["listing"] = index
            if listing["purity"]:
                copied["purity"] = listing["purity"]
            packs.append(copied)
    unique_purity = {p for p in purities if p}
    purity = unique_purity.pop() if len(unique_purity) == 1 and all(p == purities[0] for p in purities) else None
    if len(set(purities)) > 1:
        purity = None
    return packs, purity


def merge_products(catalogue_rows, flyer_rows, homepage):
    grouped = defaultdict(list)
    for row in catalogue_rows + flyer_rows:
        grouped[row["sku"]].append(row)
    home_by_sku = {item["sku"]: item for item in homepage}
    discrepancies = []
    products = []
    source_order = [
        "lipids-20260826",
        "peg-20260903",
        "fluorophores-2026",
        "organoborons-20260421",
        "new-products-20250516",
    ]

    def source_rank(source_id):
        return source_order.index(source_id) if source_id in source_order else len(source_order)

    for sku, rows in grouped.items():
        rows.sort(key=lambda r: (source_rank(r["sourceId"]), r["page"], r["listNo"] or 0))
        win_source = rows[0]["sourceId"]
        winning = [r for r in rows if r["sourceId"] == win_source]
        winning.sort(key=lambda r: (r["page"], r["listNo"] or 0))
        others = [r for r in rows if r["sourceId"] != win_source]
        listings = [listing_from(r) for r in winning]
        packs, purity = canonical_packs(listings)
        names = {r["name"] for r in winning}
        cases = {r["cas"] for r in winning}
        name = winning[0]["name"] if len(names) == 1 else winning[0]["name"]
        cas = winning[0]["cas"] if len(cases) == 1 else None
        if len(names) > 1:
            discrepancies.append({"sku": sku, "kind": "name-differs-within-source", "names": sorted(n or "" for n in names), "sourceId": win_source})
        if len(cases) > 1:
            discrepancies.append({"sku": sku, "kind": "cas-differs-within-source", "cas": sorted(c or "" for c in cases), "sourceId": win_source})
            cas = None
        for other in others:
            if other["name"] and name and norm(other["name"]) != norm(name):
                discrepancies.append({"sku": sku, "kind": "name-differs-across-sources", "canonical": name, "other": other["name"], "otherSource": other["sourceId"]})
            if other["cas"] and cas and other["cas"] != cas:
                discrepancies.append({"sku": sku, "kind": "cas-differs-across-sources", "canonical": cas, "other": other["cas"], "otherSource": other["sourceId"]})
            if packs_differ(other["packs"], winning[0]["packs"]) or (len(winning) > 1):
                # recorded via listings; only flag when the other source's packs are not equal to any winning listing
                if not any(not packs_differ(other["packs"], w["packs"]) for w in winning):
                    discrepancies.append(
                        {
                            "sku": sku,
                            "kind": "packs-differ-across-sources",
                            "canonicalSource": win_source,
                            "otherSource": other["sourceId"],
                            "otherPacks": other["packs"],
                        }
                    )
        home = home_by_sku.get(sku)
        homepage_packs = home["packs"] if home else None
        if home and homepage_packs:
            compare_homepage(sku, packs, homepage_packs, discrepancies)
        family = winning[0]["family"]
        if win_source == "new-products-20250516":
            family = "other"
        product = {
            "id": sku.lower(),
            "sku": sku,
            "name": name,
            "synonyms": [],
            "family": family,
            "subfamily": None,  # filled by assign_subfamily
            "cas": cas,
            "formula": None,
            "mw": None,
            "purity": purity,
            "packs": packs,
            "structureImage": None,
            "documents": {"sds": None, "coa": None, "datasheet": None},
            "source": {
                "url": "https://www.amtechpl.com/",
                "pdf": winning[0]["pdf"],
                "page": winning[0]["page"],
            },
            "listings": listings,
        }
        if others:
            product["alsoListedIn"] = [listing_from(r) for r in others]
        if homepage_packs:
            product["homepagePacks"] = homepage_packs
            if home.get("labels"):
                product["homepageLabels"] = home["labels"]
            if home.get("name") and name and norm(home["name"]) != norm(name):
                discrepancies.append({"sku": sku, "kind": "homepage-name-differs", "canonical": name, "homepage": home["name"]})
            if home.get("image"):
                product["homepageImageUrl"] = home["image"]
        notes = [r.get("note") for r in winning if r.get("note")]
        if notes:
            product["catalogueNote"] = notes[0]
        products.append(product)
    # homepage SKUs missing from every PDF
    known = {p["sku"] for p in products}
    for item in homepage:
        if item["sku"] in known:
            continue
        discrepancies.append({"sku": item["sku"], "kind": "homepage-only"})
        products.append(
            {
                "id": item["sku"].lower(),
                "sku": item["sku"],
                "name": item["name"],
                "synonyms": [],
                "family": "other",
                "subfamily": None,  # filled by assign_subfamily
                "cas": None,
                "formula": None,
                "mw": None,
                "purity": None,
                "packs": item["packs"],
                "structureImage": None,
                "documents": {"sds": None, "coa": None, "datasheet": None},
                "source": {"url": "https://www.amtechpl.com/", "pdf": None, "page": None},
                "listings": [],
                "homepagePacks": item["packs"],
                "homepageLabels": item.get("labels") or [],
                "homepageImageUrl": item.get("image"),
            }
        )
    return products, discrepancies


def compare_homepage(sku, packs, homepage_packs, discrepancies):
    canonical = {}
    for item in packs:
        canonical.setdefault(size_key(item["size"]), []).append(item["price"])
    for item in homepage_packs:
        key = size_key(item["size"])
        prices = canonical.get(key)
        if not prices:
            discrepancies.append({"sku": sku, "kind": "homepage-pack-not-in-catalogue", "size": item["size"], "priceText": item["priceText"]})
            continue
        if item["price"] not in prices:
            discrepancies.append(
                {
                    "sku": sku,
                    "kind": "homepage-price-differs",
                    "size": item["size"],
                    "homepagePrice": item["priceText"],
                    "cataloguePrices": prices,
                }
            )


def read_copy(slug):
    path = CACHE / "page_text" / f"{slug}.txt"
    text = path.read_text(errors="replace") if path.exists() else ""
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


def build_site(homepage_count):
    home = read_copy("home")
    intro = home.split("Featured Products:")[0].strip()
    pages = []
    for slug, title, url in [
        ("home", "Home", "https://www.amtechpl.com/"),
        ("about-us", "About Us", "https://www.amtechpl.com/about-us/"),
        ("contact", "Contact", "https://www.amtechpl.com/contact/"),
        ("contract-services", "Contract Research", "https://www.amtechpl.com/contract-services/"),
        ("analytical-services", "Analytical Services", "https://www.amtechpl.com/analytical-services/"),
        ("literature", "Literature", "https://www.amtechpl.com/literature/"),
        ("news", "News", "https://www.amtechpl.com/news/"),
        ("partners", "Partners", "https://www.amtechpl.com/partners/"),
        ("australian-customers-exclusive-offers", "Australian customers", "https://www.amtechpl.com/australian-customers-exclusive-offers/"),
        ("structure-search", "Structure Search", "https://www.amtechpl.com/structure-search/"),
        ("general-chemicals", "General Chemicals", "https://www.amtechpl.com/general-chemicals/"),
        ("organoborons", "Organoborons", "https://www.amtechpl.com/organoborons/"),
        ("organosilicons", "Organosilicons", "https://www.amtechpl.com/organosilicons/"),
        ("nucleosides", "Nucleosides", "https://www.amtechpl.com/nucleosides/"),
        ("halogenated-organics", "Halogenated Organics", "https://www.amtechpl.com/halogenated-organics/"),
        ("diaryls", "Diaryls", "https://www.amtechpl.com/diaryls/"),
        ("catalysts", "Catalysts", "https://www.amtechpl.com/catalysts/"),
        ("bioactives", "Bioactives", "https://www.amtechpl.com/bioactives/"),
        ("peg-reagents-and-linkers", "PEG Reagents and Linkers", "https://www.amtechpl.com/peg-reagents-and-linkers/"),
        ("fluorophores-and-dyes", "Fluorophores and Dyes", "https://www.amtechpl.com/fluorophores-and-dyes/"),
    ]:
        copy = intro if slug == "home" else read_copy(slug)
        pages.append({"slug": slug, "title": title, "url": url, "copy": copy})
    return {
        "crawled": "2026-10-22",
        "source": "https://www.amtechpl.com/",
        "publisher": "Advanced Molecular Technologies",
        "contact": {
            "street": ["Unit 1/7-11", "Rocco drive", "Scoresby VIC 3179"],
            "phoneAu": "03 9764 9220",
            "phoneIntl": "+61 3 9764 9220",
            "phoneTel": "+61397649220",
            "emailEnquiries": "enquiries@amtechpl.com",
            "emailSales": "sales@amtechpl.com",
            "mapUrl": "https://www.google.com/maps/search/?api=1&query=Unit%201%2F7-11%20Rocco%20drive%20Scoresby%20VIC%203179",
            "streetAddress": "Unit 1/7-11 Rocco drive, Scoresby VIC 3179",
            "postalAddress": "Unit 1/7-11 Rocco drive, Scoresby VIC 3179",
            "streetAddressAsPublishedOnContactPage": ["Unit 1/7-11", "Rocco drive", "Scoresby VIC 3179"],
            "addressOnNewProductsPdf": "Unit 1/7-11 Rocco Drive Scoresby Victoria 3179 Australia",
            "abn": "60 114 049 633",
            "abnSource": "https://www.amtechpl.com/wp-content/uploads/2025/05/New_Products_20250516.pdf",
            "phones": {
                "australia": "03 9764 9220",
                "international": "+61 3 9764 9220",
                "telHref": "tel:0397649220",
            },
            "emails": {
                "header": "enquiries@amtechpl.com",
                "contactPage": "sales@amtechpl.com",
            },
            "mapEmbed": "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d787.0785016365078!2d145.21648992918767!3d-37.899722540485016!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6ad63e0d1847a255%3A0xfc22de46a543b29b!2sUnit+1%2F7+Rocco+Dr%2C+Scoresby+VIC+3179%2C+Australia",
        },
        "shippingNotes": [
            "Next day dispatch for in-stock items shipping within Australia! *Ordered before 12-noon!",
            "Minimum order value of USD $150 for international shipping",
            "Free delivery for all orders over $250.00 AUD. (Australian customers page)",
        ],
        "sourceNav": {
            "header": [
                {"label": "HOME", "href": "https://www.amtechpl.com/"},
                {"label": "CONTRACT RESEARCH", "href": "https://www.amtechpl.com/contract-services/"},
                {
                    "label": "PRODUCTS",
                    "href": None,
                    "children": [
                        {"label": "General Chemicals", "href": "https://www.amtechpl.com/general-chemicals/"},
                        {"label": "Organoborons", "href": "https://www.amtechpl.com/organoborons/"},
                        {"label": "Organosilicons", "href": "https://www.amtechpl.com/organosilicons/"},
                        {"label": "Nucleosides", "href": "https://www.amtechpl.com/nucleosides/"},
                        {"label": "Halogenated Organics", "href": "https://www.amtechpl.com/halogenated-organics/"},
                        {"label": "Diaryls", "href": "https://www.amtechpl.com/diaryls/"},
                        {"label": "Catalysts", "href": "https://www.amtechpl.com/catalysts/"},
                        {"label": "Bioactives", "href": "https://www.amtechpl.com/bioactives/"},
                        {"label": "PEG Reagents and Linkers", "href": "https://www.amtechpl.com/peg-reagents-and-linkers/"},
                        {"label": "Fluorophores and Dyes", "href": "https://www.amtechpl.com/fluorophores-and-dyes/"},
                    ],
                },
                {"label": "STRUCTURE SEARCH", "href": "https://www.amtechpl.com/structure-search/"},
                {"label": "ANALYTICAL SERVICES", "href": "https://www.amtechpl.com/analytical-services/"},
                {"label": "CONTACT", "href": "https://www.amtechpl.com/contact/"},
            ],
            "secondary": [
                {"label": "Partners", "href": "https://www.amtechpl.com/partners/"},
                {"label": "About Us", "href": "https://www.amtechpl.com/about-us/"},
                {"label": "News", "href": "https://www.amtechpl.com/news/"},
            ],
            "footer": [
                {"label": "Home", "href": "https://www.amtechpl.com/"},
                {"label": "About Us", "href": "https://www.amtechpl.com/about-us/"},
                {"label": "Literature", "href": "https://www.amtechpl.com/literature/"},
                {"label": "Structure Search", "href": "https://www.amtechpl.com/structure-search/"},
                {"label": "Analytical Services", "href": "https://www.amtechpl.com/analytical-services/"},
                {"label": "Contract Research", "href": "https://www.amtechpl.com/contract-services/"},
                {"label": "Contact", "href": "https://www.amtechpl.com/contact/"},
            ],
        },
        "partners": [
            {"name": "Scaled Organics", "href": "https://www.scaledorganics.com/", "logo": "https://www.amtechpl.com/wp-content/uploads/2019/08/Scaled-Organics.jpg"},
            {"name": "AK Scientific", "href": "https://aksci.com/", "logo": "https://www.amtechpl.com/wp-content/uploads/2019/08/AK-Scientific.jpg"},
            {"name": "Key Organics", "href": "https://www.keyorganics.net/", "logo": "https://www.amtechpl.com/wp-content/uploads/2019/08/Key-Organics.jpg"},
            {
                "name": "Frontier Specialty Chemicals",
                "href": "https://frontierspecialtychemicals.com/product-category/functionalized-pegs-polyethylene-glycols-bioconjugation-linkers/",
                "logo": "https://www.amtechpl.com/wp-content/uploads/2026/02/Frontier-logo-150x150.png",
            },
        ],
        "structureSearch": {
            "url": "https://www.amtechpl.com/structure-search/",
            "iframe": "https://newsearch.chemexper.com/misc/hosted/amtechpl",
            "quickSearch": "https://newsearch.chemexper.com/misc/hosted/amtechpl/quick.shtml?query=",
            "note": "The structure search is a ChemExper iframe. amtechpl.com does not publish a static SKU table on that page. This extract does not query ChemExper.",
        },
        "brochures": [
            {"label": spec["title"], "title": spec["title"], "href": spec["url"], "family": spec["family"], "date": spec["date"]}
            for spec in CATALOGUES
        ]
        + [
            {
                "label": "NEW PRODUCTS LIST",
                "title": "NEW PRODUCTS LIST",
                "href": "https://www.amtechpl.com/wp-content/uploads/2025/05/New_Products_20250516.pdf",
                "family": "other",
                "date": "2025-05-16",
            }
        ],
        "documents": {
            "sds": None,
            "coa": None,
            "datasheet": None,
            "note": "No SDS, COA, or datasheet links were found on the crawled pages or in the current catalogue PDFs.",
        },
        "pages": pages,
        "homepageFeaturedCount": homepage_count,
        "emptyCataloguePages": [
            "general-chemicals",
            "organoborons",
            "organosilicons",
            "nucleosides",
            "halogenated-organics",
            "diaryls",
            "catalysts",
            "bioactives",
            "peg-reagents-and-linkers",
            "fluorophores-and-dyes",
        ],
    }


def download(url, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read()
    dest.write_bytes(data)
    return len(data)


def safe_name(url: str) -> str:
    name = url.split("/")[-1].split("?")[0]
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-")
    return name or "file"


def attach_images(products, manifest):
    media = json.loads((CACHE / "api_media.json").read_text()) + json.loads((CACHE / "api_media2.json").read_text())
    by_sku = defaultdict(list)
    for item in media:
        if not str(item.get("mime_type", "")).startswith("image/"):
            continue
        url = item.get("source_url") or ""
        filename = safe_name(url)
        for product in products:
            if product["sku"].lower() in filename.lower():
                by_sku[product["sku"]].append(url)
    # homepage images too
    for product in products:
        url = product.get("homepageImageUrl")
        if url:
            by_sku[product["sku"]].append(url.rstrip('"'))
    chosen = {}
    for sku, urls in by_sku.items():
        unique = []
        for url in urls:
            if url not in unique:
                unique.append(url)
        ranked = sorted(unique, key=lambda url: image_rank(url, sku))
        paths = []
        for url in ranked:
            filename = safe_name(url)
            dest = ASSETS / "structures" / filename
            if not dest.exists():
                try:
                    download(url, dest)
                except Exception as error:  # noqa: BLE001
                    manifest.append({"path": None, "sourceUrl": url, "kind": "structure", "sku": sku, "error": str(error)})
                    continue
            rel = f"assets/structures/{filename}"
            digest = hashlib.sha256(dest.read_bytes()).hexdigest()
            manifest.append(
                {
                    "path": rel,
                    "sourceUrl": url,
                    "kind": "structure",
                    "sku": sku,
                    "bytes": dest.stat().st_size,
                    "sha256": digest,
                }
            )
            paths.append(rel)
        if paths:
            chosen[sku] = paths[0]
    for product in products:
        product["structureImage"] = chosen.get(product["sku"])
        product.pop("homepageImageUrl", None)
    return chosen


def image_rank(url, sku):
    filename = safe_name(url)
    stem = Path(filename).stem.lower()
    exact = stem == sku.lower()
    png = filename.lower().endswith(".png")
    thumb = bool(re.search(r"-\d+x\d+", filename)) or "scaled" in filename.lower()
    return (0 if exact else 1, 0 if png else 1, 1 if thumb else 0, len(filename))


def download_logos(manifest):
    logos = [
        ("https://www.amtechpl.com/wp-content/uploads/2019/05/web-logo.png", "logo"),
        ("https://www.amtechpl.com/wp-content/uploads/2020/04/AMT-Logo-e1586416288420.png", "favicon"),
        ("https://www.amtechpl.com/wp-content/uploads/2020/04/AMT-Logo-e1586416437836.png", "apple-touch"),
        ("https://www.amtechpl.com/wp-content/uploads/2026/02/White-Background-Logo-no-subtitle.png_20260217_080755_0000-scaled.png", "logo"),
        ("https://www.amtechpl.com/wp-content/uploads/2026/02/Frontier-logo.png", "partner-logo"),
        ("https://www.amtechpl.com/wp-content/uploads/2026/02/Frontier-logo-150x150.png", "partner-logo"),
        ("https://www.amtechpl.com/wp-content/uploads/2026/02/IDT-logo.png", "partner-logo"),
        ("https://www.amtechpl.com/wp-content/uploads/2019/08/Scaled-Organics.jpg", "partner-logo"),
        ("https://www.amtechpl.com/wp-content/uploads/2019/08/AK-Scientific.jpg", "partner-logo"),
        ("https://www.amtechpl.com/wp-content/uploads/2019/08/Key-Organics.jpg", "partner-logo"),
        ("https://www.amtechpl.com/wp-content/uploads/2020/09/Delivery-Truck-e1599703368301.png", "icon"),
    ]
    for url, kind in logos:
        filename = safe_name(url)
        dest = ASSETS / "logos" / filename
        try:
            download(url, dest)
        except Exception as error:  # noqa: BLE001
            manifest.append({"path": None, "sourceUrl": url, "kind": kind, "error": str(error)})
            continue
        rel = f"assets/logos/{filename}"
        manifest.append(
            {
                "path": rel,
                "sourceUrl": url,
                "kind": kind,
                "bytes": dest.stat().st_size,
                "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
            }
        )


def historical_pdfs():
    media = json.loads((CACHE / "api_media.json").read_text()) + json.loads((CACHE / "api_media2.json").read_text())
    current = {spec["url"] for spec in CATALOGUES}
    current.add("https://www.amtechpl.com/wp-content/uploads/2025/05/New_Products_20250516.pdf")
    rows = []
    for item in media:
        if item.get("mime_type") != "application/pdf":
            continue
        url = item.get("source_url")
        title = html.unescape(item.get("title", {}).get("rendered", ""))
        rows.append(
            {
                "title": title,
                "url": url,
                "date": (item.get("date") or "")[:10],
                "bytes": item.get("filesize"),
                "extracted": url in current,
                "reason": "linked from the homepage as a current brochure" if url in current else "in the media library only; not linked from the live pages crawled on 2026-10-22; superseded catalogue, not extracted",
            }
        )
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows


def write_raw_text():
    RAW.mkdir(parents=True, exist_ok=True)
    mapping = [(spec["file"], spec["raw"]) for spec in CATALOGUES]
    mapping.append(("New_Products_20250516.pdf", "new-products-20250516.txt"))
    for src, dest in mapping:
        subprocess.check_call(["pdftotext", "-layout", str(PDF_DIR / src), str(RAW / dest)])


def family_counts(products):
    counts = defaultdict(int)
    for product in products:
        counts[product["family"]] += 1
    return dict(counts)


def source_counts(products):
    counts = defaultdict(int)
    for product in products:
        source = product["listings"][0]["sourceId"] if product["listings"] else "homepage"
        counts[source] += 1
    return dict(counts)


PDF_HEADINGS = (
    ("AMT-Lipids-20260826.pdf", "Lipids from Advanced Molecular Technologies"),
    ("AMT-PEG-Reagents-and-Linkers-Catalogue-List-20260903.pdf", "PEG Reagents and Linkers"),
    ("AMT-FluorophoresDyes-Catalogue-List-2026.pdf", "Fluorophores and Dyes"),
    ("AMT-Organoboron-Compounds-List-20260421.pdf", "AMT Organoboron Catalogue List"),
    ("New_Products_20250516.pdf", "NEW PRODUCTS MAY 2025"),
)


def catalogue_heading(product):
    pdf = (product.get("source") or {}).get("pdf") or ""
    for filename, heading in PDF_HEADINGS:
        if pdf.endswith(filename):
            return heading, pdf, product["source"].get("page"), "running header on the catalogue page"
    return "Featured Products:", "https://www.amtechpl.com/", None, "homepage h2 above the card"


def assign_subfamily(products):
    """Set subfamily from the AMT heading the row is printed under.

    The current brochures are flat lists. They do not print finer section
    titles (no boronic-acid block, no mPEG-NHS block). The page title is the
    heading. Homepage cards that print Ionisable Lipid use that label, which
    is the only finer wording AMT publishes.
    """
    for product in products:
        heading, url, page, location = catalogue_heading(product)
        labels = product.get("homepageLabels") or []
        if labels == ["Ionisable Lipid"]:
            product["subfamily"] = "Ionisable Lipid"
            product["subfamilySource"] = {
                "heading": "Ionisable Lipid",
                "url": "https://www.amtechpl.com/",
                "page": None,
                "location": "homepage card under Featured Products:",
                "catalogueHeading": heading,
            }
        else:
            product["subfamily"] = heading
            product["subfamilySource"] = {
                "heading": heading,
                "url": url,
                "page": page,
                "location": location,
            }


def subfamily_counts(products):
    order = [heading for _, heading in PDF_HEADINGS] + ["Featured Products:", "Ionisable Lipid"]
    counts = {heading: 0 for heading in order}
    for product in products:
        counts[product["subfamily"]] = counts.get(product["subfamily"], 0) + 1
    return {heading: count for heading, count in counts.items() if count}


def subfamily_lines(by_subfamily):
    lines = [
        "## Subfamily",
        "",
        "Each `subfamily` is the heading AMT prints above that product, copied verbatim. `subfamilySource` records where it was read. The 2026 brochures are flat lists: the running header is the only heading on the page. The site adds one finer label, `Ionisable Lipid`, on three homepage cards. Headings such as helper lipids, mPEG-NHS, Cy dyes, or boronic acid versus pinacol ester are not printed in these PDFs or on the crawled pages, so they are not assigned.",
        "",
        "| Subfamily | Products |",
        "| --- | ---: |",
    ]
    for heading, count in by_subfamily.items():
        lines.append(f"| {heading} | {count} |")
    lines.append("")
    return lines


def class_lines(block):
    families = ["lipids", "peg", "fluorophores", "organoborons", "other", "total"]
    lines = [
        "## Name-derived class",
        "",
        "`classDerived` is a browsing facet read from the printed product name with `data/class-rules.json`. It is not an AMT heading and it is not a PubChem field. `classDerivedSource` is `\"name\"` when a rule matches and null otherwise. Boron class, PEG architecture and dye core run only inside the family AMT already assigned. NHS, maleimide and DBCO use the same name patterns on every family, including succinimidyl, SC, SCM, SVA, SS, 2,5-dioxopyrrolidin-1-yl, Mal, pyrrole-2,5-dione, dibenzocyclooctyne and ADIBO. A PEG product can also carry an architecture (`mPEG`, `heterobifunctional`, `multi-arm`) and azide, amine or acid. Dye cores include Cy3, Cy5, Cy5.5, Cy7, cyanine, sulfo-Cy, FITC and BODIPY. Unknowns are null.",
        "",
        "| Family | Products | Matched | Null |",
        "| --- | ---: | ---: | ---: |",
    ]
    for family in families:
        row = block["byFamily"][family]
        lines.append(f"| {family} | {row['products']} | {row['matched']} | {row['null']} |")
    lines.extend(["", "Organoboron class, first matching rule:", "", "| Class | Products |", "| --- | ---: |"])
    for label, count in block["byFamily"]["organoborons"]["boronClass"].items():
        lines.append(f"| {label} | {count} |")
    lines.extend(["", "PEG architecture. A product is counted once. Null architecture is not listed.", "", "| Architecture | Products |", "| --- | ---: |"])
    for label, count in block["byFamily"]["peg"]["architecture"].items():
        lines.append(f"| {label} | {count} |")
    lines.extend(["", "PEG reactive groups. A product with two groups is counted under each.", "", "| Reactive group | Products |", "| --- | ---: |"])
    for label, count in block["byFamily"]["peg"]["reactiveGroups"].items():
        lines.append(f"| {label} | {count} |")
    lines.extend([
        "",
        "NHS, maleimide and DBCO on every family. The PEG row repeats the three cells above. ADIBO is counted as DBCO.",
        "",
        "| Family | NHS | maleimide | DBCO |",
        "| --- | ---: | ---: | ---: |",
    ])
    for family in ["lipids", "peg", "fluorophores", "organoborons", "other"]:
        groups = block["byFamily"][family]["reactiveGroups"]
        lines.append(f"| {family} | {groups['NHS']} | {groups['maleimide']} | {groups['DBCO']} |")
    lines.extend(["", "Fluorophore dye core:", "", "| Dye core | Products |", "| --- | ---: |"])
    for label, count in block["byFamily"]["fluorophores"]["dyeCore"].items():
        lines.append(f"| {label} | {count} |")
    lines.append("")
    return lines


def pubchem_lines(stats):
    lines = [
        "## External reference data",
        "",
        "`formula` and `mw` are only what AMT published, and both stay null because the catalogues have no such columns. `structureImage` stays the AMT file when one was published. PubChem formula, molecular weight and the 2D depiction are `formulaExternal`, `mwExternal` and `structureImageExternal`, with `externalSource` `{name: PubChem, cid, url}`. A CAS is accepted only when PubChem returns exactly one CID. PubChem does not serve SVG. Each `structureImageExternal` file is an SVG drawn from that CID's 2D coordinates and bond annotations, one file per CID, so a page can lazy-load it. `mwNominal` is a nominal PEG mass read from the printed name (PEG2000 or PEG(400)); a short token such as PEG3 is an oligomer length and is not used.",
        "",
        "| Family | Products | Single CAS | One CID | Formula and MW | Structure image | Nominal PEG mass |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for family in ["lipids", "peg", "fluorophores", "organoborons", "other", "total"]:
        row = stats["byFamily"][family]
        lines.append(
            f"| {family} | {row['products']} | {row['singleCas']} | {row['oneCid']} | {row['formulaAndMw']} | {row['structureImage']} | {row['mwNominal']} |"
        )
    lines.append("")
    return lines


def carry_external(products):
    """Keep PubChem and nominal-mass fields when the catalogue extract is re-run."""
    path = ROOT / "data" / "products.json"
    if not path.exists():
        return
    previous = {row["sku"]: row for row in json.loads(path.read_text())}
    keys = (
        "formulaExternal",
        "mwExternal",
        "structureImageExternal",
        "externalSource",
        "mwNominal",
        "mwNominalSource",
        "classDerived",
        "classDerivedSource",
    )
    for product in products:
        old = previous.get(product["sku"])
        if not old:
            continue
        for key in keys:
            if key in old:
                product[key] = old[key]


def write_counts(products, row_counts, collapse_notes, discrepancies, anomalies, flyer_only):
    by_family = family_counts(products)
    by_source = source_counts(products)
    multi = [p for p in products if len(p.get("listings") or []) > 1]
    payload = {
        "uniqueProducts": len(products),
        "byFamily": by_family,
        "byPrimarySource": by_source,
        "extractedRowsBeforeCollapse": row_counts,
        "identicalRowsCollapsed": len(collapse_notes),
        "skusWithMultipleListings": len(multi),
        "parseAnomalies": len(anomalies),
        "discrepancies": len(discrepancies),
        "bySubfamily": subfamily_counts(products),
    }
    counts_path = ROOT / "data" / "counts.json"
    if counts_path.exists():
        previous_counts = json.loads(counts_path.read_text())
        if "pubchem" in previous_counts:
            payload["pubchem"] = previous_counts["pubchem"]
        if "classDerived" in previous_counts:
            payload["classDerived"] = previous_counts["classDerived"]
    (ROOT / "data" / "counts.json").write_text(json.dumps(payload, indent=2) + "\n")
    lines = []
    lines.append("# Catalogue counts")
    lines.append("")
    lines.append("Crawled 2026-10-22 from https://www.amtechpl.com/. Prices, CAS numbers, purities and pack sizes are copied from the text layer of the PDFs linked on the homepage, plus the homepage featured cards. Nothing in this file was inferred to fill a blank.")
    lines.append("")
    lines.append("## Unique products")
    lines.append("")
    lines.append(f"Total unique SKUs: **{len(products)}**.")
    lines.append("")
    lines.append("| Family | Products |")
    lines.append("| --- | ---: |")
    for family in ["lipids", "peg", "fluorophores", "organoborons", "other"]:
        lines.append(f"| {family} | {by_family.get(family, 0)} |")
    lines.append("")
    lines.append("## Rows by source")
    lines.append("")
    lines.append("Extracted rows are catalogue lines before identical repeats were collapsed. Unique products are one record per SKU after that collapse. When a SKU is printed in more than one current brochure, the primary source follows this order: lipids, PEG, fluorophores, organoborons, then the May 2025 flyer. Those four brochures are parallel catalogues linked together on the homepage, not successive editions of one list.")
    lines.append("")
    lines.append("| Source | Extracted rows | Unique SKUs whose primary source is this file |")
    lines.append("| --- | ---: | ---: |")
    labels = {
        "lipids-20260826": "Lipids PDF 26 Aug 2026",
        "peg-20260903": "PEG PDF 3 Sep 2026",
        "fluorophores-2026": "Fluorophores & dyes PDF (media date 9 Jan 2026)",
        "organoborons-20260421": "Organoborons PDF 21 Apr 2026",
        "new-products-20250516": "New products flyer 16 May 2025",
        "homepage": "Homepage featured cards only",
    }
    for key in [
        "lipids-20260826",
        "peg-20260903",
        "fluorophores-2026",
        "organoborons-20260421",
        "new-products-20250516",
        "homepage",
    ]:
        extracted = "—" if key == "homepage" else row_counts.get(key, 0)
        lines.append(f"| {labels[key]} | {extracted} | {by_source.get(key, 0)} |")
    lines.append("")
    lines.append(f"Homepage featured cards parsed: {sum(1 for p in products if p.get('homepagePacks'))}.")
    lines.append("")
    lines.append("## Reconciliation")
    lines.append("")
    lines.append("Family pages (`/organoborons/`, `/peg-reagents-and-linkers/`, and the other product-menu pages) publish no SKU table. Their live HTML is the shared catalogue menu. The homepage links five files and that is the product corpus: four 2026 catalogues and the May 2025 new-products flyer.")
    lines.append("")
    lines.append("The same SKU printed twice with the same name, CAS, purity and packs was collapsed to one product. Page-boundary repeats in the organoboron PDF (a row reprinted at the top of the next page) are in this set, as is one same-page duplicate.")
    lines.append("")
    if collapse_notes:
        lines.append("| SKU | Source | Pages | Why collapsed |")
        lines.append("| --- | --- | --- | --- |")
        for note in collapse_notes:
            pages = ", ".join(str(p) for p in note["pages"])
            lines.append(f"| {note['sku']} | {note['sourceId']} | {pages} | {note['kind']} |")
        lines.append("")
    lines.append("Four PEG SKUs are printed as two different rows (a second row marked High Purity). Both rows are kept. `packs` lists every published pack and sets `listing` so the prices are not merged. Top-level `purity` is null when the rows disagree; each listing keeps the purity string that row actually prints (`High Purity 99%` or `High purity 98%`).")
    lines.append("")
    if multi:
        lines.append("| SKU | Listings |")
        lines.append("| --- | --- |")
        for product in multi:
            bits = []
            for listing in product["listings"]:
                prices = ", ".join(f"{p['size']} {p['priceRaw']}" for p in listing["packs"])
                bits.append(f"p.{listing['page']} {listing['purity'] or 'purity not printed'}: {prices}")
            lines.append(f"| {product['sku']} | {'; '.join(bits)} |")
        lines.append("")
    home_diffs = [d for d in discrepancies if d["kind"] in {"homepage-price-differs", "homepage-pack-not-in-catalogue"}]
    lines.append("Homepage featured prices are stored on `homepagePacks` and do not replace the catalogue packs. The cards do not print a currency. Where the same pack size is on the card and in the PDF, numeric differences are below. A card that shows a subset of the PDF packs is listed only when a shown price disagrees or a shown size is absent from the PDF.")
    lines.append("")
    if home_diffs:
        lines.append("| SKU | What the homepage prints | Catalogue |")
        lines.append("| --- | --- | --- |")
        for item in home_diffs:
            if item["kind"] == "homepage-price-differs":
                lines.append(f"| {item['sku']} | {item['size']} {item['homepagePrice']} | {item['cataloguePrices']} |")
            else:
                lines.append(f"| {item['sku']} | {item['size']} {item['priceText']} not in the winning catalogue row | — |")
        lines.append("")
    cross = [d for d in discrepancies if d["kind"] == "packs-differ-across-sources"]
    lines.append("When a SKU is in more than one current file, `packs`, `name`, `cas`, `purity` and `family` come from the primary brochure in the order above. The other row is kept on `alsoListedIn` and is not overwritten. The May 2025 flyer does not replace a 2026 brochure. Flyer-only SKUs stay in family `other` with `name` null, because that flyer prints structures and CAS numbers, not names. Six homepage featured cards are not in any of these PDFs; their family is `other` and their card prices are the only packs, with `currency` null because the card does not name a currency.")
    lines.append("")
    if flyer_only:
        lines.append("Flyer-only SKUs: " + ", ".join(flyer_only) + ".")
        lines.append("")
    if cross:
        lines.append(f"Cross-source pack differences: {len(cross)}. See `data/discrepancies.json`.")
        lines.append("")
    lines.append("## Fields left null")
    lines.append("")
    lines.append("- `formula` and `mw` are null for every product. The catalogues do not have formula or molecular-weight columns. Atom labels inside structure drawings were not OCR'd into those fields. Where those labels share the body font size and sit between the name and the SKU, they are dropped from `name` by left-margin position. The name string is the left-hand text only.")
    lines.append("- Some dye names end in `diazaborinin-4-ium-5-uide`. That is the PDF text layer (the syllable between `diaza` and `inin` is not in the text). It is stored as printed.")
    lines.append("- Three organoboron packs have size `\"25\"` with no unit: AMTB1060-MP14, AMTB1062-IP14, AMTB1249-IB18. The unit glyph is not in the text layer, so the size is the digits that are. AMTGC1460-DH25 on the flyer prints `5mg` at $315; that token is stored as printed.")
    lines.append("- `purity` is null when the source row does not print one. The PEG, fluorophore and organoboron tables have no purity column. The lipids table prints one, copied with its spacing (for example `≥ 98%`). Four PEG rows add a `High Purity 99%` or `High purity 98%` line; that string is stored on the listing.")
    lines.append("- `documents.sds`, `documents.coa` and `documents.datasheet` are null. The crawled pages and current PDFs do not link SDS, COA or datasheet files.")
    lines.append("- `synonyms` is an empty array. Parentheticals such as `(Exoria)` and `(PEG2000)` stay inside `name`.")
    lines.append("- Unpublished prices use `price` null and `priceText` `\"quote\"`. `priceRaw` keeps the printed token (`POA`, `Price on application`, or a masked `########`).")
    lines.append("")
    lines.extend(subfamily_lines(payload["bySubfamily"]))
    if payload.get("classDerived"):
        lines.extend(class_lines(payload["classDerived"]))
    if payload.get("pubchem"):
        lines.extend(pubchem_lines(payload["pubchem"]))
    lines.append("## Not extracted")
    lines.append("")
    lines.append("- Older PDFs in the WordPress media library (2020–2025 catalogues and earlier new-product flyers) are not linked from the live pages. They are listed in `data/sources.json` and were not parsed, so superseded prices are not mixed into `products.json`.")
    lines.append("- The HOMSi fact sheet linked from the literature page is an AK Scientific method sheet, not an AMT SKU catalogue.")
    lines.append("- ChemExper structure search is an iframe. It was not queried.")
    lines.append("- `parse anomalies` recorded while reading tokens: " + str(len(anomalies)) + ". See `data/anomalies.json`. A non-zero count means a token did not fit CAS / purity / pack and was not guessed into a field.")
    lines.append("")
    lines.append("<!-- counts")
    lines.append(json.dumps(payload, indent=2))
    lines.append("-->")
    lines.append("")
    (ROOT / "data" / "COUNTS.md").write_text("\n".join(lines))
    return payload


def main():
    write_raw_text()
    all_rows = []
    all_anomalies = []
    collapse_notes = []
    row_counts = {}
    for spec in CATALOGUES:
        print("parsing", spec["id"], flush=True)
        rows, anomalies = parse_table_pdf(spec)
        row_counts[spec["id"]] = len(rows)
        collapsed, notes = collapse_identical(rows)
        all_rows.extend(collapsed)
        all_anomalies.extend(anomalies)
        collapse_notes.extend(notes)
        print(" ", len(rows), "rows", len(collapsed), "after collapse", len(anomalies), "anomalies")
    print("parsing flyer", flush=True)
    flyer = parse_flyer()
    row_counts["new-products-20250516"] = len(flyer)
    print(" ", len(flyer), "flyer rows")
    for item in flyer:
        print("  ", item["sku"], item["cas"], item["packs"])
    homepage = parse_homepage(CACHE / "home.html")
    print("homepage cards", len(homepage))
    for item in homepage:
        print(" ", item["sku"], item["name"], item["packs"], item["labels"])
    products, discrepancies = merge_products(all_rows, flyer, homepage)
    products.sort(key=lambda p: (["lipids", "peg", "fluorophores", "organoborons", "other"].index(p["family"]), p["sku"]))
    manifest = []
    print("downloading images", flush=True)
    download_logos(manifest)
    attach_images(products, manifest)
    flyer_skus = {r["sku"] for r in flyer}
    catalogue_skus = {r["sku"] for r in all_rows}
    flyer_only = sorted(flyer_skus - catalogue_skus)
    carry_external(products)
    assign_subfamily(products)
    prior_manifest = []
    manifest_path = ASSETS / "manifest.json"
    if manifest_path.exists():
        prior_manifest = [row for row in json.loads(manifest_path.read_text()) if row.get("kind") == "structure-external"]
    (ROOT / "data" / "products.json").write_text(json.dumps(products, indent=2, ensure_ascii=False) + "\n")
    (ROOT / "data" / "discrepancies.json").write_text(json.dumps(discrepancies, indent=2, ensure_ascii=False) + "\n")
    (ROOT / "data" / "anomalies.json").write_text(json.dumps(all_anomalies, indent=2, ensure_ascii=False) + "\n")
    manifest.extend(prior_manifest)
    (ASSETS / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    site = build_site(len(homepage))
    site["logos"] = [m for m in manifest if m.get("kind") in {"logo", "favicon", "apple-touch", "partner-logo", "icon"}]
    (ROOT / "data" / "site.json").write_text(json.dumps(site, indent=2, ensure_ascii=False) + "\n")
    sources = {
        "crawled": "2026-10-22",
        "linkedBrochures": [spec["url"] for spec in CATALOGUES]
        + ["https://www.amtechpl.com/wp-content/uploads/2025/05/New_Products_20250516.pdf"],
        "literaturePdf": {
            "url": "https://aksci.com/forms/AMT_Hiyama_HOMSi_Fact_Sheet_V2.1_201203S.pdf",
            "linkedFrom": "https://www.amtechpl.com/literature/",
            "extracted": False,
            "reason": "Third-party HOMSi / Hiyama fact sheet, not an AMT catalogue of SKUs.",
        },
        "mediaLibraryPdfs": historical_pdfs(),
    }
    (ROOT / "data" / "sources.json").write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n")
    payload = write_counts(products, row_counts, collapse_notes, discrepancies, all_anomalies, flyer_only)
    print(json.dumps(payload, indent=2))
    print("anomalies", len(all_anomalies))
    print("discrepancies", len(discrepancies))
    # spot-check a few known rows
    by_sku = {p["sku"]: p for p in products}
    alc = by_sku["AMTGC903-AL21"]
    assert alc["cas"] == "2036272-55-4", alc["cas"]
    assert alc["purity"] == "≥ 98%", alc["purity"]
    assert alc["packs"][0]["priceRaw"] == "$250.00"
    assert alc["homepagePacks"][0]["priceRaw"] == "$310"
    print("spot-check ALC-0315 ok", alc["name"])
    print("products", len(products))


if __name__ == "__main__":
    main()
