import React from 'react';
import {installedVersion} from '../../shared/version.js';
import type {UpdateStatus,Target} from '../../server/src/updates.js';
export type UpdateAction={action:'opening'|'check'|'configure'|'dismiss'|'link'|'install';automatic?:boolean;target?:Target|'auto';version?:string;url?:string};
export function UpdateMenu({value,onAction,error=''}:{value?:UpdateStatus;onAction?:(action:UpdateAction)=>void;error?:string}) {
 const v=value,version=v?.installedVersion??installedVersion;
 const installation=v?.installation,busy=!!installation&&!['installed','failed'].includes(installation.phase),installed=installation?.phase==='installed';
 const progress=installation?({downloading:'Downloading update…',verifying:'Verifying checksum…',extracting:'Preparing update…',installing:'Installing update…',installed:`v${installation.version} installed. Restart Codex to finish.`,failed:installation.error??'Installation failed. Please retry.'}[installation.phase]):undefined;
 if(!onAction)return <span className="version">{version} · Local</span>;
 const label=v?.checking?`v${version} · Checking…`:v?.status==='available'&&!v.dismissed?`v${v.latestVersion} available`:
  v?.status==='current'?`v${version} · ${v.stale?'Last checked':'Up to date'}`:v?.status==='ahead'?`v${version} · Ahead of release`:
  v?.status==='available'?`v${version} · Update dismissed`:`v${version} · ${v?.error?'Unable to check':'Local'}`;
 return <details className={`updates ${v?.status==='available'&&!v.dismissed?'has-update':''}`}>
  <summary className="version version-toggle" title="Open version and update options"><span>{label}</span><svg className="update-chevron" aria-hidden="true" viewBox="0 0 12 12"><path d="m3 4.5 3 3 3-3"/></svg></summary>
  <div className="update-menu" aria-label="Version and update options">
   <strong>Installed v{version}</strong>
   <p role="status">{v?.checking?'Checking GitHub in the background…':v?.error??(v?.status==='available'?`v${v.latestVersion} available`:v?.status==='current'?'Up to date':v?.status==='ahead'?'Installed version is newer than the latest stable release.':'Update status unknown.')}</p>
   {v?.latestVersion&&<p className="hint">{v.stale?'Last known release':'Latest stable'}: v{v.latestVersion}{v.publishedAt?` · Published ${new Date(v.publishedAt).toLocaleDateString()}`:''}</p>}
   {v?.checkedAt&&<p className="hint">Last checked {new Date(v.checkedAt).toLocaleString()}{v.stale?' · cached':''}</p>}
   <div className="update-actions">
    <button disabled={v?.checking||busy} onClick={()=>onAction({action:'check'})}>Check for Updates</button>
    {v?.releaseURL&&<button onClick={()=>onAction({action:'link',url:v.releaseURL})}>View Release</button>}
    {v?.downloadURL&&v.status==='available'&&<button disabled={busy||(installed&&installation.version===v.latestVersion)||v.target!==v.detectedTarget} onClick={()=>onAction({action:'install',version:v.latestVersion})}>{busy?'Updating…':installed&&installation.version===v.latestVersion?'Installed':'Update and install'}</button>}
   </div>
   <label className="automatic-check"><input type="checkbox" checked={v?.automatic??true} onChange={e=>onAction({action:'configure',automatic:e.target.checked})}/> Check at each panel opening</label>
   <label>Package <select disabled={busy} aria-label="Update package platform and architecture" value={v?.target===v?.detectedTarget?'auto':v?.target??'auto'} onChange={e=>onAction({action:'configure',target:e.target.value as Target|'auto'})}>
    <option value="auto">Automatic{v?.detectedTarget?` (${v.detectedTarget})`:' (unsupported platform)'}</option>
    <option value="macos-arm64">macOS Apple silicon</option><option value="macos-x64">macOS Intel</option><option value="windows-x64">Windows x64</option><option value="windows-arm64">Windows ARM64</option>
   </select></label>
   {v?.latestVersion&&!v.downloadURL&&<p className="hint">No verified package and checksum pair is available for this target. View the release for details.</p>}
   {v?.status==='available'&&!v.dismissed&&<button onClick={()=>onAction({action:'dismiss',version:v.latestVersion})}>Dismiss v{v.latestVersion}</button>}
   {v?.target!==v?.detectedTarget&&<p className="hint">Choose Automatic to install the package for this computer.</p>}
   {progress&&<p role="status" className={installation?.phase==='failed'?'update-error':'hint'}>{progress}</p>}
   <p className="hint">Downloads, verifies, and installs the update. Restart Codex afterward; hook approval may be required.</p>
   {error&&<p className="update-error" role="status">{error}</p>}
  </div>
 </details>;
}
