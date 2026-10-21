import React from 'react';
import {installedVersion} from '../../shared/version.js';
import type {UpdateStatus,Target} from '../../server/src/updates.js';
export type UpdateAction={action:'opening'|'check'|'configure'|'dismiss'|'link';automatic?:boolean;target?:Target|'auto';version?:string;url?:string};
export function UpdateMenu({value,onAction,error=''}:{value?:UpdateStatus;onAction?:(action:UpdateAction)=>void;error?:string}) {
 const v=value,version=v?.installedVersion??installedVersion;
 if(!onAction)return <span className="version">{version} · Local</span>;
 const label=v?.checking?`v${version} · Checking…`:v?.status==='available'&&!v.dismissed?`v${v.latestVersion} available`:
  v?.status==='current'?`v${version} · ${v.stale?'Last checked':'Up to date'}`:v?.status==='ahead'?`v${version} · Ahead of release`:
  v?.status==='available'?`v${version} · Update dismissed`:`v${version} · ${v?.error?'Unable to check':'Local'}`;
 return <details className={`updates ${v?.status==='available'&&!v.dismissed?'has-update':''}`}>
  <summary className="version" title="Version and update options">{label}</summary>
  <div className="update-menu" aria-label="Version and update options">
   <strong>Installed v{version}</strong>
   <p role="status">{v?.checking?'Checking GitHub in the background…':v?.error??(v?.status==='available'?`v${v.latestVersion} available`:v?.status==='current'?'Up to date':v?.status==='ahead'?'Installed version is newer than the latest stable release.':'Update status unknown.')}</p>
   {v?.latestVersion&&<p className="hint">{v.stale?'Last known release':'Latest stable'}: v{v.latestVersion}{v.publishedAt?` · Published ${new Date(v.publishedAt).toLocaleDateString()}`:''}</p>}
   {v?.checkedAt&&<p className="hint">Last checked {new Date(v.checkedAt).toLocaleString()}{v.stale?' · cached':''}</p>}
   <div className="update-actions">
    <button disabled={v?.checking} onClick={()=>onAction({action:'check'})}>Check for Updates</button>
    {v?.releaseURL&&<button onClick={()=>onAction({action:'link',url:v.releaseURL})}>View Release</button>}
    {v?.downloadURL&&v.status==='available'&&<button onClick={()=>onAction({action:'link',url:v.downloadURL})}>Download Update</button>}
    {v?.checksumURL&&v.status==='available'&&<button onClick={()=>onAction({action:'link',url:v.checksumURL})}>Download SHA-256</button>}
   </div>
   <label className="automatic-check"><input type="checkbox" checked={v?.automatic??true} onChange={e=>onAction({action:'configure',automatic:e.target.checked})}/> Check at each panel opening</label>
   <label>Package <select aria-label="Update package platform and architecture" value={v?.target===v?.detectedTarget?'auto':v?.target??'auto'} onChange={e=>onAction({action:'configure',target:e.target.value as Target|'auto'})}>
    <option value="auto">Automatic{v?.detectedTarget?` (${v.detectedTarget})`:' (unsupported platform)'}</option>
    <option value="macos-arm64">macOS Apple silicon</option><option value="macos-x64">macOS Intel</option><option value="windows-x64">Windows x64</option><option value="windows-arm64">Windows ARM64</option>
   </select></label>
   {v?.latestVersion&&!v.downloadURL&&<p className="hint">No verified package and checksum pair is available for this target. View the release for details.</p>}
   {v?.status==='available'&&!v.dismissed&&<button onClick={()=>onAction({action:'dismiss',version:v.latestVersion})}>Dismiss v{v.latestVersion}</button>}
   <p className="hint">Verify the ZIP checksum before extracting. Run the packaged installer to update, then restart Codex. Hook approval may be required.</p>
   {error&&<p className="update-error" role="status">{error}</p>}
  </div>
 </details>;
}
