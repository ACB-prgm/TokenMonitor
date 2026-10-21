#!/usr/bin/env node
// One shared implementation; platform manifests select only the runtime/bootstrap.
import {mkdir,readFile,writeFile,rm,cp,readdir,chmod,stat} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';
const repo=fileURLToPath(new URL('..',import.meta.url)),plugin=path.join(repo,'plugins/token-monitor-embedded');
const pin=JSON.parse(await readFile(path.join(plugin,'scripts/runtime.json'),'utf8')),version=(await readFile(path.join(repo,'VERSION'),'utf8')).trim();
const host=`${process.platform==='darwin'?'macos':process.platform==='win32'?'windows':process.platform}-${process.arch}`;
const requested=process.argv[process.argv.indexOf('--target')+1];const targets=process.argv.includes('--target')?(requested==='all'?Object.keys(pin.targets):[requested]):[host];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(args,cwd=repo)=>execFileSync(process.execPath,args,{cwd,stdio:'inherit'});
run(['scripts/check-release.mjs']);run(['scripts/build.mjs'],plugin);
if(!process.argv.includes('--skip-tests')){run(['node_modules/typescript/bin/tsc','--noEmit'],plugin);run(['--test',...((await readdir(path.join(plugin,'tests'))).filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f))],plugin);}
const notices=[];
async function licenses(dir){for(const d of await readdir(dir,{withFileTypes:true})){if(d.isDirectory()){const child=path.join(dir,d.name);if(d.name.startsWith('@'))await licenses(child);else {try{const info=JSON.parse(await readFile(path.join(child,'package.json'),'utf8'));for(const f of await readdir(child))if(/^(LICENSE|LICENCE|COPYING)/i.test(f)&&(await stat(path.join(child,f))).isFile())notices.push(`${info.name} ${info.version}\n${await readFile(path.join(child,f),'utf8')}`);if((await readdir(child)).includes('node_modules'))await licenses(path.join(child,'node_modules'));}catch{}}}}}
await licenses(path.join(plugin,'node_modules'));
for(const target of targets){
 const config=pin.targets[target];if(!config)throw new Error('Unsupported target '+target);
 const cache=path.join(repo,'.build/embedded-runtime');await mkdir(cache,{recursive:true});const archive=path.join(cache,config.archive);
 let bytes;try{bytes=await readFile(archive);}catch{const response=await fetch(config.url);if(!response.ok)throw new Error('Runtime download failed '+response.status);bytes=Buffer.from(await response.arrayBuffer());await writeFile(archive,bytes);}
 if(digest(bytes)!==config.sha256)throw new Error('Runtime archive checksum mismatch for '+target);
 const extract=path.join(cache,target);await rm(extract,{recursive:true,force:true});await mkdir(extract,{recursive:true});
 // Python is a build-time archive utility only; never included or required by a plugin.
 execFileSync(process.platform==='win32'?'python':'python3',['-c',`import sys,zipfile,tarfile\na,d=sys.argv[1:]\nif a.endswith('.zip'):\n with zipfile.ZipFile(a) as z: z.extractall(d)\nelse:\n with tarfile.open(a) as t: t.extractall(d,filter='data')`,archive,extract],{stdio:'inherit'});
 const prefix=config.archive.replace(/\.(tar\.gz|zip)$/,'');const node=await readFile(path.join(extract,prefix,config.executable));
 const output=path.join(repo,'dist',target,'token-monitor-embedded');await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
 for(const name of ['.codex-plugin','assets','server/dist','ui/dist','README.md','VALIDATION.md'])await cp(path.join(plugin,name),path.join(output,name),{recursive:true});
 for(const name of ['LICENSE','NOTICE'])await cp(path.join(repo,name),path.join(output,name));
 await mkdir(path.join(output,'runtime'),{recursive:true});await writeFile(path.join(output,'runtime/node.gz'),gzipSync(node,{mtime:0}));await writeFile(path.join(output,'runtime/node.sha256'),digest(node)+'\n');await cp(path.join(extract,prefix,'LICENSE'),path.join(output,'runtime/NODE-LICENSE.txt'));
 await mkdir(path.join(output,'scripts'),{recursive:true});const windows=config.os==='win';const launcher=windows?'launch.ps1':'launch.sh';await cp(path.join(plugin,'scripts',launcher),path.join(output,'scripts',launcher));
 const command=windows?'powershell.exe':'/bin/sh',args=windows?['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','./scripts/launch.ps1']:['./scripts/launch.sh'];
 await writeFile(path.join(output,'.mcp.json'),JSON.stringify({mcpServers:{'token-monitor-embedded':{command,args,cwd:'.'}}},null,2)+'\n');
 const hooks={};for(const event of ['UserPromptSubmit','SessionStart','Stop','SessionEnd','PreCompact','PostCompact']){
  const mode=event==='UserPromptSubmit'?'--startup-hook':'--hook';
  const hookCommand=windows?`powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$env:PLUGIN_ROOT/scripts/launch.ps1" -Mode ${mode.slice(2)}`:`/bin/sh "$PLUGIN_ROOT/scripts/launch.sh" ${mode}`;
  hooks[event]=[{hooks:[{type:'command',command:hookCommand,timeout:event==='SessionEnd'?3:10,...(event==='UserPromptSubmit'?{statusMessage:'Preparing TokenMonitor'}:{})}]}];
 }
 await mkdir(path.join(output,'hooks'),{recursive:true});await writeFile(path.join(output,'hooks/hooks.json'),JSON.stringify({description:'Local metadata hooks and a once-per-chat startup instruction; no model refresh turns.',hooks},null,2)+'\n');
 await writeFile(path.join(output,'THIRD-PARTY-NOTICES.txt'),notices.join('\n\n---\n\n'));
 const files=[];async function inventory(dir){for(const f of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,f.name);if(f.isDirectory())await inventory(full);else files.push({path:path.relative(output,full).split(path.sep).join('/'),sha256:digest(await readFile(full))});}}await inventory(output);
 let commit='unknown',dirty=true;try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();dirty=!!execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:repo,encoding:'utf8'}).trim();}catch{}
 await writeFile(path.join(output,'release.json'),JSON.stringify({version,target,nodeVersion:pin.version,runtimeArchiveSha256:config.sha256,minimumOS:config.minimumOS,commit,dirty,files},null,2)+'\n');
 const zip=path.join(repo,'dist',`token-monitor-embedded-${version}-${target}.zip`);
 execFileSync(process.platform==='win32'?'python':'python3',['-c',`import pathlib,sys,zipfile\nsrc=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted(src.rglob('*')):\n  if p.is_file(): z.write(p,'token-monitor-embedded/'+p.relative_to(src).as_posix())`,output,zip]);
 await writeFile(zip+'.sha256',digest(await readFile(zip))+'  '+path.basename(zip)+'\n');
 // A complete local marketplace wrapper supports the documented Codex CLI install.
 const wrapper=path.join(repo,'dist',target,'TokenMonitor');await rm(wrapper,{recursive:true,force:true});await mkdir(path.join(wrapper,'plugins'),{recursive:true});await cp(output,path.join(wrapper,'plugins/token-monitor-embedded'),{recursive:true});await mkdir(path.join(wrapper,'.agents/plugins'),{recursive:true});await cp(path.join(repo,'.agents/plugins/marketplace.json'),path.join(wrapper,'.agents/plugins/marketplace.json'));
 await cp(path.join(repo,'scripts',windows?'install.ps1':'install.sh'),path.join(wrapper,windows?'install.ps1':'install.sh'));
 for(const name of ['README.md','CONTRIBUTING.md','CHANGELOG.md','LICENSE','NOTICE'])await cp(path.join(repo,name),path.join(wrapper,name));await cp(path.join(repo,'docs'),path.join(wrapper,'docs'),{recursive:true});
 const wrapperZip=path.join(repo,'dist',`token-monitor-${version}-${target}.zip`);execFileSync(process.platform==='win32'?'python':'python3',['-c',`import pathlib,sys,zipfile\nsrc=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted(src.rglob('*')):\n  if p.is_file(): z.write(p,'TokenMonitor/'+p.relative_to(src).as_posix())`,wrapper,wrapperZip]);await writeFile(wrapperZip+'.sha256',digest(await readFile(wrapperZip))+'  '+path.basename(wrapperZip)+'\n');
 console.log('Packaged '+target+': '+zip);
}
