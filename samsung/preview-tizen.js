// Preview builds only (build.py --preview): a fake Tizen API so the Samsung build opens in a
// desktop browser. The app list mirrors what a Samsung TV reports, launches only log.
(function () {
  if (window.tizen) return;
  var apps = ['YouTube TV', 'Prime Video', 'Apple TV', 'YouTube', 'Netflix', 'Hulu', 'Peacock TV', 'Disney+',
    'Samsung TV Plus', 'Spotify - Music and Podcasts', 'Internet', 'Gallery', 'SmartThings'].map(function (name, i) {
    return {id: 'preview' + i + '.App', name: name, iconPath: '', show: true};
  });
  window.tizen = {
    application: {
      // ?stall: never answer, like a TV that is still starting up.
      getAppsInfo: function (ok) { if (!/stall/.test(location.search)) setTimeout(function () { ok(apps); }, 50); },
      launch: function (id, ok) { console.log('[preview] launch', id); setTimeout(ok, 0); },
      getCurrentApplication: function () { return {appInfo: {id: 'CleanHome1.Home'}}; }
    },
    systeminfo: {
      getPropertyValue: function (name, ok, fail) {
        if (name === 'WIFI_NETWORK') ok({status: 'ON', ssid: 'Preview Wi-Fi'}); else fail(Error('none'));
      }
    }
  };
}());
