// Samsung (Tizen) start-up. Home's code talks to webOS through PalmServiceBridge; here a small
// stand-in answers the few calls that have a Tizen equivalent (app list, launch, Wi-Fi name)
// and every other call fails the way it does on a TV without that service.
(function () {
  'use strict';
  var T = window.tizen, apps = [], self = '';

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9+]/g, ''); }
  // A config title ("Prime Video") -> the Samsung app id.
  function resolve(key) {
    var i, known = window.SAMSUNG_APPS || {}, title = key;
    for (i = 0; i < apps.length; i++) if (apps[i].id === key) return apps[i].id;
    var names = (known[title] && known[title].names || [title]).map(norm);
    for (i = 0; i < apps.length; i++) if (names.indexOf(norm(apps[i].title)) >= 0) return apps[i].id;
    return null;
  }
  function artFor(title) {
    var known = window.SAMSUNG_APPS || {}, n = norm(title), k;
    for (k in known) if (known[k].names.map(norm).indexOf(n) >= 0) return known[k].art;
    return null;
  }

  function list(callback) {
    // Just after power-on the TV can be slow to answer; Home then starts from its saved layout.
    var finished = false, timer = setTimeout(function () { done(null); }, 5000);
    function done(l) { if (finished) return; finished = true; clearTimeout(timer); callback(l); }
    if (!T || !T.application) { done(null); return; }
    try {
      T.application.getAppsInfo(function (infos) {
        done(infos.filter(function (a) { return a.show !== false && a.id !== self && a.name; }).map(function (a) {
          var art = artFor(a.name), colors = window.APP_COLORS || {};
          if (art && colors[art]) colors[a.id] = colors[art];
          return {id: a.id, title: a.name, icon: art && window.SAMSUNG_TILES && SAMSUNG_TILES[art] ? 'icons/' + art + '-tile.png' : (a.iconPath || ''),
            iconColor: art && colors[art] ? colors[art][0] : ''};
        }));
      }, function () { done(null); });
    } catch (_) { done(null); }
  }

  function wifi(reply) {
    try {
      T.systeminfo.getPropertyValue('ETHERNET_NETWORK', function (e) {
        if (e && e.cable === 'ATTACHED' && e.status === 'ATTACHED') { reply({returnValue: true, wired: {state: 'connected'}}); return; }
        T.systeminfo.getPropertyValue('WIFI_NETWORK', function (w) {
          reply({returnValue: true, wifi: {state: w && w.status === 'ON' ? 'connected' : 'disconnected', ssid: w && w.ssid}});
        }, function () { reply({returnValue: false}); });
      }, function () {
        T.systeminfo.getPropertyValue('WIFI_NETWORK', function (w) {
          reply({returnValue: true, wifi: {state: w && w.status === 'ON' ? 'connected' : 'disconnected', ssid: w && w.ssid}});
        }, function () { reply({returnValue: false}); });
      });
    } catch (_) { reply({returnValue: false}); }
  }

  var handlers = {
    'com.local.nativehome.service/listApps': function (p, reply) {
      function answer(l) { if (l) apps = l; reply({returnValue: !!l, apps: l || []}); }
      if (later) later.push(answer); else list(answer);
    },
    'com.webos.applicationManager/launch': function (p, reply) {
      var id = resolve(p.id);
      if (!id) { reply({returnValue: false, errorText: 'not installed'}); return; }
      T.application.launch(id, function () { reply({returnValue: true}); },
        function (e) { reply({returnValue: false, errorText: e && e.message}); });
    },
    'com.palm.connectionmanager/getStatus': function (p, reply) {
      wifi(reply);
      // Home can open before the TV is back on Wi-Fi: report again whenever the network changes.
      if (p.subscribe) ['WIFI_NETWORK', 'ETHERNET_NETWORK'].forEach(function (name) {
        try { T.systeminfo.addPropertyValueChangeListener(name, function () { wifi(reply); }); } catch (_) {}
      });
    }
  };

  function Bridge() { this.onservicecallback = null; this.cancelled = false; }
  Bridge.prototype.call = function (uri, json) {
    var bridge = this, h = handlers[String(uri).replace(/^luna:\/\//, '')], p = {};
    try { p = JSON.parse(json || '{}'); } catch (_) {}
    function reply(r) { if (!bridge.cancelled && bridge.onservicecallback) bridge.onservicecallback(JSON.stringify(r)); }
    setTimeout(function () {
      if (!h) { reply({returnValue: false, errorText: 'Not available on Samsung'}); return; }
      try { h(p, reply); } catch (e) { reply({returnValue: false, errorText: String(e)}); }
    }, 0);
  };
  Bridge.prototype.cancel = function () { this.cancelled = true; };
  window.PalmServiceBridge = Bridge;

  // Home's own id, kept out of its tile list. (Asking the TV for it stalls at power-on.)
  self = 'CleanHome1.Home';

  // Fetched side by side, run in order (async = false), then done().
  function load(srcs, done) {
    var left = srcs.length;
    if (!left) { done(); return; }
    srcs.forEach(function (src) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = s.onerror = function () { if (--left === 0) done(); };
      document.body.appendChild(s);
    });
  }

  // The TV takes ~5 s to list its apps (longer just after power-on), so Home starts at once from
  // the list it saved last time and saves a fresh one for next time. Only the very first start waits.
  // Asking the TV freezes the page while it answers, so that waits until Home is on screen;
  // Home's own request for the list (later) is answered by that same query.
  var CACHE = 'samsung.apps', REFRESH_AFTER = 6000, saved = null, later = null;
  function save(l) { try { if (l && l.length) localStorage.setItem(CACHE, JSON.stringify(l)); } catch (_) {} }
  try { saved = JSON.parse(localStorage.getItem(CACHE)); } catch (_) {}

  // Just after power-on the TV is so busy that Home's code takes 20+ seconds to run. So the page
  // first shows Home as it last looked (a copy saved below), over everything, and only then starts
  // the code; the copy is removed once the real Home has drawn underneath it.
  var SNAP = 'samsung.snapshot', cover = showSnapshot();
  function band(d) { var h = d.getHours(); return h < 5 ? 0 : h < 12 ? 1 : h < 17 ? 2 : h < 22 ? 3 : 0; }
  function showSnapshot() {
    var snap = null, now = new Date(), el, h = now.getHours();
    try { snap = JSON.parse(localStorage.getItem(SNAP)); } catch (_) {}
    if (!snap || !snap.html) return null;
    el = document.createElement('div');
    // Appended last, so Home's code still finds its own elements first by id.
    el.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;overflow:hidden;z-index:2147483647;background:' + snap.background;
    el.innerHTML = snap.html;
    function set(sel, text) { var e = el.querySelector(sel); if (e) e.textContent = text; }
    set('#clock', (h % 12 || 12) + ':' + ('0' + now.getMinutes()).slice(-2));
    if (snap.ampm) set('#ampm', h < 12 ? 'AM' : 'PM');
    if (snap.day !== now.toDateString()) set('#date', '');
    if (snap.band !== band(now)) set('#greeting', '');
    document.body.appendChild(el);
    return el;
  }
  function takeSnapshot() {
    var copy = document.body.cloneNode(true), ampm = document.getElementById('ampm'), look = getComputedStyle(document.body);
    Array.prototype.slice.call(copy.querySelectorAll('script')).forEach(function (e) { e.parentNode.removeChild(e); });
    if (cover && cover.parentNode === document.body) copy.removeChild(copy.lastElementChild);
    try {
      localStorage.setItem(SNAP, JSON.stringify({html: copy.innerHTML, background: (look.backgroundImage === 'none' ? '' : look.backgroundImage + ' ') + look.backgroundColor,
        day: new Date().toDateString(), band: band(new Date()), ampm: !!(ampm && ampm.textContent)}));
    } catch (_) {}
  }
  // After two frames, or after ms when no frames come (a page opened behind the TV's own start-up).
  function afterPaint(ms, fn) {
    var done = false;
    function go() { if (!done) { done = true; fn(); } }
    requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(go, 0); }); });
    setTimeout(go, ms);
  }
  function drawn() {
    afterPaint(1000, function () {
      if (cover && cover.parentNode) cover.parentNode.removeChild(cover);
      cover = null;
      // Once weather and the rest have filled in; and again whenever Home goes to the background.
      setTimeout(takeSnapshot, 8000);
      document.addEventListener('visibilitychange', function () { if (document.hidden) takeSnapshot(); });
    });
  }

  // Start at once: the TV only shows the page once Samsung's own "Loading" screen ends, and
  // waiting for that first frame made the start slower, not faster.
  setTimeout(begin, 0);
  function begin() {
    if (saved && saved.length) {
      later = [];
      start(saved);
      setTimeout(function () {
        list(function (l) { var waiting = later; later = null; save(l); waiting.forEach(function (cb) { cb(l); }); });
      }, REFRESH_AFTER);
    } else list(function (l) { save(l); start(l); });
  }

  function start(l) {
    apps = l || [];
    window.TV_APPS = {apps: apps, inputs: []};
    // Titles in config.js -> ids; a title that is not installed simply drops out.
    function ids(keys) { return (keys || []).map(resolve).filter(Boolean); }
    CONFIG.dockApps = ids(CONFIG.dockApps);
    CONFIG.hiddenApps = ids(CONFIG.hiddenApps);
    window.CONFIG_HIDDEN = ids(window.CONFIG_HIDDEN);
    window.CONFIG_ORDER = ids(window.CONFIG_ORDER);
    load(['i18n.js', 'catalogs.js', 'app-library.js', 'user-data.js', 'clock.js', 'orbs.js', 'weather.js'], function () {
      (window.HomeI18n ? HomeI18n.ready : function (cb) { cb(); })(function () { load(['app.js'], drawn); });
    });
  }
}());
