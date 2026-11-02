import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,appendFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));
const bundle=await build({stdin:{resolveDir:root,contents:`export {EfficiencyStore,historyBasis,summarize} from './server/src/efficiency';export {importHistory} from './server/src/history-import';`},bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {EfficiencyStore,historyBasis,summarize,importHistory}=mod.exports;
const home=mkdtempSync(path.join(tmpdir(),'tm-scale-')),now=Date.now();let store;
const percentile=xs=>xs.sort((a,b)=>a-b)[Math.floor(xs.length*.95)];
try{
 mkdirSync(path.join(home,'sessions'));store=new EfficiencyStore(home);let db=store.storage;
 const base={timestamp:'',model:'gpt-6.1-sol',effort:'high',input:100000,cached:90000,cacheWrite:0,output:1000,reasoning:100,total:101000,cachedRecorded:true,cacheWriteRecorded:true,outputRecorded:true,reasoningRecorded:true};
 const start=performance.now(),memoryStart=process.memoryUsage().rss;
 const basisKey=db.internBasis(historyBasis),dimensions=[];
 for(let m=0;m<4;m++)dimensions.push(db.dimension({model:['gpt-6.1-sol','gpt-6-astra'][m%2],effort:m<2?'high':'medium'}));
 for(let chunk=0;chunk<100;chunk++)db.transaction(()=>{
  for(let n=chunk*100;n<(chunk+1)*100;n++){
   const source='chat-'+n,dimension=dimensions[n%4];
   db.statement('INSERT INTO history_sources VALUES(?,?,?,?)').run(source,'fixture',basisKey,new Date(now).toISOString());
   db.statement('INSERT INTO history_catalogue VALUES(?,?,?,?,1)').run(source,'Benchmark '+n,'workspace',0);
   for(let j=0;j<100;j++){
    const recent=j>=90,days=recent?(j-90)%2:90+(n*7)%1700+Math.floor(j/9),timestamp=new Date(now-days*864e5+j*1000).toISOString();
    const b={...base,timestamp,model:n%2?'gpt-6-astra':'gpt-6.1-sol',effort:n%4<2?'high':'medium',cacheInput:100000,cacheRead:90000,calls:1,priced:1,inputPriced:1,inputCost:.02,cost:.03,overhead:0};
    db.addBucket(source,b);
    if(recent){db.addSample(source,j,{...base,model:b.model,effort:b.effort,timestamp},now);db.boundary(source,j,timestamp,'context-limit',now,475000);
     for(const kind of ['record','call','cumulative'])db.statement('INSERT INTO history_replay(source,kind,digest,timestamp) VALUES(?,?,?,?)').run(source,kind,createHash('sha256').update(source+':'+j+':'+kind).digest(),timestamp.slice(0,10));
    }
   }
   const checkpoint={version:1,observed:'fixture',waiting:false,parser:{model:n%2?'gpt-6-astra':'gpt-6.1-sol',effort:'high',contextLimit:475000,awaitingPostCompactionCall:false,compactions:[],lastCallModel:n%2?'gpt-6-astra':'gpt-6.1-sol',callCount:100,turns:{epochCompleted:20}},builder:{previous:{...base,timestamp:new Date(now).toISOString()},activity:new Date(now).toISOString()}};
   db.statement('INSERT INTO history_cursors VALUES(?,?,?,?,?,?,?,?,?)').run(source,source,'fixture',80000,'fixture','fixture',JSON.stringify(checkpoint),0,1);
   db.addTurn(source,0,new Date(now).toISOString(),n%2?'gpt-6-astra':'gpt-6.1-sol',10,now);
   if(n%10===0)db.updatePayback(source,{timestamp:new Date(now-864e5).toISOString(),completed:new Date(now).toISOString(),valid:true,breakEven:5,calls:10,net:.1});
  }
 });
 db.changed();db.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
 assert.equal(summarize(db.buckets()).calls,1000000);assert.equal(db.statement('SELECT COUNT(*) AS n FROM history_samples').get().n,100000);
 const generatedMs=performance.now()-start,initial=db.diagnostics(),warm=[],cold=[];
 store.snapshot('chat-1',now);const changes=db.statement('SELECT total_changes() AS n').get().n;
 for(let i=0;i<200;i++){const t=performance.now();store.snapshot('chat-1',now);warm.push(performance.now()-t);}
 assert.equal(db.statement('SELECT total_changes() AS n').get().n,changes,'warm snapshots must not write');
 for(let i=0;i<20;i++){store.close();const t=performance.now();store=new EfficiencyStore(home);store.snapshot('chat-1',now);cold.push(performance.now()-t);}
 db=store.storage;
 const f={id:'active',file:path.join(home,'sessions','active.jsonl')};const call=i=>({type:'event_msg',timestamp:new Date(now+i).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:100000,cached_input_tokens:90000,cache_write_input_tokens:0,output_tokens:1000}}}});
 writeFileSync(f.file,JSON.stringify({type:'session_meta',payload:{id:'active',source:'cli'}})+'\n'+JSON.stringify({type:'turn_context',payload:{model:'gpt-6.1-sol',effort:'high'}})+'\n'+JSON.stringify(call(1))+'\n');importHistory(db,home,f,historyBasis);
 const appended=JSON.stringify(call(2))+'\n';appendFileSync(f.file,appended);const appendStart=performance.now(),incremental=importHistory(db,home,f,historyBasis),appendMs=performance.now()-appendStart;assert.equal(incremental.bytes,Buffer.byteLength(appended));
 const unchanged=importHistory(db,home,f,historyBasis);assert.equal(unchanged.bytes,0);assert.equal(unchanged.changed,false);
 const totalBefore=summarize(db.buckets()).calls;let pruning=0;do{db.maintenance(now+91*864e5);assert.ok(++pruning<1000);}while(db.hasExpired(now+91*864e5));assert.equal(summarize(db.buckets()).calls,totalBefore);assert.equal(db.statement('SELECT COUNT(*) AS n FROM history_samples').get().n,0);
 const retained=db.diagnostics();
 const cycleSizes=[];for(let cycle=0;cycle<10;cycle++){
  const cycleNow=now+(cycle+1)*91*864e5,records=[{type:'session_meta',payload:{id:'active',source:'cli'}},{type:'turn_context',payload:{model:'gpt-6.1-sol',effort:'high'}},...Array.from({length:1000},(_,i)=>({...call(i),timestamp:new Date(cycleNow+i).toISOString()}))];
  writeFileSync(f.file,records.map(JSON.stringify).join('\n')+'\n');let result;do{result=importHistory(db,home,f,historyBasis,{now:cycleNow});}while(!result.complete&&!result.waiting);
  do{db.maintenance(cycleNow+91*864e5);}while(db.hasExpired(cycleNow+91*864e5));db.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');cycleSizes.push(db.diagnostics().databaseBytes);
  assert.equal(summarize(db.buckets()).calls,1001000,'rewritten source must replace its contribution');
 }
 assert.ok(cycleSizes.at(-1)<=cycleSizes[0]+2097152,'repeated cleanup must reuse freed space');
 const files=readdirSync(path.dirname(db.file));assert.ok(!files.some(f=>/backup|\.bak|snapshot/.test(f)));
 const report={runtime:{node:process.version,sqlite:db.statement('SELECT sqlite_version() AS version').get().version,platform:process.platform,architecture:process.arch},fixture:{calls:1000000,chats:10000,recentDetailedCalls:100000},generationMs:generatedMs,latencyMs:{warmP95:percentile(warm),cachedColdP95:percentile(cold),incrementalAppend:appendMs},incrementalBodyBytesRead:incremental.bytes,validationReads:'Additional bounded session-header and checkpoint validation reads are included in append timing',initialStorage:initial,afterRetention:retained,pruneBatches:pruning,repeatedRetentionCycleBytes:cycleSizes,rssGrowthBytes:process.memoryUsage().rss-memoryStart,files};
 console.log(JSON.stringify(report,null,2));assert.ok(report.latencyMs.warmP95<=50,'warm p95 exceeds 50ms');assert.ok(report.latencyMs.cachedColdP95<=250,'cold p95 exceeds 250ms');
}finally{store?.close();rmSync(home,{recursive:true,force:true});}
