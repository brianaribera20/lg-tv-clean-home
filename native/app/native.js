'use strict';
var fs=require('fs'),cp=require('child_process'),policy=require('./runtime-policy');
function monotonic(){var t=process.hrtime();return t[0]*1000+t[1]/1e6;}
var root='/media/developer/apps/usr/palm/applications/com.local.nativehome';
var data=root+'/state';
// Files shared with Home's settings service. state/ is private to this process (0770), and the
// service runs as another user in its own sandbox: the one folder both can see and write is
// Home's service folder (probed on the TV 25 Oct 2026), so requests, replies and the power-on
// switch live in its ipc/ (0777, files 0666). A Home reinstall can empty it; see syncWake.
var ipc='/media/developer/apps/usr/palm/services/com.gathin.tvhome.renewal/ipc';
function ensureIpc(){try{fs.mkdirSync(ipc);}catch(e){}try{fs.chmodSync(ipc,511);}catch(e){}}
ensureIpc();
var launchParams=JSON.parse(process.argv[2]||'{}'),automatic=launchParams.nativeHomeAuto===true;
// Optional app to open when the TV is switched on (wake-app.json: {"id":"..."}); Home otherwise.
var wakeApp=null;try{wakeApp=JSON.parse(fs.readFileSync(root+'/wake-app.json','utf8')).id||null;}catch(e){}
// Home settings can switch it off (state/wake.json {"enabled":false}); read at each wake.
// The switch lives in ipc/wake.json; a private copy in state/ restores it if a Home
// reinstall wiped ipc/, so the choice survives updates.
function syncWake(){
 var shared=null,own=null;
 try{shared=fs.readFileSync(ipc+'/wake.json','utf8');}catch(e){}
 try{own=fs.readFileSync(data+'/wake.json','utf8');}catch(e){}
 if(shared!==null&&shared!==own){try{fs.writeFileSync(data+'/wake.json',shared,{mode:420});}catch(e){}return shared;}
 if(shared===null&&own!==null){ensureIpc();try{fs.writeFileSync(ipc+'/wake.json',own,{mode:438});fs.chmodSync(ipc+'/wake.json',438);}catch(e){}}
 return own;
}
function wakeTarget(){if(!wakeApp)return null;try{if(JSON.parse(syncWake()).enabled===false)return null;}catch(e){}return wakeApp;}
// After a wake the TV restores its last input (Home) a few seconds later; keep the wake app on top.
var wakeUntil=0,wakeTries=0,wakeId=null;
function block(){fs.writeFileSync(data+'/blocked','stopped',{mode:420});}
require('./state-permissions')(data,function(x){console.error(JSON.stringify(x));});
if(automatic&&fs.existsSync(data+'/blocked'))process.exit(0);
var logPath=data+'/controller.log', pidPath=data+'/controller.pid';
fs.writeFileSync(pidPath,String(process.pid));fs.writeFileSync(logPath,'');
function log(x){
 try{fs.appendFileSync(logPath,JSON.stringify(Object.assign({time:Date.now()},x))+'\n');}
 catch(e){try{console.error('Helper log failed: '+String(e));console.error(x);}catch(ignore){}}
}
process.on('uncaughtException',function(e){
 try{block();}catch(ignore){}
 log({error:String(e),stack:e&&e.stack});
 setTimeout(function(){process.exit(2);},2500);
 try{if(child)child.stdin.end();}catch(ignore){}
});
var Service=require('/usr/lib/node_modules/webos-service');
var service=new Service('com.local.nativehome');
service.activityManager.create('native-home-controller',function(){});
if(!automatic){try{fs.unlinkSync(data+'/blocked');}catch(e){if(e.code!=='ENOENT')throw e;}}
var lastForeground=null,lastForegroundAt=null,monitor='starting',monitorReason=null,shouldResumeLaunch=require('./resume-policy');
var child,ready=false,stopping=false,lastAck=monotonic(),buffer='',lastCommand='',launching=false,resumePendingUntil=0;
var resumeGuardUntil=0,resumeRetries=0,lgHomeSince=null,lastLaunchSettledAt=0;
// Opt-in, bounded observation only; never changes routing or starts another watcher.
var diagnosticUntil=0,diagnosticNext=0,homeSequence=0,lastHomeAt=null,launchSequence=0,diagnosticSession=null;
function diagnostic(trigger,details){
 if(!diagnosticUntil)return;
 var now=monotonic();
 if(now>=diagnosticUntil&&trigger!=='expired'){diagnostic('expired');diagnosticUntil=0;return;}
 log(Object.assign({event:'home-diagnostic',session:diagnosticSession,trigger:trigger,homeSequence:homeSequence,
  sinceHomeMs:lastHomeAt===null?null:Math.round(now-lastHomeAt),
  foreground:lastForeground,foregroundSource:'subscription-cache',
  foregroundAgeMs:lastForegroundAt===null?null:Math.round(now-lastForegroundAt),
  monitor:monitor,monitorReason:monitorReason,ready:ready,enabled:homeControl?homeControl.enabled():null,
  launching:launching,visitingLG:!!visitingLG},details||{}));
}
function diagnosticCommand(cmd,nonce){
 if(cmd==='diagnostics-start'){
  diagnosticSession=typeof nonce==='string'&&/^[a-f0-9]{32}$/.test(nonce)?nonce:null;
  diagnosticUntil=monotonic()+60000;diagnosticNext=monotonic()+1000;
  homeSequence=0;lastHomeAt=null;diagnostic('started',{durationMs:60000});
 }
 if(cmd==='diagnostics-stop'){diagnostic('stopped');diagnosticUntil=0;}
}
function screenLog(x){
 if(x.event.indexOf('screen-watch-')===0){monitor=x.event;monitorReason=x.reason||null;}
 log(x);diagnostic('monitor');
}
function cancelResume(){resumePendingUntil=0;resumeGuardUntil=0;lgHomeSince=null;}
log({event:'start',pid:process.pid,uid:process.getuid(),automatic:automatic,diagnosticsSchema:1});
fs.writeFileSync(data+'/control.json','{}',{mode:432});fs.chmodSync(data+'/control.json',432);
function launch(id,done,params){var request=++launchSequence;diagnostic('launch-request',{launchSequence:request,id:id});var settled=false;var deadline=setTimeout(function(){if(settled)return;settled=true;lastLaunchSettledAt=monotonic();log({event:'launch-timeout',id:id});diagnostic('launch-timeout',{launchSequence:request,id:id});if(done)done(false);},3000);service.call('luna://com.webos.applicationManager/launch',params?{id:id,params:params}:{id:id},function(m){if(settled)return;settled=true;lastLaunchSettledAt=monotonic();clearTimeout(deadline);log({event:'launch',id:id,result:m.payload});diagnostic('launch-result',{launchSequence:request,id:id,returnValue:!!(m.payload&&m.payload.returnValue===true)});if(done)done(m.payload&&m.payload.returnValue===true);});}
var visitingLG=false,suppressReturnUntil=0;
function visitLG(done){
 if(visitingLG){if(done)done(false);return;}
 visitingLG=true;cancelResume();suppressReturnUntil=monotonic()+7000;
 var deadline=monotonic()+3500;
 function open(){
  if(launching&&monotonic()<deadline){setTimeout(open,50);return;}
  if(launching||stopping){visitingLG=false;if(done)done(false);return;}
  if(screenPolicy)screenPolicy.reset();
  launch('com.webos.app.home',function(ok){visitingLG=false;if(done)done(ok);});
 }
 open();
}
var homeControl=require('./home-control')(fs,data,function(enabled){
 cancelResume();if(screenPolicy)screenPolicy.reset();
 if(child)child.stdin.write(enabled?'E':'D');
},visitLG);
var lastHomeRequest='';
function readHomeRequest(){
 var request;
 try{request=JSON.parse(fs.readFileSync(ipc+'/home-request.json','utf8'));}catch(e){return;}
 if(!request||typeof request.id!=='string'||!/^[a-f0-9]{32}$/.test(request.id)||request.id===lastHomeRequest)return;
 lastHomeRequest=request.id;
 if(typeof request.expires!=='number'||request.expires<Date.now()||request.expires>Date.now()+6000)return;
 function respond(result){
  result.id=request.id;
  try{fs.writeFileSync(ipc+'/home-response.tmp',JSON.stringify(result),{mode:438});fs.chmodSync(ipc+'/home-response.tmp',438);fs.renameSync(ipc+'/home-response.tmp',ipc+'/home-response.json');}catch(e){log({event:'home-response-error',error:String(e)});}
 }
 try{
  if(request.method==='homeStatus')respond({returnValue:true,enabled:homeControl.enabled()});
  else if(request.method==='setHomeControl'){homeControl.set(request.enabled);respond({returnValue:true,enabled:homeControl.enabled()});}
  else if(request.method==='openLGHome')visitLG(function(ok){respond({returnValue:ok});});
  else respond({returnValue:false,errorText:'Invalid Home request'});
 }catch(e){respond({returnValue:false,errorText:String(e)});}
}
function finish(code,signal){if(stopping)return;stopping=true;if(screenWatch)screenWatch.close();clearInterval(timer);log({event:'worker-exit',code:code,signal:signal});if(policy.shouldBlock(code,signal))fs.writeFileSync(data+'/blocked','stopped',{mode:420});
 function end(){try{fs.unlinkSync(pidPath);}catch(e){}process.exit(code===22?0:(code||0));}
 // Let an already-issued custom-Home request settle before the final LG launch.
 var finishDeadline=monotonic()+3200;
 function cleaned(){if(code!==22){end();return;}
  if(launching&&monotonic()<finishDeadline){setTimeout(cleaned,50);return;}
  launch('com.webos.app.home',function(){setTimeout(end,300);});
 }
 if(ready){var c=cp.spawn(root+'/relay',['cleanup'],{stdio:'ignore'});c.on('exit',function(n){log({event:'cleanup',code:n});cleaned();});}else cleaned();
}
function start(){lastAck=monotonic();child=cp.spawn(root+'/relay',[],{stdio:['pipe','pipe','pipe']});log({event:'worker-start',pid:child.pid});child.stderr.on('data',function(b){log({stderr:String(b)});});child.on('error',function(e){log({error:String(e)});finish(1);});child.on('exit',finish);
 child.stdout.on('data',function(b){buffer+=b;var i;while((i=buffer.indexOf('\n'))>=0){var line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(line==='P'){lastAck=monotonic();continue;}if(line==='ACT'){activity();continue;}log({event:'worker',message:line});if(line==='BACK_DOWN'){cancelResume();screenPolicy.back(true,monotonic());}if(line==='BACK_UP')screenPolicy.back(false,monotonic());if(line==='HOME'){wakeUntil=0;screenPolicy.clearBack();homeSequence++;lastHomeAt=monotonic();diagnostic('home');}if(line==='READY'){ready=true;lastAck=monotonic();child.stdin.write(homeControl.enabled()?'E':'D');}if(line==='LGHOME'&&!stopping)visitLG();if(line==='HOME'&&homeControl.enabled()&&!visitingLG&&!stopping&&!launching){suppressReturnUntil=0;launching=true;launch('com.gathin.tvhome',function(ok){launching=false;if(!ok)child.stdin.end();});}}});
 child.stdin.on('error',function(){});
}
var timer=setInterval(function(){if(stopping)return;readHomeRequest();periodic();try{var raw=fs.readFileSync(data+'/control.json','utf8');if(raw!==lastCommand){lastCommand=raw;var command=JSON.parse(raw);diagnosticCommand(command.cmd,command.nonce);if(command.cmd==='startup-status')service.call('luna://com.local.nativehome.service/status',{},function(r){log({event:'startup-status',result:r.payload});});if(command.cmd==='stop'&&child)child.stdin.write('Q');if(command.cmd==='renew-now'&&renewer)renewer.run(true);if(command.cmd==='settings')tvSettings(command);if(command.cmd==='stall-worker'&&child)child.stdin.write('S');if(command.cmd==='stall-controller'){cp.spawn(root+'/resume',[String(process.pid)],{stdio:'ignore'});log({event:'simulate-controller-stall'});process.kill(process.pid,'SIGSTOP');}}}catch(e){}
 if(resumePendingUntil&&ready&&!launching&&!visitingLG&&homeControl.enabled()){
  var resumeDue=resumePendingUntil;resumePendingUntil=0;
  var target=wakeTarget();if(target){wakeId=target;wakeUntil=monotonic()+12000;wakeTries=0;}
  if(target?lastForeground===target:!shouldResumeLaunch(lastForeground)){log({event:'resume-already-foreground'});}
  else if(monotonic()<=resumeDue){launching=true;log({event:'resume-launch',id:target||'com.gathin.tvhome'});launch(target||'com.gathin.tvhome',function(ok){launching=false;if(!ok)log({event:'resume-launch-failed'});});}
 }
 // A successful Luna reply only acknowledges the request. LG Home can win
 // later, including while a launch is in flight, so check the current level.
 var now=monotonic();
 if(diagnosticUntil&&now>=diagnosticNext){diagnostic('sample');diagnosticNext=now+1000;}
 if(resumeGuardUntil&&now>=resumeGuardUntil)cancelResume();
 if(resumeGuardUntil&&resumeRetries<2&&ready&&!launching&&!visitingLG&&homeControl.enabled()&&
    lastForeground==='com.webos.app.home'&&lgHomeSince!==null&&now-lgHomeSince>=1500&&now-lastLaunchSettledAt>=5000){
  resumeRetries++;launching=true;log({event:'resume-retry',attempt:resumeRetries});
  launch(wakeTarget()||'com.gathin.tvhome',function(ok){launching=false;if(!ok)log({event:'resume-retry-failed'});});
 }
 if(child){if(policy.expired(lastAck,monotonic())){log({event:'worker-watchdog'});child.kill('SIGKILL');return;}child.stdin.write('P');}
},400);
setTimeout(function(){if(!homeControl.enabled()){start();return;}launch('com.gathin.tvhome',function(ok){if(ok)start();else {block();process.exit(3);}
 var target=ok&&automatic&&wakeTarget();if(target){wakeId=target;wakeUntil=monotonic()+15000;wakeTries=0;setTimeout(function(){launch(target,function(w){if(!w)log({event:'wake-app-failed',id:target});});},1500);}});},automatic?0:1000);


