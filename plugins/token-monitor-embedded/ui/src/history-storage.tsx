import React,{useState} from 'react';
export type HistoryDiagnostics={retentionDays:number;databaseBytes:number;journalBytes:number;reusableBytes:number;backlog:number;frozenThreads:number};
const size=(n:number)=>`${(n/1048576).toLocaleString('en-US',{maximumFractionDigits:2})} MiB`;
export function HistoryStorage({load}:{load?:()=>Promise<HistoryDiagnostics>}){
 const [value,setValue]=useState<HistoryDiagnostics>(),[pending,setPending]=useState(false),[error,setError]=useState('');
 if(!load)return null;
 return <section><h2>History storage</h2><p>90 days of numeric detail; permanent summaries. No conversation text or automatic backup copies.</p><button type="button" disabled={pending} onClick={async()=>{setPending(true);setError('');try{setValue(await load());}catch{setError('Storage diagnostics are temporarily unavailable.');}finally{setPending(false);}}}>{pending?'Checking…':'Inspect storage'}</button>{error&&<p role="status">{error}</p>}{value&&<dl className="details-grid"><dt>Database</dt><dd>{size(value.databaseBytes)}</dd><dt>Transaction journal</dt><dd>{size(value.journalBytes)}</dd><dt>Reusable space</dt><dd>{size(value.reusableBytes)}</dd><dt>Detail retention</dt><dd>{value.retentionDays} days</dd><dt>Pending imports</dt><dd>{value.backlog}</dd><dt>Saved calculation versions</dt><dd>{value.frozenThreads} chats</dd></dl>}</section>;
}
