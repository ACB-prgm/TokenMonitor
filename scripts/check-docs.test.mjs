import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkDocs} from './check-docs.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url));
test('documentation checker accepts redirects and rejects broken links, casing and missing release records',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tokenmonitor-docs-'));
 try{
  for(const p of ['LICENSE','docs','AGENTS.md','README.md','CONTRIBUTING.md','CHANGELOG.md','VERSION','plugins/token-monitor-embedded/README.md','plugins/token-monitor-embedded/VALIDATION.md','plugins/token-monitor-embedded/server/src','plugins/token-monitor-embedded/ui/src','plugins/token-monitor-embedded/tests'])await cp(path.join(repo,p),path.join(root,p),{recursive:true});
  await checkDocs(root);
  const index=path.join(root,'docs/index.md'),original=await readFile(index,'utf8');
  for(const link of ['missing.md','Architecture.md']){await writeFile(index,original+`\n[Broken](${link})\n`);await assert.rejects(checkDocs(root),/Missing or wrong-case/);}
  await writeFile(index,original);
  await rm(path.join(root,'docs/releases/1.10.0/validation.md'));
  await assert.rejects(checkDocs(root),/Missing or wrong-case/);
 }finally{await rm(root,{recursive:true,force:true});}
});
