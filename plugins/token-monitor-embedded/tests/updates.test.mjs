import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Updates,compareVersions,parseVersion,parseRelease,detectedTarget,targets,releasesURL} from '../server/dist/updates.mjs';
const base='https://github.com/ACB-prgm/TokenMonitor/releases';
function release(version='1.5.0', selected=targets){return {tag_name:'v'+version,draft:false,prerelease:false,html_url:`${base}/tag/v${version}`,published_at:'2026-10-20T00:00:00Z',assets:selected.flatMap(t=>['.zip','.zip.sha256'].map(ext=>{const name=`token-monitor-${version}-${t}${ext}`;return {name,browser_download_url:`${base}/download/v${version}/${name}`};}))};}
const response=(raw=release(),headers={etag:'"release-1"'})=>new Response(JSON.stringify(raw),{headers});
async function fixture(t,version='1.4.0',options={}){
 const root=await mkdtemp(path.join(tmpdir(),'tm-updates-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const requests=[];let now=Date.now(),fetcher=async()=>response();
 const settings={root,now:()=>now,fetch:async(...args)=>{requests.push(args);return fetcher(...args);},...options};
 const u=new Updates(version,settings);
 return {u,root,requests,settings,time:()=>now,advance:n=>{now+=n;},fetch:f=>{fetcher=f;}};
}
for(const [version,status]of [['1.4.0','available'],['1.5.0','current'],['1.6.0','ahead'],['1.5.0-rc.1','available'],['bad','unknown']]){
 test(`installed ${version} versus stable release`,async t=>{const {u}=await fixture(t,version);await u.check();assert.equal((await u.settled()).status,status);});
}
test('SemVer precedence, build metadata and malformed values',()=>{
 const sequence=['1.0.0-alpha','1.0.0-alpha.1','1.0.0-alpha.beta','1.0.0-beta','1.0.0-beta.2','1.0.0-beta.11','1.0.0-rc.1','1.0.0','1.0.1','1.10.0','2.0.0'];
 for(let i=1;i<sequence.length;i++)assert.equal(compareVersions(sequence[i-1],sequence[i]),-1);
 assert.equal(compareVersions('1.0.0+abc','1.0.0+xyz'),0);
 assert.equal(compareVersions('999999999999999999.0.0','999999999999999998.0.0'),1);
 for(const value of ['01.0.0','1.0','1.0.0-01','1.0.0-','v1.0.0',undefined])assert.equal(parseVersion(value),undefined);
 assert.throws(()=>compareVersions('','1.0.0'));
});
for(const [platform,arch,target]of [['darwin','x64','macos-x64'],['darwin','arm64','macos-arm64'],['win32','x64','windows-x64'],['win32','arm64','windows-arm64']]){
 test(`select ${target} from actual assets`,async t=>{assert.equal(detectedTarget(platform,arch),target);const {u}=await fixture(t,'1.4.0',{target});await u.check();const s=await u.settled();assert.ok(s.downloadURL.endsWith(`${target}.zip`));assert.ok(s.checksumURL.endsWith(`${target}.zip.sha256`));});
}
test('unsupported platform and missing or duplicate assets never offer a download',async t=>{
 assert.equal(detectedTarget('linux','x64'),undefined);
 const f=await fixture(t,'1.4.0',{target:'macos-x64'});f.fetch(async()=>response(release('1.5.0',['windows-x64'])));await f.u.check();let s=await f.u.settled();assert.equal(s.status,'available');assert.equal(s.downloadURL,undefined);assert.ok(s.releaseURL);
 const raw=release();raw.assets.push(raw.assets[0]);f.fetch(async()=>response(raw));await f.u.configure({target:'macos-arm64'});await f.u.check();s=await f.u.settled();assert.equal(s.downloadURL,undefined);
});
for(const mutation of [r=>r.draft=true,r=>r.prerelease=true,r=>r.tag_name='v1.5.0-beta',r=>delete r.tag_name,r=>r.tag_name='v01.5.0',r=>r.html_url='https://evil.test/x',r=>r.published_at='bad',r=>delete r.assets]){
 test('invalid stable release is unknown',async t=>{const f=await fixture(t);const r=release();mutation(r);assert.throws(()=>parseRelease(r));f.fetch(async()=>response(r));await f.u.check();assert.equal((await f.u.settled()).status,'unknown');});
}
test('opening always revalidates cache, ETag 304 refreshes age, no 24h throttle',async t=>{
 const f=await fixture(t);await f.u.check(true);const initial=await f.u.settled();assert.equal(initial.stale,false);
 const restarted=new Updates('1.4.0',f.settings);assert.equal((await restarted.status()).latestVersion,'1.5.0');
 f.advance(86400001);assert.equal((await restarted.status()).stale,true);
 f.fetch(async(url,init)=>{assert.equal(url,releasesURL);assert.equal(init.headers['If-None-Match'],'"release-1"');assert.equal(init.redirect,'error');return new Response(null,{status:304});});
 await restarted.check(true);const next=await restarted.settled();assert.equal(next.stale,false);assert.ok(next.checkedAt>initial.checkedAt);assert.equal(f.requests.length,2);
});
test('network failure retains cache and persists backoff without claiming current',async t=>{
 const f=await fixture(t,'1.5.0');await f.u.check();await f.u.settled();f.fetch(async()=>{throw Error('private network error');});await f.u.check();const s=await f.u.settled();assert.equal(s.status,'unknown');assert.equal(s.latestVersion,'1.5.0');assert.equal(s.stale,true);assert.doesNotMatch(s.error,/private/);
 const other=new Updates('1.5.0',f.settings);await other.check(true);assert.equal(f.requests.length,2);assert.equal((await other.status()).status,'unknown');
 f.advance(60001);f.fetch(async()=>response());await other.check();assert.equal((await other.settled()).status,'current');
});
test('rate limiting respects Retry-After and reset across processes',async t=>{
 const f=await fixture(t);f.fetch(async()=>new Response('',{status:403,headers:{'retry-after':'120','x-ratelimit-reset':String(Math.floor((f.time()+300000)/1000))}}));await f.u.check();const s=await f.u.settled();assert.ok(s.retryAt>=f.time()+299000);
 const other=new Updates('1.4.0',f.settings);await other.check();assert.equal(f.requests.length,1);f.advance(300001);f.fetch(async()=>response());await other.check();assert.equal((await other.settled()).status,'available');
});
test('disabled automatic checks preserve manual checks, overrides and dismissal',async t=>{
 const f=await fixture(t);await f.u.configure({automatic:false,target:'windows-arm64'});await f.u.check(true);assert.equal(f.requests.length,0);
 await f.u.check();let s=await f.u.settled();assert.equal(s.target,'windows-arm64');assert.equal(s.status,'available');
 await f.u.configure({dismissVersion:'1.5.0'});const other=new Updates('1.4.0',f.settings);assert.equal((await other.status()).dismissed,true);assert.equal((await other.status()).automatic,false);
 f.fetch(async()=>response(release('1.6.0')));await other.check();s=await other.settled();assert.equal(s.dismissed,false);
 await assert.rejects(other.configure({dismissVersion:'9.0.0'}));await other.configure({target:'auto'});assert.equal((await other.status()).target,detectedTarget());
});
test('checks return before network completion and deduplicate concurrent requests',async t=>{
 const f=await fixture(t);let resolve;const blocked=new Promise(r=>{resolve=r;});f.fetch(()=>blocked);
 const statuses=await Promise.all(Array.from({length:10},()=>f.u.check(true)));assert.ok(statuses.every(s=>s.checking));
 await new Promise(r=>setImmediate(r));while(f.requests.length===0)await new Promise(r=>setImmediate(r));assert.equal(f.requests.length,1);
 await f.u.status();assert.equal(f.requests.length,1);resolve(response());assert.equal((await f.u.settled()).status,'available');
});
test('request deadline aborts stalled fetch',async t=>{
 const f=await fixture(t,'1.4.0',{timeoutMs:10});f.fetch((url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})));
 await f.u.check();assert.equal((await f.u.settled()).status,'unknown');
});
test('corrupt cache and preferences recover; unsafe cached links are removed',async t=>{
 const f=await fixture(t);await writeFile(path.join(f.root,'cache.json'),'{');await writeFile(path.join(f.root,'preferences.json'),'{');assert.equal((await f.u.status()).automatic,true);await f.u.check();await f.u.settled();
 const file=path.join(f.root,'cache.json'),cache=JSON.parse(await readFile(file,'utf8'));cache.release.assets[0].url='https://evil.test/file';await writeFile(file,JSON.stringify(cache));
 const s=await f.u.configure({target:'macos-arm64'});assert.equal(s.downloadURL,undefined);
});
test('oversized and non-JSON responses fail gracefully',async t=>{
 const f=await fixture(t);f.fetch(async()=>new Response('x'.repeat(1024*1024+1)));await f.u.check();assert.equal((await f.u.settled()).status,'unknown');
 f.advance(60001);f.fetch(async()=>new Response('not json'));await f.u.check();assert.equal((await f.u.settled()).status,'unknown');
});
