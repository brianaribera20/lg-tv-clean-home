// Scores card above the dock: Ravens, Commanders and Capitals. The service (scores.js in
// renewal-service) fetches and trims ESPN's data; this file only draws a few lines per team.
// A live game shows its score and clock; otherwise the next game, its time and channel, and
// the last result. Refreshes every 10 minutes, every minute while a game is live.
(function () {
  var box = document.createElement('div');
  box.id = 'scores';
  // Inside the header, so it slides away with it as one layer when scrolling to the grid
  // (fading the cards on their own cost ~6 fps on this TV).
  (document.querySelector('header') || document.body).appendChild(box);
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function clock(d) {
    var h = d.getHours();
    return (h % 12 || 12) + ':' + ('0' + d.getMinutes()).slice(-2) + (h < 12 ? ' AM' : ' PM');
  }
  function when(iso) {
    var d = new Date(iso), now = new Date();
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate()), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((day - today) / 86400000);
    var label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff > 1 && diff < 7 ? DAYS[d.getDay()] : MONTHS[d.getMonth()] + ' ' + d.getDate();
    return label + ' ' + clock(d);
  }
  function logo(league, abbr, size) {
    // ESPN's dark-background logo set: transparent PNGs drawn to stand out on dark cards.
    return 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/' + String(league).toLowerCase() + '/500-dark/' +
      String(abbr).toLowerCase() + '.png&h=' + size + '&w=' + size;
  }
  // Card tint from the team's own colour (ESPN hex); fall back to the alternate if it's near black.
  function tint(t) {
    function rgb(hex) { var n = parseInt(hex, 16); return isNaN(n) ? null : [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    var c = rgb(t.color), alt = rgb(t.altColor);
    if (!c || Math.max(c[0], c[1], c[2]) < 40) c = alt && Math.max(alt[0], alt[1], alt[2]) >= 40 ? alt : [88, 132, 255];
    var v = c.join(',');
    return 'background:linear-gradient(150deg,rgba(' + v + ',0.62) 0%,rgba(' + v + ',0.22) 55%,rgba(20,22,29,0.35) 100%)';
  }
  // Section label with the TV channel badge on the right (live and next games alike).
  function label(text, tv, cls) {
    return '<div class="sc-label' + cls + '"><span>' + text + '</span>' + (tv ? '<span class="sc-tv">' + esc(tv) + '</span>' : '') + '</div>';
  }
  // Betting line strip for the next game (sportsbook via ESPN). Every number names its team:
  // the spread already reads "WSH -4.5"; the over/under is the game's combined total; the
  // moneyline shows both sides, ours first. In hockey ESPN's headline line is the moneyline
  // itself, so the spread cell is left out.
  function oddsRow(o, us, them) {
    if (!o) return '';
    var cells = [];
    var isMoneyline = o.line && (o.line.indexOf(o.mlUs) >= 0 || o.line.indexOf(o.mlThem) >= 0);
    if (o.line && !isMoneyline) cells.push(['Spread', esc(o.line), 'favorite']);
    if (o.total) cells.push(['O/U', esc(o.total), 'total pts']);
    if (o.mlUs) cells.push(['Moneyline', esc(us) + ' ' + esc(o.mlUs), o.mlThem ? esc(them) + ' ' + esc(o.mlThem) : '']);
    if (!cells.length) return '';
    return '<div class="sc-odds">' + cells.map(function (c) {
      return '<div><div class="sc-odds-k">' + c[0] + '</div><div class="sc-odds-v">' + c[1] + '</div>' +
        (c[2] ? '<div class="sc-odds-s">' + c[2] + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function glow(t) {
    var n = parseInt(t.color, 16);
    return isNaN(n) ? 'rgba(255,255,255,0.5)' : 'rgba(' + [n >> 16 & 255, n >> 8 & 255, n & 255].join(',') + ',0.9)';
  }
  function plate(src, cls) { return '<span class="' + cls + '"><img src="' + esc(src) + '" alt=""></span>'; }

  function card(t) {
    var league = t.league, l = !t.live && t.last;
    // Last result sits in the top-right corner (keeps the card short enough to leave air above the dock).
    var lastBadge = l ? '<div class="sc-last"><span class="sc-res ' + (l.won ? 'sc-w' : 'sc-l') + '">' + (l.won ? 'W' : 'L') + '</span>' +
      esc(l.us) + '–' + esc(l.them) + '<div class="sc-last-opp">' + (l.home ? 'vs ' : 'at ') + esc(l.opp) + '</div></div>' : '';
    var html = '<div class="sc-top">' + plate(t.logo, 'sc-logo') + '<div class="sc-id"><div class="sc-name">' + esc(t.name) +
      '</div><div class="sc-rec">' + esc(t.record) + (t.record ? '  ·  ' : '') + esc(league) + '</div></div>' + lastBadge + '</div>';
    if (t.live) {
      var g = t.live;
      html += label('<span class="sc-dot"></span>LIVE  ·  ' + esc(g.detail), g.tv, ' sc-live-label') +
        '<div class="sc-score">' + plate(t.logo, 'sc-opp') + '<span>' + esc(g.us) + '</span><span class="sc-dash">–</span><span>' + esc(g.them) +
        '</span>' + plate(logo(league, g.opp, 96), 'sc-opp') + '<span class="sc-score-opp">' + esc(g.opp) + '</span></div>';
    } else if (t.next) {
      var n = t.next;
      html += label('Next game', n.tv, '') + '<div class="sc-match"><span class="sc-vs">' + (n.home ? 'vs' : 'at') + '</span>' +
        plate(logo(league, n.opp, 96), 'sc-opp') + '<span class="sc-opp-name">' + esc(n.oppName) + '</span></div>' +
        '<div class="sc-when">' + esc(when(n.date)) + '</div>' + oddsRow(n.odds, t.abbr, n.opp);
    }
    // Game day: the team plays today (or is live) -> a soft pulsing glow in its colour.
    var today = t.live || (t.next && new Date(t.next.date).toDateString() === new Date().toDateString());
    var glowEl = today ? '<span class="sc-glow" style="box-shadow:0 0 28px 2px ' + glow(t) + '"></span>' : '';
    return '<div class="score-card' + (t.live ? ' live' : '') + (today ? ' gameday' : '') + '" style="' + tint(t) + '">' + glowEl + html + '</div>';
  }

  function render(teams) {
    teams = (teams || []).slice().sort(function (a, b) {
      if (!!a.live !== !!b.live) return a.live ? -1 : 1;
      return (a.next ? Date.parse(a.next.date) : Infinity) - (b.next ? Date.parse(b.next.date) : Infinity);
    });
    var keep = focused;
    box.innerHTML = teams.map(card).join('');
    if (keep >= 0) setFocus(keep);
    box.className = teams.length ? 'shown' : '';
    return teams.some(function (t) { return t.live; });
  }
  // Remote-control focus (app.js "cards" zone): Up from the dock lands here, OK opens YouTube TV,
  // where these games are watched.
  var focused = -1;
  function cards() { return box.querySelectorAll('.score-card'); }
  function setFocus(i) {
    var list = cards();
    if (focused >= 0 && list[focused]) list[focused].classList.remove('focused');
    focused = Math.max(0, Math.min(i, list.length - 1));
    if (list[focused]) list[focused].classList.add('focused');
  }
  window.ScoresCard = {
    render: render,
    count: function () { return box.className === 'shown' ? cards().length : 0; },
    focusNearest: function (x) {
      var list = cards(), best = 0, bestDistance = Infinity;
      for (var i = 0; i < list.length; i++) {
        var r = list[i].getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - x);
        if (d < bestDistance) { bestDistance = d; best = i; }
      }
      setFocus(best);
    },
    move: function (step) { setFocus(focused + step); },
    blur: function () { var list = cards(); if (list[focused]) list[focused].classList.remove('focused'); focused = -1; },
    centerX: function () { var c = cards()[focused]; if (!c) return 960; var r = c.getBoundingClientRect(); return r.left + r.width / 2; },
    watchApp: function () { return 'youtube.leanback.ytv.v1'; }
  };

  var timer = null;
  function refresh() {
    clearTimeout(timer);
    if (typeof PalmServiceBridge === 'undefined') return;
    var b = new PalmServiceBridge(), done = false;
    var guard = setTimeout(function () { finish(null); }, 30000);
    function finish(r) {
      if (done) return; done = true; clearTimeout(guard); try { b.cancel(); } catch (_) {}
      var live = r && r.returnValue === true ? render(r.teams) : false;
      timer = setTimeout(refresh, live ? 60000 : 10 * 60000);
    }
    b.onservicecallback = function (raw) { try { finish(JSON.parse(raw)); } catch (_) { finish(null); } };
    try { b.call('luna://com.gathin.tvhome.renewal/scores', '{}'); } catch (_) { finish(null); }
  }
  refresh();
  // Coming back to Home after a while: refresh rather than wait out the timer.
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) hiddenAt = Date.now(); else if (Date.now() - hiddenAt > 120000) refresh();
  });
}());
