// Keeps Home in charge while it is on screen.
// 1. LG's screensaver is always declined from here too, so it never covers Home even when
//    Home Helper (which also declines it) is off.
// 2. If Home Helper stops answering (the five-Home emergency stop, or anything else), Home asks
//    once, with "Turn it back on" already selected, so one OK press brings everything back.
(function () {
  'use strict';
  if (typeof PalmServiceBridge === 'undefined') return;
  var SETTLE = 20000, RECHECK = 10000, EVERY = 60000, asked = false, timer = null;

  function call(uri, payload, done) {
    var b = new PalmServiceBridge(), finished = false;
    // Home's service sleeps when idle: waking it plus the helper's 5 s answer window can pass 8 s.
    var guard = setTimeout(function () { finish(null); }, 15000);
    function finish(r) { if (finished) return; finished = true; clearTimeout(guard); try { b.cancel(); } catch (_) {} done(r); }
    b.onservicecallback = function (raw) { try { finish(JSON.parse(raw)); } catch (_) { finish(null); } };
    try { b.call(uri, JSON.stringify(payload)); } catch (_) { finish(null); }
  }

  var saver = new PalmServiceBridge();
  saver.onservicecallback = function (raw) {
    var m; try { m = JSON.parse(raw); } catch (_) { return; }
    if (!m || typeof m.timestamp === 'undefined') return;
    var reply = new PalmServiceBridge();
    reply.onservicecallback = function () {};
    reply.call('luna://com.webos.service.tvpower/power/responseScreenSaverRequest',
      JSON.stringify({clientName: 'com.gathin.tvhome', ack: false, timestamp: m.timestamp}));
  };
  try {
    saver.call('luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
      JSON.stringify({subscribe: true, clientName: 'com.gathin.tvhome'}));
  } catch (_) {}

  // The helper answers homeStatus through the shared ipc/ folder; silence means it is off.
  function helperOff(done) {
    call('luna://com.gathin.tvhome.renewal/homeStatus', {}, function (r) {
      done(!!(r && r.returnValue === false && r.errorText === 'Home Helper did not respond'));
    });
  }
  function toast(text) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text; t.classList.add('shown');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.remove('shown'); }, 3000);
  }
  function offer() {
    if (asked || document.hidden || !window.HomeI18n) return;
    asked = true;
    window.HomeI18n.confirm({
      title: 'Home Helper is off',
      message: 'Until it is back on, the Home button opens LG’s home screen and the TV won’t open YouTube TV or switch itself off.',
      action: 'Turn it back on', cancel: 'Not now', focusAction: true
    }, function () {
      call('luna://com.webos.applicationManager/launch', {id: 'com.local.nativehome', params: {nativeHomeStart: true}}, function (r) {
        if (!r || r.returnValue !== true) { toast('Couldn’t start Home Helper'); return; }
        setTimeout(function () { helperOff(function (off) { toast(off ? 'Home Helper is still starting…' : 'Home Helper is back on'); }); }, 8000);
      });
    });
  }
  // Two misses 10 s apart, after Home has been on screen for 20 s: a cold boot starts the
  // helper a little after Home, and a restart after a stall takes a few seconds. While Home
  // stays on screen it checks again every minute.
  function check(wait) {
    clearTimeout(timer);
    if (document.hidden || asked) return;
    timer = setTimeout(function () {
      helperOff(function (off) {
        if (document.hidden) return;
        if (!off) { check(EVERY); return; }
        timer = setTimeout(function () { helperOff(function (still) { if (still) offer(); else check(EVERY); }); }, RECHECK);
      });
    }, wait || SETTLE);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { clearTimeout(timer); asked = false; } else check(); });
  document.addEventListener('webOSRelaunch', function () { check(); });
  check();
}());
