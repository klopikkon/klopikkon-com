#!/usr/bin/env python3
"""Find AMT-published documents and product images.

Crawls the live WordPress pages, the media library, and the five catalogue
PDFs already on disk. A document is recorded only when a page or media item
links an SDS, COA, datasheet, spec sheet, or technical document for a SKU or
a family. Catalogue PDFs stay on `source.pdf` and are not copied into
`documents`.

An image is AMT's when the homepage card shows it beside the SKU, or when a
media-library file name contains that SKU. Files are saved unaltered under
assets/products/. PubChem fields are not touched.

Nothing is invented. Run from the repo root:

    python3 amt/redesign/data/crawl_site_assets.py
    python3 amt/redesign/data/crawl_site_assets.py --apply
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path("/workspace/amt/redesign")
DATA = ROOT / "data"
PRODUCTS = DATA / "products.json"
COUNTS_JSON = DATA / "counts.json"
COUNTS_MD = DATA / "COUNTS.md"
MANIFEST = ROOT / "assets" / "manifest.json"
OUT_DIR = ROOT / "assets" / "products"
CACHE = Path("/tmp/amt-crawl")
UA = "Mozilla/5.0 (compatible; klopikkon-research/1.0; catalogue research)"
SKU_RE = re.compile(r"AMT[A-Z]{1,6}\d{2,5}-[A-Za-z0-9]+")
DOC_RE = re.compile(
    r"\b(?:SDS|MSDS|COA|datasheet|data\s+sheet|spec(?:ification)?\s+sheet|technical\s+data(?:\s+sheet)?|"
    r"safety\s+data(?:\s+sheet)?|certificate\s+of\s+analysis)\b",
    re.I,
)
PDF_RE = re.compile(r"https://www\.amtechpl\.com/wp-content/uploads/[^\"'\s>]+\.pdf", re.I)
IMG_RE = re.compile(r"https://www\.amtechpl\.com/wp-content/uploads/[^\"'\s>]+\.(?:png|jpe?g|gif|webp)", re.I)
THUMB_RE = re.compile(r"-\d+x\d+(?=\.)|[-_]scaled(?=\.)", re.I)

FAMILIES = {
    "lipids": "lipids",
    "peg": "peg",
    "fluorophore": "fluorophores",
    "organoboron": "organoborons",
}


def fetch(url: str, accept: str = "*/*") -> tuple[int, bytes, dict]:
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, response.read(), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, error.read(), dict(error.headers)


def fetch_json(url: str):
    status, body, headers = fetch(url, "application/json")
    if status != 200:
        return status, None, headers
    return status, json.loads(body), headers


def all_media() -> list[dict]:
    rows = []
    page = 1
    while page <= 20:
        status, payload, headers = fetch_json(
            f"https://www.amtechpl.com/wp-json/wp/v2/media?per_page=100&page={page}"
        )
        if status == 400 or payload is None:
            break
        if not payload:
            break
        rows.extend(payload)
        total = int(headers.get("X-WP-TotalPages") or headers.get("x-wp-totalpages") or page)
        print(f"media page {page}/{total} +{len(payload)}", flush=True)
        if page >= total:
            break
        page += 1
        time.sleep(0.25)
    return rows


def all_pages() -> list[dict]:
    status, payload, headers = fetch_json("https://www.amtechpl.com/wp-json/wp/v2/pages?per_page=100")
    print(f"pages {status} {0 if not payload else len(payload)}", flush=True)
    return payload or []


def probe(url: str) -> int:
    status, body, _headers = fetch(url)
    print(f"probe {status} {url} bytes={len(body)}", flush=True)
    time.sleep(0.2)
    return status


def strip_tags(html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text)


def sku_in_filename(sku: str, url: str) -> bool:
    name = url.split("/")[-1].split("?")[0]
    return re.search(re.escape(sku) + r"(?![A-Za-z0-9])", name, re.I) is not None


def is_thumb(url: str) -> bool:
    return bool(THUMB_RE.search(url.split("/")[-1]))


def image_rank(url: str, sku: str) -> tuple:
    filename = url.split("/")[-1].split("?")[0]
    stem = filename.rsplit(".", 1)[0].lower()
    exact = stem == sku.lower()
    png = filename.lower().endswith(".png")
    return (0 if exact else 1, 0 if png else 1, 1 if is_thumb(url) else 0, len(filename))


def homepage_images(html: str, skus: set[str]) -> dict[str, str]:
    """Image shown on the homepage card, the nearest upload before the SKU."""
    found = {}
    for match in SKU_RE.finditer(html):
        sku = match.group(0)
        if sku not in skus:
            continue
        window = html[max(0, match.start() - 900) : match.start()]
        images = IMG_RE.findall(window)
        if not images:
            continue
        url = images[-1].rstrip('"')
        if any(token in url.lower() for token in ("logo", "delivery-truck", "frontier", "scaled-organics")):
            continue
        found[sku] = url
    return found


def classify_doc(url: str, context: str) -> str | None:
    blob = f"{url} {context}"
    if re.search(r"certificate\s+of\s+analysis|\bCOA\b", blob, re.I):
        return "coa"
    if re.search(r"safety\s+data|\bSDS\b|\bMSDS\b", blob, re.I):
        return "sds"
    if re.search(r"datasheet|data\s+sheet", blob, re.I):
        return "datasheet"
    if re.search(r"spec(?:ification)?\s+sheet", blob, re.I):
        return "spec"
    if re.search(r"technical\s+data(?:\s+sheet)?", blob, re.I):
        return "technical"
    return None


def safe_name(url: str) -> str:
    name = url.split("/")[-1].split("?")[0]
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-")
    return name or "file"


def norm_size(size) -> str:
    return re.sub(r"\s+", "", str(size or "")).lower()


def price_conflict(product: dict) -> bool:
    home = product.get("homepagePacks") or []
    if not home:
        return False
    pdf_prices: dict[str, set] = {}
    for pack in product.get("packs") or []:
        pdf_prices.setdefault(norm_size(pack.get("size")), set()).add(pack.get("price"))
    for pack in home:
        prices = pdf_prices.get(norm_size(pack.get("size")))
        if not prices or pack.get("price") not in prices:
            return True
    return False


def collect() -> dict:
    media = all_media()
    pages = all_pages()
    probes = {
        "wc/v3/products": probe("https://www.amtechpl.com/wp-json/wc/v3/products"),
        "wc/store/products": probe("https://www.amtechpl.com/wp-json/wc/store/v1/products"),
        "wp/v2/product": probe("https://www.amtechpl.com/wp-json/wp/v2/product?per_page=1"),
        "uploads index": probe("https://www.amtechpl.com/wp-content/uploads/"),
        "uploads 2026": probe("https://www.amtechpl.com/wp-content/uploads/2026/"),
    }
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "api_media_full.json").write_text(json.dumps(media))
    (CACHE / "api_pages_full.json").write_text(json.dumps(pages))

    products = json.loads(PRODUCTS.read_text())
    skus = {row["sku"] for row in products}
    by_sku = {row["sku"]: row for row in products}

    documents = []
    doc_notes = []
    for page in pages:
        link = page.get("link") or ""
        html = (page.get("content") or {}).get("rendered") or ""
        text = strip_tags(html)
        pdfs = PDF_RE.findall(html)
        for pdf in pdfs:
            kind = classify_doc(pdf, text)
            if kind:
                documents.append({"type": kind, "url": pdf, "source": link, "via": "page"})
            else:
                doc_notes.append({"url": pdf, "source": link, "kept": False, "reason": "catalogue or other PDF, not an SDS/COA/spec/technical sheet"})
        if DOC_RE.search(text) and not pdfs:
            doc_notes.append({"source": link, "kept": False, "reason": "wording without a document URL", "sample": DOC_RE.search(text).group(0)})
    for item in media:
        url = item.get("source_url") or ""
        title = strip_tags((item.get("title") or {}).get("rendered") or "")
        if not url.lower().endswith(".pdf"):
            continue
        kind = classify_doc(url, title)
        if kind:
            documents.append({"type": kind, "url": url, "source": item.get("link") or url, "via": "media", "title": title})
        else:
            doc_notes.append({"url": url, "source": "media library", "title": title, "kept": False, "reason": "PDF is not an SDS, COA, datasheet, spec sheet, or technical document"})

    # Attach a document to a SKU only when the URL or the surrounding title names that SKU.
    # A family document would name the family and no SKU. None of the current PDFs do.
    per_sku_docs: dict[str, list] = {sku: [] for sku in skus}
    family_docs = []
    for doc in documents:
        blob = f"{doc['url']} {doc.get('title','')}"
        named = [sku for sku in skus if sku_in_filename(sku, blob) or sku in blob]
        if named:
            for sku in named:
                per_sku_docs[sku].append({key: doc[key] for key in ("type", "url", "source")})
        else:
            family = None
            low = blob.lower()
            for token, family_id in FAMILIES.items():
                if token in low:
                    family = family_id
                    break
            if family and classify_doc(doc["url"], blob):
                family_docs.append({**doc, "family": family})

    home_html = ""
    for page in pages:
        if (page.get("link") or "").rstrip("/") == "https://www.amtechpl.com":
            home_html = (page.get("content") or {}).get("rendered") or ""
    cards = homepage_images(home_html, skus)

    media_images = []
    for item in media:
        mime = item.get("mime_type") or ""
        url = item.get("source_url") or ""
        if not mime.startswith("image/") or not url:
            continue
        media_images.append(url)

    chosen = {}
    for sku in sorted(skus):
        if sku in cards:
            chosen[sku] = {"url": cards[sku], "where": "homepage card"}
            continue
        matches = [url for url in media_images if sku_in_filename(sku, url) and not is_thumb(url)]
        if not matches:
            matches = [url for url in media_images if sku_in_filename(sku, url)]
        if not matches:
            continue
        matches.sort(key=lambda url: image_rank(url, sku))
        chosen[sku] = {"url": matches[0], "where": "media library"}

    conflicts = [row["sku"] for row in products if price_conflict(row)]
    report = {
        "mediaItems": len(media),
        "pages": len(pages),
        "probes": probes,
        "documentsFound": documents,
        "documentNotes": doc_notes,
        "familyDocuments": family_docs,
        "productsWithDocuments": sum(1 for docs in per_sku_docs.values() if docs),
        "images": chosen,
        "imagesOnHomepage": sum(1 for row in chosen.values() if row["where"] == "homepage card"),
        "imagesInMediaOnly": sum(1 for row in chosen.values() if row["where"] == "media library"),
        "priceConflict": conflicts,
    }
    Path("/tmp/amt-site-assets.json").write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"documents {len(documents)} family {len(family_docs)} images {len(chosen)} "
        f"homepage {report['imagesOnHomepage']} media-only {report['imagesInMediaOnly']} "
        f"conflicts {conflicts}",
        flush=True,
    )
    return report


def apply(report: dict) -> None:
    products = json.loads(PRODUCTS.read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else []
    manifest = [row for row in manifest if row.get("kind") != "product-image"]
    new_rows = []
    by_family = {family: {"products": 0, "amtImage": 0, "documents": 0} for family in ["lipids", "peg", "fluorophores", "organoborons", "other"]}

    for product in products:
        sku = product["sku"]
        product["documents"] = []
        product.pop("priceConflict", None)
        image = report["images"].get(sku)
        if image:
            url = image["url"]
            filename = safe_name(url)
            dest = OUT_DIR / filename
            if not dest.exists():
                status, body, _headers = fetch(url)
                if status != 200 or not body or body[:1] == b"<":
                    raise SystemExit(f"{sku} image download failed {status} {url}")
                dest.write_bytes(body)
                time.sleep(0.15)
            rel = f"assets/products/{filename}"
            product["structureImage"] = rel
            product["structureImageSource"] = url
            digest = hashlib.sha256(dest.read_bytes()).hexdigest()
            new_rows.append(
                {
                    "path": rel,
                    "sourceUrl": url,
                    "kind": "product-image",
                    "sku": sku,
                    "bytes": dest.stat().st_size,
                    "sha256": digest,
                }
            )
        else:
            product["structureImage"] = None
            product["structureImageSource"] = None
        if sku in report["priceConflict"]:
            product["priceConflict"] = True
        family = product["family"]
        by_family[family]["products"] += 1
        if product["structureImage"]:
            by_family[family]["amtImage"] += 1
        if product["documents"]:
            by_family[family]["documents"] += 1

    # PubChem depiction must stay off the AMT image field.
    for product in products:
        external = product.get("structureImageExternal")
        if external and product.get("structureImage") == external:
            raise SystemExit(f"{product['sku']} structureImage points at PubChem")

    PRODUCTS.write_text(json.dumps(products, indent=2, ensure_ascii=False) + "\n")
    MANIFEST.write_text(json.dumps(manifest + new_rows, indent=2, ensure_ascii=False) + "\n")

    total_images = sum(row["amtImage"] for row in by_family.values())
    coverage = {
        "documents": {
            "products": 0,
            "note": "No SDS, COA, datasheet, spec sheet, or technical document URL is published per SKU or per family. Catalogue PDFs stay on source.pdf.",
            "byFamily": {family: by_family[family]["documents"] for family in by_family},
        },
        "amtImages": {
            "products": total_images,
            "onHomepageCard": report["imagesOnHomepage"],
            "mediaLibraryOnly": report["imagesInMediaOnly"],
            "byFamily": {family: by_family[family]["amtImage"] for family in by_family},
        },
        "priceConflict": report["priceConflict"],
    }
    counts = json.loads(COUNTS_JSON.read_text())
    counts["documents"] = coverage["documents"]
    counts["amtImages"] = coverage["amtImages"]
    counts["priceConflict"] = coverage["priceConflict"]
    COUNTS_JSON.write_text(json.dumps(counts, indent=2, ensure_ascii=False) + "\n")
    text = COUNTS_MD.read_text()
    section = "\n".join(coverage_lines(coverage)) + "\n"
    if "## AMT documents and images" in text:
        text = re.sub(r"## AMT documents and images\n.*?(?=\n## )", section, text, count=1, flags=re.S)
    else:
        text = text.replace("\n## Not extracted\n", "\n" + section + "\n## Not extracted\n")
    text = text.replace(
        "- `documents.sds`, `documents.coa` and `documents.datasheet` are null. The crawled pages and current PDFs do not link SDS, COA or datasheet files.\n",
        "",
    )
    comment = "<!-- counts\n" + json.dumps(counts, indent=2) + "\n-->"
    text = re.sub(r"<!-- counts\n.*?\n-->", comment, text, count=1, flags=re.S)
    COUNTS_MD.write_text(text)
    print(json.dumps(coverage, indent=2))


def coverage_lines(coverage: dict) -> list[str]:
    images = coverage["amtImages"]
    lines = [
        "## AMT documents and images",
        "",
        "`documents` is a list of `{type, url, source}` only where AMT publishes an SDS, COA, datasheet, spec sheet, or technical document for that SKU. An empty list means no such file is linked. Catalogue PDFs stay on `source.pdf`. `structureImage` is a file AMT published for that SKU, saved unaltered under `assets/products/`, and `structureImageSource` is that file's URL. PubChem drawings stay on `structureImageExternal`. `priceConflict` is true when a homepage card price and the catalogue pack for the same size disagree. Both prices are kept.",
        "",
        f"Documents: **{coverage['documents']['products']}** products. {coverage['documents']['note']}",
        "",
        f"AMT images: **{images['products']}** of 1347. {images['onHomepageCard']} are the image on the current homepage card. {images['mediaLibraryOnly']} are media-library files named with the SKU and not on that card.",
        "",
        "| Family | Products | AMT image | Documents |",
        "| --- | ---: | ---: | ---: |",
    ]
    order = ["lipids", "peg", "fluorophores", "organoborons", "other"]
    product_counts = {"lipids": 36, "peg": 212, "fluorophores": 40, "organoborons": 1046, "other": 13}
    for family in order:
        lines.append(
            f"| {family} | {product_counts[family]} | {images['byFamily'][family]} | {coverage['documents']['byFamily'][family]} |"
        )
    lines.append("")
    conflict = ", ".join(coverage["priceConflict"]) or "none"
    lines.append(f"`priceConflict`: {conflict}.")
    lines.append("")
    return lines


def main() -> None:
    report = collect()
    if "--apply" in sys.argv:
        apply(report)


if __name__ == "__main__":
    main()
