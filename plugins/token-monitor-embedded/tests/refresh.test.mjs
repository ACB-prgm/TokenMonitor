import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const root=new URL('../',import.meta.url);
const bundle=await build({entryPoints:[new URL('ui/src/main.tsx',root).pathname],bundle:true,platform:'node',format:'cjs',write:false,external:['react','react-dom/client','@modelcontextprotocol/ext-apps']});

// Run the real panel controller with deterministic hooks and a deferred bridge.
function panel() {
 const slots=[],effects=[],calls=[];let cursor=0,component,poll,first=true;
 const react={
  createElement:(type,props)=>({type,props}),
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=value;}];},
  useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
  useEffect(effect){cursor++;if(first)effects.push(effect);},
 };
 let bridge;
 class App {
  constructor(){bridge=this;}
  getHostContext(){return {};}
  async connect(){}
  close(){}
  callServerTool(request){return new Promise(resolve=>calls.push({request,resolve}));}
 }
 const document={documentElement:{dataset:{}},getElementById(){return {};},visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 const nativeRequire=createRequire(new URL('package.json',root));
 const require=name=>name==='react'?react:name==='react-dom/client'?{createRoot:()=>({render(element){component=element.type;}})}:name==='@modelcontextprotocol/ext-apps'?{App}:nativeRequire(name);
 new Function('require','document','window','sessionStorage','setInterval','clearInterval',bundle.outputFiles[0].text)(require,document,{}, {getItem:()=>null,setItem(){}},callback=>{poll=callback;return 1;},()=>{});
 const render=()=>{cursor=0;return component().props;};
 render();first=false;for(const effect of effects)effect();
 const deliver=state=>bridge.ontoolresult({_meta:{monitor:state}});
 const settle=async(state)=>{calls.at(-1).resolve({_meta:{monitor:state}});await new Promise(resolve=>setImmediate(resolve));};
 return {render,deliver,settle,calls,poll:()=>poll()};
}

test('polls retain unchanged views and queue selections made in flight',async()=>{
 const p=panel();
 const state={panelId:'p',revision:'r1',selectedId:'a',task:{id:'a',title:'A'},status:'Monitoring'};
 p.deliver(state);
 assert.equal(p.calls.length,1);
 assert.equal(p.calls[0].request.arguments.revision,'r1');
 p.render().onAction('select','b');
 assert.equal(p.calls.length,1,'selection waits for the running poll');
 await p.settle({panelId:'p',revision:'r1',unchanged:true});
 assert.strictEqual(p.render().s,state,'unchanged response preserves the snapshot');
 assert.equal(p.calls.length,2);
 assert.equal(p.calls[1].request.arguments.action,'select');
 assert.equal(p.calls[1].request.arguments.taskId,'b');
 const selected={...state,selectedId:'b',revision:'r2'};
 await p.settle(selected);
 assert.strictEqual(p.render().s,selected);
 p.poll();p.poll();
 assert.equal(p.calls.length,3,'overlapping polls are skipped');
 assert.equal(p.calls[2].request.arguments.revision,'r2');
 await p.settle({panelId:'p',revision:'r2',unchanged:true});
 assert.strictEqual(p.render().s,selected);
});
