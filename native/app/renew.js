'use strict';
// Developer Mode renewal from the TV itself, inside Home Helper (which is always running).
// Checks the session with LG a minute after start and then every 6 hours; when less than
// 960 hours remain it asks LG to reset it, which tops the session back up to the maximum
// (~1000 h, confirmed 25 Oct 2026). So any day the TV is on and online, the timer refills.
// The token is read fresh each time and never logged. Last result: state/renew.json.
var fs = require('fs'), https = require('https');
var TOKEN = '/var/luna/preferences/devmode_enabled', THRESHOLD = 960 * 3600, EVERY = 6 * 3600000;
var BUNDLE = '/media/developer/apps/usr/palm/services/com.gathin.tvhome.renewal/ca-bundle.crt';
var SHARED = '/media/developer/apps/usr/palm/services/com.gathin.tvhome.renewal/ipc/renew.json';

module.exports = function (data, log) {
  function ask(op, token, ca, done) {
    var finished = false;
    function end(err, body) { if (!finished) { finished = true; done(err, body); } }
    var options = {hostname: 'developer.lge.com', port: 443, method: 'GET', agent: false,
      path: '/secure/' + op + 'DevModeSession.dev?sessionToken=' + encodeURIComponent(token),
      headers: {Accept: 'application/json'}, timeout: 20000};
    if (ca) options.ca = ca;
    var req = https.request(options, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try { end(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { end(Error('bad-response')); }
      });
    });
    req.on('timeout', function () { req.abort(); end(Error('timeout')); });
    req.on('error', function (e) { end(e); });
    req.end();
  }
  // Some TV firmware lacks current root certificates; fall back to Home's bundled store.
  function call(op, token, done) {
    ask(op, token, null, function (err, body) {
      if (!err || !/CERT|certificate|issuer/i.test(String(err.code || err.message))) return done(err, body);
      var ca; try { ca = fs.readFileSync(BUNDLE, 'utf8'); } catch (e) { return done(err); }
      ask(op, token, ca, done);
    });
  }
  function seconds(body) {
    var m = body && body.result === 'success' && /^(\d{1,6}):([0-5]\d):([0-5]\d)$/.exec(body.errorMsg || '');
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  }
  function save(result) {
    result.time = Date.now();
    try { fs.writeFileSync(data + '/renew.json', JSON.stringify(result), {mode: 420}); } catch (e) {}
    // Copy for Home's settings page, in the folder both apps can read (see native.js ipc).
    try { fs.writeFileSync(SHARED, JSON.stringify(result), {mode: 438}); fs.chmodSync(SHARED, 438); } catch (e) {}
    log(Object.assign({event: 'devmode-renew'}, result));
  }
  function run(force) {
    var token;
    try { token = fs.readFileSync(TOKEN, 'utf8').trim(); } catch (e) { return save({status: 'no-token'}); }
    if (!/^[A-Za-z0-9]{1,4096}$/.test(token)) return save({status: 'no-token'});
    call('Check', token, function (err, body) {
      var before = seconds(body);
      if (err || before === null) return save({status: 'check-failed', error: err ? String(err.code || err.message) : String(body && body.errorMsg)});
      if (!force && before >= THRESHOLD) return save({status: 'ok', hoursLeft: Math.floor(before / 3600)});
      call('Reset', token, function (err2) {
        if (err2) return save({status: 'reset-failed', hoursLeft: Math.floor(before / 3600), error: String(err2.code || err2.message)});
        call('Check', token, function (err3, body3) {
          var after = seconds(body3);
          save({status: after !== null && after > before + 60 ? 'renewed' : 'renew-unconfirmed',
            hoursBefore: Math.floor(before / 3600), hoursLeft: after === null ? null : Math.floor(after / 3600)});
        });
      });
    });
  }
  // unref: these must never be what keeps a process alive (tests load the controller in a VM).
  var first = setTimeout(run, 60000), every = setInterval(run, EVERY);
  if (first.unref) { first.unref(); every.unref(); }
  return {run: run};
};
