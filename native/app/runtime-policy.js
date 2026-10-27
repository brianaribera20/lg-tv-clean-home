'use strict';
exports.expired=function(last,now){return now-last>2500;};
exports.shouldBlock=function(code,signal){return !!signal||code!==25;};
// A stall: the controller and relay lost contact for over 2 s (the TV paused the helper under
// load). The relay exits 20, or the controller's watchdog kills it. That is not a fault in the
// remote, so the helper restarts itself instead of latching off; the triple-Home emergency stop
// (27) and every other exit still latch. At most 3 restarts in 30 minutes, so a stall that keeps
// coming back still ends in the safe stopped state.
exports.isStall=function(code,watchdog){return code===20||!!watchdog;};
exports.RESTART_WINDOW=30*60000;exports.RESTART_LIMIT=3;
exports.allowRestart=function(history,now){
 var recent=(Array.isArray(history)?history:[]).filter(function(t){return typeof t==='number'&&now-t>=0&&now-t<exports.RESTART_WINDOW;});
 return {allowed:recent.length<exports.RESTART_LIMIT,history:recent.concat(recent.length<exports.RESTART_LIMIT?[now]:[])};
};
