import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const bundle=await build({entryPoints:[fileURLToPath(new URL('../server/src/history-client.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,define:{'import.meta.url':JSON.stringify(import.meta.url)}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function client(){
 const requests=[];
 class Worker extends EventEmitter {
  postMessage(request){requests.push(request);}
  unref(){}
  terminate(){}
 }
 let worker;
 const require=createRequire(import.meta.url),mod={exports:{}};
 new Function('require','module','exports',bundle.outputFiles[0].text)(id=>id==='node:worker_threads'?{Worker:class extends Worker{constructor(){super();worker=this;}}}:require(id),mod,mod.exports);
 return {client:new mod.exports.HistoryClient('/unused'),requests,reply(){const request=requests.at(-1);worker.emit('message',{id:request.id});}};
}
test('queued incremental scans retain updates from every panel and the newest file metadata',async()=>{
 const {client:c,requests,reply}=client();
 try{
  const first=c.scan('',[{id:'active',file:'active'}],true,false);
  c.scan('',[{id:'a',file:'old'}],true,false);
  c.scan('',[{id:'b',file:'b'},{id:'a',file:'new'}],true,false);
  reply();await tick();
  assert.deepEqual(requests[1].args.files,[{id:'a',file:'new'},{id:'b',file:'b'}]);
  assert.equal(requests[1].args.reconcile,false);
  reply();await first;
 }finally{c.close();}
});
test('a full catalogue replaces queued incremental scans and retains later updates',async()=>{
 const {client:c,requests,reply}=client();
 try{
  const first=c.scan('',[],true,false);
  c.scan('',[{id:'removed',file:'removed'}],true,false);
  c.scan('',[{id:'a',file:'a'}],true,true);
  c.scan('',[{id:'b',file:'b'}],true,false);
  reply();await tick();
  assert.deepEqual(requests[1].args.files,[{id:'a',file:'a'},{id:'b',file:'b'}]);
  assert.equal(requests[1].args.reconcile,true);
  reply();await first;
 }finally{c.close();}
});
