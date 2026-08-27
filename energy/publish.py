#!/usr/bin/env python3
import base64, json, os, sys, urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

SALT = bytes.fromhex(os.environ["ENERGY_DASH_SALT"])
PASSWORD = os.environ["ENERGY_DASH_PASSWORD"].encode()
TOKEN = os.environ["TOKEN"]
SITE = os.environ["SITE"]
VEH_ID = os.environ["TESLA_VEHICLE_ID"]
GH_PAT = os.environ["GH_PAT"]
REPO = os.environ.get("GITHUB_REPOSITORY", "klopikkon/klopikkon-com")
BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com/api/1"

def tesla(path):
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + TOKEN})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def gh_get(path):
    req = urllib.request.Request(
        "https://api.github.com/repos/" + REPO + "/contents/" + path,
        headers={"Authorization": "token " + GH_PAT, "Accept": "application/vnd.github+json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except Exception:
        return None

def derive():
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=SALT, iterations=100000)
    return kdf.derive(PASSWORD)

def encrypt(obj):
    key = derive()
    iv = os.urandom(12)
    ct = AESGCM(key).encrypt(iv, json.dumps(obj).encode(), None)
    return base64.b64encode(iv + ct).decode()

def decrypt_b64(s):
    raw = base64.b64decode(s.strip())
    pt = AESGCM(derive()).decrypt(raw[:12], raw[12:], None)
    return json.loads(pt)


def main():
    live = (tesla("/energy_sites/%s/live_status" % SITE) or {}).get("response") or {}
    info = (tesla("/energy_sites/%s/site_info" % SITE) or {}).get("response") or {}
    prev_car = {}
    existing = gh_get("energy/status.enc")
    if existing and existing.get("content"):
        try:
            prev = decrypt_b64(base64.b64decode(existing["content"]).decode())
            prev_car = prev.get("car") or {}
        except Exception:
            prev_car = {}
    car = dict(prev_car)
    car["asleep"] = True
    try:
        veh = tesla("/vehicles")
        rows = veh.get("response") or []
        hit = None
        for v in rows:
            if str(v.get("id"))==str(VEH_ID) or str(v.get("vehicle_id"))==str(VEH_ID) or v.get("display_name")=="Spirit of Fire":
                hit = v
                break
        if hit:
            car["name"] = hit.get("display_name") or "Spirit of Fire"
            state = hit.get("state") or ""
            car["asleep"] = state != "online"
            if state == "online":
                data = tesla("/vehicles/%s/vehicle_data?endpoints=charge_state" % hit.get("vin", VEH_ID))
                cs = ((data.get("response") or {}).get("charge_state")) or {}
                car["soc"] = cs.get("battery_level")
                car["charging"] = cs.get("charging_state")
                car["limit"] = cs.get("charge_limit_soc")
                st = cs.get("charging_state") or ""
                car["plugged_in"] = st not in ("Disconnected", "", "Unknown")
    except Exception as e:
        car["error"] = str(e)[:120]
    payload = {
        "updated_at": datetime.now(ZoneInfo("Australia/Sydney")).isoformat(),
        "powerwall": {
            "soc": live.get("percentage_charged"),
            "solar_w": live.get("solar_power"),
            "grid_w": live.get("grid_power"),
            "battery_w": live.get("battery_power"),
            "load_w": live.get("load_power"),
            "mode": info.get("default_real_mode"),
            "reserve": info.get("backup_reserve_percent"),
        },
        "car": car,
        # Encrypted with the page password. Lets the Update button kick a status_only workflow.
        "refresh": {
            "repo": REPO,
            "workflow": "tesla-powerwall.yml",
            "ref": "main",
            "token": GH_PAT,
        },
        "fleet_api_credit": {
            "available_via_api": False,
            "note": "Tesla only shows Fleet API usage/credit in the developer portal Billing & usage page. No public credit endpoint.",
            "portal": "https://developer.tesla.com/",
            "personal_discount_usd": 10,
        },
    }
    blob = encrypt(payload)
    sha = (existing or {}).get("sha")
    body = json.dumps({
        "message": "Update encrypted home energy status",
        "content": base64.b64encode(blob.encode()).decode(),
        "branch": "main",
        **({"sha": sha} if sha else {}),
    }).encode()
    req = urllib.request.Request(
        "https://api.github.com/repos/" + REPO + "/contents/energy/status.enc",
        data=body, method="PUT",
        headers={"Authorization": "token " + GH_PAT, "Accept": "application/vnd.github+json", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.load(r)
    print("published", payload["powerwall"]["soc"], "car", car.get("soc"), "asleep", car.get("asleep"))
    print(out.get("content", {}).get("path"))

if __name__ == "__main__":
    main()
