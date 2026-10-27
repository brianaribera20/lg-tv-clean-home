#!/usr/bin/env bash
# Rebuild and reinstall Home after editing launcher/ (theme, dock).
# --fresh removes Home first so the TV forgets its saved tile order and uses config.js.
# --helper also reinstalls Home Helper after editing native/ (e.g. wake-app.json).
# Needs ./install.sh to have run once (tools, SSH key and pairing are reused).
set -euo pipefail
cd "$(dirname "$0")"
# Personal settings (TV address, display name) live in tv.local.env, which is not committed.
[ -f tv.local.env ] && . ./tv.local.env
: "${TV_HOST:?Set TV_HOST in tv.local.env (copy tv.local.env.example)}"
export TV_HOST TV_APP_TITLE TV_WEATHER_LAT TV_WEATHER_LON
export DEVICE="${DEVICE:-clean-your-tv-${TV_HOST//./-}}"
export PATH="$PWD/.venv/bin:$PWD/build/tools/node_modules/.bin:$PATH"
umask 022
# This TV (webOS 22) runs Chrome 87 in English: skip the old-browser polyfills and other languages.
export TV_BROWSERS="Chrome 87" TV_NO_POLYFILLS=1 TV_LANG_ONLY=en TV_BUNDLE=1 TV_FAST_BOOT=1

python3 scripts/make-tiles.py
export ZIG="$(python3 -c 'from pathlib import Path; import ziglang; print(Path(ziglang.__file__).parent / "zig")')"
bash scripts/build.sh
launcher=$(python3 -c 'import json; a=json.load(open("launcher/appinfo.json")); print("dist/"+a["id"]+"_"+a["version"]+"_all.ipk")')

helper=$(python3 -c 'import json; a=json.load(open("native/app/appinfo.json")); print("dist/"+a["id"]+"_"+a["version"]+"_arm.ipk")')

if [[ " $* " == *" --helper "* ]]; then
  ares-install -d "$DEVICE" "$helper"
  # Installing does not replace a running controller, and the dev shell may not kill it:
  # use the helper's own stop command. The explicit launch below clears its stop marker.
  ares-novacom -d "$DEVICE" --run 'S=/media/developer/apps/usr/palm/applications/com.local.nativehome/state; echo "{\"cmd\":\"stop\",\"nonce\":\"'"$(date +%s)"'\"}" > $S/control.json; sleep 4; true' || true
fi
if [[ " $* " == *" --fresh "* ]]; then
  ares-install -d "$DEVICE" --remove com.gathin.tvhome
fi
ares-install -d "$DEVICE" "$launcher"
# Removing Home drops its input registration and helper settings; restore both.
bash scripts/configure-tv.sh
ares-launch -d "$DEVICE" -p '{"nativeHomeStart":true}' com.local.nativehome
echo 'Home updated.'
