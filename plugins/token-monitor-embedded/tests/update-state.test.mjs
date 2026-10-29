import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {writeJob} from '../server/dist/auto-update.mjs';

for(const scenario of ['transient','persistent','other-error','posix'])test(`atomic update status handles ${scenario} rename failures`,async()=>{
 const root=fs.mkdtempSync(path.join(tmpdir(),'tm-update-state-')),file=path.join(root,'job.json');
 fs.writeFileSync(file,JSON.stringify({phase:'downloading'}));
 const rename=fs.renameSync;let attempts=0;
 fs.renameSync=(from,to)=>{
  attempts++;
  assert.equal(JSON.parse(fs.readFileSync(file)).phase,'downloading');
  if(scenario!=='transient'||attempts<3)throw Object.assign(new Error('locked'),{code:scenario==='other-error'?'ENOSPC':'EPERM'});
  return rename(from,to);
 };syncBuiltinESMExports();
 try{
  const result=writeJob(root,{phase:'failed'},scenario==='posix'?'darwin':'win32');
  if(scenario==='transient'){await result;assert.equal(attempts,3);assert.equal(JSON.parse(fs.readFileSync(file)).phase,'failed');}
  else {await assert.rejects(result,/locked/);assert.equal(attempts,scenario==='persistent'?6:1);assert.equal(JSON.parse(fs.readFileSync(file)).phase,'downloading');}
  assert.deepEqual(fs.readdirSync(root),['job.json']);
 }finally{fs.renameSync=rename;syncBuiltinESMExports();fs.rmSync(root,{recursive:true,force:true});}
});
