import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createGame} from '../shared/engine.js';
import {createApp} from '../server/app.js';

async function setup(t,options={}){
  const app=createApp({dataFile:null,...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const req=async(path,body,session,headers={})=>{const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.token}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const create=async()=>{const a=await req('rooms',{name:'松风',side:'red'});assert.equal(a.status,201);return a.data;};
  const pair=async()=>{const a=await create(),b=(await req(`rooms/${a.room.code}/join`,{name:'远山'})).data;const start=(await req(`rooms/${a.room.code}/actions`,{type:'start',expectedVersion:b.room.version,requestId:randomUUID()},a.session)).data;return {a:a.session,b:b.session,room:start.room};};
  return {...app,base,req,create,pair};
}
test('online creation, authenticated snapshot, join, host start, standard game',async t=>{
  const s=await setup(t),a=await s.create();assert.match(a.room.code,/^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await s.req(`rooms/${a.room.code}`)).status,401);
  assert.equal((await s.req(`rooms/${a.room.code}`,null,a.session)).status,200);
  const b=(await s.req(`rooms/${a.room.code}/join`,{name:'远山'})).data;
  assert.equal((await s.req(`rooms/${a.room.code}/actions`,{type:'start',expectedVersion:b.room.version,requestId:randomUUID()},b.session)).status,409);
  const started=await s.req(`rooms/${a.room.code}/actions`,{type:'start',expectedVersion:b.room.version,requestId:randomUUID()},a.session);
  assert.equal(started.status,200);assert.equal(started.data.room.game.board.filter(Boolean).length,32);
  assert.equal(JSON.stringify(started.data).includes('hash'),false);assert.equal(started.data.room.game.turn,'red');
});
test('server rejects out-of-turn, illegal and stale moves without changing position',async t=>{
  const s=await setup(t),{a,b,room}=await s.pair(),path=`rooms/${room.code}/actions`;
  const post=(session,fields)=>s.req(path,{type:'move',expectedVersion:room.version,requestId:randomUUID(),...fields},session);
  assert.equal((await post(b,{from:27,to:36})).status,400);
  assert.equal((await post(a,{from:54,to:55})).status,400);
  assert.equal((await post(a,{from:-1,to:45})).status,400);
  const unchanged=(await s.req(`rooms/${room.code}`,null,a)).data.room;assert.deepEqual(unchanged.game.board,room.game.board);assert.equal(unchanged.version,room.version);
  const ok=await post(a,{from:54,to:45});assert.equal(ok.status,200);assert.equal(ok.data.room.game.turn,'black');
  assert.equal((await post(b,{from:27,to:36})).status,409);
});
test('idempotency avoids duplicate moves and rejects reused ids with different payload',async t=>{
  const s=await setup(t),{a,room}=await s.pair(),path=`rooms/${room.code}/actions`,body={type:'move',from:54,to:45,expectedVersion:room.version,requestId:randomUUID()};
  const first=await s.req(path,body,a),again=await s.req(path,body,a);assert.equal(first.status,200);assert.equal(again.status,200);assert.equal(again.data.room.game.history.length,1);assert.equal(again.data.room.version,first.data.room.version);
  assert.equal((await s.req(path,{...body,to:36},a)).status,409);
});
test('undo negotiation locks moves, requires opponent, restores turn, counts uses',async t=>{
  const s=await setup(t),{a,b,room}=await s.pair(),path=`rooms/${room.code}/actions`;let v=room.version;
  const act=async(session,type,fields={})=>{const r=await s.req(path,{type,expectedVersion:v,requestId:randomUUID(),...fields},session);if(r.data.room)v=r.data.room.version;return r;};
  await act(a,'move',{from:54,to:45});assert.equal((await act(a,'undo')).status,200);
  assert.equal((await act(b,'move',{from:27,to:36})).status,409);assert.equal((await act(a,'respond',{accept:true})).status,409);
  const r=await act(b,'respond',{accept:true});assert.equal(r.data.room.game.turn,'red');assert.equal(r.data.room.game.history.length,0);assert.equal(r.data.room.undoUsed.red,1);assert.equal(r.data.room.game.board[54].side,'red');
});
test('draw, rematch consent, resignation and leave preserve room rules',async t=>{
  const s=await setup(t),{a,b,room}=await s.pair(),path=`rooms/${room.code}/actions`;let v=room.version;
  const act=async(session,type,fields={})=>{const r=await s.req(path,{type,expectedVersion:v,requestId:randomUUID(),...fields},session);if(r.data.room)v=r.data.room.version;return r;};
  await act(a,'draw');const draw=await act(b,'respond',{accept:true});assert.equal(draw.data.room.game.winner,null);assert.equal(draw.data.room.phase,'ended');
  await act(a,'rematch');const restarted=await act(b,'respond',{accept:true});assert.equal(restarted.data.room.phase,'playing');assert.notEqual(restarted.data.room.round,room.round);
  const resigned=await act(b,'resign');assert.equal(resigned.data.room.game.winner,null);
  await act(b,'leave');assert.equal((await act(a,'rematch')).status,409);
});
test('SSE sends authenticated initial state and committed move',async t=>{
  const s=await setup(t),{a,b,room}=await s.pair(),controller=new AbortController();t.after(()=>controller.abort());
  const response=await fetch(s.base+`/api/rooms/${room.code}/events`,{headers:{Authorization:'Bearer '+b.token},signal:controller.signal});assert.match(response.headers.get('content-type'),/event-stream/);const reader=response.body.getReader(),decoder=new TextDecoder();
  const initial=decoder.decode((await reader.read()).value);assert.match(initial,/"phase":"playing"/);
  await s.req(`rooms/${room.code}/actions`,{type:'move',from:54,to:45,expectedVersion:room.version,requestId:randomUUID()},a);
  const update=decoder.decode((await reader.read()).value);assert.match(update,/"kind":"move"/);assert.match(update,/"turn":"black"/);controller.abort();
});
test('storage contains hashed credentials, persists and recovers room',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'xiangqi-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'rooms.json');
  const s=await setup(t,{dataFile:file}),a=await s.create();const content=readFileSync(file,'utf8');assert.equal(content.includes(a.session.token),false);
  const restored=await setup(t,{dataFile:file});assert.equal((await restored.req(`rooms/${a.room.code}`,null,a.session)).status,200);
});
test('room TTL counts actual activity, proposal timeout unlocks play',async t=>{
  let now=1000000;const s=await setup(t,{clock:()=>now}),{a,room}=await s.pair();
  await s.req(`rooms/${room.code}/actions`,{type:'draw',expectedVersion:room.version,requestId:randomUUID()},a);
  now+=61000;s.expire();assert.equal(s.rooms.get(room.code).proposal,null);
  now+=24*3600000+1;s.expire();assert.equal(s.rooms.has(room.code),false);
});
test('static whitelist excludes private data and allows subpath; cross-origin writes rejected',async t=>{
  const s=await setup(t);for(const path of ['/.local/pixso.json','/server/app.js','/.data/rooms.json','/rule.md'])assert.equal((await fetch(s.base+path)).status,404);
  const r=await fetch(s.base+'/xiangqi/');assert.equal(r.status,200);assert.match(await r.text(),/中国象棋/);
  assert.equal((await s.req('rooms',{name:'松风' },null,{Origin:'https://unrelated.invalid'})).status,403);
});

test('online may ignore check and wins only after general capture',async t=>{
 const s=await setup(t),{a,b,room}=await s.pair(),r=s.rooms.get(room.code),board=Array(90).fill(null);
 for(const [i,side,type]of [[84,'red','K'],[4,'black','K'],[31,'red','R'],[27,'black','P']])board[i]={id:side+type,side,type};r.game=createGame(board);
 let v=r.version;const act=async(session,from,to)=>{const res=await s.req(`rooms/${room.code}/actions`,{type:'move',from,to,expectedVersion:v,requestId:randomUUID()},session);assert.equal(res.status,200);v=res.data.room.version;return res.data.room;};
 assert.equal((await act(a,31,22)).phase,'playing');assert.equal((await act(b,27,36)).phase,'playing');
 const won=await act(a,22,4);assert.equal(won.game.winner,'red');assert.equal(won.game.reason,'吃掉黑方將');assert.equal(won.phase,'ended');
});
