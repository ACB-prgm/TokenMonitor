import type {RecordValue} from './metrics.js';

export type CallActivity = {response?: string; skills?: string[]; tools: {name: string; detail?: string}[]; files: string[]};
const excerpt=(text:unknown,limit:number)=>typeof text==='string'?text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim().slice(0,limit):'';

// Collect only visible assistant output and tool requests between usage records.
// Never retain user prompts, reasoning, tool results, or full patches.
export class ActivityCollector {
  private value:CallActivity={tools:[],files:[]};
  private seen=new Set<string>();
  reset(){this.value={tools:[],files:[]};this.seen.clear();}
  consume(type:string,p:RecordValue){
    if(type==='compacted'||type==='turn_context'||(type==='event_msg'&&['task_started','user_message','task_complete','task_aborted'].includes(p.type))){this.reset();return;}
    if(type!=='response_item')return;
    if(p.type==='message'&&p.role==='assistant'&&Array.isArray(p.content)){
      const text=p.content.filter((c:any)=>c&&['output_text','text'].includes(c.type)&&typeof c.text==='string').map((c:any)=>c.text).join('\n');
      if(text)this.value.response=excerpt([this.value.response,text].filter(Boolean).join('\n'),600);
      return;
    }
    if(!['function_call','custom_tool_call'].includes(p.type))return;
    const name=excerpt(p.name,100);if(!name)return;
    const id=excerpt(p.call_id,200);if(id&&this.seen.has(id))return;
    if(this.seen.size>=32)return;if(id)this.seen.add(id);
    const raw=typeof p.arguments==='string'?p.arguments:typeof p.input==='string'?p.input:'';
    let args:RecordValue={};try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))args=parsed;}catch{/* Custom tools may use plain text. */}
    // A skill read is evidence of loading its instructions, not proof of execution.
    if(/\b(cat|read|sed|head)\b/.test(raw)){
      for(const match of raw.matchAll(/([A-Za-z0-9_.-]+)\/SKILL\.md/g)){
        const skill=match[1].slice(0,128);
        const skills=this.value.skills??=[];
        if(skills.length<16&&!skills.includes(skill))skills.push(skill);
      }
    }
    const detail=excerpt(args.cmd??args.command??args.query??args.description,240);
    if(this.value.tools.length<6)this.value.tools.push({name,...(detail?{detail}: {})});
    const addFile=(file:unknown)=>{const text=excerpt(file,240);if(text&&this.value.files.length<8&&!this.value.files.includes(text))this.value.files.push(text);};
    if(/(?:^|[._])apply_patch$/.test(name)){
      const patch=typeof args.patch==='string'?args.patch:raw;
      for(const match of patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm))addFile(match[1]);
    }else if(/(?:^|[._])(?:write_file|create_file|edit_file)$/.test(name))addFile(args.path??args.file_path);
  }
  take():CallActivity|undefined{
    const value=this.value;this.reset();
    return value.response||value.tools.length||value.files.length?value:undefined;
  }
}
