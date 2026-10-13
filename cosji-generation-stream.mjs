export async function readGenerationStream(response,onProgress){
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',result;
 const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.error)throw new Error(event.error);if(event.stage)onProgress(event.stage+(event.promptId?' · 任务 '+event.promptId:''));if(event.result)result=event.result;};
 try{while(true){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const lines=pending.split('\n');pending=lines.pop();for(const line of lines)consume(line);}pending+=decoder.decode();consume(pending);if(!result)throw new Error('生图连接结束，但未收到图片结果');return result;}finally{reader.releaseLock();}
}
