#!/usr/bin/env bash
# samsung/autostart.sh against a fake Samsung TV (power state + app API), one scenario at a time.
#   bash tests/samsung-autostart.sh
set -uo pipefail
cd "$(dirname "$0")/.."
WORK=$(mktemp -d) PORT=$((20000 + RANDOM % 20000)) FAIL=0
trap 'kill $SERVER $WATCHER 2>/dev/null; rm -rf "$WORK"' EXIT

# Fake TV. state.json: power (on/standby/off = unreachable), visible, opens (POSTs that open
# Home; -1 = never opens), posts (count), drop (upcoming GETs left unanswered, like a TV still
# booting), load (seconds Home takes to appear after a launch). GET /power, GET|POST /app.
cat > "$WORK/tv.py" <<'EOF'
import json, sys, time, threading, http.server
F = sys.argv[2]
LOCK = threading.Lock()
def load(): return json.load(open(F))
def save(s): json.dump(s, open(F, 'w'))
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def reply(self, body):
        self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(body).encode())
    def do_GET(self):
        with LOCK:
            s = load()
            if s.get('drop', 0) > 0: s['drop'] -= 1; save(s); s['power'] = 'off'
        if s['power'] == 'off': self.close_connection = True; return self.connection.close()
        if self.path == '/power': return self.reply({'device': {'PowerState': s['power']}})
        return self.reply({'id': 'CleanHome1.Home', 'running': s['visible'], 'visible': s['visible']})
    def do_POST(self):
        with LOCK:
            s = load(); s['posts'] += 1; save(s)
        if s['power'] == 'on' and s['opens'] != -1 and s['posts'] >= s['opens']:
            def show():
                with LOCK:
                    t = load(); t['visible'] = True; save(t)
            threading.Timer(s.get('load', 0), show).start()
        self.reply(True)
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
EOF
tv() { python3 - "$WORK/state.json" "$@" <<'EOF'
import json, sys
f = sys.argv[1]; s = json.load(open(f))
for kv in sys.argv[2:]:
    k, v = kv.split('='); s[k] = int(v) if v.lstrip('-').isdigit() else (v == 'true' if v in ('true', 'false') else v)
json.dump(s, open(f, 'w'))
EOF
}
echo '{"power":"standby","visible":false,"opens":1,"posts":0,"drop":0,"load":0}' > "$WORK/state.json"
python3 "$WORK/tv.py" $PORT "$WORK/state.json" & SERVER=$!
sleep 1

start_watcher() {
  : > "$WORK/log"
  SAMSUNG_POWER_URL="http://127.0.0.1:$PORT/power" SAMSUNG_APP_URL="http://127.0.0.1:$PORT/app" \
  SAMSUNG_GUARD_SECONDS=3 SAMSUNG_OPEN_TRIES=16 SAMSUNG_TICK=0.2 SAMSUNG_STEP=0.5 SAMSUNG_LOADING_SECONDS=3 SAMSUNG_OFF_AFTER_SECONDS=8 \
    bash samsung/autostart.sh >> "$WORK/log" 2>&1 & WATCHER=$!
  sleep 1
}
expect() { # expect <seconds> <text>: the log gets <text> within <seconds>
  for _ in $(seq 1 $(($1 * 5))); do grep -q "$2" "$WORK/log" && return 0; sleep 0.2; done
  echo "  FAIL: no '$2' in log:"; sed 's/^/    /' "$WORK/log"; FAIL=1; return 1
}
posts() { python3 -c "import json;print(json.load(open('$WORK/state.json'))['posts'])"; }
absent() { grep -q "$1" "$WORK/log" && { echo "  FAIL: unexpected '$1'"; FAIL=1; }; true; }
check() { echo "- $1"; }

check "TV turns on from standby: Home opens"
tv power=standby visible=false opens=1 posts=0; start_watcher
tv power=on; expect 5 "opened Home"

check "Samsung opens something over Home during the first seconds: Home comes back"
tv visible=false; expect 5 "something replaced Home"; expect 5 "opened Home"
kill $WATCHER; wait $WATCHER 2>/dev/null

check "TV joins Wi-Fi late (unreachable, then on), apps slow to start: Home opens on the 3rd try"
tv power=off visible=false opens=3 posts=0; start_watcher
tv power=on; expect 8 "opened Home"
kill $WATCHER; wait $WATCHER 2>/dev/null

check "TV turned off again before Home could open: gives up quietly, catches the next power-on"
tv power=standby visible=false opens=-1 posts=0; start_watcher
tv power=on; sleep 1.5; tv power=standby; expect 5 "TV went off before Home opened"
tv opens=1 posts=0; tv power=on; expect 6 "opened Home"
kill $WATCHER; wait $WATCHER 2>/dev/null

check "Home never opens (uninstalled): says so and keeps watching"
tv power=standby visible=false opens=-1 posts=0; start_watcher
tv power=on; expect 14 "could not open Home"
kill -0 $WATCHER 2>/dev/null || { echo "  FAIL: watcher exited"; FAIL=1; }
kill $WATCHER; wait $WATCHER 2>/dev/null

check "Watcher starts while the TV is already on: leaves it alone"
tv power=on visible=false opens=1 posts=0; start_watcher; sleep 2
absent "opened Home"; [ "$(python3 -c "import json;print(json.load(open('$WORK/state.json'))['posts'])")" = 0 ] || { echo "  FAIL: launched Home"; FAIL=1; }
kill $WATCHER; wait $WATCHER 2>/dev/null

check "After the guard, choosing another app is left alone"
tv power=standby visible=false opens=1 posts=0; start_watcher
tv power=on; expect 5 "opened Home"; sleep 4; tv visible=false; sleep 2
absent "something replaced Home"
kill $WATCHER; wait $WATCHER 2>/dev/null

check "Booting TV misses replies and Home takes 2 s to load: opened exactly once"
tv power=standby visible=false opens=1 posts=0 load=2; start_watcher
tv power=on drop=6; expect 8 "opened Home"; sleep 3
[ "$(posts)" = 1 ] || { echo "  FAIL: Home was opened $(posts) times"; FAIL=1; }
absent "something replaced Home"; absent "TV went off"
tv load=0
kill $WATCHER; wait $WATCHER 2>/dev/null

check "Missed replies while watching another app later: no relaunch, no false power-off"
tv power=standby visible=false opens=1 posts=0; start_watcher
tv power=on; expect 5 "opened Home"; sleep 4; tv visible=false drop=6; sleep 4
absent "something replaced Home"; absent "TV power: unreachable"
[ "$(posts)" = 1 ] || { echo "  FAIL: Home was opened $(posts) times"; FAIL=1; }
kill $WATCHER; wait $WATCHER 2>/dev/null

check "Power cut (no standby, silent past the limit), then on: Home opens"
tv power=standby visible=false opens=1 posts=0; start_watcher
tv power=on; expect 5 "opened Home"; sleep 4; tv power=off visible=false; expect 12 "TV power: unreachable"
tv posts=0; tv power=on
for _ in $(seq 1 30); do [ "$(grep -c 'opened Home' "$WORK/log")" = 2 ] && break; sleep 0.2; done
[ "$(grep -c 'opened Home' "$WORK/log")" = 2 ] || { echo "  FAIL: Home not opened after the power cut"; sed "s/^/    /" "$WORK/log"; FAIL=1; }
kill $WATCHER; wait $WATCHER 2>/dev/null

[ $FAIL = 0 ] && echo "PASS samsung autostart" || { echo "FAILED samsung autostart"; exit 1; }
