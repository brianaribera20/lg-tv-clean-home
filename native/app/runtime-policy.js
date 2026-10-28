'use strict';
exports.expired=function(last,now){return now-last>2500;};
exports.shouldBlock=function(code,signal){return !!signal||code!==25;};
// Only the five-Home emergency stop (27) or a deliberate stop (0, 22) leaves the helper off.
// Every other exit (a stall where the relay exits 20 or the watchdog kills it, a crash, a lost
// device) restarts it without leaving the app on screen. 25 is the remote going away at
// power-off; the wake starts the helper again, as before.
exports.shouldRestart=function(code,signal,watchdog){return !!watchdog||!!signal||[0,22,25,27].indexOf(code)<0;};
exports.isStall=function(code,watchdog){return code===20||!!watchdog;};
// Never give up: after 3 restarts in 30 minutes, wait 5 minutes between tries instead of 3 s.
exports.RESTART_WINDOW=30*60000;exports.RESTART_LIMIT=3;exports.RESTART_DELAY=3000;exports.BACKOFF_DELAY=5*60000;
exports.allowRestart=function(history,now){
 var recent=(Array.isArray(history)?history:[]).filter(function(t){return typeof t==='number'&&now-t>=0&&now-t<exports.RESTART_WINDOW;});
 return {allowed:true,delay:recent.length<exports.RESTART_LIMIT?exports.RESTART_DELAY:exports.BACKOFF_DELAY,history:recent.slice(-9).concat([now])};
};
