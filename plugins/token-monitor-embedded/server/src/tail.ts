import {closeSync,fstatSync,openSync,readSync} from 'node:fs';
export class JSONLTail {
  private offset=0;private identity?:string;private checkpoint=Buffer.alloc(0);private pending=Buffer.alloc(0);private discard=false;
  read(file:string,reset:()=>void,line:(record:Buffer)=>void) {
    const fd=openSync(file,'r');try{
      const stat=fstatSync(fd);if(!stat.isFile())throw new Error('Transcript is not a file');const identity=`${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      let rewritten=false;if(this.offset>0&&stat.size>=this.offset&&this.checkpoint.length){const check=Buffer.alloc(this.checkpoint.length);const count=readSync(fd,check,0,check.length,this.offset-check.length);rewritten=count!==check.length||!check.equals(this.checkpoint);}
      if(this.identity!==identity||stat.size<this.offset||rewritten){this.offset=0;this.checkpoint=Buffer.alloc(0);this.pending=Buffer.alloc(0);this.discard=false;reset();}
      this.identity=identity;const buffer=Buffer.alloc(65536);
      // Read only the size observed at entry: a constantly growing transcript
      // cannot monopolize the server. No descriptor survives this call.
      while(this.offset<stat.size){const count=readSync(fd,buffer,0,Math.min(buffer.length,stat.size-this.offset),this.offset);if(!count)break;
        this.offset+=count;const block=buffer.subarray(0,count);this.checkpoint=Buffer.from(Buffer.concat([this.checkpoint,block]).subarray(-128));
        this.pending=Buffer.concat([this.pending,block]);let end:number;
        while((end=this.pending.indexOf(10))>=0){if(!this.discard&&end<=4*1024*1024)line(this.pending.subarray(0,end));this.discard=false;this.pending=Buffer.from(this.pending.subarray(end+1));}
        if(this.pending.length>4*1024*1024){this.pending=Buffer.alloc(0);this.discard=true;}
      }
    }finally{closeSync(fd);}
  }
}
