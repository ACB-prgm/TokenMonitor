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
 const off=control({available:true,threadId:'target',enabled:false});assert.equal(off.switch.props.disabled,false);assert.equal(off.switch.props.checked,false);
 off.switch.props.onChange({target:{checked:true}});assert.deepEqual(off.actions,['enable']);
 const on=control({available:true,threadId:'target',enabled:true});
 assert.equal(on.switch.props.checked,true);assert.equal(on.switch.props.disabled,false);on.switch.props.onChange({target:{checked:false}});assert.deepEqual(on.actions,['disable']);
});
test('toggle reflects selected chat only and blocks interaction during mutation or dispatch',()=>{
 assert.equal(control({available:true,threadId:'other',enabled:true}).switch.props.checked,false);
 assert.equal(control({available:true,threadId:'target',enabled:false}).switch.props.checked,false);
 assert.equal(control({available:true},true).switch.props.disabled,true);
 assert.equal(control({available:false,threadId:'target',enabled:true}).switch.props.disabled,false);
 assert.equal(control({available:true},false,'').switch.props.disabled,true);
});
test('near-limit offer is scoped to the selected chat and exposes enable and dismiss actions',()=>{
 const actions=[];const render=(value,threadId='target')=>mod.exports.ResumeOffer({value,threadId,title:'Example',busy:false,onAction:a=>actions.push(a)});
 assert.equal(render({threadId:'other',offer:true,available:true,enabled:false}),null);
 assert.equal(render({threadId:'target',offer:false,available:true,enabled:false}),null);
 assert.equal(render({threadId:'target',offer:true,available:false,enabled:false}),null);
 assert.equal(render({threadId:'target',offer:true,available:true,enabled:true}),null);
 const tree=render({threadId:'target',offer:true,available:true,enabled:false});
 const buttons=nodes(tree).filter(n=>n.type==='button');buttons[0].props.onClick();buttons[1].props.onClick();assert.deepEqual(actions,['enable','dismiss']);
});
