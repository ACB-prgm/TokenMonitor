import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {build} from 'esbuild';

const result=await build({logOverride:{'empty-import-meta':'silent'},stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),contents:`
 export {PricingCache,bundledSnapshot} from './server/src/pricing-cache';
 export {bundledCatalog,parseCatalog} from './server/src/pricing';
 export {price,inputCost,estimateCompactionValue} from './server/src/metrics';
 export {TelemetryStore,Collector} from './server/src/collector';
 export {EfficiencyStore} from './server/src/efficiency';
`},bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};
new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {PricingCache,bundledSnapshot,bundledCatalog,parseCatalog,price,inputCost,estimateCompactionValue,TelemetryStore,Collector,EfficiencyStore}=mod.exports;
const host='https://raw.githubusercontent.com/ACB-prgm/TokenMonitor/main/pricing.json';
const promotion='2027-03-01T08:00:00Z';
const stamp='2026-11-18T00:00:00Z';
const sample={timestamp:stamp,model:'gpt-6.2-astra',input:100000,cached:0,cacheWrite:0,output:0,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true};
const catalogResponse=(catalog,etag='"example"')=>new Response(JSON.stringify(catalog),{headers:{etag}});
function fixture(t){
 const home=mkdtempSync(path.join(tmpdir(),'tm-pricing-'));
 t.after(()=>rmSync(home,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
 return home;
}

test('catalog resolves recorded date, aliases, tiers, context, region and promotions',()=>{
 const {rates}=bundledSnapshot.pricing;
 assert.equal(rates('gpt-6.2-astra','ultrafast',272000,false,'2027-03-01T07:59:59Z').input,24);
 assert.equal(rates('gpt-6.2-astra','ultrafast',272001,false,promotion).input,96);
 assert.equal(rates('gpt-6.2-astra','flex',272000,false,stamp),undefined);
 assert.equal(rates('gpt-6.2-astra','priority',1,false,stamp).input,16);
 assert.equal(rates('gpt-5.5','fast',272001,false,stamp),undefined);
 assert.equal(rates('gpt-5.5','standard',272001,true,stamp).cached,1.1);
 assert.equal(rates('gpt-5.6',undefined,1,false,'2026-11-30T23:59:59Z').input,4);
 assert.equal(rates('gpt-5.6',undefined,1,false,'2026-12-01T00:00:00Z'),undefined);
 assert.equal(price({...sample,timestamp:'2026-11-16T23:59:59Z'}).total,undefined);
 assert.equal(price({...sample,model:'gpt-5.5-pro'}).total,3);
 assert.equal(price({...sample,model:'gpt-5.5-pro',cached:1}).total,undefined);
 assert.equal(inputCost({...sample,cached:10000,cacheWrite:10000}),.744);
 const forecast={model:sample.model,serviceTier:'ultrafast',currentInput:100000,growthPerCall:2000,typicalOutput:2000};
 const before=estimateCompactionValue(forecast,bundledSnapshot.pricing,Date.parse(promotion)-1);
 const after=estimateCompactionValue(forecast,bundledSnapshot.pricing,Date.parse(promotion));
 assert.equal(after.compactionOverheadUsd,before.compactionOverheadUsd*2);
});

test('cache validates and atomically publishes one conditional request per cooldown',async t=>{
 const home=fixture(t);let time=0,respond;
 const cache=new PricingCache(home,async (url,options)=>{
  assert.equal(url,host);assert.equal(options.redirect,'error');assert.ok(options.signal);
  throw Error('offline');
 },()=>time);
 assert.equal(cache.snapshot().origin,'bundled');
 await cache.refresh();assert.equal(cache.snapshot().origin,'bundled');
 time+=300000;
 // The first successful fetch still has no validator.
 const ready=new PricingCache(home,async (url,opts)=>{
  assert.equal(url,host);assert.deepEqual(opts.headers,{});
  return new Promise(resolve=>{respond=resolve;});
 },()=>time);
 const catalog=structuredClone(bundledCatalog);
 catalog.models['gpt-6.2-astra'][0].tiers.standard.base.input=7;
 const pending=ready.refresh();assert.equal(ready.refresh(),pending);
 let otherRequests=0;
 const other=new PricingCache(home,async()=>{otherRequests++;return new Response(null,{status:304});},()=>time);
 await other.refresh();assert.equal(otherRequests,0);
 assert.equal(ready.snapshot().origin,'bundled');
 respond(catalogResponse(catalog));await pending;
 const committed=ready.snapshot();assert.equal(committed.origin,'cached');
 assert.notEqual(committed.basis,bundledSnapshot.basis);
 await ready.refresh();assert.equal(ready.snapshot(),committed);
 let conditionalRequests=0;
 let next=(url,opts)=>{
  conditionalRequests++;
  assert.equal(url,host);assert.deepEqual(opts.headers,{'If-None-Match':'"example"'});
  return new Response(null,{status:304});
 };
 const restarted=new PricingCache(home,(...args)=>next(...args),()=>time);
 assert.equal(restarted.snapshot().basis,committed.basis);
 time+=300000;await restarted.refresh();assert.equal(conditionalRequests,1);
 const validFile=path.join(home,'token-monitor-embedded','pricing','catalog.json');
 const original=readFileSync(validFile,'utf8');
 for(const malformed of [
  {schemaVersion:2},
  {...catalog,aliases:{broken:'unknown'}},
  {...catalog,models:{test:[...catalog.models['gpt-6.2-astra']].reverse()}},
  {...catalog,models:{test:[{...catalog.models['gpt-6.2-astra'][0],tiers:{standard:{base:{input:-1,output:2}}}}]}},
 ]){
  assert.throws(()=>parseCatalog(malformed));
  time+=300000;next=()=>catalogResponse(malformed);await restarted.refresh();
  assert.equal(restarted.snapshot().basis,committed.basis);
 }
 time+=300000;next=()=>new Response('x'.repeat(256*1024+1));await restarted.refresh();
 assert.equal(readFileSync(validFile,'utf8'),original);
 time+=300000;catalog.verifiedAt='2026-11-19';next=()=>catalogResponse(catalog);await restarted.refresh();
 assert.equal(restarted.snapshot().basis,committed.basis);
 assert.equal(restarted.snapshot().pricing.verifiedAt,'2026-11-19');
});

test('live and saved costs adopt a new pricing basis with staged replay',async t=>{
 const home=fixture(t),dir=path.join(home,'sessions'),file=path.join(dir,'chat.jsonl');
 mkdirSync(dir);
 const serialize=x=>JSON.stringify(x);
 writeFileSync(file,[
  {type:'session_meta',payload:{id:'chat',source:'cli'}},
  {type:'turn_context',timestamp:stamp,payload:{model:sample.model}},
  {type:'event_msg',timestamp:stamp,payload:{type:'token_count',info:{last_token_usage:{input_tokens:sample.input,cached_input_tokens:0,cache_write_input_tokens:0,output_tokens:0}}}},
 ].map(serialize).join('\n')+'\n');
 const store=new TelemetryStore(home),history=new EfficiencyStore(home);
 try {
  assert.equal(await store.record({session_id:'chat',transcript_path:file,hook_event_name:'Stop'}),true);
  const now=Date.parse(stamp)+1000,records=[{id:'chat',file}];
  await history.scan(home,records,true,now);
  assert.equal(store.snapshot('chat',now).usage.cost,.8);
  assert.equal(history.snapshot('chat',now).thread.cost,.8);
  const catalog=structuredClone(bundledCatalog);
  catalog.models[sample.model][0].tiers.standard.base.input=7;
  let tick=0;
  const cache=new PricingCache(home,async()=>catalogResponse(catalog),()=>tick);
  await cache.refresh();
  assert.equal(await cache.write(bundledSnapshot,()=>assert.fail('stale basis write')),undefined);
  assert.equal(history.snapshot('chat',now).comparisonReady,false);
  assert.equal(store.snapshot('chat',now).usage.cost,.7);
  await history.scan(home,records,true,now+1000);
  assert.equal(history.snapshot('chat',now+1000).thread.cost,.7);
  assert.equal(history.snapshot('chat',now+1000).comparisonReady,true);

  rmSync(file);
  // An orphaned summary without retained numeric detail keeps its committed value.
  history.storage.statement("DELETE FROM history_samples WHERE source='chat'").run();
  catalog.models[sample.model][0].tiers.standard.base.input=6;
  tick+=300000;await cache.refresh();
  await history.scan(home,[],true,now+2000);
  const frozen=history.snapshot('chat',now+2000);
  assert.equal(frozen.thread.cost,.7);
  assert.equal(frozen.threadPricingCurrent,false);
  assert.equal(frozen.comparisonReady,false);
 }finally{store.close();history.close();}
});


test('selected unknown models trigger a retry after the startup cooldown',async t=>{
 const home=fixture(t);
 const collector=new Collector(home,{touch(){},snapshot(){return {};},close(){}});
 try {
  collector.store.allowanceFiles=()=>[];
  let model='gpt-6.2-astra',tick=0,checks=0;
  collector.store.snapshot=()=>({available:true,model});
  collector.store.pricing=new PricingCache(home,async()=>{checks++;return new Response(null,{status:304});},()=>tick);
  collector.refreshPricing();
  await collector.store.pricing.refresh();
  assert.equal(checks,1);
  tick+=300000;
  await collector.request('state',{taskId:'chat'});
  assert.equal(checks,1);
  model='new-unlisted-model';
  await collector.request('state',{taskId:'chat'});
  await collector.store.pricing.refresh();
  assert.equal(checks,2);
  await collector.request('state',{taskId:'chat'});
  assert.equal(checks,2);
 }finally{collector.close();}
});
