// Weather on the greeting line (Open-Meteo: free, no key, allows the TV to read it): now, today's
// high/low and tomorrow. Plus a red banner for active National Weather Service warnings.
// Location comes from tv.local.env via local.js; without it nothing is shown.
(function () {
  var place = window.TV_LOCAL && window.TV_LOCAL.weather, el = document.getElementById('weather');
  if (!place || !el) return;
  // WMO weather codes -> short words.
  var WORDS = {0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog',
    51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Freezing Drizzle', 57: 'Freezing Drizzle',
    61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 66: 'Freezing Rain', 67: 'Freezing Rain',
    71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow', 80: 'Showers', 81: 'Showers',
    82: 'Heavy Showers', 85: 'Snow Showers', 86: 'Snow Showers', 95: 'Thunderstorms', 96: 'Thunderstorms', 99: 'Thunderstorms'};
  // Shorter words for tomorrow, so the greeting line stays on one line.
  var SHORT = {0: 'Clear', 1: 'Clear', 2: 'Clouds', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 61: 'Rain', 63: 'Rain', 65: 'Rain',
    66: 'Ice', 67: 'Ice', 71: 'Snow', 73: 'Snow', 75: 'Snow', 77: 'Snow', 80: 'Showers', 81: 'Showers', 82: 'Showers',
    85: 'Snow', 86: 'Snow', 95: 'Storms', 96: 'Storms', 99: 'Storms'};
  var last = 0;
  function update() {
    if (document.hidden || Date.now() - last < 25 * 60000) return;
    last = Date.now();
    var x = new XMLHttpRequest();
    x.open('GET', 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon +
      '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code' +
      '&forecast_days=2&timezone=auto&temperature_unit=fahrenheit', true);
    x.timeout = 10000;
    x.onload = function () {
      try {
        var data = JSON.parse(x.responseText), c = data.current, d = data.daily || {};
        el.textContent = Math.round(c.temperature_2m) + '°  ' + (WORDS[c.weather_code] || '');
        // Today's high/low and tomorrow sit on a small line above the date (keeps every row short).
        var fc = document.getElementById('forecast');
        if (fc && d.temperature_2m_max) {
          fc.textContent = 'H ' + Math.round(d.temperature_2m_max[0]) + '°  L ' + Math.round(d.temperature_2m_min[0]) + '°' +
            '   ·   Tomorrow ' + Math.round(d.temperature_2m_max[1]) + '° ' + (SHORT[d.weather_code[1]] || '');
          fc.className = 'shown';
        }
        el.className = 'shown';
      } catch (_) { last = 0; }
    };
    x.onerror = x.ontimeout = function () { last = 0; };
    x.send();
  }
  // Active NWS warnings/watches/advisories for this point (US only; the feed allows the TV to read it).
  var banner = document.getElementById('wxAlert'), lastAlerts = 0;
  function alerts() {
    if (!banner || document.hidden || Date.now() - lastAlerts < 10 * 60000) return;
    lastAlerts = Date.now();
    var x = new XMLHttpRequest();
    x.open('GET', 'https://api.weather.gov/alerts/active?point=' + place.lat + ',' + place.lon, true);
    x.timeout = 15000;
    x.onload = function () {
      try {
        var rank = {Extreme: 4, Severe: 3, Moderate: 2, Minor: 1};
        var list = (JSON.parse(x.responseText).features || []).map(function (f) { return f.properties; }).filter(function (p) {
          return p.status === 'Actual' && p.messageType !== 'Cancel' && !/test/i.test(p.event || '') && (!p.expires || Date.parse(p.expires) > Date.now());
        }).sort(function (a, b) { return (rank[b.severity] || 0) - (rank[a.severity] || 0); });
        if (!list.length) { banner.className = ''; banner.textContent = ''; return; }
        var top = list[0], until = top.ends || top.expires, d = until ? new Date(until) : null;
        var time = d ? ' until ' + ((d.getHours() % 12) || 12) + ':' + ('0' + d.getMinutes()).slice(-2) + (d.getHours() < 12 ? ' AM' : ' PM') : '';
        banner.textContent = top.event + time + (list.length > 1 ? '  +' + (list.length - 1) : '');
        banner.className = 'shown' + ((rank[top.severity] || 0) >= 3 ? ' severe' : '');
      } catch (_) { lastAlerts = 0; }
    };
    x.onerror = x.ontimeout = function () { lastAlerts = 0; };
    x.send();
  }
  update();
  alerts();
  setInterval(function () { update(); alerts(); }, 60000);
  document.addEventListener('visibilitychange', function () { update(); alerts(); });
}());
