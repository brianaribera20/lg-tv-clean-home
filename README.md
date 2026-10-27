# LG TV Clean Home

A personal, Apple TV–style home screen for an **LG 65UQ8000AUB** (webOS TV Lite 7.6.0, webOS 22),
built on [Clean Your TV — LG webOS](https://github.com/Razdva122/clean-your-tv-lg-webos) by Razdva122
(No-root edition). It replaces LG's ad-filled Home with a clean dock and app grid, opens YouTube TV
when the TV turns on, and keeps LG's Developer Mode alive on its own.

No root, no firmware changes. Everything installs as two Developer Mode apps — **Home** and
**Home Helper** — so a factory reset always puts the TV back exactly as it shipped.

The original project's README, with its full install guide and compatibility notes, is kept as
[UPSTREAM-README.md](UPSTREAM-README.md).

## What's different from upstream

### Look and feel
- **Apple-style theme** (`launcher/apple.css`): Inter font, sentence-case header, frosted pill buttons,
  a translucent dock shelf, and focused tiles that lift with a shadow instead of an outline.
  The focus ring sits an even 12 px around the tile and 24 px inside the shelf.
- **Full-colour tiles** (`scripts/make-tiles.py`): webOS only hands out small square icons, and the
  TV's browser can't read their pixels, so tiles are built on the computer — each icon centred on its
  own edge colour (or a blurred backdrop when the edge isn't one colour).
- **Moving background** (`launcher/orbs.js`): three soft orbs drift on smooth looping paths and take
  the focused app's colours (YouTube TV white and red, Prime Video blue and white…), from
  `launcher/app-colors.js`, which `make-tiles.py` writes.
- **Header**: greeting, clock and date on the left; weather (Open-Meteo, with today's high/low,
  tomorrow, and National Weather Service warnings) and round icon buttons — Inputs, Wi-Fi,
  **Good night** (turns the TV off in 30 minutes) and Settings — on the right.
- **Score cards** (`launcher/scores.js`, `renewal-service/scores.js`): Ravens, Commanders and
  Capitals from ESPN — next game with time and channel, live score, last result, and the
  DraftKings line with every number labelled by team. Up from the dock selects a card, OK opens
  YouTube TV, and a card glows in its team colour on game day.
- **Dock and rows** (`launcher/config.js`): YouTube TV, Prime Video, Apple TV, YouTube and Xbox
  (HDMI 1) in the dock; Netflix, Hulu, Peacock and Alexa lead the next row, then everything else A–Z.
- **Settings in the same style**: frosted panel, white-on-focus buttons, green switches; the
  Developer Mode page shows Home Helper's real renewal status ("994 hours left").
- **Idle clock** (`launcher/clock.js`): available, but switched off (`IDLE_CLOCK` in `config.js`).
- **Plain splash** and a personal app title that you fill in (e.g. "Welcome, <your name>"), which is what webOS shows on its
  "Loading…" card — set with `TV_APP_TITLE` in `tv.local.env`.

### Home Helper additions
- **YouTube TV at power-on** (`native/app/wake-app.json`): on wake or cold boot the helper opens
  YouTube TV, and for 12 seconds after waking (60 after a cold boot) re-opens it if the TV restores
  Home on top. A
  **When the TV turns on** switch in Home → Settings turns this off.
- **Idle timers**: at 4 h 59 m without a button press, an on-screen warning; at 5 hours, the TV
  turns off. The Good night button uses the same switch-off. LG's own screensaver is always declined. The
  remote relay reports activity (`ACT`) for this.
- **Developer Mode renewal from the TV** (`native/app/renew.js`): checks LG every 6 hours and resets
  the session when under 960 hours remain, which tops it back up to the ~1,000-hour maximum, and
  shares the result with Home's Settings.
  `devmode-renew.sh` is a second, independent path that runs daily on the Mac via launchd.
- **Restarts itself after a stall** (`native/app/runtime-policy.js`): if the TV pauses the helper for
  over 2 seconds, it used to switch itself off until started by hand. Now it restarts quietly (up to 3
  times in 30 minutes) without leaving the app you're watching. Pressing Home three times still
  switches it off; open **Home Helper** → **Start Helper** to bring it back.

### Fixes
- **Settings ↔ helper files**: Home's settings service and Home Helper run as different users in
  separate sandboxes, and the helper's `state/` folder isn't visible to the service. Shared files
  (Change Home requests, the power-on switch) now live in `ipc/` inside Home's service folder — the
  one place both can write. This fixes **Change Home** and the power-on switch on this firmware.
- **`install.sh`**: reads the TV's Node version from the last line of `ares-cli` output (it prints
  an `[Info]` line first, which failed the version check).

### Speed (measured on the TV)
Profiled over the webOS debugger (`ares-inspect` + DevTools protocol):

| | Before | After |
|---|---|---|
| Home ready (cached) | 1.6–1.9 s | 0.1–0.6 s |
| Moving between tiles | 9 fps | 51–56 fps |
| Home at rest | 43 fps | 60 fps |
| Settings panel | 17 fps | 58 fps |
| Inputs menu, clock screen | not measured | 58–59 fps |

- Optional build flags in `scripts/compile-tv-web.cjs`, set by `update-home.sh` for this TV:
  `TV_BROWSERS="Chrome 87"`, `TV_NO_POLYFILLS=1` (drops the 274 KB core-js bundle),
  `TV_LANG_ONLY=en`, `TV_BUNDLE=1` (one script and one stylesheet instead of ~20 files) and
  `TV_FAST_BOOT=1` (skip updater services already found missing). Without the flags, builds are
  unchanged.
- Animations use only `transform` and `opacity`. A CSS mask or a colour transition on the large
  orb layers dropped navigation to 9–10 fps on this TV's GPU.

## Setup

Requirements: a Mac on the same network, Node.js 20+, Python 3.9+, and LG **Developer Mode** turned on
(LG Content Store → Developer Mode, signed in with an LG developer account made with an email and
password — a "Sign in with Google" account is refused by the TV), with **Dev Mode Status** and
**Key Server** on.

```sh
cp tv.local.env.example tv.local.env   # then fill in TV_HOST and TV_APP_TITLE (both start blank)
./install.sh 192.168.1.50         # first install with your TV's address (type the TV's passphrase)
./update-home.sh                  # rebuild and reinstall Home after editing launcher/
./update-home.sh --helper         # also reinstall and restart Home Helper after editing native/
./update-home.sh --fresh          # reinstall Home and forget its saved tile order
```

Personal settings:
- **TV address, display name and weather location**: `tv.local.env` (not committed; copy `tv.local.env.example`).
- **Dock, row order and hidden apps**: `launcher/config.js` (`dockApps`, `CONFIG_ORDER`, `hiddenApps`, `columns`).
- **Teams**: `TEAMS` in `renewal-service/scores.js`.
- **Power-on app**: `native/app/wake-app.json` (delete it to open Home instead), or the switch in
  Home → Settings.
- **Mac renewal backup**: `devmode-renew.sh`, scheduled daily by a LaunchAgent (`~/Library/LaunchAgents/com.lg-tv-clean-home.devmode-renew.plist`);
  log at `~/Library/Logs/lg-devmode-renew.log`.

Files kept out of git on purpose: `tv.local.env`, the TV pairing key (`.lgtv-key.json`), the TV's app list and icons
(`launcher/apps.js`, `launcher/icons/`), build output, and anything under `~/.ssh` or
`~/.config/lg-devmode`.

## Remote controls

| Button | Result |
|---|---|
| Home | Opens this Home screen (never LG's) |
| Home ×3 within 2 s | Emergency exit to LG Home; open **Home Helper** from LG's apps to resume |
| Back inside an app | Normal Back; exiting an app returns to Home (LG Home can flash briefly — a webOS limit) |
| Up from the dock | Score cards; Up again reaches the header buttons |

## Undo

1. **Quick**: press Home three times.
2. **Remove**: delete the **Home** and **Home Helper** apps.
3. **Everything**: Settings → General → System → **Reset to Initial Settings**.

## Known limits
- On a Back exit from an app, LG Home appears for a moment before this Home returns; the Home button
  avoids it. Removing it needs root, which this firmware (July 2026) doesn't allow.
- The first start after a TV restart is slower while webOS loads Home from storage.
- The LG logo at power-off and webOS's own "Loading…" card can't be removed.

## Credits and licences
Based on [Clean Your TV — LG webOS](https://github.com/Razdva122/clean-your-tv-lg-webos) (Razdva122),
itself built on [webos-vibehack](https://github.com/OmkarK97/webos-vibehack) and
[CleanYourTV](https://github.com/Gathin23/cleanyourtv); MIT licence in [LICENSE](LICENSE), third-party
notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Inter font: SIL Open Font License
([launcher/fonts/Inter-OFL.txt](launcher/fonts/Inter-OFL.txt)). Not affiliated with LG.
