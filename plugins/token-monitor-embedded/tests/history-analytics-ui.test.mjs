import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({stdin:{resolveDir:root,contents:"export {HistoryAnalyticsView} from './ui/src/history-analytics';export {emptyDashboardTotals} from './server/src/history-dashboard';"},bundle:true,platform:'node',format:'cjs',write:false,external:['react']});

test('weekly lines connect measured buckets and columns require an explicit selection',async()=>{
 const slots=[],effects=[],requests=[];
 let cursor=0,rendering=false;
 const react={...React,useState(initial){
  if(!rendering)return React.useState(initial);
  const i=cursor++;
  if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
  return [slots[i],value=>{slots[i]=value;}];
 },useRef(initial){
  const i=cursor++;
  return slots[i]??(slots[i]={current:initial});
 },useEffect(effect){effects.push(effect);}};
 const mod={exports:{}};
 new Function('require','module','exports','localStorage',bundle.outputFiles[0].text)(name=>name==='react'?react:require(name),mod,mod.exports,{getItem:()=>null});
 const {HistoryAnalyticsView,emptyDashboardTotals}=mod.exports;
 const row={...emptyDashboardTotals(),priced:1,calls:1,cost:1};
 const data={start:'2026-11-02',end:'2026-11-22',trend:[
  {...row,label:'2026-11-02'},{...row,label:'2026-11-16',cost:2},
 ],choices:{model:[],effort:[],workspace:[]},models:[],low:[],high:[],spend:[],active:1,payback:{evaluable:0,pending:0}};
 const load=async(period,filters,grain)=>{requests.push([period,grain]);return data;};
 const render=()=>{
  cursor=0;effects.length=0;rendering=true;
  try{return HistoryAnalyticsView({load});}finally{rendering=false;}
 };
 function* elements(node){
  if(Array.isArray(node)){for(const child of node)yield* elements(child);}
  else if(React.isValidElement(node)){yield node;yield* elements(node.props.children);}
 }
 const find=(prop,value)=>[...elements(render())].find(el=>el.props[prop]===value);
 const chart=()=>renderToStaticMarkup(render()).match(/class="analytics-trend"[\s\S]*?<\/svg>/)[0];
 const refresh=async()=>{for(const effect of effects)effect();await Promise.resolve();};
 render();
 await refresh();
 assert.deepEqual(requests,[['30','week']]);
 assert.match(chart(),/<path d="M[^"]+ L[^"]+"/);
 assert.doesNotMatch(chart(),/<rect/);
 find('aria-label','Trend chart type').props.onChange({target:{selectedIndex:1}});
 assert.equal((chart().match(/<rect/g)??[]).length,2);
 assert.doesNotMatch(chart(),/<path/);
 assert.equal(requests.length,1);
 find('aria-label','Time grain').props.onChange({target:{selectedIndex:2}});
 find('children','Last 7 days').props.onClick();
 render();
 await refresh();
 assert.deepEqual(requests.at(-1),['7','month']);
});
