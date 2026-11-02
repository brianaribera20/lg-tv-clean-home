#!/usr/bin/env python3
"""Build Home for a Samsung (Tizen) TV into samsung/build/widget from launcher/.

The launcher's own files are copied as they are; only index.html (header buttons and script
list), the webOS Back key (461 -> Samsung 10009) and config.js differ.
No score cards on Samsung.
  --preview  also loads preview-tizen.js, a fake Tizen API, so the build opens in a browser.
"""
import json, os, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAUNCHER, HERE = ROOT / 'launcher', ROOT / 'samsung'
OUT = HERE / 'build' / 'widget'
PREVIEW = '--preview' in sys.argv

# Launcher files Home needs on Samsung; the rest talk to LG services that Tizen has no copy of.
COPY = ['style.css', 'i18n.css', 'apple.css', 'i18n.js', 'catalogs.js', 'app-library.js', 'user-data.js',
        'clock.js', 'orbs.js', 'weather.js', 'app.js', 'app-colors.js', 'fonts']
# Header buttons with nothing behind them on Samsung (LG inputs, LG power-off, LG settings panel).
DROP_PILLS = ['btnInputs', 'btnSleep', 'btnSettings']
# Start-up scripts merged into home.js, in this order.
BUNDLE = ['i18n.js', 'app-library.js', 'user-data.js', 'clock.js', 'orbs.js', 'weather.js']


def env():
    values = {}
    path = ROOT / 'tv.local.env'
    if path.is_file():
        for line in path.read_text().splitlines():
            m = re.match(r'\s*([A-Z_]+)=(.*)$', line)
            if m:
                values[m.group(1)] = m.group(2).strip().strip('"')
    values.update({k: v for k, v in os.environ.items() if k.startswith(('TV_', 'SAMSUNG_'))})
    return values


def main():
    local = env()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for name in COPY:
        src = LAUNCHER / name
        if src.is_dir():
            shutil.copytree(src, OUT / name)
        elif src.is_file():
            text = src.read_text(encoding='utf-8')
            if name in ('app.js', 'i18n.js'):
                text = re.sub(r'\b461\b', '10009', text)
            (OUT / name).write_text(text, encoding='utf-8')

    # Full-colour tiles from make-tiles.py, reused for the same streaming apps.
    tiles = {}
    (OUT / 'icons').mkdir()
    for spec in json.loads(re.search(r'SAMSUNG_APPS = (\{.*?\n\});', (HERE / 'config.js').read_text(), re.S).group(1)).values():
        tile = LAUNCHER / 'icons' / (spec['art'] + '-tile.png')
        if tile.is_file():
            shutil.copy(tile, OUT / 'icons' / tile.name)
            tiles[spec['art']] = 1

    lat, lon = local.get('SAMSUNG_WEATHER_LAT') or local.get('TV_WEATHER_LAT'), local.get('SAMSUNG_WEATHER_LON') or local.get('TV_WEATHER_LON')
    data = {'weather': {'lat': float(lat), 'lon': float(lon)}} if lat and lon else {}
    (OUT / 'local.js').write_text('window.TV_LOCAL = %s;\nwindow.SAMSUNG_TILES = %s;\n' % (json.dumps(data), json.dumps(tiles)))

    for name in ['config.js', 'tizen-boot.js', 'samsung.css'] + (['preview-tizen.js'] if PREVIEW else []):
        shutil.copy(HERE / name, OUT / name)

    html = (LAUNCHER / 'index.html').read_text(encoding='utf-8')
    for pill in DROP_PILLS:
        html = re.sub(r'\s*<div class="pill" id="%s">.*?</span>\s*</div>' % pill, '', html, flags=re.S)
    scripts = ['config.js', 'local.js', 'app-colors.js'] + (['preview-tizen.js'] if PREVIEW else []) + ['tizen-boot.js']
    # Inlined: four fewer files to read at start.
    tags = '<script>\n' + '\n;\n'.join((OUT / s).read_text(encoding='utf-8') for s in scripts) + '\n</script>'
    html = re.sub(r'  <script src="config.js"></script>.*</script>', lambda _: tags, html, flags=re.S)
    html = re.sub(r'\s*<link rel="stylesheet" href="renewal-panel.css">', '', html)
    # One stylesheet and one start-up script instead of a dozen files: just after power-on the TV
    # starves Home of disk time, and every separate read costs seconds there. catalogs.js (the
    # translations, 200 KB) stays apart and loads once Home is on screen.
    css = ''.join((OUT / n).read_text(encoding='utf-8') + '\n' for n in ['style.css', 'i18n.css', 'apple.css', 'samsung.css'])
    (OUT / 'home.css').write_text(css, encoding='utf-8')
    html = re.sub(r'  <link rel="stylesheet" href="(style|i18n|apple)\.css">\n', '', html)
    html = html.replace('</head>', '  <link rel="stylesheet" href="home.css">\n</head>')
    bundle = ''.join((OUT / n).read_text(encoding='utf-8') + '\n;\n' for n in BUNDLE)
    (OUT / 'home.js').write_text(bundle, encoding='utf-8')
    for n in ['style.css', 'i18n.css', 'apple.css', 'samsung.css'] + BUNDLE + scripts:
        (OUT / n).unlink()
    (OUT / 'index.html').write_text(html, encoding='utf-8')

    title = local.get('SAMSUNG_APP_TITLE') or local.get('TV_APP_TITLE') or 'Home'
    xml = (HERE / 'config.xml').read_text(encoding='utf-8').replace('<name>Home</name>', '<name>%s</name>' % title.replace('&', '&amp;').replace('<', '&lt;'))
    (OUT / 'config.xml').write_text(xml, encoding='utf-8')
    shutil.copy(LAUNCHER / 'largeIcon.png', OUT / 'icon.png')
    print('Built', OUT.relative_to(ROOT), '(preview)' if PREVIEW else '')


if __name__ == '__main__':
    main()
