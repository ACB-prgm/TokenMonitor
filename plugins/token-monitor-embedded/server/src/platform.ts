import path from 'node:path';
import {homedir} from 'node:os';
import {constants,closeSync,existsSync,fstatSync,lstatSync,mkdirSync,openSync,readSync,realpathSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {pluginName} from '../../shared/identity.js';
export const codexHome=()=>path.resolve(process.env.CODEX_HOME||path.join(homedir(),'.codex'));
export const stateRoot=(home=codexHome())=>path.join(home,pluginName);
export const validID=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value);
export function contained(root:string,candidate:string,flavor: 'win32'|'posix'=process.platform==='win32'?'win32':'posix') {
  const p=path[flavor];if(!p.isAbsolute(candidate))return false;const relative=p.relative(p.resolve(root),p.resolve(candidate));return !!relative&&relative!=='..'&&!relative.startsWith('..'+p.sep)&&!p.isAbsolute(relative);
}
export function acceptedTranscript(candidate:unknown,id:string,home:string):candidate is string {
  if(!validID(id)||typeof candidate!=='string'||!path.isAbsolute(candidate))return false;
  let fd:number|undefined;try {
    const root=realpathSync(home),file=realpathSync(candidate);if(!contained(root,file))return false;
    fd=openSync(file,constants.O_RDONLY);if(!fstatSync(fd).isFile())return false;
    const buffer=Buffer.alloc(65536),size=readSync(fd,buffer,0,buffer.length,0),end=buffer.subarray(0,size).indexOf(10);if(end<0)return false;
    const record=JSON.parse(buffer.subarray(0,end).toString('utf8')),p=record?.payload;
    return record.type==='session_meta'&&p?.id===id&&!(p.source&&typeof p.source==='object'&&Object.hasOwn(p.source,'subagent'))&&!(typeof p.source==='string'&&p.source.toLowerCase().startsWith('subagent'));
  }catch{return false;}finally{if(fd!=null)closeSync(fd);}
}
export function privateDirectory(directory:string) {
  if(existsSync(directory)){const s=lstatSync(directory);if(s.isSymbolicLink()||!s.isDirectory())throw new Error('Invalid state directory');return;}
  mkdirSync(directory,{recursive:true,mode:0o700});
}
export function atomicJSON(file:string,value:unknown) {
  privateDirectory(path.dirname(file));const temporary=path.join(path.dirname(file),`.${randomUUID()}.tmp`);
  try{writeFileSync(temporary,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});renameSync(temporary,file);}finally{rmSync(temporary,{force:true});}
}
// Directory creation is exclusive on both NTFS and POSIX. A crashed writer's
// abandoned lock is reclaimed only after its owner is confirmed absent.
export async function withStateLock<T>(root:string,action:()=>T):Promise<T|undefined> {
  privateDirectory(root);const lock=path.join(root,'hooks.lock.d'),deadline=Date.now()+1200;
  while(Date.now()<deadline){
    try {mkdirSync(lock,{mode:0o700});}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
      try{if(Date.now()-statSync(lock).mtimeMs>30000){const owner=Number((await import('node:fs')).readFileSync(path.join(lock,'owner'),'utf8'));let alive=true;try{process.kill(owner,0);}catch(e){alive=(e as NodeJS.ErrnoException).code!=='ESRCH';}if(!alive){const abandoned=lock+'.'+randomUUID();renameSync(lock,abandoned);rmSync(abandoned,{recursive:true,force:true});continue;}}}catch{}
      await delay(15);continue;
    }
    try{writeFileSync(path.join(lock,'owner'),String(process.pid),{mode:0o600});return action();}finally{rmSync(lock,{recursive:true,force:true});}
  }
}