process.on('exit',function(code){log({event:'controller-exit',code:code});});

service.call('luna://com.local.nativehome.service/status',{},function(m){
 log({event:'startup-status',result:m.payload});
 if(!m.payload||!m.payload.returnValue||(m.payload.state.enabled&&m.payload.state.schema===3))return;
 service.call('luna://com.local.nativehome.service/enable',{},function(a){
  if(!a.payload||!a.payload.returnValue){log({event:'startup-arm-error',result:a.payload});return;}
  service.call('luna://com.palm.activitymanager/create',{activity:{name:'com.local.nativehome.boot',description:'Bounded Native Home once per boot',type:{foreground:true,persist:true},schedule:{interval:'10s',precise:true},callback:{method:'luna://com.local.nativehome.service/tick',params:{}}},start:true,replace:true,subscribe:false},function(r){log({event:'startup-create',result:r.payload});});
 });
});

var powerPolicy=require('./power-policy')();
var watchedApps=[];try{watchedApps=JSON.parse(fs.readFileSync(data+'/apps.json','utf8'));if(!Array.isArray(watchedApps))watchedApps=[];}catch(e){}
var screenPolicy=require('./screen-policy')(watchedApps);
var screenWatch=require('./screen-watch')(data,screenLog,function(id){
 if(id==='com.webos.app.home'){if(lgHomeSince===null)lgHomeSince=monotonic();}
 else {lgHomeSince=null;if(id&&id!=='com.webos.app.cpcover'&&id!=='com.gathin.tvhome')cancelResume();}
 if(wakeUntil&&monotonic()<wakeUntil&&wakeTries<3&&!launching&&!visitingLG&&(id==='com.gathin.tvhome'||id==='com.webos.app.home')){
  wakeTries++;launching=true;log({event:'wake-relaunch',id:wakeId,attempt:wakeTries});launch(wakeId,function(){launching=false;});
 }
 lastForeground=id;lastForegroundAt=monotonic();log({event:'foreground',id:id});diagnostic('foreground');
 var exited=screenPolicy.next(id,monotonic());
 if(exited&&homeControl.enabled()&&!visitingLG&&monotonic()>suppressReturnUntil&&ready&&!stopping&&!launching){
  resumeGuardUntil=monotonic()+30000;resumeRetries=0;
  launching=true;log({event:'return-after-exit'});
  launch('com.gathin.tvhome',function(ok){launching=false;if(!ok)log({event:'return-after-exit-failed'});});
 }
},function(){lastForeground=null;lastForegroundAt=null;monitor='reset';monitorReason=null;lgHomeSince=null;screenPolicy.reset();diagnostic('monitor-reset');},function(p){
 log({event:'power',state:p.state,processing:p.processing,onOff:p.onOff});
 screenOn=p.state==='Active'&&p.onOff!=='off';if(p.state==='Active'&&!p.processing)activity();
 if(p.onOff==='off'||p.state==='Active Standby'||p.state==='Suspend'){cancelResume();wakeUntil=0;}
 if(powerPolicy.next(p)&&homeControl.enabled()&&!visitingLG&&!stopping){
  var now=monotonic();resumePendingUntil=now+10000;resumeGuardUntil=now+30000;resumeRetries=0;
  lgHomeSince=lastForeground==='com.webos.app.home'?now:null;
 }
});

