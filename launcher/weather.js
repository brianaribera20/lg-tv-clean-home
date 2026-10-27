// Current weather next to the date (Open-Meteo: free, no key, allows the TV to read it).
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
  var last = 0;
  function update() {
    if (document.hidden || Date.now() - last < 25 * 60000) return;
    last = Date.now();
    var x = new XMLHttpRequest();
    x.open('GET', 'https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon +
      '&current=temperature_2m,weather_code&temperature_unit=fahrenheit', true);
    x.timeout = 10000;
    x.onload = function () {
      try {
        var c = JSON.parse(x.responseText).current;
        el.textContent = Math.round(c.temperature_2m) + '°  ' + (WORDS[c.weather_code] || '');
        el.className = 'shown';
      } catch (_) { last = 0; }
    };
    x.onerror = x.ontimeout = function () { last = 0; };
    x.send();
  }
  update();
  setInterval(update, 60000);
  document.addEventListener('visibilitychange', update);
}());
