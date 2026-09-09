import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),output=resolve(root,'dist');
const files=['index.html','styles.css','game.js','package.json','server/app.js','shared/engine.js','shared/motion.js',
  ...['hero','landscape','board'].map(name=>`assets/images/${name}.webp`),
  ...['red','black'].flatMap(side=>['K','A','B','N','R','C','P'].map(type=>`assets/images/pieces/${side}-${type}.webp`))].sort();
const contents=await Promise.all(files.map(async path=>({path,bytes:await readFile(resolve(root,path))})));
const digest=createHash('sha256'),hashes={};
for(const {path,bytes} of contents){hashes[path]=createHash('sha256').update(bytes).digest('hex');digest.update(path+'\0'+hashes[path]+'\n');}
const id=digest.digest('hex').slice(0,16);
await rm(output,{recursive:true,force:true});
for(const {path} of contents){const target=resolve(output,path);await mkdir(dirname(target),{recursive:true});await copyFile(resolve(root,path),target);}
await writeFile(resolve(output,'release.json'),JSON.stringify({id,files:hashes},null,2)+'\n');
console.log(`Built ${id}: ${files.length} files, ${contents.reduce((sum,file)=>sum+file.bytes.length,0)} bytes`);
