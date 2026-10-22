#!/usr/bin/env python3
"""Second-pass catalogue audit.

The first extract used Poppler's pdftotext bounding boxes. This pass uses
pdfplumber (pdfminer) table cells for the four brochures and pdfminer word
positions for the May 2025 flyer. It diffs SKU, name, CAS, purity, pack size
and price against data/products.json and writes a JSON report to stdout.

PDFs are read from /tmp/amt-crawl/pdf. Nothing here overwrites products.json.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pdfplumber

PDF_DIR = Path("/tmp/amt-crawl/pdf")
PRODUCTS = Path("/workspace/amt/redesign/data/products.json")
SKU_RE = re.compile(r"^AMT[A-Z]{1,6}\d{2,5}-[A-Za-z0-9]+$")
CAS_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")
PRICE_RE = re.compile(r"^\$[\d,]+(?:\.\d+)?$")
PURITY_LINE = re.compile(r"(?i)^high\s+purity\s+\d+(?:\.\d+)?\s*%$|^≥\s*\d+(?:\.\d+)?\s*%$")

CATALOGUES = [
    ("lipids-20260826", "AMT-Lipids-20260826.pdf"),
    ("peg-20260903", "AMT-PEG-Reagents-and-Linkers-Catalogue-List-20260903.pdf"),
    ("fluorophores-2026", "AMT-FluorophoresDyes-Catalogue-List-2026.pdf"),
    ("organoborons-20260421", "AMT-Organoboron-Compounds-List-20260421.pdf"),
]


def norm_space(text: str | None) -> str | None:
    if text is None:
        return None
    text = text.replace("\u200b", "").replace("\xa0", " ").replace("\u2009", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def join_name(cell: str | None) -> tuple[str | None, str | None]:
    if not cell:
        return None, None
    raw = cell.replace("\u200b", "").replace("\xa0", " ")
    lines = [re.sub(r"\s+", " ", line).strip() for line in raw.splitlines()]
    lines = [line for line in lines if line]
    purity = None
    kept = []
    for line in lines:
        if PURITY_LINE.fullmatch(line):
            purity = norm_space(line)
            if purity and purity.lower().startswith("high"):
                purity = re.sub(r"(?i)^high\s+purity", "High Purity" if "Purity" in line else "High purity", purity)
                # keep the PDF's own capitalisation
                purity = norm_space(line)
        else:
            kept.append(line)
    if not kept:
        return None, purity
    joined = kept[0]
    for line in kept[1:]:
        if joined.endswith("-") or joined.endswith("/"):
            joined += line
        else:
            joined += " " + line
    return norm_space(joined), purity


def parse_price(token: str | None) -> dict | None:
    if token is None:
        return None
    token = norm_space(token)
    if not token:
        return None
    if token in {"POA", "########"} or token.lower() == "price on application":
        return {"size": None, "price": None, "priceRaw": token}
    if not PRICE_RE.match(token):
        return {"size": None, "price": None, "priceRaw": token, "unparsed": True}
    number = token.replace("$", "").replace(",", "")
    value = round(float(number), 2)
    if value == int(value):
        value = int(value)
    return {"size": None, "price": value, "priceRaw": token}


def header_map(row: list[str | None]) -> dict | None:
    mapping: dict[str, int] = {}
    qty = 0
    price = 0
    for index, cell in enumerate(row):
        label = norm_space((cell or "").split("\n")[0]) or ""
        label = label.lower()
        if label.startswith("name"):
            mapping["name"] = index
        elif label.startswith("catalog"):
            mapping["sku"] = index
        elif label.startswith("cas"):
            mapping["cas"] = index
        elif label.startswith("purity"):
            mapping["purity"] = index
        elif label.startswith("qty") or label.startswith("quantity"):
            qty += 1
            mapping[f"qty{qty}"] = index
        elif label.startswith("price"):
            price += 1
            mapping[f"price{price}"] = index
    if "sku" not in mapping:
        return None
    return mapping


def cell(row: list[str | None], index: int | None) -> str | None:
    if index is None or index >= len(row):
        return None
    return row[index]


def packs_from_row(row: list[str | None], mapping: dict) -> list[dict]:
    packs = []
    for number in range(1, 6):
        qty = norm_space(cell(row, mapping.get(f"qty{number}")))
        raw_price = cell(row, mapping.get(f"price{number}"))
        if not qty and not (raw_price and norm_space(raw_price)):
            continue
        parsed = parse_price(raw_price) or {"price": None, "priceRaw": None}
        packs.append({"size": qty, "price": parsed.get("price"), "priceRaw": parsed.get("priceRaw")})
    return packs


def extract_tables(source_id: str, filename: str) -> list[dict]:
    rows_out = []
    with pdfplumber.open(PDF_DIR / filename) as pdf:
        for page_no, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables() or []
            if not tables:
                continue
            mapping = None
            for row in tables[0]:
                found = header_map(row)
                if found:
                    mapping = found
                    continue
                if mapping is None:
                    continue
                sku = re.sub(r"\s+", "", cell(row, mapping["sku"]) or "")
                if not SKU_RE.match(sku):
                    continue
                name, peeled = join_name(cell(row, mapping.get("name")))
                purity = norm_space(cell(row, mapping.get("purity"))) or peeled
                cas = norm_space(cell(row, mapping.get("cas")))
                rows_out.append(
                    {
                        "sku": sku,
                        "name": name,
                        "cas": cas,
                        "purity": purity,
                        "packs": packs_from_row(row, mapping),
                        "page": page_no,
                        "sourceId": source_id,
                    }
                )
    return rows_out


def extract_flyer() -> list[dict]:
    with pdfplumber.open(PDF_DIR / "New_Products_20250516.pdf") as pdf:
        words = pdf.pages[0].extract_words(use_text_flow=False) or []
    skus = [word for word in words if SKU_RE.match(word["text"])]
    skus.sort(key=lambda word: (word["top"], word["x0"]))
    bands = []
    for sku in skus:
        if not bands or sku["top"] - bands[-1][0]["top"] > 40:
            bands.append([sku])
        else:
            bands[-1].append(sku)
    parsed = []
    for index, band in enumerate(bands):
        band = sorted(band, key=lambda word: word["x0"])
        next_top = bands[index + 1][0]["top"] - 6 if index + 1 < len(bands) else 760
        xs = [word["x0"] for word in band]
        for i, sku in enumerate(band):
            left = 0 if i == 0 else (xs[i - 1] + xs[i]) / 2
            right = 2000 if i + 1 == len(xs) else (xs[i] + xs[i + 1]) / 2
            cell_words = [
                word
                for word in words
                if left <= word["x0"] < right and sku["top"] - 4 <= word["top"] < next_top and word is not sku
            ]
            cell_words.sort(key=lambda word: (word["top"], word["x0"]))
            cas = None
            packs = []
            pending = []
            quote = []
            for word in cell_words:
                token = word["text"]
                if token == "CAS:":
                    continue
                if CAS_RE.match(token):
                    cas = token
                    continue
                if token in {"Price", "on", "application"}:
                    quote.append(token)
                    continue
                if quote and (PRICE_RE.match(token) or re.fullmatch(r"\d+(?:\.\d+)?", token) or token.lower() in {"mg", "g"}):
                    packs.append({"size": None, "price": None, "priceRaw": "Price on application"})
                    quote = []
                if re.fullmatch(r"\d+(?:\.\d+)?(?:mg|g|kg)", token, re.I):
                    pending = [token]
                    continue
                if re.fullmatch(r"\d+(?:\.\d+)?", token) or token.lower() in {"mg", "g", "kg"}:
                    pending.append(token)
                    continue
                if PRICE_RE.match(token):
                    size = None
                    if len(pending) == 1:
                        size = pending[0]
                    elif len(pending) == 2:
                        size = pending[0] + pending[1]
                    elif pending:
                        size = "".join(pending)
                    parsed_price = parse_price(token)
                    packs.append({"size": size, "price": parsed_price["price"], "priceRaw": parsed_price["priceRaw"]})
                    pending = []
            if quote:
                packs.append({"size": None, "price": None, "priceRaw": "Price on application"})
            parsed.append(
                {
                    "sku": sku["text"],
                    "name": None,
                    "cas": cas,
                    "purity": None,
                    "packs": packs,
                    "page": 1,
                    "sourceId": "new-products-20250516",
                }
            )
    return parsed


def pack_sig(packs: list[dict]) -> tuple:
    out = []
    for pack in packs:
        size = norm_space(pack.get("size"))
        price = pack.get("price")
        raw = pack.get("priceRaw")
        if price is None:
            out.append((size, None, raw))
        else:
            out.append((size, price, None))
    return tuple(out)


def same_row(extracted: dict, stored: dict) -> dict:
    fields = {}
    for key in ("name", "cas", "purity"):
        left = norm_space(extracted.get(key))
        right = norm_space(stored.get(key))
        if key == "purity":
            if left and left.lower().startswith("high purity"):
                left = "High Purity " + left.split(None, 2)[-1] if False else left
            # compare case-insensitively for the high-purity label only when the digits match
        if left != right:
            # High Purity vs High purity is a real printed difference; keep it.
            fields[key] = {"pdf": extracted.get(key), "stored": stored.get(key)}
    if pack_sig(extracted["packs"]) != pack_sig(stored.get("packs") or []):
        fields["packs"] = {"pdf": extracted["packs"], "stored": stored.get("packs")}
    return fields


def listing_view(listing: dict) -> dict:
    return {
        "name": listing.get("name"),
        "cas": listing.get("cas"),
        "purity": listing.get("purity"),
        "packs": [
            {"size": pack.get("size"), "price": pack.get("price"), "priceRaw": pack.get("priceRaw")}
            for pack in listing.get("packs") or []
        ],
        "page": listing.get("page"),
        "sourceId": listing.get("sourceId"),
    }


def audit(extracted: list[dict], products: list[dict]) -> dict:
    by_source: dict[tuple, list] = {}
    for product in products:
        for listing in product.get("listings") or []:
            by_source.setdefault((listing["sourceId"], product["sku"]), []).append(listing_view(listing))
        for listing in product.get("alsoListedIn") or []:
            by_source.setdefault((listing["sourceId"], product["sku"]), []).append(listing_view(listing))
    pdf_groups: dict[tuple, list] = {}
    for row in extracted:
        pdf_groups.setdefault((row["sourceId"], row["sku"]), []).append(row)

    mismatches = []
    duplicates = []
    missing_in_products = []
    missing_in_pdf = []
    keys = set(by_source) | set(pdf_groups)
    for key in sorted(keys):
        pdf_rows = pdf_groups.get(key) or []
        stored_rows = by_source.get(key) or []
        used_pdf = set()
        used_stored = set()
        for i, row in enumerate(pdf_rows):
            for j, stored in enumerate(stored_rows):
                if j in used_stored:
                    continue
                if not same_row(row, stored):
                    used_pdf.add(i)
                    used_stored.add(j)
                    break
        for i, row in enumerate(pdf_rows):
            if i in used_pdf:
                continue
            if any(not same_row(row, stored_rows[j]) for j in used_stored):
                duplicates.append({"sku": key[1], "sourceId": key[0], "pdfPage": row["page"]})
                continue
            if not stored_rows:
                missing_in_products.append({"sku": key[1], "sourceId": key[0], "page": row["page"], "row": row})
                continue
            # leftover pdf row against an unused stored row, else the first stored row
            target = next((j for j in range(len(stored_rows)) if j not in used_stored), 0)
            used_stored.add(target)
            fields = same_row(row, stored_rows[target])
            if fields:
                mismatches.append(
                    {
                        "sku": key[1],
                        "sourceId": key[0],
                        "page": row["page"],
                        "storedPage": stored_rows[target]["page"],
                        "fields": fields,
                    }
                )
        for j, stored in enumerate(stored_rows):
            if j not in used_stored:
                missing_in_pdf.append(
                    {
                        "sku": key[1],
                        "sourceId": key[0],
                        "storedPage": stored["page"],
                        "stored": stored,
                    }
                )
    return {
        "extracted": len(extracted),
        "mismatches": mismatches,
        "missingInProducts": missing_in_products,
        "missingInPdf": missing_in_pdf,
        "pageDuplicates": duplicates,
    }


def homepage_crosscheck(extracted: list[dict], products: list[dict]) -> list[dict]:
    by_sku: dict[str, list] = {}
    for row in extracted:
        by_sku.setdefault(row["sku"], []).append(row)
    diffs = []
    for product in products:
        cards = product.get("homepagePacks") or []
        if not cards:
            continue
        pdf_rows = by_sku.get(product["sku"]) or []
        pdf_packs = []
        for row in pdf_rows:
            for pack in row["packs"]:
                pdf_packs.append({"sourceId": row["sourceId"], "page": row["page"], **pack})
        def size_key(size):
            return re.sub(r"\s+", "", size or "").lower()
        for card in cards:
            key = size_key(card.get("size"))
            matches = [pack for pack in pdf_packs if size_key(pack.get("size")) == key]
            prices = sorted({pack.get("price") for pack in matches})
            entry = {
                "sku": product["sku"],
                "cardSize": card.get("size"),
                "cardPrice": card.get("price"),
                "cardPriceRaw": card.get("priceRaw"),
                "pdfPrices": prices,
                "pdfPacks": [{"sourceId": pack["sourceId"], "size": pack.get("size"), "price": pack.get("price")} for pack in matches],
            }
            if not matches:
                entry["kind"] = "card size absent from the PDFs"
                diffs.append(entry)
            elif card.get("price") not in prices:
                entry["kind"] = "price differs"
                diffs.append(entry)
    return diffs


def main() -> None:
    extracted = []
    for source_id, filename in CATALOGUES:
        rows = extract_tables(source_id, filename)
        print(f"{source_id} {len(rows)}", flush=True)
        extracted.extend(rows)
    flyer = extract_flyer()
    print(f"flyer {len(flyer)}", flush=True)
    extracted.extend(flyer)
    products = json.loads(PRODUCTS.read_text())
    report = audit(extracted, products)
    report["homepage"] = homepage_crosscheck(extracted, products)
    report["bySource"] = {}
    for source_id, _filename in CATALOGUES + [("new-products-20250516", "")]:
        report["bySource"][source_id] = sum(1 for row in extracted if row["sourceId"] == source_id)
    out = Path("/tmp/amt-audit-report.json")
    # drop bulky empty success; keep mismatches
    slim = {
        "extracted": report["extracted"],
        "bySource": report["bySource"],
        "mismatchCount": len(report["mismatches"]),
        "missingInProducts": report["missingInProducts"],
        "missingInPdf": report["missingInPdf"],
        "duplicateCount": len(report["pageDuplicates"]),
        "mismatches": report["mismatches"],
        "homepage": report["homepage"],
    }
    out.write_text(json.dumps(slim, indent=2) + "\n")
    print(json.dumps({k: slim[k] for k in ("extracted", "bySource", "mismatchCount", "duplicateCount")}, indent=2))
    print("missing products", len(slim["missingInProducts"]), "missing pdf", len(slim["missingInPdf"]), "homepage diffs", len(slim["homepage"]))


if __name__ == "__main__":
    main()
