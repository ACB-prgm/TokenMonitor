import {readdirSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
function markdown(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?markdown(path.join(directory,e.name)):e.name.endsWith('.md')?[path.join(directory,e.name)]:[]);}
const failures=[];
for(const file of [path.join(root,'README.md'),...markdown(path.join(root,'docs'))]){
 const text=readFileSync(file,'utf8').replace(/```[\s\S]*?```/g,'');
 for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
  const target=match[1].split(/\s+"/)[0].replace(/^<|>$/g,'').split('#')[0];
  if(!target||/^[a-z]+:/i.test(target))continue;
  if(!existsSync(path.resolve(path.dirname(file),decodeURIComponent(target))))failures.push(`${path.relative(root,file)}: ${target}`);
 }
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Documentation links verified.');
