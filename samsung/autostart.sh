#!/usr/bin/env bash
# Samsung TVs never start a sideloaded app at power-on, so the Mac does it: watch the TV's
# power state and, each time it comes on, open Home through the TV's own web API.
# Only works while this Mac is awake on the TV's network; the LaunchAgent keeps it from
# sleeping while it is plugged in (caffeinate -s).
#   ./samsung/autostart.sh             run the watcher (what the LaunchAgent runs)
#   ./samsung/autostart.sh --install   install and start it as LaunchAgent com.local.samsung-home
#   ./samsung/autostart.sh --remove    stop and remove the LaunchAgent
# Only curl talks to the TV: macOS's Local Network privacy lets Apple's own tools reach the
# TV from a LaunchAgent but silently blocks others (sdb hung there).
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f tv.local.env ] && . ./tv.local.env
HOST="${SAMSUNG_TV_HOST:?Set SAMSUNG_TV_HOST in tv.local.env}"
APP=CleanHome1.Home LABEL=com.local.samsung-home
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist" LOG="$HOME/Library/Logs/samsung-home-autostart.log"
# Overridable for tests (tests/samsung-autostart.sh points them at a fake TV).
POWER_URL="${SAMSUNG_POWER_URL:-http://$HOST:8001/api/v2/}"
APP_URL="${SAMSUNG_APP_URL:-https://$HOST:8002/api/v2/applications/$APP}"
GUARD="${SAMSUNG_GUARD_SECONDS:-30}" TRIES="${SAMSUNG_OPEN_TRIES:-120}" TICK="${SAMSUNG_TICK:-1}" STEP="${SAMSUNG_STEP:-1}"
LOADING="${SAMSUNG_LOADING_SECONDS:-15}" OFF_AFTER="${SAMSUNG_OFF_AFTER_SECONDS:-60}"

if [ "${1:-}" = --install ]; then
  mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-s</string><string>/bin/bash</string><string>$PWD/samsung/autostart.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
  launchctl bootstrap "gui/$(id -u)" "$PLIST" && echo "Started $LABEL (log: $LOG)"
  exit
fi
if [ "${1:-}" = --remove ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null; rm -f "$PLIST"; echo "Removed $LABEL"; exit
fi

log() { echo "$(date '+%F %T') $*"; }
state() { curl -s -m 2 "$POWER_URL" | grep -o '"PowerState": *"[a-z]*"' | sed 's/.*"\([a-z]*\)"$/\1/'; }
# Home on screen? "shown", "hidden", or "" when the TV did not answer. While it boots the TV
# often misses a reply; that must never count as Home being gone, or every relaunch restarts
# Samsung's "Loading" screen. -k: the TV's certificate is self-signed.
home() {
  local r; r=$(curl -sk -m 3 "$APP_URL")
  case "$r" in *'"visible": true'*|*'"visible":true'*) echo shown;; *'"visible"'*) echo hidden;; esac
}
launch() { [ "$(curl -sk -m 5 -o /dev/null -w '%{http_code}' -X POST "$APP_URL")" = 200 ]; }

open_home() {
  # Right after power-on the TV is still starting its apps, and Samsung's own start-up
  # (Autorun Last App, its network notice) can open over Home a few seconds later. Open Home,
  # give it LOADING seconds to come up before ever asking again, then keep it in front for
  # GUARD seconds. After that the TV is left alone. Only an explicit standby means "turned off".
  local start=$SECONDS opened=0 launched=-1000 h
  for _ in $(seq 1 "$TRIES"); do
    h=$(home)
    if [ "$h" = shown ]; then
      [ $opened = 0 ] && { log "opened Home ($((SECONDS - start)) s)"; opened=1; }
      [ $((SECONDS - start)) -ge "$GUARD" ] && return 0
    elif [ "$(state)" = standby ]; then
      log "TV went off before Home opened"; return 1
    elif { [ "$h" = hidden ] || [ $launched -lt 0 ]; } && [ $((SECONDS - launched)) -ge "$LOADING" ]; then
      # The first request goes out at once, answer or not; a request the TV never got does
      # not count, so the next one follows a second later instead of LOADING seconds later.
      [ $opened = 1 ] && log "something replaced Home; opening it again"
      launch && launched=$SECONDS
    fi
    sleep "$STEP"
  done
  [ $opened = 1 ] && return 0
  log "could not open Home (is Developer Mode still on and Home installed?)"
  return 1
}

# Turning the TV off always reports standby first, so that is what "off" means. A TV that simply
# stops answering while on (a Wi-Fi blip) only counts as off after OFF_AFTER seconds of
# silence; otherwise a blip during a show would pull Home over it.
last=$(state) quiet_since=
log "watching $HOST (power: ${last:-unreachable})"
while true; do
  now=$(state)
  if [ -z "$now" ] && [ "$last" = on ]; then
    : "${quiet_since:=$SECONDS}"
    [ $((SECONDS - quiet_since)) -lt "$OFF_AFTER" ] && now=on
  else
    quiet_since=
  fi
  [ "$now" != "$last" ] && log "TV power: ${now:-unreachable}"
  if [ "$now" = on ] && [ "$last" != on ]; then
    open_home
    now=$(state); [ -z "$now" ] && now=on   # back to standby if it went off meanwhile
  fi
  last=$now
  sleep "$TICK"
done
