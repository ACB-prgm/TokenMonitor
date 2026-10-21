import {readFile,readdir} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const repo=fileURLToPath(new URL('..',import.meta.url)),plugin=path.join(repo,'plugins/token-monitor-embedded');
const version=(await readFile(path.join(repo,'VERSION'),'utf8')).trim();assert.match(version,/^\d+\.\d+\.\d+$/);
for(const name of ['package.json','package-lock.json','.codex-plugin/plugin.json']){const data=JSON.parse(await readFile(path.join(plugin,name),'utf8'));assert.equal(data.version,version);if(name==='package-lock.json')assert.equal(data.packages[''].version,version);else assert.equal(data.license,'PolyForm-Noncommercial-1.0.0');}
const catalog=JSON.parse(await readFile(path.join(repo,'.agents/plugins/marketplace.json'),'utf8'));assert.equal(catalog.name,'tokenmonitor');assert.equal(catalog.plugins[0].policy.installation,'NOT_AVAILABLE');
const manifest=JSON.parse(await readFile(path.join(plugin,'.codex-plugin/plugin.json'),'utf8'));assert.equal(manifest.name,'token-monitor-embedded');assert.equal(manifest.requires_local_executor,true);assert.equal(manifest.hooks,'./hooks/hooks.json');assert.equal(manifest.mcpServers,'./.mcp.json');
const hooks=JSON.parse(await readFile(path.join(plugin,'hooks/hooks.json'),'utf8')).hooks;assert.equal(Object.keys(hooks).length,6);for(const [event,groups]of Object.entries(hooks))assert.ok(groups[0].hooks[0].command.includes(event==='UserPromptSubmit'?'--startup-hook':'--hook'));
assert.ok((await readFile(path.join(repo,'LICENSE'),'utf8')).startsWith('# PolyForm Noncommercial License 1.0.0'));
const ignored=new Set(['.git','.build','build','dist','node_modules','runtime']);
async function scan(dir){for(const f of await readdir(dir,{withFileTypes:true})){if(ignored.has(f.name))continue;assert.ok(!f.name.endsWith('.swift'),'Unexpected retired source '+f.name);assert.ok(f.name!=='Package.swift');if(f.isDirectory())await scan(path.join(dir,f.name));}}await scan(repo);
assert.ok((await readFile(path.join(plugin,'shared/version.ts'),'utf8')).includes("import metadata from '../package.json'"));
assert.ok((await readFile(path.join(repo,'docs',`RELEASE-${version}.md`),'utf8')).includes(`TokenMonitor ${version}`));
console.log('Release metadata, hooks, license and source inventory verified: '+version);
