#!/usr/bin/env bash
# Backup Developer Mode renewal that runs on this Mac (daily, via launchd).
# Talks to the same LG endpoints as Home's on-TV auto-renewal, so it works even if the
# TV is off; it only needs the session token, refreshed from the TV whenever it's on.
# Renews when 7 days or less remain. Never prints the token.
set -uo pipefail
cd "$(dirname "$0")"
# Personal settings (TV address, display name) live in tv.local.env, which is not committed.
[ -f tv.local.env ] && . ./tv.local.env
: "${TV_HOST:?Set TV_HOST in tv.local.env (copy tv.local.env.example)}"
export TV_HOST TV_APP_TITLE
DEVICE="clean-your-tv-${TV_HOST//./-}"
DIR="$HOME/.config/lg-devmode"
LOG="$HOME/Library/Logs/lg-devmode-renew.log"
export PATH="$PWD/build/tools/node_modules/.bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
mkdir -p "$DIR" && chmod 700 "$DIR"
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*" >> "$LOG"; }

# The token changes if Developer Mode is switched off and on, so prefer a fresh copy.
if nc -z -G 3 "$TV_HOST" 9922 2>/dev/null; then
  fresh=$(ares-novacom -d "$DEVICE" --run 'cat /var/luna/preferences/devmode_enabled' 2>/dev/null | grep -v '^\[Info\]' | tr -d '[:space:]')
  [[ "$fresh" =~ ^[A-Za-z0-9]+$ ]] && (umask 077; printf %s "$fresh" > "$DIR/token")
fi
token=$(cat "$DIR/token" 2>/dev/null)
[[ "$token" =~ ^[A-Za-z0-9]+$ ]] || { log 'no token yet (TV never reachable)'; exit 1; }

hours() {  # remaining whole hours from LG's "HHH:MM:SS" reply, or empty
  curl -s -m 20 -H 'Accept: application/json' "https://developer.lge.com/secure/$1DevModeSession.dev?sessionToken=$token" \
    | python3 -c 'import json,re,sys
try:
    d=json.load(sys.stdin); m=re.fullmatch(r"(\d+):\d\d:\d\d",d.get("errorMsg",""))
    print(int(m.group(1)) if d.get("result")=="success" and m else "")
except Exception: print("")'
}

left=$(hours Check)
[[ -n "$left" ]] || { log 'check failed (network or token expired)'; exit 1; }
if (( left > 168 )); then
  log "ok: ${left}h left"
  exit 0
fi
curl -s -m 20 -o /dev/null -H 'Accept: application/json' "https://developer.lge.com/secure/ResetDevModeSession.dev?sessionToken=$token"
after=$(hours Check)
if [[ -n "$after" ]] && (( after > left )); then log "renewed: ${left}h -> ${after}h"; else log "renewal not confirmed: ${left}h -> ${after:-?}h"; exit 1; fi
