#!/usr/bin/env python3
"""Encrypt hub.json -> hub.enc and commit to main.

Env: SITE_HUB_PASSWORD, SITE_HUB_SALT (hex), GH_PAT
Usage: python3 publish.py hub.json
"""
import base64, json, os, sys, urllib.request
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

REPO = os.environ.get("GITHUB_REPOSITORY", "klopikkon/klopikkon-com")
PATH = "hub.enc"
SALT = bytes.fromhex(os.environ["SITE_HUB_SALT"])
PASSWORD = os.environ["SITE_HUB_PASSWORD"].encode()
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
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/contents/{PATH}",
        data=json.dumps(body).encode(),
        method="PUT",
        headers={"Authorization": f"token {GH_PAT}", "Accept": "application/vnd.github+json", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def main():
    obj = json.loads(open(sys.argv[1]).read())
    if "sites" not in obj:
        raise SystemExit("hub.json needs sites[]")
    blob = encrypt(obj) + "\n"
    out = gh_put(base64.b64encode(blob.encode()).decode(), "Update site hub encrypted directory", gh_get_sha())
    print(out["commit"]["sha"])

if __name__ == "__main__":
    main()
