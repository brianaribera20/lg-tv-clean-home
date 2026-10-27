// "Good night" button: one press turns the TV off in 30 minutes, another press cancels.
// Home's service stores the off time in the shared ipc/sleep.json; Home Helper, which can
// switch the TV off, acts on it. The button counts down ("Off in 29 min").
(function () {
  var MINUTES = 30, label = document.getElementById('sleepLabel'), button = document.getElementById('btnSleep');
  if (!label || !button) return;
  var offAt = 0, ticker = null;

  function call(method, payload, done) {
    if (typeof PalmServiceBridge === 'undefined') { if (done) done(null); return; }
    var b = new PalmServiceBridge(), finished = false;
    var guard = setTimeout(function () { finish(null); }, 8000);
    function finish(r) { if (finished) return; finished = true; clearTimeout(guard); try { b.cancel(); } catch (_) {} if (done) done(r); }
    b.onservicecallback = function (raw) { try { finish(JSON.parse(raw)); } catch (_) { finish(null); } };
    try { b.call('luna://com.gathin.tvhome.renewal/' + method, JSON.stringify(payload)); } catch (_) { finish(null); }
  }
  function show() {
    var left = offAt ? Math.ceil((offAt - Date.now()) / 60000) : 0;
    if (offAt && left <= 0) { offAt = 0; }
    label.textContent = offAt ? left + ' min' : 'Good night';
    button.classList.toggle('sleeping', !!offAt);
  }
  function apply(r) {
    if (r && r.returnValue === true) offAt = r.at || 0;
    show();
    clearInterval(ticker);
    if (offAt) ticker = setInterval(show, 15000);
  }
  function toast(text) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = text; t.classList.add('shown');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.remove('shown'); }, 2500);
  }
  window.SleepTimer = {
    toggle: function () {
      var minutes = offAt ? 0 : MINUTES;
      call('setSleep', {minutes: minutes}, function (r) {
        apply(r);
        if (!r || r.returnValue !== true) toast("Couldn't set the timer");
        else toast(minutes ? 'The TV will turn off in ' + minutes + ' minutes' : 'Good night timer cancelled');
      });
    }
  };
  call('sleepStatus', {}, apply);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) call('sleepStatus', {}, apply); });
}());
