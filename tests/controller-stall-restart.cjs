// A stall (relay exit 20 or the controller's watchdog) restarts the helper without opening Home;
// the triple-Home emergency stop (27) still latches, and repeated stalls fall back to the latch.
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),EventEmitter=require('events');
const policy=require('../native/app/runtime-policy');
const STATE='/media/developer/apps/usr/palm/applications/com.local.nativehome/state';
function run(how,history){
  let now=1000,worker,tick,exited=null;const timers=[],spawns=[],launches=[],files=new Map(),log=[];
  if(history)files.set(STATE+'/restarts.json',JSON.stringify(history));
  function Service(){this.register=()=>{};this.activityManager={create(){}};this.call=(uri,p,cb)=>{if(uri.endsWith('/launch'))launches.push(p.id);cb({payload:{returnValue:true,state:{enabled:true,schema:3}}});};}
  const fakefs={existsSync:p=>files.has(p),writeFileSync:(p,s)=>files.set(p,s),renameSync(a,b){files.set(b,files.get(a));files.delete(a);},chmodSync(){},mkdirSync(){},
    unlinkSync:p=>files.delete(p),appendFileSync:(p,s)=>{if(p.endsWith('controller.log'))log.push(JSON.parse(s));},
    readFileSync(p){if(files.has(p))return files.get(p);const e=new Error('missing');e.code='ENOENT';throw e;}};
  function spawn(cmd,args){const c=new EventEmitter();c.stdout=new EventEmitter();c.stderr=new EventEmitter();c.stdin=new EventEmitter();c.stdin.write=()=>{};c.stdin.end=()=>{};c.kill=()=>{};c.unref=()=>{};c.pid=spawns.length+2;
    spawns.push({cmd,args});if(args&&args[0]==='cleanup')setImmediate(()=>c.emit('exit',0));else if(!/node$/.test(cmd))worker=c;return c;}
  const context={Buffer,JSON,Date,require(n){if(n==='./state-permissions')return()=>true;if(n==='fs')return fakefs;if(n==='child_process')return{spawn};if(n==='/usr/lib/node_modules/webos-service')return Service;
      if(n==='./screen-watch')return()=>({close(){}});return require('../native/app/'+n.slice(2));},
    process:{argv:['node','app','{"nativeHomeAuto":true}'],execPath:'/usr/bin/node',pid:1,getuid:()=>5431,hrtime:()=>[Math.floor(now/1000),(now%1000)*1e6],on(){},exit(c){exited=c;}},
    setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval(fn){tick=fn;return 1;},clearInterval(){},setImmediate};
  vm.runInNewContext(fs.readFileSync('native/app/native.js','utf8'),context);
  timers.find(t=>t.ms===0).fn();worker.stdout.emit('data',Buffer.from('READY\n'));
  if(how==='watchdog'){now+=3000;tick();worker.emit('exit',null,'SIGKILL');}
  else{files.set(STATE+'/blocked','stopped');worker.emit('exit',how,null);}   // the relay writes the latch itself
  return new Promise(res=>setImmediate(()=>setImmediate(()=>{timers.filter(t=>t.ms===300).forEach(t=>t.fn());
    const restart=spawns.find(s=>/node$/.test(s.cmd));
    res({exited,blocked:files.has(STATE+'/blocked'),restart,launches,log,history:files.has(STATE+'/restarts.json')?JSON.parse(files.get(STATE+'/restarts.json')):null});})));
}
(async()=>{
  let r=await run(20);
  assert.equal(r.blocked,false,'a stall must not leave the safety latch');
  assert(r.restart,'a stall must start a fresh controller');
  assert.equal(JSON.parse(r.restart.args.at(-1)).nativeHomeRestart,true);
  assert(r.log.some(e=>e.event==='stall-restart'));
  r=await run('watchdog');
  assert.equal(r.blocked,false,'a watchdog stall must not latch');assert(r.restart);
  r=await run(27);
  assert.equal(r.blocked,true,'triple-Home must latch');assert.equal(r.restart,undefined,'triple-Home must not restart');
  const t=Date.now();r=await run(20,[t-1000,t-2000,t-3000]);
  assert.equal(r.blocked,true,'a fourth stall within 30 minutes must latch');assert.equal(r.restart,undefined);
  r=await run(20,[t-31*60000,t-40*60000,t-50*60000]);
  assert.equal(r.blocked,false,'old restarts expire');assert.equal(r.history.length,1);
  assert.equal(policy.isStall(27,false),false);assert.equal(policy.isStall(20,false),true);
  console.log('PASS stall restart: stalls restart quietly, triple-Home and repeated stalls latch');
})().catch(e=>{console.error(e);process.exit(1);});
