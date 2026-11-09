import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const bundle=await build({entryPoints:[fileURLToPath(new URL('../ui/src/resume.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['react']});
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports);
function nodes(n){return !n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];}
function control(value,busy=false,threadId='target'){
 const actions=[],tree=mod.exports.ResumeControls({value,busy,threadId,onAction:a=>actions.push(a)});
 return {actions,switch:nodes(tree).find(n=>n.props.role==='switch')};
}
test('per-chat toggle remains clickable without bridge metadata and can be turned off',()=>{
 const off=control({available:false});assert.equal(off.switch.props.disabled,false);assert.equal(off.switch.props.checked,false);
 off.switch.props.onChange({target:{checked:true}});assert.deepEqual(off.actions,['reset']);
 const on=control({available:true,request:{threadId:'target',phase:'armed',mode:'reset'}});
 assert.equal(on.switch.props.checked,true);assert.equal(on.switch.props.disabled,false);on.switch.props.onChange({target:{checked:false}});assert.deepEqual(on.actions,['cancel']);
});
test('toggle reflects selected chat only and blocks interaction during mutation or dispatch',()=>{
 assert.equal(control({available:true,request:{threadId:'other',phase:'armed',mode:'reset'}}).switch.props.checked,false);
 assert.equal(control({available:true,request:{threadId:'target',phase:'sent',mode:'reset'}}).switch.props.checked,false);
 assert.equal(control({available:true},true).switch.props.disabled,true);
 assert.equal(control({available:true,request:{threadId:'target',phase:'sending',mode:'reset'}}).switch.props.disabled,true);
 assert.equal(control({available:true},false,'').switch.props.disabled,true);
});