// ---- Idle: Home's clock screen after 1 hour without remote activity, power off after 5 hours
// (2 hours turned the TV off mid-show; 5 chosen 27 Oct 2026).
// LG's own screensaver is always declined; ours replaces it once the hour has passed.
var IDLE_CLOCK=60*60000,IDLE_WARN=299*60000,IDLE_OFF=300*60000;
var lastActivity=monotonic(),idleStage=0,screenOn=true;
function activity(){lastActivity=monotonic();if(idleStage){log({event:'idle-reset',stage:idleStage});idleStage=0;}}
function showClock(){idleStage=1;log({event:'idle-clock'});launch('com.gathin.tvhome',null,{screensaver:true});}
// Every 15 s from the main 0.4 s loop (no extra timers): keep the power-on switch in sync and
// run the idle steps.
var lastPeriodic=0;
function periodic(){
 var now=monotonic();if(now-lastPeriodic<15000)return;lastPeriodic=now;
 syncWake();
 if(stopping||!screenOn)return;
 var idle=now-lastActivity;
 if(idle>=IDLE_OFF&&idleStage<3){idleStage=3;log({event:'idle-power-off'});if(screenWatch)screenWatch.request('ssap://system/turnOff',{});return;}
 if(idle>=IDLE_WARN&&idleStage<2){idleStage=2;log({event:'idle-warning'});if(screenWatch)screenWatch.request('ssap://system.notifications/createToast',{message:'The TV will turn off in 1 minute. Press any button to keep watching.'});return;}
 if(idle>=IDLE_CLOCK&&idleStage<1&&(lastForeground==='com.gathin.tvhome'||lastForeground==='com.webos.app.home'))showClock();
}
try{
 service.subscribe('luna://com.webos.service.tvpower/power/registerScreenSaverRequest',{subscribe:true,clientName:'com.local.nativehome'}).on('response',function(m){
  var p=m.payload||{};
  if(typeof p.timestamp==='undefined'){log({event:'screensaver-register',result:p});return;}
  service.call('luna://com.webos.service.tvpower/power/responseScreenSaverRequest',{clientName:'com.local.nativehome',ack:false,timestamp:p.timestamp},function(r){log({event:'screensaver-declined',result:r.payload&&r.payload.returnValue});});
  if(monotonic()-lastActivity>=IDLE_CLOCK&&idleStage<1)showClock();
 });
}catch(e){log({event:'screensaver-register-error',error:String(e)});}

// Developer Mode renewal on the TV itself (renew.js); runs regardless of Home control.
var renewer=require('./renew')(data,log);

// LG system settings (power-on behaviour, auto power-off), driven from the computer through
// control.json: {"cmd":"settings","method":"getSystemSettings"|"setSystemSettings","payload":{...}}.
// Limited to the settings service; the TV's answer is logged.
function tvSettings(command){
 if(['getSystemSettings','setSystemSettings'].indexOf(command.method)<0||!command.payload)return log({event:'settings',error:'invalid'});
 service.call('luna://com.webos.settingsservice/'+command.method,command.payload,function(m){log({event:'settings',method:command.method,request:command.payload,result:m.payload});});
}
