#!/usr/bin/env node
import {mkdir,readFile,writeFile,cp,realpath,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomInt,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildPlugin} from '../plugins/token-monitor-embedded/scripts/build.mjs';

const repo=fileURLToPath(new URL('..',import.meta.url));
export const marketplaceName='tokenmonitor-dev';
export const pluginName='token-monitor-dev';
export const selector=`${pluginName}@${marketplaceName}`;

export async function buildDev({marketplaceRoot=path.join(repo,'.build/tokenmonitor-dev')}={}) {
  if(Number(process.versions.node.split('.')[0])<24) throw Error('Token Monitor DEV requires Node 24 or newer.');
  const metadata=JSON.parse(await readFile(path.join(repo,'plugins/token-monitor-embedded/package.json'),'utf8'));
  // Each immutable snapshot gets a new SemVer so Codex refreshes its installed cache.
  const version=`${metadata.version.split('-')[0]}-dev.${Date.now()}.${randomInt(1000000)}`;
  const pluginRoot=path.join(marketplaceRoot,'builds',version,pluginName);
  await buildPlugin({outputRoot:pluginRoot,devVersion:version});
  const manifest=JSON.parse(await readFile(path.join(repo,'plugins/token-monitor-embedded/.codex-plugin/plugin.json'),'utf8'));
  manifest.name=pluginName;manifest.version=version;
  manifest.description='Local development build of TokenMonitor. Open manually to inspect this checkout.';
  manifest.interface={...manifest.interface,displayName:'Token Monitor DEV',shortDescription:'Local TokenMonitor development build',longDescription:manifest.description};
  await mkdir(path.join(pluginRoot,'.codex-plugin'),{recursive:true});
  await writeJSON(path.join(pluginRoot,'.codex-plugin/plugin.json'),manifest);
  await cp(path.join(repo,'plugins/token-monitor-embedded/assets'),path.join(pluginRoot,'assets'),{recursive:true});
  for(const name of ['LICENSE','NOTICE']) await cp(path.join(repo,name),path.join(pluginRoot,name));
  await writeJSON(path.join(pluginRoot,'.mcp.json'),{mcpServers:{[pluginName]:{
    command:process.execPath,args:['./server/dist/index.mjs'],cwd:'.'
  }}});
  // Keep DEV metadata current without requesting a second automatic panel.
  const hookCommand=process.platform==='win32'
    ? `& '${process.execPath.replaceAll("'","''")}' "$env:PLUGIN_ROOT/server/dist/hook.mjs"`
    : `'${process.execPath.replaceAll("'","'\\''")}' "$PLUGIN_ROOT/server/dist/hook.mjs"`;
  const hooks=Object.fromEntries(['SessionStart','Stop','SessionEnd','PreCompact','PostCompact'].map(event=>[
    event,[{hooks:[{type:'command',command:hookCommand,timeout:event==='SessionEnd'?3:10}]}]
  ]));
  await mkdir(path.join(pluginRoot,'hooks'),{recursive:true});
  await writeJSON(path.join(pluginRoot,'hooks/hooks.json'),{description:'DEV metadata only; open Token Monitor DEV manually.',hooks});
  await writeJSON(path.join(pluginRoot,'dev-build.json'),{version,node:process.execPath,source:repo,builtAt:new Date().toISOString()});
  await mkdir(path.join(marketplaceRoot,'.agents/plugins'),{recursive:true});
  // Publish the catalog last; a failed build leaves the previous snapshot usable.
  await writeJSON(path.join(marketplaceRoot,'.agents/plugins/marketplace.json'),{
    name:marketplaceName,interface:{displayName:'Token Monitor DEV'},plugins:[{
      name:pluginName,source:{source:'local',path:'./'+path.relative(marketplaceRoot,pluginRoot).split(path.sep).join('/')},
      policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'
    }]
  });
  return {marketplaceRoot,pluginRoot,version};
}

async function writeJSON(file,value) {
  const temporary=`${file}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify(value,null,2)+'\n');
  await rename(temporary,file);
}

export async function installDev({marketplaceRoot},run=args=>execFileSync(process.env.CODEX_CLI_PATH||'codex',['plugin',...args],{encoding:'utf8'})) {
  const {marketplaces}=JSON.parse(run(['marketplace','list','--json']));
  const existing=marketplaces.find(entry=>entry.name===marketplaceName);
  if(existing) {
    if(await realpath(existing.root)!==await realpath(marketplaceRoot)) throw Error(`The ${marketplaceName} marketplace belongs to another checkout: ${existing.root}. Remove that DEV marketplace explicitly before switching checkouts.`);
  } else run(['marketplace','add',marketplaceRoot]);
  // Only the DEV selector is installed/refreshed; the stable registration is untouched.
  console.log(run(['add',selector]));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const flags=process.argv.slice(2);
  if(flags.some(flag=>flag!=='--install')) throw Error('Usage: node scripts/dev.mjs [--install]');
  const result=await buildDev();
  console.log(`Built Token Monitor DEV ${result.version}\n${result.pluginRoot}`);
  if(flags.includes('--install')) {
    await installDev(result);
    console.log('Restart Codex, review DEV hook trust, then ask to open Token Monitor DEV.');
  } else console.log('Run npm run dev to build and install locally.');
}
