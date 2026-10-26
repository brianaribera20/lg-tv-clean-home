// Recolours the background orbs from the focused app: its tile colour and logo colour
// (app-colors.js, from make-tiles.py), e.g. YouTube TV white and red, Prime Video blue and white.
// Each orb has two pre-drawn gradient layers; a new colour is drawn into the hidden one and the
// two crossfade by opacity, which the GPU does without repainting anything (see apple.css).
(function () {
  var DEFAULT = ['#5884ff', '#aa5cff', '#28c8d2'];
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function bright(hex) { var c = rgb(hex); return Math.max(c[0], c[1], c[2]); }
  function pick(id) {
    var pair = window.APP_COLORS && window.APP_COLORS[id];
    if (!pair) return DEFAULT;
    var a = pair[0], b = pair[1];
    // A black tile colour would vanish on the dark background; let the logo colour lead.
    if (bright(a) < 40) a = b;
    if (bright(b) < 40) b = a;
    if (bright(a) < 40) return DEFAULT;
    return [a, b, a === b ? '#8e8e93' : a];
  }
  // Per-orb strength lives in the gradient, not on the element: element opacity on a big
  // scaled layer would make the GPU blend it in an extra pass.
  var STRENGTH = [0.42, 0.38, 0.32];
  function gradient(hex, strength) {
    var c = rgb(hex).join(','), white = bright(hex) > 240 && rgb(hex)[2] > 230, k = (white ? 0.7 : 1) * strength;
    // Soft multi-stop falloff, so neighbouring orbs melt together.
    return 'radial-gradient(circle, rgba(' + c + ',' + 0.9 * k + ') 0%, rgba(' + c + ',' + 0.5 * k + ') 32%, rgba(' + c + ',' +
      0.16 * k + ') 52%, rgba(' + c + ',0) 70%)';
  }
  var orbs = document.querySelectorAll('#orbs .orb'), current = '', state = [];
  for (var i = 0; i < orbs.length; i++) state.push({layers: orbs[i].getElementsByTagName('i'), front: 0});
  function paint(colours, instant) {
    for (var i = 0; i < state.length; i++) {
      var s = state[i], back = 1 - s.front, show = s.layers[instant ? s.front : back];
      show.style.background = gradient(colours[i], STRENGTH[i]);
      show.className = 'on';
      if (!instant) { s.layers[s.front].className = ''; s.front = back; }
    }
  }
  // Change colour only once focus rests on an app: while scrolling past tiles the crossfade
  // would run on every step, and that blending is the costliest thing Home does on this TV.
  var timer = null;
  window.setOrbColors = function (id) {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var colours = pick(id), key = colours.join();
      if (key === current) return;
      current = key;
      paint(colours, false);
    }, 550);
  };
  paint(DEFAULT, true);
  current = DEFAULT.join();
}());
