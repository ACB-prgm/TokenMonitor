import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../server/src/tail.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);

test('dense JSONL copies only block checkpoints and unfinished records',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'tm-tail-')),file=path.join(root,'log.jsonl');
 const content='{"n":1}\n'.repeat(20000),tail=new mod.exports.JSONLTail(),records=[];
 const original=Buffer.from;let copied=0;
 try{
  writeFileSync(file,content+'{"n":');
  Buffer.from=function(value,...args){if(Buffer.isBuffer(value))copied+=value.length;return original(value,...args);};
  try{tail.read(file,()=>{},line=>records.push(line));}finally{Buffer.from=original;}
  assert.equal(records.length,20000);
  assert.ok(records.every(line=>line.toString()==='{"n":1}'));
  assert.ok(copied<content.length,`Copied ${copied} bytes for ${content.length} input bytes`);
  appendFileSync(file,'2}\n');tail.read(file,()=>{},line=>records.push(line));
  assert.equal(records.at(-1).toString(),'{"n":2}');
  tail.read(file,()=>{},()=>assert.fail('unchanged file replayed'));
 }finally{Buffer.from=original;rmSync(root,{recursive:true,force:true});}
});
test('oversized records are skipped and reading resumes across append boundaries',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'tm-tail-limit-')),file=path.join(root,'log.jsonl'),tail=new mod.exports.JSONLTail(),records=[];
 try{
  writeFileSync(file,'x'.repeat(4*1024*1024+1));tail.read(file,()=>{},line=>records.push(line.toString()));
  appendFileSync(file,'more\n{"n":3}\n');tail.read(file,()=>{},line=>records.push(line.toString()));
  assert.deepEqual(records,['{"n":3}']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
