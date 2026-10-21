import {existsSync,openSync,readSync,closeSync,realpathSync} from 'node:fs';
import path from 'node:path';
/** Resolve native Codex or its installed npm entry point without a shell or system Node. */
export function codexCommand(env:NodeJS.ProcessEnv=process.env,platform:string=process.platform):{command:string;prefix:string[]} {
 const windows=platform==='win32',p=windows?path.win32:path;
 const dirs=(env.PATH??env.Path??'').split(windows?';':path.delimiter).filter(Boolean);
 const candidates=env.CODEX_CLI_PATH?[env.CODEX_CLI_PATH]:dirs.flatMap(dir=>windows?
  [p.join(dir,'codex.exe'),p.join(dir,'node_modules/@openai/codex/bin/codex.js')]:[p.join(dir,'codex')]);
 for(const candidate of candidates){
  if(!existsSync(candidate))continue;
  const resolved=realpathSync(candidate);
  if(/\.(cmd|bat)$/i.test(resolved))throw Error('Set CODEX_CLI_PATH to the native codex.exe or installed codex.js entry point.');
  const fd=openSync(resolved,'r'),header=Buffer.alloc(100);
  let length;try{length=readSync(fd,header,0,100,0);}finally{closeSync(fd);}
  if(resolved.endsWith('.js')||header.subarray(0,length).toString().match(/^#!.*\bnode\b/))return {command:process.execPath,prefix:[resolved]};
  return {command:resolved,prefix:[]};
 }
 throw Error('Codex CLI not found. Add Codex to PATH or set CODEX_CLI_PATH to its existing executable.');
}
