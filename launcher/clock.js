// Idle clock screen, in place of LG's screensaver. It keeps Home's own background and orbs,
// fades the header and tiles away, and shows the time centred in Home's font with the date
// and weather beneath (the TV is an LED panel, so nothing needs to drift). Home Helper opens Home with
// {screensaver:true} after an hour without remote activity; Home also starts it itself
// after an hour idle on this screen. Any button or pointer movement dismisses it and
// is swallowed, so the press that wakes the screen never opens an app.
(function () {
  var IDLE = 60 * 60000, last = Date.now(), visible = false, timer = null;
  var el = document.createElement('div');
  el.id = 'idleClock';
  el.innerHTML = '<div class="idle-clock-face"><div class="idle-clock-time"><span></span><span class="idle-clock-ampm"></span></div>' +
    '<div class="idle-clock-info"></div></div>';
  document.body.appendChild(el);
  var face = el.firstChild, time = face.firstChild.firstChild, ampm = face.firstChild.lastChild, date = face.lastChild;
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function tick() {
    var now = new Date(), h = now.getHours();
    time.textContent = (h % 12 || 12) + ':' + ('0' + now.getMinutes()).slice(-2);
    ampm.textContent = h < 12 ? 'AM' : 'PM';
    var weather = document.getElementById('weather');
    date.textContent = DAYS[now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate() +
      (weather && weather.className === 'shown' && weather.textContent ? '   ·   ' + weather.textContent : '');
  }
  function show() {
    if (visible) return;
    visible = true; tick(); el.className = 'shown'; document.body.classList.add('idle');
    timer = setInterval(tick, 15000);
  }
  function hide() {
    visible = false; el.className = ''; document.body.classList.remove('idle'); clearInterval(timer);
  }
  function wake(event) {
    last = Date.now();
    if (!visible) return;
    hide();
    event.stopPropagation(); event.preventDefault();
  }
  ['keydown', 'keyup', 'mousedown', 'wheel'].forEach(function (type) { window.addEventListener(type, wake, true); });
  window.addEventListener('mousemove', function () { last = Date.now(); if (visible) hide(); }, true);

  function wanted(raw) {
    try {
      if (raw && raw.params) raw = raw.params;
      var params = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return !!(params && params.screensaver === true);
    } catch (_) { return false; }
  }
  document.addEventListener('webOSRelaunch', function (e) { if (wanted(e && e.detail)) show(); else if (visible) hide(); });
  if (wanted(window.PalmSystem && window.PalmSystem.launchParams)) show();
  setInterval(function () { if (!visible && Date.now() - last >= IDLE) show(); }, 30000);
}());
