#!/usr/bin/env node
// Diagnostic only: keep both readers until the live cutover gate is satisfied.
import {spawn} from 'node:child_process';
import {appendFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {AppBridge} from '../plugins/token-monitor-embedded/server/dist/app-bridge.mjs';
import {resolveCodex} from '../plugins/token-monitor-embedded/server/dist/legacy-allowances.mjs';
export function comparable(value){
 const buckets=value?.rateLimitsByLimitId!==undefined?value.rateLimitsByLimitId:{legacy:value?.rateLimits};
 return {ordinaryUsageAllowed:value?.ordinaryUsageAllowed??null,buckets:!buckets||typeof buckets!=='object'?null:Object.fromEntries(Object.entries(buckets).sort(([a],[b])=>a.localeCompare(b)).map(([key,b])=>[key,{primary:window(b?.primary),secondary:window(b?.secondary)}]))};
}
function window(w){return w?{usedPercent:w.usedPercent??null,windowDurationMins:w.windowDurationMins??null,resetsAt:w.resetsAt??null}:null;}
export function known(value){
 const c=comparable(value),windows=Object.values(c.buckets??{}).flatMap(b=>[b.primary,b.secondary]).filter(Boolean);
 return typeof c.ordinaryUsageAllowed==='boolean'&&windows.length>0&&windows.every(w=>typeof w.usedPercent==='number'&&Number.isFinite(w.usedPercent)&&w.usedPercent>=0&&typeof w.resetsAt==='number'&&Number.isFinite(w.resetsAt)&&typeof w.windowDurationMins==='number'&&w.windowDurationMins>0);
}
export function compare(a,b){return JSON.stringify(comparable(a))===JSON.stringify(comparable(b));}
async function cliRead(){
 const command=resolveCodex();if(!command)throw Error('Codex executable unavailable');
 const child=spawn(command,['app-server','--listen','stdio://'],{stdio:'pipe'});child.stderr.resume();let buffer='',serial=0;const pending=new Map();
 const fail=()=>{for(const reject of pending.values())reject({error:true});};child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail);
 child.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>1048576){fail();child.kill();return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const m=JSON.parse(line);pending.get(m.id)?.(m);}catch{}}});
 const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Usage request timed out'));},15000);pending.set(id,m=>{clearTimeout(timer);pending.delete(id);m.error?reject(Error('Usage request failed')):resolve(m.result);});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
 try{await rpc('initialize',{clientInfo:{name:'token_monitor_comparison',version:'1'},capabilities:{experimentalApi:false}});child.stdin.write('{"method":"initialized"}\n');return await rpc('account/rateLimits/read',{});}finally{child.stdin.destroy();child.kill();}
}
async function main(){
 const [threadId,output,duration='1800']=process.argv.slice(2),seconds=Number(duration);
 if(!threadId||!output||!Number.isFinite(seconds)||seconds<0)throw Error('Usage: node scripts/compare-usage.mjs CHAT_ID OUTPUT_JSONL [SECONDS=1800]');
 const bridge=new AppBridge(),started=Date.now();let samples=0,errors=0,mismatchSince,prolonged=false,resetObserved=false,previous;
 do{
  const begin=Date.now();
  const read=async fn=>{try{return {ok:true,at:Date.now(),...(await fn()).result};}catch{return {ok:false,at:Date.now()};}};
  const capture=async fn=>{const start=Date.now();const value=await fn();if(!known(value))throw Error('Incomplete usage snapshot');return {result:{completedAt:Date.now(),durationMs:Date.now()-start,value:comparable(value)}};};
  const [old,current]=await Promise.all([read(()=>capture(cliRead)),read(()=>capture(()=>bridge.call('get_usage_limits',{},threadId)))]);
  samples++;const equal=old.ok&&current.ok&&JSON.stringify(old.value)===JSON.stringify(current.value);
  if(!old.ok||!current.ok)errors++;
  if(!equal){mismatchSince??=begin;if(begin-mismatchSince>=30000)prolonged=true;}else mismatchSince=undefined;
  const windows=Object.values(current.value?.buckets??{}).flatMap(b=>[b.primary,b.secondary]).filter(Boolean);
  if(equal&&previous)resetObserved ||= windows.some(w=>previous.some(p=>p.windowDurationMins===w.windowDurationMins&&typeof p.resetsAt==='number'&&begin>=p.resetsAt*1000&&w.resetsAt>p.resetsAt&&w.usedPercent<p.usedPercent));
  if(equal)previous=windows;
  await appendFile(output,JSON.stringify({observedAt:new Date(begin).toISOString(),old,current,equal})+'\n',{mode:0o600});
  if(Date.now()-started>=seconds*1000)break;
  await delay(Math.max(1,30000-(Date.now()-begin)));
 }while(true);
 const report={samples,errors,prolongedMismatch:prolonged,resetObserved,elapsedSeconds:(Date.now()-started)/1000};
 console.log(JSON.stringify({...report,gatePassed:report.elapsedSeconds>=1800&&errors===0&&!prolonged&&resetObserved}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
