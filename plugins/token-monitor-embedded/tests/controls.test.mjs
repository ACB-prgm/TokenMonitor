import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react');
const bundle=await build({entryPoints:[new URL('../ui/src/controls.tsx',import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',write:false,external:['react']});
function nodes(n){return !n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];}
function picker(){
 const slots=[],deps=[],cleanups=[],effects=[],timers=new Map();let cursor=0,serial=0,focus=0;const filters=[],selections=[];
 const mock={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},useId(){cursor++;return 'picker';},useEffect(effect,values){const i=cursor++;if(!deps[i]||values.some((v,j)=>v!==deps[i][j])){deps[i]=values;effects.push(()=>{cleanups[i]?.();cleanups[i]=effect();});}}};
 const mod={exports:{}};new Function('require','module','exports','document','setTimeout','clearTimeout',bundle.outputFiles[0].text)(n=>n==='react'?mock:require(n),mod,mod.exports,{getElementById:()=>null},fn=>{timers.set(++serial,fn);return serial;},id=>timers.delete(id));
 const s={panelId:'p',status:'Monitoring',selectedId:'a',task:{id:'a',title:'Alpha'},tasks:[{id:'a',title:'Alpha'},{id:'b-123',title:'Beta'}],matchCount:2};
 let tree;
 function render(){cursor=0;tree=mod.exports.ThreadPicker({s,onSelect:id=>selections.push(id),onFilter:(q,a)=>filters.push([q,a])});for(const n of nodes(tree))if(n.props.ref&&!n.props.ref.current)n.props.ref.current={focus(){focus++;}};effects.splice(0).forEach(fn=>fn());return tree;}
 function get(role){return nodes(tree).find(n=>n.props.role===role);}
 function key(k,target){let prevented=false;tree.props.onKeyDown({key:k,target,preventDefault(){prevented=true;},stopPropagation(){}});return prevented;}
 return {render,get,key,s,filters,selections,trigger:()=>nodes(tree).find(n=>n.props.className==='thread-trigger'),flush:()=>{for(const fn of timers.values())fn();timers.clear();},focus:()=>focus};
}
test('integrated picker searches names and IDs, debounces server filtering and restores focus on selection',()=>{
 const p=picker();p.render();assert.equal(p.trigger().props['aria-expanded'],false);assert.equal(p.get('combobox'),undefined);
 p.trigger().props.onClick();p.render();const input=p.get('combobox');assert.equal(input.props['aria-controls'],'picker-list');
 input.props.onChange({target:{value:'b-123'}});p.render();p.flush();assert.deepEqual(p.filters,[['b-123',false]]);
 assert.equal(p.get('option').props.id,'picker-0');assert.equal(p.get('combobox').props['aria-activedescendant'],'picker-0');
 assert.equal(p.key('Enter',p.get('combobox').props.ref.current),true);p.render();assert.deepEqual(p.selections,['b-123']);assert.equal(p.trigger().props['aria-expanded'],false);assert.ok(p.focus()>=2);
});
test('arrow navigation and Escape work without opening separate metric cards',()=>{
 const p=picker();p.render();p.key('ArrowDown');p.render();p.key('ArrowDown');p.render();p.key('Enter',p.get('combobox').props.ref.current);p.render();assert.deepEqual(p.selections,['b-123']);
 p.trigger().props.onClick();p.render();assert.equal(p.key('Escape'),true);p.render();assert.equal(p.get('combobox'),undefined);
});
test('selected archived threads remain visible and empty search results cannot change selection',()=>{
 const p=picker();p.s.task={id:'archived',title:'Past work',archived:true};p.s.selectedId='archived';p.render();assert.match(nodes(p.trigger()).map(n=>n.props.children).flat().join(' '),/Archived/);
 p.trigger().props.onClick();p.render();p.get('combobox').props.onChange({target:{value:'no such thread'}});p.render();assert.equal(p.get('option'),undefined);p.key('Enter',p.get('combobox').props.ref.current);assert.deepEqual(p.selections,[]);
});

test('picker retains its open state across telemetry updates and shows pending search inside the menu',()=>{
 const p=picker();p.s.catalogueQuery='';p.render();p.trigger().props.onClick();p.render();p.get('combobox').props.onChange({target:{value:'Beta'}});p.s.revision='r2';p.render();assert.equal(p.trigger().props['aria-expanded'],true);
 assert.ok(nodes(p.get('combobox')?p.render():null).some(n=>String(n.props.children).includes('Searching threads')));
 p.s.catalogueQuery='Beta';p.s.tasks=[{id:'b-123',title:'Beta'}];p.s.matchCount=1;p.render();assert.equal(p.get('option').props['aria-selected'],false);
});
