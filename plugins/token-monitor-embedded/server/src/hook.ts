import {TelemetryStore} from './collector.js';
// Hooks are bounded and silent; invalid telemetry never blocks a user's task.
try {
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;if(size>1024*1024){process.stdin.destroy();break;}chunks.push(chunk);}
  if(size<=1024*1024)await new TelemetryStore().record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}catch{}
