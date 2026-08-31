#!/usr/bin/env bash
set -euo pipefail
BASE="https://fleet-api.prd.na.vn.cloud.tesla.com/api/1"
umask 077
printf '%s' "$TESLA_PRIVATE_KEY" > /tmp/tesla-private.pem
printf '%s' "$TOKEN" > /tmp/tesla-token
export TESLA_KEY_FILE=/tmp/tesla-private.pem
export TESLA_TOKEN_FILE=/tmp/tesla-token
export PATH="$PATH:$(go env GOPATH)/bin"

VEHICLES=$(curl -sS "$BASE/vehicles" -H "Authorization: Bearer $TOKEN")
VIN=$(echo "$VEHICLES" | jq -r --arg id "$TESLA_VEHICLE_ID" '.response[] | select((.id|tostring)==$id or (.vehicle_id|tostring)==$id or .display_name=="Spirit of Fire") | .vin' | head -1)
if [ -z "$VIN" ] || [ "$VIN" = "null" ]; then
  echo "Could not resolve VIN"
  exit 1
fi
export TESLA_VIN="$VIN"
CAR_STATE=$(echo "$VEHICLES" | jq -r --arg id "$TESLA_VEHICLE_ID" --arg vin "$VIN" '.response[] | select((.id|tostring)==$id or (.vehicle_id|tostring)==$id or .vin==$vin or .display_name=="Spirit of Fire") | .state' | head -1)
LIVE=$(curl -sS "$BASE/energy_sites/$SITE/live_status" -H "Authorization: Bearer $TOKEN")
PW=$(echo "$LIVE" | jq -r '.response.percentage_charged // 0')
GRID=$(echo "$LIVE" | jq -r '.response.grid_power // 0')
SURPLUS=$(echo "$GRID" | awk '{printf "%.0f", -$1}')
MIN_W=1150

LAST_PLUGGED=""
LAST_SOC=""
if [ -n "${GH_PAT:-}" ]; then
  PRES=$(curl -sS -H "Authorization: token $GH_PAT" -H "Accept: application/vnd.github.raw" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/energy/car_presence.json?ref=main" || true)
  LAST_PLUGGED=$(echo "$PRES" | jq -r 'if .plugged==false then "false" elif .plugged==true then "true" else empty end' 2>/dev/null || true)
  LAST_SOC=$(echo "$PRES" | jq -r 'if .soc == null or .soc == "" then empty else .soc end' 2>/dev/null || true)
  echo "presence_last plugged=${LAST_PLUGGED:-unknown} soc=${LAST_SOC:-unknown} ts=$(echo "$PRES" | jq -r '.ts // empty' 2>/dev/null || true)"
fi

echo "wake_gate hour=$HOUR pw=$PW surplus_w=$SURPLUS min_w=$MIN_W state=${CAR_STATE:-unknown} last_plugged=${LAST_PLUGGED:-unknown} last_soc=${LAST_SOC:-unknown}"
should_wake=0
case "$HOUR" in
  11|16) should_wake=1; echo "wake_gate: $HOUR fixed window" ;;
  09|10)
    if [ -n "${LAST_SOC:-}" ] && awk -v s="$LAST_SOC" 'BEGIN { exit !(s+0 > 80) }'; then
      echo "wake_gate: skip morning solar, last soc=$LAST_SOC > 80"
    elif [ "$CAR_STATE" = "online" ]; then
      should_wake=1; echo "wake_gate: already online"
    elif [ "$LAST_PLUGGED" = "false" ]; then
      echo "wake_gate: last poll unplugged — skip wake (assumed not at home)"
    elif awk -v pw="$PW" -v s="$SURPLUS" -v m="$MIN_W" 'BEGIN { exit !((pw+0) >= 95 && (s+0) >= m) }'; then
      should_wake=1; echo "wake_gate: surplus"
    else
      echo "wake_gate: skip wake"
    fi
    ;;
  14|15)
    if [ "$CAR_STATE" = "online" ]; then
      should_wake=1; echo "wake_gate: already online"
    elif [ "$LAST_PLUGGED" = "false" ]; then
      echo "wake_gate: last poll unplugged — skip wake (assumed not at home)"
    elif awk -v pw="$PW" -v s="$SURPLUS" -v m="$MIN_W" 'BEGIN { exit !((pw+0) >= 95 && (s+0) >= m) }'; then
      should_wake=1; echo "wake_gate: surplus"
    else
      echo "wake_gate: skip wake"
    fi
    ;;
