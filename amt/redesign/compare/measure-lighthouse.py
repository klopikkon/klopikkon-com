#!/usr/bin/env python3
"""Run Lighthouse three times per URL and form factor.

Writes trimmed JSON (scores and audit numeric values; image payloads dropped)
to compare/data/lighthouse/. Safe to re-run: existing ok files are skipped.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock, Semaphore

ROOT = Path("/workspace/amt/redesign/compare/data/lighthouse")
ROOT.mkdir(parents=True, exist_ok=True)
PROGRESS = ROOT / "_progress.log"

CHROME_FLAGS = "--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage"
KEEP_AUDITS = {
    "largest-contentful-paint",
    "cumulative-layout-shift",
    "total-blocking-time",
    "total-byte-weight",
    "first-contentful-paint",
    "speed-index",
    "interactive",
    "max-potential-fid",
    "server-response-time",
    "mainthread-work-breakdown",
    "bootup-time",
    "network-rtt",
    "network-server-latency",
    "dom-size",
    "unminified-javascript",
    "unused-javascript",
    "render-blocking-resources",
    "redirects",
    "largest-contentful-paint-element",
    "layout-shifts",
    "errors-in-console",
    "is-on-https",
    "robots-txt",
    "http-status-code",
    "crawlable-anchors",
    "document-title",
    "meta-description",
    "viewport",
    "color-contrast",
    "image-alt",
    "link-name",
    "button-name",
    "html-has-lang",
}

# Also keep every audit's score/numericValue but drop details (images, item lists).

SITES = [
    {
        "id": "amt",
        "host": "www.amtechpl.com",
        "pages": {
            "home": "https://www.amtechpl.com/",
            "product": "https://www.amtechpl.com/peg-reagents-and-linkers/",
        },
    },
    {
        "id": "broadpharm",
        "host": "broadpharm.com",
        "pages": {
            "home": "https://broadpharm.com/",
            "product": "https://broadpharm.com/product/bp-25269",
        },
    },
    {
        "id": "jenkem",
        "host": "jenkemusa.com",
        "pages": {
            "home": "https://jenkemusa.com/",
            "product": "https://jenkemusa.com/product/methoxy-peg-dspe",
        },
    },
    {
        "id": "creativepeg",
        "host": "creativepegworks.com",
        "pages": {
            "home": "https://creativepegworks.com/",
            "product": "https://creativepegworks.com/product/mpeg-dspe-mw-2k",
        },
    },
    {
        "id": "avanti",
        "host": "www.avantiresearch.com",
        "pages": {
            "home": "https://www.avantiresearch.com/en-gb",
            "product": "https://www.avantiresearch.com/en-gb/products/product/880120-180-peg2000-pe-ammonium-salt",
        },
    },
    {
        "id": "cayman",
        "host": "www.caymanchem.com",
        "pages": {
            "home": "https://www.caymanchem.com/",
            "product": "https://www.caymanchem.com/product/28181/dspe-mpeg-2000-sodium-salt",
        },
    },
    {
        "id": "tci",
        "host": "www.tcichemicals.com",
        "pages": {
            "home": "https://www.tcichemicals.com/US/en/",
            "product": "https://www.tcichemicals.com/US/en/p/A2420",
        },
        "timeout": 55,
    },
    {
        "id": "sigma",
        "host": "www.sigmaaldrich.com",
        "pages": {
            "home": "https://www.sigmaaldrich.com/US/en",
            "product": "https://www.sigmaaldrich.com/US/en/product/aldrich/718513",
        },
        "timeout": 50,
    },
    {
        "id": "lumiprobe",
        "host": "www.lumiprobe.com",
        "pages": {
            "home": "https://www.lumiprobe.com/",
            "product": "https://www.lumiprobe.com/p/cy5-nhs-ester",
        },
    },
    {
        "id": "boc",
        "host": "www.bocsci.com",
        "pages": {
            "home": "https://www.bocsci.com/",
            "product": "https://www.bocsci.com/product/dppe-mpeg-cas-205494-72-0-254018.html",
        },
    },
    {
        "id": "biochempeg",
        "host": "www.biochempeg.com",
        "pages": {
            "home": "https://www.biochempeg.com/",
            "product": "https://www.biochempeg.com/product/DSPE-PEG-Mal.html",
        },
    },
    {
        "id": "nanocs",
        "host": "www.nanocs.net",
        "pages": {
            "home": "https://www.nanocs.net/",
            "product": "https://www.nanocs.net/DSPE-PEG2000-Maleimide-2k.htm",
        },
    },
    {
        "id": "aatbio",
        "host": "www.aatbio.com",
        "pages": {
            "home": "https://www.aatbio.com/",
            "product": "https://www.aatbio.com/products/ifluor-488-succinimidyl-ester",
        },
    },
]

host_locks: dict[str, Lock] = {}
log_lock = Lock()
lh_slots = Semaphore(2)


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).isoformat()} {msg}"
    with log_lock:
        print(line, flush=True)
        with PROGRESS.open("a") as fh:
            fh.write(line + "\n")


def trim(raw: dict, meta: dict) -> dict:
    audits_out = {}
    for aid, audit in (raw.get("audits") or {}).items():
        if not isinstance(audit, dict):
            continue
        item = {
            "title": audit.get("title"),
            "score": audit.get("score"),
            "numericValue": audit.get("numericValue"),
            "numericUnit": audit.get("numericUnit"),
            "displayValue": audit.get("displayValue"),
            "scoreDisplayMode": audit.get("scoreDisplayMode"),
        }
        if aid == "network-requests":
            docs = []
            for req in ((audit.get("details") or {}).get("items") or []):
                if req.get("resourceType") == "Document":
                    docs.append(
                        {
                            "url": req.get("url"),
                            "statusCode": req.get("statusCode"),
                            "mimeType": req.get("mimeType"),
                            "transferSize": req.get("transferSize"),
                            "resourceSize": req.get("resourceSize"),
                        }
                    )
            item["documents"] = docs[:8]
        if aid == "http-status-code":
            item["numericValue"] = audit.get("numericValue")
            item["displayValue"] = audit.get("displayValue")
        audits_out[aid] = item
    cats = {}
    for cid, cat in (raw.get("categories") or {}).items():
        cats[cid] = {"title": cat.get("title"), "score": cat.get("score")}
    cs = raw.get("configSettings") or {}
    env = raw.get("environment") or {}
    return {
        "status": "ok",
        "trimmed": "Audit details, filmstrip, and full-page screenshot payloads removed. Scores and numericValue fields are copied from the Lighthouse JSON.",
        "lighthouseVersion": raw.get("lighthouseVersion"),
        "fetchTime": raw.get("fetchTime"),
        "requestedUrl": raw.get("requestedUrl"),
        "finalUrl": raw.get("finalUrl"),
        "finalDisplayedUrl": raw.get("finalDisplayedUrl"),
        "mainDocumentUrl": raw.get("mainDocumentUrl"),
        "userAgent": raw.get("userAgent"),
        "runWarnings": raw.get("runWarnings") or [],
        "runtimeError": raw.get("runtimeError"),
        "configSettings": {
            "formFactor": cs.get("formFactor"),
            "throttlingMethod": cs.get("throttlingMethod"),
            "screenEmulation": cs.get("screenEmulation"),
            "locale": cs.get("locale"),
            "channel": cs.get("channel"),
        },
        "environment": {
            "networkUserAgent": env.get("networkUserAgent"),
            "hostUserAgent": env.get("hostUserAgent"),
            "benchmarkIndex": env.get("benchmarkIndex"),
        },
        "categories": cats,
        "audits": audits_out,
        **meta,
    }


def run_job(job: dict) -> str:
    host = job["host"]
    lock = host_locks.setdefault(host, Lock())
    out = ROOT / job["file"]
    if out.exists():
        try:
            existing = json.loads(out.read_text())
            if existing.get("status") == "ok" and existing.get("categories"):
                log(f"skip {job['file']}")
                return job["file"]
        except json.JSONDecodeError:
            pass
    with lock:
        time.sleep(2.5)
        started = datetime.now(timezone.utc)
        tmp = Path("/tmp/lh-raw") / job["file"]
        tmp.parent.mkdir(parents=True, exist_ok=True)
        if tmp.exists():
            tmp.unlink()
        cmd = [
            "npx",
            "--yes",
            os.environ.get("LH_PACKAGE", "lighthouse@13.5.0"),
            job["url"],
            "--quiet",
            f"--chrome-flags={CHROME_FLAGS}",
            "--only-categories=performance,accessibility,best-practices,seo",
            "--output=json",
            f"--output-path={tmp}",
            "--max-wait-for-load=45000",
        ]
        if job["form"] == "desktop":
            cmd.append("--preset=desktop")
        log(f"start {job['file']}")
        t0 = time.time()
        try:
            with lh_slots:
                proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=job["timeout"],
                env={**os.environ, "CHROME_PATH": "/usr/bin/google-chrome"},
            )
            elapsed = round((time.time() - t0) * 1000)
            meta = {
                "siteId": job["id"],
                "page": job["page"],
                "formFactor": job["form"],
                "run": job["run"],
                "startedAt": started.isoformat(),
                "elapsedMs": elapsed,
                "exitCode": proc.returncode,
            }
            if proc.returncode != 0 or not tmp.exists():
                payload = {
                    "status": "error",
                    **meta,
                    "requestedUrl": job["url"],
                    "error": (proc.stderr or proc.stdout or "lighthouse failed")[-4000:],
                }
                out.write_text(json.dumps(payload, indent=2))
                log(f"fail {job['file']} exit={proc.returncode} {elapsed}ms")
                return job["file"]
            raw = json.loads(tmp.read_text())
            payload = trim(raw, meta)
            # Flag error documents so scores are not treated as the catalogue.
            status = None
            http_audit = (payload["audits"].get("http-status-code") or {}).get("numericValue")
            docs = (payload["audits"].get("network-requests") or {}).get("documents") or []
            final_url = payload.get("finalUrl") or payload.get("mainDocumentUrl") or ""
            matched = [d for d in docs if d.get("url") == final_url and isinstance(d.get("statusCode"), int)]
            if matched:
                status = matched[-1]["statusCode"]
            elif docs and isinstance(docs[-1].get("statusCode"), int):
                status = docs[-1]["statusCode"]
            if isinstance(http_audit, (int, float)) and http_audit >= 400:
                status = int(http_audit)
            payload["mainDocumentStatus"] = status
            final = (payload.get("finalUrl") or "") + (payload.get("mainDocumentUrl") or "")
            blocked_markers = ("errors.edgesuite.net", "cdn-cgi/challenge", "/challenge-platform/")
            if (status and status >= 400) or any(m in final for m in blocked_markers):
                payload["blocked"] = True
                payload["blockReason"] = f"HTTP {status}" if status else "challenge or error URL"
            if payload.get("runtimeError"):
                payload["status"] = "error"
            out.write_text(json.dumps(payload, indent=2))
            cats = payload["categories"]
            perf = (cats.get("performance") or {}).get("score")
            log(f"ok {job['file']} perf={perf} http={status} blocked={payload.get('blocked', False)} {elapsed}ms")
        except subprocess.TimeoutExpired as exc:
            elapsed = round((time.time() - t0) * 1000)
            payload = {
                "status": "error",
                "siteId": job["id"],
                "page": job["page"],
                "formFactor": job["form"],
                "run": job["run"],
                "startedAt": started.isoformat(),
                "elapsedMs": elapsed,
                "requestedUrl": job["url"],
                "error": f"timeout after {job['timeout']}s",
                "stderrTail": ((exc.stderr or "") if isinstance(exc.stderr, str) else "")[-2000:],
            }
            out.write_text(json.dumps(payload, indent=2))
            log(f"timeout {job['file']} {elapsed}ms")
        finally:
            if tmp.exists():
                tmp.unlink()
    return job["file"]


def main() -> None:
    jobs = []
    # Round-robin across hosts so parallel slots do not queue on one site.
    for run in (1, 2, 3):
        for form in ("mobile", "desktop"):
            for page in ("home", "product"):
                for site in SITES:
                    url = site["pages"][page]
                    jobs.append(
                        {
                            "id": site["id"],
                            "host": site["host"],
                            "page": page,
                            "url": url,
                            "form": form,
                            "run": run,
                            "timeout": site.get("timeout", 120),
                            "file": f"{site['id']}__{page}__{form}__run{run}.json",
                        }
                    )
    log(f"queue {len(jobs)} jobs lighthouse_slots=2")
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(run_job, job) for job in jobs]
        for fut in as_completed(futures):
            fut.result()
    log("batch done")


if __name__ == "__main__":
    main()
