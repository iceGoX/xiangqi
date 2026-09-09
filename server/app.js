import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, playMove, undoMove, finishGame, other, sideName } from '../shared/engine.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.webp':'image/webp', '.woff2':'font/woff2', '.ttf':'font/ttf', '.svg':'image/svg+xml' };
const STATIC = new Set(['index.html','styles.css','game.js','shared/engine.js','shared/motion.js','assets/images/hero.webp','assets/images/landscape.webp','assets/images/board.webp','release.json',...['red','black'].flatMap(s=>['K','A','B','N','R','C','P'].map(t=>`assets/images/pieces/${s}-${t}.webp`)), 'assets/fonts/body.woff2','assets/fonts/heading.woff2']);

export function createApp({ dataFile = resolve(ROOT,'.data/rooms.json'), root = ROOT, clock = Date.now, trustProxy = false } = {}) {
  let rooms = new Map();
  if (dataFile && existsSync(dataFile)) {
    const saved = JSON.parse(readFileSync(dataFile,'utf8'));
    if (!Array.isArray(saved)) throw new Error('Invalid room storage');
    rooms = new Map(saved.filter(r=>codePattern.test(r.code)).map(r=>[r.code,r]));
  }
  const streams = new Map(), rates = new Map();
  let release = 'development';
  try { release = JSON.parse(readFileSync(resolve(root,'release.json'),'utf8')).id; } catch {}
  function save() {
    if (!dataFile) return;
    mkdirSync(dirname(dataFile),{recursive:true,mode:0o700});
    writeFileSync(dataFile+'.tmp',JSON.stringify([...rooms.values()]),{mode:0o600});
    renameSync(dataFile+'.tmp',dataFile);
  }
  function snapshot(r) {
    const game = r.game ? { ...r.game, keys: undefined, history: r.game.history.map(({before,...m})=>m) } : null;
    return { code:r.code, version:r.version, phase:r.phase, round:r.round, host:r.host, players:Object.fromEntries(Object.entries(r.players).map(([s,p])=>[s,p?{id:p.id,name:p.name,left:!!p.left}:null])), game, proposal:r.proposal, undoUsed:r.undoUsed, lastEvent:r.lastEvent };
  }
  function broadcast(r) {
    for (const stream of streams.get(r.code)??[]) {
      if (stream.res.destroyed) continue;
      const packet=`id: ${r.version}\ndata: ${JSON.stringify(snapshot(r))}\n\n`;
      if (stream.res.writableLength > 1024*1024) stream.res.end(); else stream.res.write(packet);
    }
  }
  function commit(r, change) {
    const before=structuredClone(r);
    try { change();r.version++;r.changedAt=clock();save(); }
    catch(error){rooms.set(r.code,before);throw error;}
    broadcast(r);return snapshot(r);
  }
  function expire() {
    let changed=false;
    for(const [code,r] of rooms){
      const ttl=r.phase==='waiting'?2*3600000:r.phase==='playing'?24*3600000:3600000;
      if(clock()-r.changedAt>ttl){rooms.delete(code);changed=true;for(const s of streams.get(code)??[]){s.res.write('event: expired\ndata: {}\n\n');s.res.end();}streams.delete(code);}
      else if(r.proposal&&r.proposal.expiresAt<clock())commit(r,()=>{r.proposal=null;r.lastEvent={kind:'proposal-expired'};});
    }
    if(changed)save();
    for(const [ip,v]of rates)if(clock()-v.start>60000)rates.delete(ip);
  }
  const sweep=setInterval(()=>{try{expire();}catch(error){console.error('Room cleanup failed:',error.message);}},10000);sweep.unref();
  function limit(ip) {
    let v=rates.get(ip);if(!v||clock()-v.start>=60000){if(rates.size>=10000&&!v)throw fail(429,'请求较多，请稍后重试');v={start:clock(),count:0};rates.set(ip,v);}
    if(++v.count>240)throw fail(429,'操作太频繁，请稍后重试');
  }
  function player(r, req) {
    const token=(req.headers.authorization??'').replace(/^Bearer /,'');
    if(!/^[a-f0-9]{64}$/.test(token))throw fail(401,'玩家身份失效，请重新进入');
    const h=hash(token);
    for(const [side,p]of Object.entries(r.players))if(p&&!p.left&&timingSafeEqual(Buffer.from(p.hash,'hex'),Buffer.from(h,'hex')))return {side,...p};
    throw fail(401,'玩家身份失效，请重新进入');
  }
  function newPlayer(name) {
    if(typeof name!=='string'||![...name.trim()].length||[...name.trim()].length>12||/[\x00-\x1f<>]/.test(name))throw fail(400,'昵称请填写 1～12 个字，不含特殊符号');
    const token=randomBytes(32).toString('hex');return {token,record:{id:randomBytes(8).toString('hex'),name:name.trim(),hash:hash(token),left:false}};
  }
  async function body(req) {
    if(!(req.headers['content-type']??'').startsWith('application/json'))throw fail(415,'请使用 JSON 请求');
    let size=0;const chunks=[];
    for await(const c of req){size+=c.length;if(size>8192)throw fail(413,'请求内容过大');chunks.push(c);}
    try {const b=JSON.parse(Buffer.concat(chunks).toString());if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{throw fail(400,'请求内容无效');}
  }
  function act(r,p,b) {
    if(typeof b.requestId!=='string'||!/^[-\w]{8,80}$/.test(b.requestId))throw fail(400,'缺少操作标识');
    const payload=hash(JSON.stringify(b)),old=r.requests.find(q=>q.id===b.requestId&&q.player===p.id);
    if(old){if(old.payload!==payload)throw fail(409,'操作标识被重复使用');return snapshot(r);}
    if(!Number.isInteger(b.expectedVersion)||b.expectedVersion!==r.version)throw fail(409,'棋局已更新，请在同步后重试');
    const both=()=>r.players.red&&!r.players.red.left&&r.players.black&&!r.players.black.left;
    const active=()=>{if(r.phase!=='playing'||r.game?.status!=='playing')throw fail(409,'当前没有进行中的对局');};
    return commit(r,()=>{
      r.lastEvent={kind:b.type};
      switch(b.type){
        case 'start':
          if(r.host!==p.id||r.phase!=='waiting'||!both())throw fail(409,'需要房主在双方入座后开始');
          r.game=createGame();r.phase='playing';r.round=randomBytes(8).toString('hex');break;
        case 'move':
          active();if(r.proposal)throw fail(409,'请先处理当前协商');
          try{r.game=playMove(r.game,b.from,b.to,p.side);}catch(error){throw fail(400,error.message);}
          r.phase=r.game.status==='ended'?'ended':'playing';
          r.lastEvent={kind:'move',from:b.from,to:b.to,piece:r.game.history.at(-1).piece,captured:r.game.history.at(-1).captured};break;
        case 'resign':active();r.game=finishGame(r.game,null,`${sideName(p.side)}结束对局`);r.phase='ended';r.proposal=null;break;
        case 'leave':
          if(r.phase==='playing'){r.game=finishGame(r.game,null,`${sideName(p.side)}退出对局`);r.phase='ended';}
          r.players[p.side].left=true;r.proposal=null;
          if(r.phase==='waiting'&&r.host===p.id)r.phase='closed';break;
        case 'undo':
          active();if(r.proposal)throw fail(409,'已有协商待处理');
          if(r.game.history.at(-1)?.side!==p.side)throw fail(409,'仅可在对方走棋前撤回自己的上一步');
          if(r.undoUsed[p.side]>=2)throw fail(409,'本局悔棋次数已用完');
          r.proposal={type:'undo',from:p.side,expiresAt:clock()+60000};break;
        case 'draw':active();if(r.proposal)throw fail(409,'已有协商待处理');r.proposal={type:'draw',from:p.side,expiresAt:clock()+60000};break;
        case 'rematch':
          if(r.phase!=='ended'||!both())throw fail(409,'双方都在房间内才能再来一局');
          if(r.proposal)throw fail(409,'已有邀请待处理');r.proposal={type:'rematch',from:p.side,expiresAt:clock()+60000};break;
        case 'cancel':if(r.proposal?.from!==p.side)throw fail(409,'没有可取消的协商');r.proposal=null;break;
        case 'respond': {
          const q=r.proposal;if(!q||q.from===p.side||q.expiresAt<clock())throw fail(409,'协商已失效');
          if(typeof b.accept!=='boolean')throw fail(400,'请选择同意或拒绝');
          if(b.accept){
            if(q.type==='undo'){active();r.game=undoMove(r.game);r.undoUsed[q.from]++;}
            if(q.type==='draw'){active();r.game=finishGame(r.game,null,'双方同意和棋');r.phase='ended';}
            if(q.type==='rematch'){if(!both()||r.phase!=='ended')throw fail(409,'无法重开');r.game=createGame();r.phase='playing';r.round=randomBytes(8).toString('hex');r.undoUsed={red:0,black:0};}
          }
          r.lastEvent={kind:'response',type:q.type,accepted:b.accept};r.proposal=null;break;
        }
        default:throw fail(400,'未知操作');
      }
      r.requests.push({id:b.requestId,player:p.id,payload});r.requests=r.requests.slice(-100);
    });
  }
  const server=http.createServer(async(req,res)=>{
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','SAMEORIGIN');
    try{
      const url=new URL(req.url,'http://local'),path=url.pathname.replace(/^\/xiangqi(?=\/|$)/,'')||'/';
      if(path.startsWith('/api/')){
        const remote=req.socket.remoteAddress??'unknown';const ip=trustProxy&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)?String(req.headers['x-real-ip']??remote):remote;limit(ip);
        if(req.headers.origin){let host;try{host=new URL(req.headers.origin).host;}catch{throw fail(403,'来源无效');}if(host!==req.headers.host)throw fail(403,'不允许跨站请求');}
        if(path==='/api/health'&&req.method==='GET')return json(200,{ok:true,release});
        if(path==='/api/rooms'&&req.method==='POST'){
          expire();const b=await body(req),p=newPlayer(b.name),side=b.side==='black'?'black':'red';
          if(rooms.size>=200||[...rooms.values()].filter(r=>r.ownerIp===hash(ip)).length>=12)throw fail(429,'房间较多，请稍后创建');
          let code;do{code=Array.from(randomBytes(6),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');}while(rooms.has(code));
          const r={code,ownerIp:hash(ip),version:1,phase:'waiting',round:null,players:{red:null,black:null},host:p.record.id,game:null,proposal:null,undoUsed:{red:0,black:0},lastEvent:{kind:'create'},changedAt:clock(),requests:[]};r.players[side]=p.record;
          rooms.set(code,r);try{save();}catch(e){rooms.delete(code);throw e;}
          return json(201,{room:snapshot(r),session:{code,token:p.token,playerId:p.record.id,side}});
        }
        const match=path.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|events|actions))?$/);
        if(!match||!codePattern.test(match[1]))throw fail(404,'没有这个接口');
        const r=rooms.get(match[1]);if(!r)throw fail(404,'房间不存在或已过期');
        if(match[2]==='join'&&req.method==='POST'){
          const b=await body(req),p=newPlayer(b.name);
          if(r.phase!=='waiting')throw fail(409,'房间已经开始或关闭');
          const side=['red','black'].find(s=>!r.players[s]||r.players[s].left);if(!side)throw fail(409,'房间已经满员');
          const state=commit(r,()=>{r.players[side]=p.record;r.lastEvent={kind:'join'};});
          return json(200,{room:state,session:{code:r.code,token:p.token,playerId:p.record.id,side}});
        }
        const p=player(r,req);
        if(match[2]==='events'&&req.method==='GET'){
          const set=streams.get(r.code)??new Set();if([...set].filter(s=>s.player===p.id).length>=4)throw fail(429,'连接过多，请关闭多余页面');
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
          res.write(`retry: 2000\nid: ${r.version}\ndata: ${JSON.stringify(snapshot(r))}\n\n`);
          const entry={player:p.id,res};set.add(entry);streams.set(r.code,set);
          const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': heartbeat\n\n');},15000);heartbeat.unref();
          res.on('close',()=>{clearInterval(heartbeat);set.delete(entry);if(!set.size)streams.delete(r.code);});return;
        }
        if(!match[2]&&req.method==='GET')return json(200,{room:snapshot(r)});
        if(match[2]==='actions'&&req.method==='POST')return json(200,{room:act(r,p,await body(req))});
        throw fail(405,'请求方式不支持');
      }
      if(!['GET','HEAD'].includes(req.method))throw fail(405,'请求方式不支持');
      if(path==='/'){const original=url.pathname;if(original==='/xiangqi'){res.writeHead(308,{Location:'/xiangqi/'});res.end();return;}}
      const file=path==='/'?'index.html':decodeURIComponent(path.slice(1));
      if(!STATIC.has(file))throw fail(404,'页面不存在');
      const bytes=readFileSync(resolve(root,file));
      res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
      res.writeHead(200,{'Content-Type':MIME[extname(file)]??'application/octet-stream','Cache-Control':file.endsWith('.webp')?'public, max-age=31536000, immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){if(res.headersSent){res.end();return;}const status=error.status??(error.code==='ENOENT'?404:error.message?.match(/棋|将|炮|马|兵|相|士|落点|轮到|过河|结束/)?400:500);if(status===500)console.error('Request failed:',error.message);json(status,{error:status===500?'服务暂时不可用，请稍后重试':error.message});}
  });
  server.on('close',()=>{clearInterval(sweep);for(const set of streams.values())for(const s of set)s.res.end();});
  return {server,rooms,snapshot,expire,close:()=>{for(const set of streams.values())for(const s of set)s.res.end();server.close();clearInterval(sweep);}};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
  const app=createApp({dataFile:process.env.DATA_FILE||undefined,trustProxy:process.env.TRUST_PROXY==='1'});
  const host=arg('--host')||process.env.HOST||'127.0.0.1',port=Number(arg('--port')||process.env.PORT||4193);
  app.server.listen(port,host,()=>console.log(`Xiangqi listening on http://${host}:${port}`));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>app.close());
}