esac
if [ "$should_wake" -ne 1 ]; then
  rm -f /tmp/tesla-private.pem /tmp/tesla-token
  exit 0
fi

if [ "$CAR_STATE" != "online" ]; then
  echo "Waking vehicle..."
  curl -sS -X POST "$BASE/vehicles/$VIN/wake_up" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' >/dev/null || true
  for i in 1 2 3 4 5 6; do
    STATE=$(curl -sS "$BASE/vehicles/$VIN" -H "Authorization: Bearer $TOKEN" | jq -r '.response.state // empty')
    echo "state=$STATE"
    [ "$STATE" = "online" ] && break
    sleep 10
  done
fi

set_limit() {
  local pct="$1"; set +e; OUT=$(tesla-control charging-set-limit "$pct" 2>&1); RC=$?; set -e; echo "$OUT"
  [ "$RC" -eq 0 ] && return 0
  echo "$OUT" | grep -qi already_set && return 0
  return "$RC"
}
tesla_ok() {
  set +e; OUT=$(tesla-control "$@" 2>&1); RC=$?; set -e; echo "$OUT"
  [ "$RC" -eq 0 ] && return 0
  echo "$OUT" | grep -Eiq 'already_set|is_charging|complete|requested|not_charging|disconnected|no_power' && return 0
  return "$RC"
}

