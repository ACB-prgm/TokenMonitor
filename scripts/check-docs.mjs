import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
export async function checkDocs(root) {
 const docs=[];
 async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.name.endsWith('.md'))docs.push(p);}}
 await walk(path.join(root,'docs'));
 const files=[...docs,...['AGENTS.md','README.md','CONTRIBUTING.md','CHANGELOG.md','plugins/token-monitor-embedded/README.md','plugins/token-monitor-embedded/VALIDATION.md'].map(p=>path.join(root,p))];
 const graph=new Map();
 async function exact(p){let cursor=root;const rel=path.relative(root,p);assert.ok(!rel.startsWith('..'),'Link escapes repository: '+p);for(const part of rel.split(path.sep).filter(Boolean)){assert.ok((await readdir(cursor)).includes(part),'Missing or wrong-case link: '+p);cursor=path.join(cursor,part);}}
 for(const p of files){const raw=await readFile(p,'utf8');const s=raw.replace(/```[^\n]*\n[\s\S]*?```/g,'');assert.equal((s.match(/^# /gm)||[]).length,1,'Expected one title: '+p);const links=[];for(const m of s.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)){const url=m[1],repoURL='https://github.com/ACB-prgm/TokenMonitor/blob/main/';if(/^(https?:|mailto:|#)/.test(url)&&!url.startsWith(repoURL))continue;const dest=url.startsWith(repoURL)?path.resolve(root,decodeURIComponent(url.slice(repoURL.length).split('#')[0])):path.resolve(path.dirname(p),decodeURIComponent(url.split('#')[0]));await exact(dest);links.push(dest);}graph.set(p,links);assert.ok(!raw.includes('<!-- compatibility-redirect -->'),'Use canonical documents instead of redirects: '+p);}
 const seen=new Set();function visit(p){if(seen.has(p))return;seen.add(p);for(const q of graph.get(p)||[])visit(q);}visit(path.join(root,'docs/index.md'));
 for(const p of docs)assert.ok(seen.has(p),'Unreachable document: '+p);
 const version=(await readFile(path.join(root,'VERSION'),'utf8')).trim();for(const name of ['notes','validation'])await exact(path.join(root,'docs/releases',version,name+'.md'));
 assert.ok((await readFile(path.join(root,'CHANGELOG.md'),'utf8')).includes('## '+version+'\n'),'Missing current changelog entry');
 return files.length;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(`Documentation verified: ${await checkDocs(fileURLToPath(new URL('..',import.meta.url)))} files`);
