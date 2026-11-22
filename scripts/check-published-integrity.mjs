// Compare published public files to a clean build of a known Git revision.
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory=process.argv[2];
const base=process.argv[3]||'https://controle-de-saude.duckdns.org';
if(!directory)throw Error('Provide the clean baseline dist directory.');
async function files(path,prefix=''){
 const result=[];
 for(const entry of await readdir(path,{withFileTypes:true})){
  const name=prefix+entry.name;
  result.push(...(entry.isDirectory()?await files(`${path}/${entry.name}`,name+'/'):[name]));
 }
 return result;
}
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const checks=[];
for(const name of await files(directory)){
 const response=await fetch(`${base}/${name}`,{redirect:'error',signal:AbortSignal.timeout(15000)});
 let published=Buffer.from(await response.arrayBuffer()),expected=await readFile(`${directory}/${name}`);
 if(['index.html','sw.js'].includes(name)){
  const normalize=buffer=>Buffer.from(buffer.toString().replace(/\r\n?/g,'\n').split('\n').filter(line=>line.trim()).join('\n').replace(/ritmo-shell-1\.0\.0-[a-f0-9]{12}/g,'ritmo-shell-1.0.0-BUILD'));
  published=normalize(published);expected=normalize(expected);
 }
 if(name.endsWith('.webmanifest')){
  published=Buffer.from(JSON.stringify(JSON.parse(published.toString())));
  expected=Buffer.from(JSON.stringify(JSON.parse(expected.toString())));
 }
 checks.push({file:name,status:response.status,match:response.ok&&sha(published)===sha(expected)});
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),base,checks},null,2));
if(checks.some(check=>!check.match))process.exitCode=1;
