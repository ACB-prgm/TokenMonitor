import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=new URL('../',import.meta.url),nativeRequire=createRequire(new URL('package.json',root));
const bundle=await build({entryPoints:[fileURLToPath(new URL('ui/src/view.tsx',root))],bundle:true,platform:'node',format:'cjs',write:false,external:['react']});
const react={...nativeRequire('react'),useState(initial){return [initial==='Cost'?'Context':typeof initial==='function'?initial():initial,()=>{}];},useEffect(){}};
const mod={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(name=>name==='react'?react:nativeRequire(name),mod,mod.exports);
function elements(node){
 if(!node||typeof node!=='object')return [];
 const children=node.props?.children;
 return [node,...(Array.isArray(children)?children:[children]).flat(Infinity).flatMap(elements)];
}
function contextSeries(samples){
 const view=mod.exports.MonitorView({s:{panelId:'p',status:'Monitoring',callCount:samples.length,samples},expanded:false,scale:1});
 const history=elements(view).find(node=>node.type?.name==='History');
 return elements(history.type(history.props)).filter(node=>node.props?.className?.startsWith('series '));
}

test('context chart leaves gaps for unknown cache while preserving measured zero cache',()=>{
 const samples=[
  {input:100,cached:20},
  {input:200,cached:0,cachedRecorded:false},
  {input:300,cached:150},
  {input:400,cached:0},
 ].map((sample,i)=>({timestamp:`2026-10-29T00:00:0${i}Z`,output:0,reasoning:0,...sample}));
 const series=contextSeries(samples),fresh=series.find(node=>node.props.className==='series fresh');
 const coordinates=[...(fresh.props.d??fresh.props.points).matchAll(/[ML]?(-?[\d.]+),(-?[\d.]+)/g)].map(([,x,y])=>[Number(x),Number(y)]);
 assert.deepEqual(coordinates,[[45,108],[385,88.75],[555,20]],'unknown cache has no fresh-input coordinate; measured zero cache remains full input');
 assert.deepEqual(fresh.props.d.match(/[ML]/g),['M','M','L'],'fresh-input line resumes after the missing reading without bridging the gap');
 const unknown=contextSeries(samples.map(sample=>({...sample,cachedRecorded:false})));
 assert.equal(unknown.find(node=>node.props.className==='series fresh').props.d.trim(),'');
 assert.match(unknown.find(node=>node.props.className==='series input').props.d,/M45,/,'input remains recorded independently of cache');
});
