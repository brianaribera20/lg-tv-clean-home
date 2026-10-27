'use strict';
// Team scores for Home's scores card, from ESPN's public site API. Fetched here, in the
// service process, because the schedules are large (the NHL one is ~1.2 MB) and parsing that
// in Home would stutter the UI; Home only receives a few fields per team.
//   team endpoint (~22 KB, every call): live game, last result, record, logo
//   schedule (cached 6 h in scores-cache.json): the next upcoming game
//   game summary (~130 KB, cached 1 h per game): the betting line for that next game
var fs = require('fs'), https = require('https');
var TEAMS = [
  {sport: 'football', league: 'nfl', team: 'bal'},
  {sport: 'football', league: 'nfl', team: 'wsh'},
  {sport: 'hockey', league: 'nhl', team: 'wsh'}
];
var SCHEDULE_TTL = 6 * 3600000, ODDS_TTL = 3600000;

function get(path, done) {
  var finished = false;
  function end(err, body) { if (!finished) { finished = true; done(err, body); } }
  var req = https.request({hostname: 'site.api.espn.com', port: 443, method: 'GET', agent: false,
    path: '/apis/site/v2/sports/' + path, headers: {Accept: 'application/json'}, timeout: 15000}, function (res) {
    if (res.statusCode !== 200) { res.resume(); return end(Error('http-' + res.statusCode)); }
    var chunks = [];
    res.on('data', function (c) { chunks.push(c); });
    res.on('end', function () {
      try { end(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { end(Error('bad-json')); }
    });
  });
  req.on('timeout', function () { req.abort(); end(Error('timeout')); });
  req.on('error', end);
  req.end();
}

function score(c) { return c && (typeof c.score === 'object' ? c.score && c.score.displayValue : c.score); }

// One game from our team's side: opponent, home/away, scores, state, start time, TV channel.
function game(event, abbr) {
  var comp = event && event.competitions && event.competitions[0];
  if (!comp) return null;
  var us = null, them = null;
  (comp.competitors || []).forEach(function (c) {
    if ((c.team && c.team.abbreviation || '').toLowerCase() === abbr) us = c; else them = c;
  });
  if (!us || !them) return null;
  var type = comp.status && comp.status.type || {};
  var tv = (comp.broadcasts || []).map(function (b) { return b.media && b.media.shortName || (b.names || [])[0]; }).filter(Boolean)[0] || '';
  return {
    id: event.id, state: type.state, detail: type.shortDetail || '', date: event.date, home: us.homeAway === 'home',
    opp: them.team && them.team.abbreviation, oppName: them.team && (them.team.shortDisplayName || them.team.displayName),
    us: score(us), them: score(them), won: us.winner === true, tv: tv
  };
}

function cacheFile(dir) { return dir + '/scores-cache.json'; }
// Bump CACHE_VERSION when the cached shape changes (v2: games carry their ESPN id for odds).
var CACHE_VERSION = 2;
function readCache(dir) {
  try { var c = JSON.parse(fs.readFileSync(cacheFile(dir), 'utf8')); return c.v === CACHE_VERSION ? c : {v: CACHE_VERSION}; }
  catch (e) { return {v: CACHE_VERSION}; }
}
function writeCache(dir, cache) { try { fs.writeFileSync(cacheFile(dir), JSON.stringify(cache)); } catch (e) {} }

function schedule(t, cache, done) {
  var key = t.league + '/' + t.team, hit = cache[key];
  if (hit && Date.now() - hit.at < SCHEDULE_TTL) return done(hit.events);
  get(t.sport + '/' + t.league + '/teams/' + t.team + '/schedule', function (err, body) {
    if (err || !body) return done(hit ? hit.events : []);
    // Keep only what we need: upcoming games and the most recent finished one.
    var now = Date.now(), events = (body.events || []).map(function (e) { return {e: game(e, t.team), raw: e}; })
      .filter(function (x) { return x.e; }).map(function (x) { return x.e; });
    var upcoming = events.filter(function (g) { return g.state === 'pre' && Date.parse(g.date) > now - 6 * 3600000; }).slice(0, 3);
    var finished = events.filter(function (g) { return g.state === 'post'; }).slice(-1);
    cache[key] = {at: now, events: finished.concat(upcoming)};
    done(cache[key].events);
  });
}

function signed(n) { return typeof n === 'number' ? (n > 0 ? '+' + n : String(n)) : null; }

// Sportsbook line for one upcoming game (ESPN's pickcenter, currently DraftKings): the headline
// line ("BUF -3.5", or the moneyline favourite in hockey), the over/under, and both moneylines.
function odds(t, g, cache, done) {
  if (!g || !g.id) return done(null);
  var key = 'odds/' + g.id, hit = cache[key];
  if (hit && Date.now() - hit.at < ODDS_TTL) return done(hit.odds);
  get(t.sport + '/' + t.league + '/summary?event=' + encodeURIComponent(g.id), function (err, body) {
    if (err || !body) return done(hit ? hit.odds : null);
    var pc = (body.pickcenter || [])[0], result = null;
    if (pc) {
      var mine = g.home ? pc.homeTeamOdds : pc.awayTeamOdds, theirs = g.home ? pc.awayTeamOdds : pc.homeTeamOdds;
      result = {book: pc.provider && pc.provider.name || '', line: pc.details || '', total: pc.overUnder || null,
        mlUs: signed(mine && mine.moneyLine), mlThem: signed(theirs && theirs.moneyLine)};
    }
    cache[key] = {at: Date.now(), odds: result};
    done(result);
  });
}

module.exports = function (dir) {
  return function scores(done) {
    var cache = readCache(dir), out = [], pending = TEAMS.length;
    TEAMS.forEach(function (t, i) {
      get(t.sport + '/' + t.league + '/teams/' + t.team, function (err, body) {
        var team = body && body.team;
        schedule(t, cache, function (events) {
          var entry = null;
          if (team) {
            var current = game((team.nextEvent || [])[0], t.team);
            var now = Date.now();
            var next = events.filter(function (g) { return g.state === 'pre' && Date.parse(g.date) > now - 5 * 60000; })[0] || null;
            var last = events.filter(function (g) { return g.state === 'post'; }).slice(-1)[0] || null;
            if (current && current.state === 'post') last = current;
            if (current && current.state === 'pre' && (!next || Date.parse(current.date) < Date.parse(next.date))) next = current;
            entry = {
              league: t.league.toUpperCase(), name: team.shortDisplayName || team.name, abbr: team.abbreviation,
              logo: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/' + t.league + '/500-dark/' + t.team + '.png&h=144&w=144',
              record: ((team.record && team.record.items) || [])[0] ? team.record.items[0].summary : '',
              color: team.color || '', altColor: team.alternateColor || '',
              live: current && current.state === 'in' ? current : null, next: next, last: last
            };
          }
          odds(t, entry && entry.next, cache, function (o) {
            if (entry && entry.next) entry.next.odds = o;
            out[i] = entry;
            if (--pending === 0) {
              // Drop cached lines for games that are no longer anyone's next game.
              Object.keys(cache).forEach(function (k) { if (k.indexOf('odds/') === 0 && Date.now() - cache[k].at > 2 * 86400000) delete cache[k]; });
              writeCache(dir, cache); done(out.filter(Boolean));
            }
          });
        });
      });
    });
  };
};
