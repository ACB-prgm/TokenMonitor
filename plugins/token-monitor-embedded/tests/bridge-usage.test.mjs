import test from 'node:test';
import assert from 'node:assert/strict';
import {BridgeUsage} from '../server/dist/bridge-usage.mjs';
test('shared usage reader deduplicates reads, caches, backs off and retains stale observations',async()=>{
 let now=1000,calls=0,fail=false,release;
 const bridge={available:true,call:()=>{calls++;return new Promise((resolve,reject)=>{release=()=>fail?reject(Error('offline')):resolve({accountId:'account',rateLimits:{primary:{windowDurationMins:300,usedPercent:90,resetsAt:200}}});});}};
 const reader=new BridgeUsage(bridge,()=>now);await assert.rejects(reader.read());reader.bind('chat');
 const first=reader.read(),second=reader.read();assert.equal(calls,1);release();await Promise.all([first,second]);
 assert.equal(reader.snapshot().fiveHour.used,90);await reader.read();assert.equal(calls,1);
 now+=30000;fail=true;const failed=reader.read();release();await assert.rejects(failed);await assert.rejects(reader.read(true));assert.equal(calls,2);assert.equal(reader.observedAt,1000);
 now+=15000;fail=false;const recovered=reader.read();release();await recovered;assert.equal(reader.observedAt,now);
 reader.close();await assert.rejects(reader.read(true));
});