save_presence() {
  local st soc pl ts sha content
  st=$(echo "$DATA" | jq -r '.response.charge_state.charging_state // "Unknown"')
  soc=$(echo "$DATA" | jq -r '.response.charge_state.battery_level // null')
  if echo "$st" | grep -Eiq 'disconnected|^$|unknown'; then pl=false; else pl=true; fi
  echo "presence_now plugged=$pl state=$st soc=$soc"
  [ -z "${GH_PAT:-}" ] && return 0
  ts=$(TZ=Australia/Sydney date +%Y-%m-%dT%H:%M:%S%z)
  sha=$(curl -sS -H "Authorization: token $GH_PAT" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/energy/car_presence.json?ref=main" | jq -r .sha)
  content=$(jq -n --argjson plugged "$pl" --arg state "$st" --arg ts "$ts" --argjson soc "$soc" \
    '{plugged:$plugged,state:$state,soc:$soc,ts:$ts}' | base64 -w0)
  curl -sS -X PUT -H "Authorization: token $GH_PAT" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/energy/car_presence.json" \
    -d "{\"message\":\"Update car presence plugged=$pl\",\"content\":\"$content\",\"sha\":\"$sha\"}" \
    | jq '{ok:(.commit.sha!=null),sha:.commit.sha}'
}

LIVE=$(curl -sS "$BASE/energy_sites/$SITE/live_status" -H "Authorization: Bearer $TOKEN")
DATA=$(curl -sS "$BASE/vehicles/$VIN/vehicle_data?endpoints=charge_state" -H "Authorization: Bearer $TOKEN")
save_presence || true

if [ "$HOUR" = "11" ]; then
  set_limit 90; tesla_ok charging-set-amps 20; tesla_ok charging-start || true
  rm -f /tmp/tesla-private.pem /tmp/tesla-token
  exit 0
fi

# same planner as tesla-powerwall.yml (if not plugged)
echo 'aW1wb3J0IGpzb24sIHN5cwpob3VyID0gc3lzLmFyZ3ZbMV0KbGl2ZSA9IGpzb24ubG9hZChvcGVuKHN5cy5hcmd2WzJdKSkuZ2V0KCJyZXNwb25zZSIpIG9yIHt9CmNzID0gKGpzb24ubG9hZChvcGVuKHN5cy5hcmd2WzNdKSkuZ2V0KCJyZXNwb25zZSIpIG9yIHt9KS5nZXQoImNoYXJnZV9zdGF0ZSIpIG9yIHt9CnNvbGFyID0gZmxvYXQobGl2ZS5nZXQoInNvbGFyX3Bvd2VyIikgb3IgMCkKZ3JpZCA9IGZsb2F0KGxpdmUuZ2V0KCJncmlkX3Bvd2VyIikgb3IgMCkgICAjICtpbXBvcnQgLyAtZXhwb3J0CmJhdHQgPSBmbG9hdChsaXZlLmdldCgiYmF0dGVyeV9wb3dlciIpIG9yIDApICAjICtkaXNjaGFyZ2UKcHcgPSBmbG9hdChsaXZlLmdldCgicGVyY2VudGFnZV9jaGFyZ2VkIikgb3IgMCkKc29jID0gY3MuZ2V0KCJiYXR0ZXJ5X2xldmVsIikKc3RhdGUgPSAoY3MuZ2V0KCJjaGFyZ2luZ19zdGF0ZSIpIG9yICIiKQphbXBzX25vdyA9IGZsb2F0KGNzLmdldCgiY2hhcmdlcl9hY3R1YWxfY3VycmVudCIpIG9yIDApCnZvbHRzID0gZmxvYXQoY3MuZ2V0KCJjaGFyZ2VyX3ZvbHRhZ2UiKSBvciAwKQpwaGFzZXNfcmF3ID0gY3MuZ2V0KCJjaGFyZ2VyX3BoYXNlcyIpIG9yIDEKdHJ5OgogICAgcGhhc2VzX3JhdyA9IGludChwaGFzZXNfcmF3KQpleGNlcHQgRXhjZXB0aW9uOgogICAgcGhhc2VzX3JhdyA9IDEKcGhhc2VzID0gMyBpZiBwaGFzZXNfcmF3ID49IDIgZWxzZSAxCnZvbHRzID0gdm9sdHMgaWYgdm9sdHMgPiA1MCBlbHNlIDIzMC4wCmNhcl93ID0gYW1wc19ub3cgKiB2b2x0cyAqIHBoYXNlcyBpZiBzdGF0ZSA9PSAiQ2hhcmdpbmciIGVsc2UgMC4wCnN1cnBsdXMgPSBjYXJfdyAtIGdyaWQKcGx1Z2dlZCA9IHN0YXRlIG5vdCBpbiAoIkRpc2Nvbm5lY3RlZCIsICIiLCAiVW5rbm93biIpCnB3X2Z1bGwgPSBwdyA+PSA5NQpwcmludCgKICAgIGYiaG91cj17aG91cn0gcHc9e3B3Oi4xZn0gc29sYXI9e3NvbGFyOi4wZn1XIGdyaWQ9e2dyaWQ6LjBmfVcgYmF0dD17YmF0dDouMGZ9VyAiCiAgICBmImNhcj17Y2FyX3c6LjBmfVcgc3VycGx1cz17c3VycGx1czouMGZ9VyBzb2M9e3NvY30gc3RhdGU9e3N0YXRlfSBwbHVnZ2VkPXtwbHVnZ2VkfSIsCiAgICBmaWxlPXN5cy5zdGRlcnIsCikKCmRlZiBlbWl0KGFjdGlvbiwgYW1wcz0wLCBsaW1pdD0wLCByZWFzb249IiIpOgogICAgcHJpbnQoanNvbi5kdW1wcyh7ImFjdGlvbiI6IGFjdGlvbiwgImFtcHMiOiBpbnQoYW1wcyksICJsaW1pdCI6IGludChsaW1pdCksICJyZWFzb24iOiByZWFzb24sICJzb2MiOiBzb2N9KSkKCiMgVW5wbHVnZ2VkIC8gVW5rbm93biBmaXJzdDogbmV2ZXIgZmFpbCB0aGUgam9iIG9uIG5vX3NvYy4KaWYgbm90IHBsdWdnZWQ6CiAgICBpZiBob3VyID09ICIxNiI6CiAgICAgICAgZW1pdCgic2tpcCIsIHJlYXNvbj0iZW5kIG9mIDItNHBtIHdpbmRvdywgY2FyIG5vdCBwbHVnZ2VkIGluIikKICAgIGVsc2U6CiAgICAgICAgZW1pdCgic2tpcCIsIHJlYXNvbj0iY2FyIG5vdCBwbHVnZ2VkIGluIikKICAgIHN5cy5leGl0KDApCgppZiBzb2MgaXMgTm9uZToKICAgIGVtaXQoInNraXAiLCByZWFzb249Im5vX3NvYyIpCiAgICBzeXMuZXhpdCgwKQoKaWYgaG91ciA9PSAiMTYiOgogICAgZW1pdCgic3RvcF9mcmVlIiwgcmVhc29uPSJlbmQgb2YgMi00cG0gc29sYXIgd2luZG93IiwgbGltaXQ9bWF4KDUwLCBpbnQoc29jKSAtIDIpKQogICAgc3lzLmV4aXQoMCkKCmlmIGhvdXIgPT0gIjE0IiBhbmQgc29jID49IDg1OgogICAgZW1pdCgic3RvcF9mcmVlIiwgcmVhc29uPSJlbmQgZnJlZSB3aW5kb3csIGNhciBhbHJlYWR5ID49ODUlIiwgbGltaXQ9bWF4KDUwLCBpbnQoc29jKSAtIDIpKQogICAgc3lzLmV4aXQoMCkKCmlmIHNvYyA+PSA4NToKICAgIGVtaXQoInN0b3AiIGlmIHN0YXRlID09ICJDaGFyZ2luZyIgZWxzZSAic2tpcCIsIHJlYXNvbj0iY2FyIGFscmVhZHkgYXQgb3IgYWJvdmUgODUlIikKICAgIHN5cy5leGl0KDApCgppZiBub3QgcHdfZnVsbDoKICAgIGVtaXQoInN0b3AiIGlmIHN0YXRlID09ICJDaGFyZ2luZyIgZWxzZSAic2tpcCIsIHJlYXNvbj1mIlBvd2Vyd2FsbCB7cHc6LjBmfSUgbm90IGZ1bGwsIHNvbGFyIHNob3VsZCBmaWxsIGl0IGZpcnN0IikKICAgIHN5cy5leGl0KDApCgptaW5fdyA9IDUgKiAyMzAKaWYgc3VycGx1cyA8IG1pbl93OgogICAgZW1pdCgic3RvcCIgaWYgc3RhdGUgPT0gIkNoYXJnaW5nIiBlbHNlICJza2lwIiwgcmVhc29uPWYic3VycGx1cyB7c3VycGx1czouMGZ9VyBiZWxvdyB7bWluX3c6LjBmfVciKQogICAgc3lzLmV4aXQoMCkKCmFtcHMgPSBpbnQoKHN1cnBsdXMgLSAzMDApIC8gKHZvbHRzICogcGhhc2VzKSkKYW1wcyA9IG1heCg1LCBtaW4oMTYsIGFtcHMpKQplbWl0KCJzb2xhciIsIGFtcHM9YW1wcywgbGltaXQ9ODUsIHJlYXNvbj1mImRpdmVydCB+e2FtcHMgKiB2b2x0cyAqIHBoYXNlczouMGZ9VyB0byBjYXIgKGNhcCAxNkEpIikK' | base64 -d > /tmp/solar_plan.py
printf '%s' "$LIVE" > /tmp/live.json
printf '%s' "$DATA" > /tmp/car.json
PLAN=$(python3 /tmp/solar_plan.py "$HOUR" /tmp/live.json /tmp/car.json)
echo "$PLAN"
ACTION=$(echo "$PLAN" | jq -r .action)
REASON=$(echo "$PLAN" | jq -r .reason)
case "$ACTION" in
  solar) AMPS=$(echo "$PLAN" | jq -r .amps); set_limit 85; tesla_ok charging-set-amps "$AMPS"; tesla_ok charging-start || true ;;
  stop_free) LIMIT=$(echo "$PLAN" | jq -r .limit); set_limit "$LIMIT"; tesla_ok charging-stop || true ;;
  stop) tesla_ok charging-stop || true ;;
  skip|error) echo "No car action ($REASON)" ;;
  *) echo "Planner error: $PLAN"; exit 1 ;;
esac
rm -f /tmp/tesla-private.pem /tmp/tesla-token
