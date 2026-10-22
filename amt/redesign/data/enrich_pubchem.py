#!/usr/bin/env python3
"""Add PubChem formula, molecular weight and a 2D depiction beside AMT fields.

Does not write `formula`, `mw` or `structureImage`. A CAS is kept only when
PubChem's registry-number lookup returns exactly one CID. Responses are cached
under data/raw/pubchem/. Nominal PEG masses (PEG2000, PEG(400)) are read from
the printed name into `mwNominal`.

Re-run safe: cached CAS and CID responses are not fetched again.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path("/workspace/amt/redesign")
DATA = ROOT / "data"
RAW = DATA / "raw" / "pubchem"
ASSETS = ROOT / "assets" / "structures" / "pubchem"
PRODUCTS = DATA / "products.json"
COUNTS_JSON = DATA / "counts.json"
COUNTS_MD = DATA / "COUNTS.md"
MANIFEST = ROOT / "assets" / "manifest.json"

UA = "Mozilla/5.0 (compatible; klopikkon-research/1.0; catalogue research)"
CAS_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")
# PEG2000 / PEG-2000 / PEG 2000 / mPEG2000 / PEG(400). PEG3 and PEG23 are
# oligomer lengths (fewer than 3 digits) and are not nominal masses.
PEG_RE = re.compile(
    r"(?i)(?:^|[^A-Za-z0-9])m?PEG\s*(?:\(\s*(\d{3,})\s*\)|[\s-]?(\d{3,}))(?!\d)"
)
FAMILIES = ["lipids", "peg", "fluorophores", "organoborons", "other"]
INTERVAL = 0.25  # 4 requests per second
WORKERS = 4


class Limiter:
    def __init__(self, interval: float) -> None:
        self.interval = interval
        self.lock = threading.Lock()
        self.next_at = 0.0

    def wait(self) -> None:
        with self.lock:
            now = time.monotonic()
            delay = self.next_at - now
            if delay < 0:
                delay = 0
            self.next_at = max(now, self.next_at) + self.interval
        if delay:
            time.sleep(delay)


LIMITER = Limiter(INTERVAL)


def fetch(url: str, accept: str) -> tuple[int, bytes]:
    last_error = None
    for attempt in range(6):
        LIMITER.wait()
        request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            body = error.read()
            if error.code in {404, 400}:
                return error.code, body
            last_error = f"HTTP {error.code}"
            if error.code not in {429, 500, 502, 503, 504}:
                return error.code, body
        except urllib.error.URLError as error:
            last_error = str(error.reason)
        time.sleep(min(60, 2 ** attempt))
    raise RuntimeError(f"{url} failed after retries: {last_error}")


def single_cas(value) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if CAS_RE.fullmatch(text):
        return text
    return None


def nominal_mw(name) -> int | None:
    if not isinstance(name, str) or not name:
        return None
    found = set()
    for left, right in PEG_RE.findall(name):
        token = left or right
        if token:
            found.add(int(token))
    if len(found) == 1:
        return found.pop()
    return None


def xref_path(cas: str) -> Path:
    return RAW / "xref" / f"{cas}.json"


def property_path(cid: int) -> Path:
    return RAW / "property" / f"{cid}.json"


def png_cache(cid: int) -> Path:
    return RAW / "png" / f"{cid}.png"


def load_xref(cas: str) -> dict:
    path = xref_path(cas)
    if path.exists():
        return json.loads(path.read_text())
    status, body = fetch(
        f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/xref/RN/{cas}/cids/JSON",
        "application/json",
    )
    if status == 200:
        payload = json.loads(body)
        cids = payload.get("IdentifierList", {}).get("CID") or []
        record = {"httpStatus": 200, "cids": cids}
    else:
        record = {"httpStatus": status, "cids": []}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2) + "\n")
    return record


def load_property(cid: int) -> dict | None:
    path = property_path(cid)
    if path.exists():
        cached = json.loads(path.read_text())
        return cached if cached.get("MolecularFormula") else None
    status, body = fetch(
        "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/"
        f"{cid}/property/MolecularFormula,MolecularWeight/JSON",
        "application/json",
    )
    record = {"httpStatus": status}
    if status == 200:
        rows = json.loads(body).get("PropertyTable", {}).get("Properties") or []
        row = next((item for item in rows if item.get("CID") == cid), None)
        if row and row.get("MolecularFormula") and row.get("MolecularWeight"):
            record["MolecularFormula"] = row["MolecularFormula"]
            record["MolecularWeight"] = row["MolecularWeight"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2) + "\n")
    return record if record.get("MolecularFormula") else None


def parse_mw(token: str) -> float | None:
    try:
        value = float(token)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    if value == int(value):
        return int(value)
    return round(value, 4)


def load_png(cid: int) -> bytes | None:
    path = png_cache(cid)
    if path.exists() and path.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n":
        return path.read_bytes()
    status, body = fetch(
        "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/"
        f"{cid}/PNG?record_type=2d&image_size=300x300",
        "image/png",
    )
    if status == 200 and body[:8] == b"\x89PNG\r\n\x1a\n" and len(body) > 200:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        return body
    return None


def blank_external(product: dict) -> None:
    product["formulaExternal"] = None
    product["mwExternal"] = None
    product["structureImageExternal"] = None
    product["externalSource"] = None


def apply_nominal(product: dict) -> None:
    value = nominal_mw(product.get("name"))
    if value is None:
        product["mwNominal"] = None
        product["mwNominalSource"] = None
    else:
        product["mwNominal"] = value
        product["mwNominalSource"] = "name"


def main() -> None:
    products = json.loads(PRODUCTS.read_text())
    protected = {row["sku"]: (row.get("formula"), row.get("mw"), row.get("structureImage")) for row in products}
    cases = sorted({cas for row in products if (cas := single_cas(row.get("cas")))})
    print(f"single CAS values: {len(cases)}", flush=True)

    done = 0
    xref = {}

    def one_cas(cas: str):
        return cas, load_xref(cas)

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(one_cas, cas) for cas in cases]
        for future in as_completed(futures):
            cas, record = future.result()
            xref[cas] = record
            done += 1
            if done % 100 == 0 or done == len(cases):
                print(f"xref {done}/{len(cases)}", flush=True)

    accepted = {}
    for cas, record in xref.items():
        cids = record.get("cids") or []
        if record.get("httpStatus") == 200 and len(cids) == 1:
            accepted[cas] = int(cids[0])
    print(f"unambiguous CID: {len(accepted)}", flush=True)

    cids = sorted(set(accepted.values()))
    properties = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(load_property, cid) for cid in cids]
        finished = 0
        for future in as_completed(futures):
            future.result()
            finished += 1
            if finished % 100 == 0 or finished == len(cids):
                print(f"properties {finished}/{len(cids)}", flush=True)
        # reload from cache so worker return values stay simple
    for cid in cids:
        prop = json.loads(property_path(cid).read_text()) if property_path(cid).exists() else {}
        mw = parse_mw(prop.get("MolecularWeight"))
        formula = prop.get("MolecularFormula")
        if isinstance(formula, str) and formula and mw is not None:
            properties[cid] = (formula, mw)
    print(f"properties kept: {len(properties)}", flush=True)

    images = {}
    needed = [cid for cid in cids if cid in properties]
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(load_png, cid): cid for cid in needed}
        finished = 0
        for future in as_completed(futures):
            cid = futures[future]
            body = future.result()
            finished += 1
            if body:
                images[cid] = body
            if finished % 100 == 0 or finished == len(needed):
                print(f"images {finished}/{len(needed)} kept {len(images)}", flush=True)

    ASSETS.mkdir(parents=True, exist_ok=True)
    manifest_rows = []
    for cid, body in images.items():
        dest = ASSETS / f"{cid}.png"
        if not dest.exists() or dest.read_bytes() != body:
            dest.write_bytes(body)
        rel = f"assets/structures/pubchem/{cid}.png"
        source = (
            "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/"
            f"{cid}/PNG?record_type=2d&image_size=300x300"
        )
        manifest_rows.append(
            {
                "path": rel,
                "sourceUrl": source,
                "kind": "structure-external",
                "cid": cid,
                "bytes": dest.stat().st_size,
                "sha256": hashlib.sha256(body).hexdigest(),
            }
        )

    stats = {
        family: {
            "products": 0,
            "singleCas": 0,
            "oneCid": 0,
            "formulaAndMw": 0,
            "structureImage": 0,
            "mwNominal": 0,
        }
        for family in FAMILIES
    }

    for product in products:
        sku = product["sku"]
        before = protected[sku]
        apply_nominal(product)
        cas = single_cas(product.get("cas"))
        cid = accepted.get(cas) if cas else None
        prop = properties.get(cid) if cid is not None else None
        blank_external(product)
        if prop:
            formula, mw = prop
            product["formulaExternal"] = formula
            product["mwExternal"] = mw
            rel = f"assets/structures/pubchem/{cid}.png" if cid in images else None
            product["structureImageExternal"] = rel
            product["externalSource"] = {
                "name": "PubChem",
                "cid": cid,
                "url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
            }
        if (product.get("formula"), product.get("mw"), product.get("structureImage")) != before:
            raise SystemExit(f"{sku} AMT formula/mw/structureImage changed")
        family = product["family"]
        row = stats[family]
        row["products"] += 1
        if cas:
            row["singleCas"] += 1
        if cid is not None:
            row["oneCid"] += 1
        if product["formulaExternal"] is not None:
            row["formulaAndMw"] += 1
        if product["structureImageExternal"]:
            row["structureImage"] += 1
        if product["mwNominal"] is not None:
            row["mwNominal"] += 1

    total = {key: sum(stats[family][key] for family in FAMILIES) for key in stats["lipids"]}
    pubchem = {"byFamily": {**stats, "total": total}}

    PRODUCTS.write_text(json.dumps(products, indent=2, ensure_ascii=False) + "\n")

    counts = json.loads(COUNTS_JSON.read_text())
    counts["pubchem"] = pubchem
    COUNTS_JSON.write_text(json.dumps(counts, indent=2) + "\n")
    text = COUNTS_MD.read_text()
    section = "\n".join(pubchem_section(pubchem)) + "\n"
    if "## External reference data" in text:
        text = re.sub(r"## External reference data\n.*?(?=\n## )", section, text, count=1, flags=re.S)
    else:
        text = text.replace("\n## Not extracted\n", "\n" + section + "\n## Not extracted\n")
    comment = "<!-- counts\n" + json.dumps(counts, indent=2) + "\n-->"
    text = re.sub(r"<!-- counts\n.*?\n-->", comment, text, count=1, flags=re.S)
    COUNTS_MD.write_text(text)

    existing = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else []
    existing = [row for row in existing if row.get("kind") != "structure-external"]
    MANIFEST.write_text(json.dumps(existing + manifest_rows, indent=2) + "\n")
    print(json.dumps(pubchem, indent=2))


def pubchem_section(stats: dict) -> list[str]:
    lines = [
        "## External reference data",
        "",
        "`formula` and `mw` are only what AMT published, and both stay null because the catalogues have no such columns. `structureImage` stays the AMT file when one was published. PubChem formula, molecular weight and the 2D depiction are `formulaExternal`, `mwExternal` and `structureImageExternal`, with `externalSource` `{name: PubChem, cid, url}`. A CAS is accepted only when PubChem returns exactly one CID. `mwNominal` is a nominal PEG mass read from the printed name (PEG2000 or PEG(400)); a short token such as PEG3 is an oligomer length and is not used.",
        "",
        "| Family | Products | Single CAS | One CID | Formula and MW | Structure image | Nominal PEG mass |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for family in FAMILIES + ["total"]:
        row = stats["byFamily"][family]
        lines.append(
            "| {family} | {products} | {singleCas} | {oneCid} | {formulaAndMw} | {structureImage} | {mwNominal} |".format(
                family=family, **row
            )
        )
    lines.append("")
    return lines


if __name__ == "__main__":
    main()
