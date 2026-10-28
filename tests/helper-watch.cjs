// Home declines LG's screensaver itself and, when Home Helper stops answering, offers one-press
// "Turn it back on" (action focused); a helper that answers is never nagged.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function run(helperAnswers){
  const calls=[],timers=[],confirms=[],listeners={};let saverCb;
  function Bridge(){}
  Bridge.prototype.cancel=function(){};
  Bridge.prototype.call=function(uri,raw){const p=JSON.parse(raw);calls.push({uri,p});const cb=this.onservicecallback;
    if(uri.endsWith('registerScreenSaverRequest')){saverCb=cb;cb(JSON.stringify({returnValue:true,subscribed:true}));return;}
    if(uri.endsWith('/homeStatus'))cb(JSON.stringify(helperAnswers()?{returnValue:true,enabled:true}:{returnValue:false,errorText:'Home Helper did not respond'}));
    if(uri.endsWith('/launch'))cb(JSON.stringify({returnValue:true}));};
  const document={hidden:false,getElementById:()=>null,addEventListener:(n,f)=>{listeners[n]=f;}};
  const ctx={PalmServiceBridge:Bridge,document,JSON,setTimeout:(fn,ms)=>{if(ms!==15000&&ms!==8000)timers.push({fn,ms});return timers.length+1;},clearTimeout(){},
    window:{HomeI18n:{confirm:(o,cb)=>confirms.push({o,cb})}}};
  vm.runInNewContext(fs.readFileSync('launcher/helper-watch.js','utf8'),ctx);
  const step=()=>{const t=timers.shift();t.fn();return t.ms;};
  return {calls,timers,confirms,step,saver:m=>saverCb(JSON.stringify(m))};
}
let r=run(()=>false);
r.saver({timestamp:'123'});
const decline=r.calls.find(c=>c.uri.endsWith('responseScreenSaverRequest'));
assert(decline&&decline.p.ack===false&&decline.p.timestamp==='123','LG screensaver must be declined');
assert.equal(r.step(),20000);assert.equal(r.confirms.length,0,'one miss is not enough');
assert.equal(r.step(),10000);assert.equal(r.confirms.length,1,'two misses offer to turn it back on');
assert.equal(r.confirms[0].o.focusAction,true);assert.equal(r.confirms[0].o.action,'Turn it back on');
r.confirms[0].cb();
const launch=r.calls.find(c=>c.uri.endsWith('/launch'));
assert.equal(launch.p.id,'com.local.nativehome');assert.equal(launch.p.params.nativeHomeStart,true);
let up=true;r=run(()=>up);
assert.equal(r.step(),20000);assert.equal(r.step(),60000,'a running helper is checked again in a minute');
up=false;assert.equal(r.step(),60000);assert.equal(r.step(),10000);assert.equal(r.confirms.length,1,'a helper that goes off later is noticed');
console.log('PASS helper watch: screensaver declined, one-press restart offered only when Helper is off');
