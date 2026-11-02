import {parentPort,workerData} from 'node:worker_threads';
import {EfficiencyStore} from './efficiency.js';
if(!parentPort)throw Error('History worker requires a parent');
const store=new EfficiencyStore(workerData.home,{backgroundMigration:true});
parentPort.on('message',async({id,method,args})=>{try{
 const value=method==='scan'?await store.scan(workerData.home,args.files,args.complete,Date.now(),args.reconcile):method==='snapshot'?store.snapshot(args.id):method==='diagnostics'?store.storageDiagnostics():method==='saved'?store.savedTasks(args.query,args.includeArchived):undefined;
 parentPort!.postMessage({id,value});
}catch(error){parentPort!.postMessage({id,error:error instanceof Error?error.message:'Historical storage unavailable'});}});
parentPort.on('close',()=>store.close());
