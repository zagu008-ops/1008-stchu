// Split only outer comma-separated tags; preserve weights, schedules and escaped commas.
export function dedupePrompt(value){
    const tokens=[];let token='',round=0,square=0,angle=0,escaped=false;
    for(const char of String(value??'')){
        if(escaped){token+=char;escaped=false;continue;}
        if(char==='\\'){token+=char;escaped=true;continue;}
        if(char==='(')round++;if(char===')')round=Math.max(0,round-1);
        if(char==='[')square++;if(char===']')square=Math.max(0,square-1);
        if(char==='<')angle++;if(char==='>')angle=Math.max(0,angle-1);
        if((char===','||char==='\n')&&!round&&!square&&!angle){tokens.push(token.trim());token='';}else token+=char;
    }
    tokens.push(token.trim());
    const result=[],seen=new Map(),removed=[];
    for(const text of tokens){
        if(!text)continue;
        if(/^(BREAK|AND)$/.test(text)){result.push(text);seen.clear();continue;}
        const lora=text.match(/^<(?:lora|wlr):(.+?):(-?[\d.]+(?::-?[\d.]+){0,2})>$/i);
        const key=lora?'lora:'+lora[1].replace(/\\+/g,'/').replace(/\.(safetensors|ckpt|pt)$/i,''):text.replace(/\s+/g,' ').toLowerCase();
        if(seen.has(key)){
            const index=seen.get(key);removed.push(text);
            // Later outfit-specific weights override earlier common defaults.
            if(lora)result[index]=text;
        }else{seen.set(key,result.length);result.push(text);}
    }
    return {prompt:result.join(', '),removed};
}
