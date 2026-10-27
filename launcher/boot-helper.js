// NOT LOADED (removed from index.html 27 Oct 2026). Tried on a cold start: Home itself only
// loads ~52 s after boot, so starting the helper from here gained just ~12 s, and asking for
// YouTube TV that early let LG Home take over at ~86 s. The TV's own boot activity (~55-68 s)
// is the reliable path. Kept for reference.
// After a cold start the TV's scheduler only starts Home Helper ~55 s after boot, while Home
// itself is up within seconds (it's the TV's "recent input"). So in the first 5 minutes after
// boot, Home starts the helper straight away; the helper then opens the power-on app.
// Safe to repeat: a running helper holds a lock, so a second start exits, and an
// emergency-stopped helper ignores automatic starts.
// Only in builds made for a known TV (TV_FAST_BOOT, set by compile-tv-web.cjs on
// profile-bootstrap.js, which loads after this file - hence the deferred check).
setTimeout(function () {
  if (window.TV_FAST_BOOT !== true || typeof PalmServiceBridge === 'undefined') return;
  function call(uri, payload, done) {
    var b = new PalmServiceBridge(), finished = false;
    var timer = setTimeout(function () { finish(null); }, 4000);
    function finish(r) { if (finished) return; finished = true; clearTimeout(timer); try { b.cancel(); } catch (_) {} if (done) done(r); }
    b.onservicecallback = function (raw) { try { finish(JSON.parse(raw)); } catch (_) { finish(null); } };
    try { b.call(uri, JSON.stringify(payload)); } catch (_) { finish(null); }
  }
  var loaded = Date.now();
  call('luna://com.gathin.tvhome.renewal/uptime', {}, function (r) {
    var note = {pageAgeMs: Date.now() - loaded, uptime: r};
    // No answer usually means the TV is still starting its services: treat that as a cold start.
    if (r && r.returnValue === true && r.seconds > 300) return;
    call('luna://com.webos.applicationManager/launch', {id: 'com.local.nativehome', params: {nativeHomeAuto: true}}, function (l) {
      note.launch = l; note.launchAfterMs = Date.now() - loaded;
      call('luna://com.gathin.tvhome.renewal/bootNote', note);
    });
  });
}, 0);
