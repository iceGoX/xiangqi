import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

test('service starts through an atomic-release current symlink',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'xiangqi-start-'));let child;
  try{
    await symlink(fileURLToPath(new URL('../',import.meta.url)),join(dir,'current'));
    child=spawn(process.execPath,[join(dir,'current/server/app.js'),'--port','0'],{env:{...process.env,DATA_FILE:join(dir,'rooms.json')},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Service failed to start')),5000);
      child.once('exit',code=>{clearTimeout(timer);reject(Error(`Service exited before listening: ${code}`));});
      child.stdout.on('data',data=>{if(data.toString().includes('Xiangqi listening')){clearTimeout(timer);resolve();}});
      child.once('error',reject);
    });
    assert.equal(child.exitCode,null);
  }finally{if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}await rm(dir,{recursive:true,force:true});}
});
