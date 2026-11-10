import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('production server has no legacy usage RPC or allowance subprocess client',()=>{
 const bundle=readFileSync(new URL('../server/dist/index.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(bundle,/account\/rateLimits\/read|token_monitor_allowances/);
});
test('Unix release launcher prefers supplied app runtime without extracting its packaged runtime',{skip:process.platform==='win32'},()=>{
 const root=mkdtempSync(path.join(tmpdir(),'tm-runtime-'));try{
 mkdirSync(path.join(root,'scripts'));mkdirSync(path.join(root,'server/dist'),{recursive:true});copyFileSync(new URL('../scripts/launch.sh',import.meta.url),path.join(root,'scripts/launch.sh'));
 writeFileSync(path.join(root,'server/dist/index.mjs'),'console.log(JSON.stringify({runtime:process.execPath,pipe:process.env.CODEX_APP_TOOLS_PIPE_PATH}))');
 const result=JSON.parse(execFileSync('/bin/sh',[path.join(root,'scripts/launch.sh')],{env:{...process.env,CODEX_MCP_NODE_PATH:process.execPath,CODEX_APP_TOOLS_PIPE_PATH:'fixture'},encoding:'utf8'}));assert.equal(result.runtime,process.execPath);assert.equal(result.pipe,'fixture');
 }finally{rmSync(root,{recursive:true,force:true});}
});
