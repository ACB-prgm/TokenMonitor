/** The preview survives pointer gaps and owns its entire dismissal lifecycle. */
export type Inspection = {hovered:string|null; focused:string|null; pinned:string|null; closing:boolean};
type Timer = ReturnType<typeof setTimeout>;
export class InspectionController {
  state:Inspection={hovered:null,focused:null,pinned:null,closing:false};
  private timer?:Timer;
  private inside=false;
  private disposed=false;
  constructor(private changed:(state:Inspection)=>void,private reducedMotion=()=>false,
    private schedule:(callback:()=>void,ms:number)=>Timer=(callback,ms)=>setTimeout(callback,ms),private cancel:(timer:Timer)=>void=timer=>clearTimeout(timer)){}
  get active(){return this.state.hovered??this.state.focused??this.state.pinned;}
  private stop(){if(this.timer!==undefined)this.cancel(this.timer);this.timer=undefined;}
  private emit(){if(!this.disposed)this.changed({...this.state});}
  enter(key?:string){this.stop();this.inside=true;this.state.closing=false;if(key)this.state.hovered=key;this.emit();}
  leave(){this.inside=false;this.dismiss();}
  focus(key?:string){this.stop();this.state.closing=false;if(key)this.state.focused=key;this.emit();}
  blur(){this.state.focused=null;this.dismiss();}
  pin(key:string){if(this.state.pinned===key)this.clear();else{this.stop();this.state.pinned=key;this.state.closing=false;this.emit();}}
  private dismiss(){
    this.stop();if(this.inside||this.state.focused||!this.state.hovered)return;
    this.timer=this.schedule(()=>{
      this.timer=undefined;
      // Restore a pinned call without closing its panel.
      if(this.state.pinned){this.state.hovered=null;this.emit();return;}
      if(this.reducedMotion()){this.state.hovered=null;this.emit();return;}
      this.state.closing=true;this.emit();
      this.timer=this.schedule(()=>{this.timer=undefined;this.state.hovered=null;this.state.closing=false;this.emit();},140);
    },200);
  }
  retain(keys:Set<string>){
    let changed=false;for(const field of ['hovered','focused','pinned'] as const)if(this.state[field]&&!keys.has(this.state[field]!)){this.state[field]=null;changed=true;}
    if(changed){this.stop();this.state.closing=false;this.emit();}
  }
  clear(){this.stop();this.state={hovered:null,focused:null,pinned:null,closing:false};this.emit();}
  dispose(){this.stop();this.disposed=true;}
}
