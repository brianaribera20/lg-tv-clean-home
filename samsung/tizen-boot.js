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

  function list(done) {
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
      list(function (l) { if (l) apps = l; reply({returnValue: !!l, apps: l || []}); });
    },
    'com.webos.applicationManager/launch': function (p, reply) {
      var id = resolve(p.id);
      if (!id) { reply({returnValue: false, errorText: 'not installed'}); return; }
      T.application.launch(id, function () { reply({returnValue: true}); },
        function (e) { reply({returnValue: false, errorText: e && e.message}); });
    },
    'com.palm.connectionmanager/getStatus': function (p, reply) { wifi(reply); }
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

  // Back is 10009 on a Samsung remote (the build maps webOS's 461 to it). Home never exits on
  // Back; the remote's Home button leaves for Smart Hub as usual.
  try { self = T.application.getCurrentApplication().appInfo.id; } catch (_) {}

  function load(srcs, done) {
    if (!srcs.length) { done(); return; }
    var s = document.createElement('script');
    s.src = srcs[0];
    s.onload = s.onerror = function () { load(srcs.slice(1), done); };
    document.body.appendChild(s);
  }

  list(function (l) {
    apps = l || [];
    window.TV_APPS = {apps: apps, inputs: []};
    // Titles in config.js -> ids; a title that is not installed simply drops out.
    function ids(keys) { return (keys || []).map(resolve).filter(Boolean); }
    CONFIG.dockApps = ids(CONFIG.dockApps);
    CONFIG.hiddenApps = ids(CONFIG.hiddenApps);
    window.CONFIG_HIDDEN = ids(window.CONFIG_HIDDEN);
    window.CONFIG_ORDER = ids(window.CONFIG_ORDER);
    load(['i18n.js', 'catalogs.js', 'app-library.js', 'user-data.js', 'clock.js', 'orbs.js', 'weather.js'], function () {
      (window.HomeI18n ? HomeI18n.ready : function (cb) { cb(); })(function () { load(['app.js'], function () {}); });
    });
  });
}());
