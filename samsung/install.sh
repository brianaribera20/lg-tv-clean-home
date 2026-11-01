#!/usr/bin/env bash
# Build, sign and install Home on a Samsung TV in Developer Mode (samsung/README.md).
#   ./samsung/install.sh [TV address]   (default SAMSUNG_TV_HOST from tv.local.env)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f tv.local.env ] && . ./tv.local.env
HOST="${1:-${SAMSUNG_TV_HOST:-}}"
: "${HOST:?Pass the TV address or set SAMSUNG_TV_HOST in tv.local.env}"
TIZEN="${TIZEN_STUDIO:-$HOME/tizen-studio}"
PROFILE="${SAMSUNG_CERT_PROFILE:-tizenhome}"   # signing profile (a plain Tizen certificate is accepted in Developer Mode)
CLI="$TIZEN/tools/ide/bin/tizen" SDB="$TIZEN/tools/sdb"

python3 samsung/build.py
"$SDB" connect "$HOST:26101"
TARGET=$("$SDB" devices | awk -v h="$HOST:26101" '$1 == h {print $3}')
: "${TARGET:?The TV did not accept the connection: check Developer Mode and its Host PC IP}"
"$CLI" package -t wgt -s "$PROFILE" -- samsung/build/widget
# The package is named after the app title; a comma or space in it makes the TV refuse it.
mv samsung/build/widget/*.wgt samsung/build/widget/Home.wgt
"$CLI" install -n Home.wgt -t "$TARGET" -- samsung/build/widget
"$CLI" run -p CleanHome1.Home -t "$TARGET"
echo 'Home installed on the Samsung TV.'
