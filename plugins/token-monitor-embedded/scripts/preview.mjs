// Developer-only browser host for the actual bundled widget. No Codex access,
// transcripts, services, or model turns. Serve .build/embedded-preview locally.
import {build} from 'esbuild';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=path.resolve(root,'../../.build/embedded-preview');
await mkdir(output,{recursive:true});
await copyFile(path.join(root,'ui/dist/panel.html'),path.join(output,'panel.html'));
await writeFile(path.join(output,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><title>TokenMonitor UI test host</title></head><body style="margin:0;font:14px system-ui;background:#888"><nav style="padding:10px;background:#eee"><button id="theme">Theme</button> <button id="width">Width</button> <button id="failure">Disconnect</button> <output id="counts">Connecting</output></nav><iframe title="TokenMonitor actual bundled panel" style="display:block;border:0;width:600px;height:1100px;margin:12px auto" src="panel.html"></iframe><script src="host.js"></script></body></html>`);
await build({stdin:{resolveDir:root,contents:`
import {AppBridge,PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';
const frame=document.querySelector('iframe');
let calls=0,messages=0,updates=0,dark=false,offline=false;
const stamp='2026-10-19T12:00:00Z';
const samples=Array.from({length:28},(_,i)=>({timestamp:stamp,input:60000+i*3300,cached:56000+i*2900,output:400+i,reasoning:200,cacheWrite:0,outputRecorded:true,reasoningRecorded:true}));
const state={version:1,panelId:'12345678-1234-4234-8234-123456789012',revision:'test',task:{id:'fixture-chat',title:'Build the local embedded token monitor',workspace:'TokenMonitor'},selectedId:'fixture-chat',tasks:[{id:'fixture-chat',title:'Build the local embedded token monitor'},{id:'other',title:'Another local task'}],status:'Monitoring selected task',followingMode:'host-chat',selectionSource:'host-chat',available:true,model:'gpt-6.1-sol',effort:'high',input:149100,cached:134300,fresh:14800,contextLimit:475000,contextPercent:31.39,contextHealth:0,freshHealth:0,callCount:228,samples,compactions:[{timestamp:stamp,callPosition:211.5}],lastCall:stamp,lastEvent:stamp,cacheTemperature:'WARM',fiveHour:{used:43,reset:'2026-10-20T03:00:00Z'},weekly:{used:32,reset:'2026-10-22T03:00:00Z'},outputTotals:{total:187057,reasoning:87256,source:'reported-cumulative'},compactionValue:{category:'MEDIUM',level:1,currentInput:149100,estimatedInput:44730,breakEvenCalls:6},attribution:{skillCount:2,callCount:48,afterCompaction:true,contributors:[{name:'Read/Search',calls:22,tokens:15000},{name:'Skills / create-plugin',calls:2,tokens:3000},{name:'Shell',calls:24,tokens:9000}]}};
const bridge=new AppBridge(null,{name:'developer-fixture-host',version:'1'},{serverTools:{}});
bridge.setHostContext({theme:'light',displayMode:'fullscreen',availableDisplayModes:['inline','fullscreen']});
function counts(){document.querySelector('#counts').textContent='Refresh calls '+calls+' · prompts '+messages+' · context updates '+updates;}
bridge.oncalltool=async p=>{calls++;counts();if(offline)throw new Error('Simulated collector disconnect');if(p.arguments.action==='lock')state.locked=true;if(p.arguments.action==='unlock')state.locked=false;if(p.arguments.action==='select'){state.selectedId=p.arguments.taskId;state.task=state.tasks.find(t=>t.id===state.selectedId);}return {content:[],_meta:{monitor:{...state,revision:String(calls)}}};};
bridge.onmessage=async()=>{messages++;counts();return {};};bridge.onupdatemodelcontext=async()=>{updates++;counts();return {};};
bridge.oninitialized=async()=>{await bridge.sendToolInput({arguments:{}});await bridge.sendToolResult({content:[],_meta:{monitor:state}});counts();};
bridge.connect(new PostMessageTransport(frame.contentWindow,frame.contentWindow));
document.querySelector('#theme').onclick=()=>{dark=!dark;bridge.setHostContext({theme:dark?'dark':'light',displayMode:'fullscreen'});};
document.querySelector('#width').onclick=()=>{frame.style.width=frame.style.width==='320px'?'600px':'320px';};
document.querySelector('#failure').onclick=()=>{offline=!offline;};
`},bundle:true,format:'iife',platform:'browser',target:'es2022',outfile:path.join(output,'host.js')});
console.log(output);
