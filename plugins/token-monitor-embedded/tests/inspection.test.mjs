import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('../ui/src/inspection.ts',import.meta.url));
const bundle=await build({entryPoints:[entry],bundle:true,format:'esm',platform:'node',write:false});
const {InspectionController}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
function setup(reduced=false){
 let now=0,id=0;const timers=new Map(),states=[];
 const c=new InspectionController(s=>states.push(s),()=>reduced,(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},id=>timers.delete(id));
 return {c,states,timers,tick(ms){const end=now+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;}};
}
test('instant switching survives gaps and dismisses after delay plus exit animation',()=>{
 const {c,tick}=setup();c.enter('a');assert.equal(c.active,'a');c.leave();tick(199);assert.equal(c.active,'a');c.enter('b');tick(400);assert.equal(c.active,'b');assert.equal(c.state.closing,false);
 c.leave();tick(200);assert.equal(c.state.closing,true);assert.equal(c.active,'b');tick(139);assert.equal(c.active,'b');tick(1);assert.equal(c.active,null);
});
test('details entry and re-entry during exit cancel dismissal',()=>{
 const {c,tick}=setup();c.enter('a');c.leave();tick(210);c.enter();tick(500);assert.equal(c.active,'a');assert.equal(c.state.closing,false);c.leave();tick(340);assert.equal(c.active,null);
});
test('focus, pinning, clear, retention and disposal own their timers',()=>{
 const {c,tick,timers}=setup();c.focus('a');c.leave();tick(500);assert.equal(c.active,'a');c.blur();assert.equal(c.active,null);
 c.enter('a');c.pin('a');c.enter('b');c.leave();tick(200);assert.equal(c.active,'a');assert.equal(c.state.closing,false);
 c.pin('a');assert.equal(c.active,null);c.enter('b');c.leave();c.clear();tick(500);assert.equal(c.active,null);
 c.enter('a');c.pin('a');c.retain(new Set(['b']));assert.equal(c.active,null);
 c.enter('b');c.leave();c.dispose();assert.equal(timers.size,0);
});
test('reduced motion preserves hide delay but omits exit phase',()=>{
 const {c,tick}=setup(true);c.enter('a');c.leave();tick(199);assert.equal(c.active,'a');tick(1);assert.equal(c.active,null);assert.equal(c.state.closing,false);
});

test('default timers call browser globals with their native receiver',async()=>{
 const browser=await build({entryPoints:[entry],bundle:true,format:'iife',globalName:'Preview',write:false});
 runInNewContext(`let scheduled=0;function setTimeout(fn,ms){if(this!==globalThis)throw new Error('Illegal invocation');scheduled++;return 1;}function clearTimeout(id){if(this!==globalThis)throw new Error('Illegal invocation');}${browser.outputFiles[0].text};const c=new Preview.InspectionController(()=>{});c.enter('a');c.leave();c.enter('b');c.leave();c.dispose();if(scheduled!==2)throw new Error('Timers not scheduled');`);
});
