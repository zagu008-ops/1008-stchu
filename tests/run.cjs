const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');let failures=0;
const files=fs.readdirSync(__dirname).filter(name=>/\.test\.(mjs|cjs)$/.test(name)).sort();
for(const file of files){const result=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:root,encoding:'utf8'});if(result.status!==0){failures++;process.stdout.write(`FAIL ${file}\n${result.stdout||''}${result.stderr||''}`);}else process.stdout.write(`PASS ${file}\n`);}
process.stdout.write(`${files.length} tests; ${failures} failures\n`);process.exitCode=failures?1:0;
