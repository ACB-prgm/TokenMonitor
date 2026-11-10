import {AppBridge} from './app-bridge.js';
import {liveAllowances,type Allowances} from './allowances.js';
export interface UsageBridge {available:boolean;call(tool:'get_usage_limits',args:Record<string,unknown>,sourceThreadId:string):Promise<any>}
/** Shared read/cache boundary; callers supply an authenticated app chat context. */
export class BridgeUsage {
  private pending?:Promise<any>;private value?:any;private observed=0;private next=0;private failures=0;private source?:string;private closed=false;
  constructor(private bridge:UsageBridge=new AppBridge(),private now=()=>Date.now()){}
  bind(source:string){this.source=source;}
  get available(){return this.bridge.available&&!!this.source&&!this.closed;}
  get observedAt(){return this.observed;}
  get current(){return this.value;}
  snapshot():Allowances{const values=this.value?liveAllowances(this.value,new Date(this.observed).toISOString()):{};if(this.failures)for(const v of Object.values(values))v.stale=true;return values;}
  async read(force=false){
    if(!this.available)throw Error('Live app usage unavailable.');
    if(this.pending)return this.pending;
    if(this.now()<this.next&&this.failures)throw Error('Live app usage is retrying.');
    if(!force&&this.now()<this.next&&this.value)return this.value;
    this.pending=this.bridge.call('get_usage_limits',{},this.source!).then(value=>{
      if(this.closed)throw Error('Usage reader closed.');
      if(typeof value?.accountId!=='string'||!value.accountId)throw Error('Account identity unavailable.');
      this.value=value;this.observed=this.now();this.failures=0;this.next=this.now()+30000;return value;
    }).catch(error=>{this.failures++;this.next=this.now()+Math.min(300000,15000*2**Math.min(this.failures-1,5));throw error;}).finally(()=>{this.pending=undefined;});
    return this.pending;
  }
  touch(){void this.read().catch(()=>{});}
  close(){this.closed=true;}
}
