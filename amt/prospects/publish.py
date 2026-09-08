#!/usr/bin/env python3
"""Encrypt amt/prospects/prospects.json -> prospects.enc and commit to main.

Env (never commit these):
  AMT_PROSPECTS_PASSWORD
  AMT_PROSPECTS_SALT   (hex, 32 chars)
  GH_PAT              (contents:write on klopikkon/klopikkon-com)

Usage:
  python3 publish.py /path/to/prospects.json
"""
import base64, json, os, sys, urllib.request
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

REPO = os.environ.get("GITHUB_REPOSITORY", "klopikkon/klopikkon-com")
PATH = "amt/prospects/prospects.enc"
SALT = bytes.fromhex(os.environ["AMT_PROSPECTS_SALT"])
PASSWORD = os.environ["AMT_PROSPECTS_PASSWORD"].encode()
GH_PAT = os.environ["GH_PAT"]

def derive():
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=SALT, iterations=100000).derive(PASSWORD)

def encrypt(obj):
    iv = os.urandom(12)
    ct = AESGCM(derive()).encrypt(iv, json.dumps(obj, separators=(",", ":")).encode(), None)
    return base64.b64encode(iv + ct).decode()

def gh_get_sha():
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/contents/{PATH}?ref=main",
        headers={"Authorization": f"token {GH_PAT}", "Accept": "application/vnd.github+json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r).get("sha")
    except Exception:
        return None

def gh_put(content_b64, message, sha=None):
    body = {"message": message, "content": content_b64, "branch": "main"}
    if sha:
        body["sha"] = sha
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/contents/{PATH}",
        data=data,
        method="PUT",
        headers={
            "Authorization": f"token {GH_PAT}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def main():
    if len(sys.argv) != 2:
        print("usage: publish.py prospects.json", file=sys.stderr)
        sys.exit(2)
    obj = json.loads(open(sys.argv[1]).read())
    if "accounts" not in obj or not isinstance(obj["accounts"], list):
        raise SystemExit("prospects.json must have an accounts array")
    blob = encrypt(obj) + "\n"
    out = gh_put(base64.b64encode(blob.encode()).decode(), "Update AMT prospects encrypted blob", gh_get_sha())
    print(out["commit"]["sha"])

if __name__ == "__main__":
    main()
