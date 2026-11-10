import net from 'node:net';
import {randomUUID} from 'node:crypto';

/** Adapter to the app-supplied pipe. No socket discovery or credentials are stored. */
export class AppBridge {
  constructor(private pipe=process.env.CODEX_APP_TOOLS_PIPE_PATH,private callerHost=process.env.CODEX_APP_TOOLS_CALLER_HOST_ID){}
  get available(){return !!this.pipe;}
  private request(method:string,params:unknown):Promise<any>{
    if(!this.pipe)return Promise.reject(Error('The app did not supply its tools bridge to this DEV process.'));
    return new Promise((resolve,reject)=>{
      const socket=net.createConnection(this.pipe!);let buffer=Buffer.alloc(0),finished=false;
      const finish=(error?:Error,value?:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);socket.destroy();error?reject(error):resolve(value);};
      const timer=setTimeout(()=>finish(Error('App bridge timed out; delivery may be unknown.')),15000);
      socket.on('error',()=>finish(Error('App bridge unavailable. Reconnect Token Monitor DEV or restart Codex to refresh the app connection.')));
      socket.on('close',()=>finish(Error('App bridge closed; delivery may be unknown.')));
      socket.on('connect',()=>{const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,method,params})),header=Buffer.alloc(4);header.writeUInt32LE(body.length);socket.write(Buffer.concat([header,body]));});
      socket.on('data',chunk=>{
        buffer=Buffer.concat([buffer,chunk]);
        if(buffer.length>8*1024*1024+4)return finish(Error('App bridge response exceeded its limit.'));
        if(buffer.length<4)return;const length=buffer.readUInt32LE(0);
        if(length===0||length>8*1024*1024)return finish(Error('Invalid app bridge frame.'));
        if(buffer.length<length+4)return;
        try{const result=JSON.parse(buffer.subarray(4,length+4).toString());if(result.id!==1||result.jsonrpc!=='2.0')throw Error();if(result.error)return finish(Error('The app rejected the bridge request.'));finish(undefined,result.result);}catch{finish(Error('Invalid app bridge response.'));}
      });
    });
  }
  async call(tool:'get_usage_limits'|'read_thread'|'send_message_to_thread',args:Record<string,unknown>,sourceThreadId:string){
    const result=await this.request('tools/call',{namespace:'codex_app',tool,arguments:args,callerSource:'codex',hostId:this.callerHost,threadId:sourceThreadId,callId:`tm-dev-${randomUUID()}`,turnId:`tm-dev-${randomUUID()}`});
    if(result?.success!==true)throw Error('The app tool rejected the request. Check the target chat before retrying.');
    const text=result.contentItems?.filter((v:any)=>v.type==='inputText').map((v:any)=>v.text).join('\n');
    try{return JSON.parse(text);}catch{if(tool==='send_message_to_thread')return {acknowledgement:true};throw Error('The app returned an unsupported response shape.');}
  }
}
