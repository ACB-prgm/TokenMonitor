import React,{useEffect,useId,useRef,useState} from 'react';
import type {Monitor} from './view.js';
import {displayName,isDev} from '../../shared/identity.js';
import {installedVersion} from '../../shared/version.js';
import {UpdateMenu,type UpdateAction} from './updates.js';
import type {UpdateStatus} from '../../server/src/updates.js';

export function ThreadPicker({s,onSelect,onFilter}:{s:Monitor;onSelect?:(id:string)=>void;onFilter?:(query:string,archived:boolean)=>void}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const trigger=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null),filter=useRef(onFilter);filter.current=onFilter;
 const id=useId();
 const tasks=[...(s.tasks??[])];if(s.task&&!tasks.some(t=>t.id===s.task!.id))tasks.unshift(s.task);
 const results=tasks.filter(t=>!query||`${t.title} ${t.id} ${t.workspace??''}`.toLowerCase().includes(query.toLowerCase()));
 const searching=s.catalogueQuery!==undefined&&s.catalogueQuery!==query;
 const index=Math.min(active,Math.max(0,results.length-1));
 useEffect(()=>{const timer=setTimeout(()=>filter.current?.(query,false),200);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{if(open)input.current?.focus();},[open]);
 useEffect(()=>{document.getElementById(`${id}-${index}`)?.scrollIntoView?.({block:'nearest'});},[index,open]);
 function close(restore=true){setOpen(false);setQuery('');setActive(0);if(restore)trigger.current?.focus();}
 function select(i:number){const task=results[i];if(task){onSelect?.(task.id);close();}}
 return <div className="thread-selector" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))close(false);}} onKeyDown={e=>{
  if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close();}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!open)setOpen(true);else setActive((index+(e.key==='ArrowDown'?1:-1)+results.length)%Math.max(1,results.length));}
  else if(open&&(e.key==='Home'||e.key==='End')&&e.ctrlKey){e.preventDefault();setActive(e.key==='Home'?0:Math.max(0,results.length-1));}
  else if(open&&e.key==='Enter'&&e.target===input.current){e.preventDefault();select(index);}
 }}>
  <button ref={trigger} className="thread-trigger" disabled={!onSelect} aria-label={`Select monitored thread: ${s.task?.title??'Waiting for local threads'}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?`${id}-list`:undefined} onClick={()=>open?close():setOpen(true)}><span className="disclosure-caret" aria-hidden="true"/><span>{s.task?.archived?'Archived · ':''}{s.task?.title??'Choose a thread'}</span></button>
  {open&&<div className="thread-popover"><input ref={input} role="combobox" aria-label="Search threads by name or ID" aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={results.length?`${id}-${index}`:undefined} placeholder="Search threads…" maxLength={200} value={query} onChange={e=>{setQuery(e.target.value);setActive(0);}}/>
   <div className="picker-status" role="status">{s.discovery?.state==='scanning'?'Discovering threads…':searching?'Searching threads…':`${s.matchCount??results.length} matching threads`}{s.shownCount!=null&&s.matchCount!=null&&s.shownCount<s.matchCount?` · showing ${s.shownCount}`:''}</div>
   <div id={`${id}-list`} role="listbox" aria-label="Local threads">{results.map((t,i)=><button key={t.id} id={`${id}-${i}`} role="option" aria-selected={t.id===s.selectedId} className={i===index?'active':''} tabIndex={-1} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(i)} onClick={()=>select(i)}><span>{t.archived?'Archived · ':''}{t.title}</span><small>{t.id}</small></button>)}</div>
   {!results.length&&!searching&&<p className="picker-status">No matching local threads.</p>}
  </div>}
 </div>;
}
export function Settings({expanded,scale,onLayout,updates,onUpdate,error,children}:{expanded:boolean;scale:number;onLayout?:(expanded:boolean,scale:number)=>void;updates?:UpdateStatus;onUpdate?:(a:UpdateAction)=>void;error?:string;children?:React.ReactNode}) {
 return <details className="settings" onKeyDown={e=>{if(e.key==='Escape'){const d=e.currentTarget;d.open=false;d.querySelector('summary')?.focus();}}}>
  <summary aria-label="Dashboard settings" title="Settings and About">⚙{updates?.status==='available'&&!updates.dismissed&&<span className="update-badge" aria-label="Update available">•</span>}</summary>
  <div className="settings-body"><h2>Settings</h2><label>Display scale <select aria-label="Layout scale" value={scale} onChange={e=>onLayout?.(expanded,Number(e.target.value))}><option value="0.85">85%</option><option value="1">100%</option><option value={1/.85}>118%</option><option value={1.15/.85}>135%</option></select></label>{children}
   <div className="about"><h2>About {displayName}</h2><p className="build-version">{installedVersion}</p><p>Local token monitoring. Costs are API-equivalent estimates, separate from subscription allowances.</p>{!isDev&&<UpdateMenu value={updates} onAction={onUpdate} error={error}/>}</div>
  </div>
 </details>;
}
