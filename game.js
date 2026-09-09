import {createGame,playMove,undoMove,finishGame,moveError,legalMoves,GLYPHS,coord,sideName,other} from './shared/engine.js?v=2';
import {boardPoint,displacement,moveDuration,shakeFrames,SHAKE_MS} from './shared/motion.js';

const $=id=>document.getElementById(id),base=new URL('./',import.meta.url),api=new URL('api/',base);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let mode='lobby',game=null,room=null,session=null,entryTab='create',flipped=false,selected=null,target=null;
let connected=false,animating=false,pendingRequest=false,latestVersion=-1,queue=Promise.resolve(),networkEpoch=0,streamAbort=null,toastTimer=null;
const pieces=new Map();
const storage={get(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}}};
const sprite=p=>new URL(`assets/images/pieces/${p.side}-${p.type}.webp?v=2`,base).href;
const boardAssets=Promise.all([new URL('assets/images/board.webp?v=2',base).href,...['red','black'].flatMap(side=>['K','A','B','N','R','C','P'].map(type=>sprite({side,type})))].map(src=>{const img=new Image();img.src=src;return img.decode().catch(()=>{});}));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ownSide=()=>mode==='local'?game?.turn:session?.side;
const locked=()=>!game||game.status!=='playing'||animating||pendingRequest||!!room?.proposal||(mode==='online'&&!connected);
function notice(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
function saveLocal(){if(mode==='local'&&game&&!storage.set('xiangqi.local.v1',game))notice('浏览器空间不足，本局暂不能保存');}
function savedGame(){const g=storage.get('xiangqi.local.v1');return g?.board?.length===90&&['red','black'].includes(g.turn)&&Array.isArray(g.history)&&Array.isArray(g.keys)&&g.board.every(p=>!p||GLYPHS[p.side]?.[p.type])?g:null;}
function saveSession(){try{session?sessionStorage.setItem('xiangqi.session.v1',JSON.stringify(session)):sessionStorage.removeItem('xiangqi.session.v1');}catch{notice('浏览器未允许保存玩家身份，刷新会丢失座位');}}
function stopNetwork(){networkEpoch++;streamAbort?.abort();streamAbort=null;connected=false;}
function clearSelection(){selected=null;target=null;$('game-error').textContent='';}
function setScreen(id){for(const name of ['lobby','waiting','play','settlement'])$(name).hidden=name!==id;$('exit').hidden=id==='lobby';}
function point(node,i){const p=boardPoint(i,flipped);node.style.left=p.x+'%';node.style.top=p.y+'%';}
function modal(title,content,actions=[{label:'知道了'}]){
  if($('dialog').open)$('dialog').close();$('dialog-title').textContent=title;
  $('dialog-content').replaceChildren();if(typeof content==='string'){$('dialog-content').append(Object.assign(document.createElement('p'),{textContent:content}));}else $('dialog-content').append(content);
  $('dialog-actions').replaceChildren();for(const a of actions){const b=document.createElement('button');b.className=a.danger?'primary danger':a.secondary?'quiet':'primary';b.textContent=a.label;b.onclick=()=>{$('dialog').close();a.run?.();};$('dialog-actions').append(b);}
  $('dialog').showModal();
}
$('dialog-close').onclick=()=>$('dialog').close();
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
function showRules(){
  const wrap=document.createElement('div');wrap.innerHTML='<div class="rule-grid"></div>';
  const rules=[['K','帅／将','己方九宫内横竖走一格；照面时可直接吃掉对方将帅。'],['A','仕／士','己方九宫内斜走一格。'],['B','相／象','斜走两格，不能过河；中间象眼有子不可走。'],['N','马','走日字；长边方向紧邻有子会蹩马腿。'],['R','车','横竖直行，途中不能越子。'],['C','炮','不吃子同车，吃子须恰隔一枚棋子。'],['P','兵／卒','未过河只向前；过河可左右，永不后退、不升变。']];
  for(const[type,title,text]of rules){const el=document.createElement('div');el.className='rule-item';el.innerHTML=`<img src="${sprite({side:'red',type})}" alt=""><div><h3>${title}</h3><p>${text}</p></div>`;wrap.firstChild.append(el);}
  const p=document.createElement('p');p.className='rule-footnote';p.textContent='红方先行。允许不解将、送将和将帅照面，实际吃掉对方帅或将才获胜。没有将死、困毙或长将自动判负。在线悔棋每方两次，须对方同意。';wrap.append(p);modal('怎么玩中国象棋',wrap);
}
$('rules').onclick=showRules;
function lobby(){stopNetwork();mode='lobby';room=null;game=null;session=null;latestVersion=-1;clearSelection();saveSession();setScreen('lobby');$('local-resume').hidden=!savedGame();$('entry-error').textContent='';}
function leave(){
  if(mode==='lobby')return;
  const playing=game?.status==='playing';
  modal(playing?'退出对局？':'返回大厅？',mode==='online'&&playing?'退出会结束本局，不判任何一方获胜。':mode==='local'?'同屏棋局将保存在这台设备上，可稍后继续。':'离开当前房间并返回大厅。',[{label:'继续对局',secondary:true},{label:'确认退出',danger:mode==='online'&&playing,run:async()=>{
    if(mode==='online'){try{await action('leave');}catch(error){notice(error.message);return;}}else saveLocal();lobby();
  }}]);
}
$('home').onclick=leave;$('exit').onclick=leave;$('leave-waiting').onclick=leave;$('result-home').onclick=leave;
function chooseTab(tab){entryTab=tab;$('create-tab').setAttribute('aria-selected',tab==='create');$('join-tab').setAttribute('aria-selected',tab==='join');$('seat-field').hidden=tab!=='create';$('code-field').hidden=tab!=='join';$('room-code').required=tab==='join';$('entry-submit').textContent=tab==='create'?'创建双人房间':'加入房间';$('entry-error').textContent='';}
$('create-tab').onclick=()=>chooseTab('create');$('join-tab').onclick=()=>chooseTab('join');
async function request(path,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(new URL(path,api),{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.token}:{}),...options.headers},signal:controller.signal});const data=await response.json();if(!response.ok){const e=new Error(data.error??'请求失败');e.status=response.status;throw e;}return data;}
  catch(e){if(e.name==='AbortError')throw new Error('请求超时，请检查网络后重试');throw e;}finally{clearTimeout(timer);}
}
$('entry-form').onsubmit=async e=>{
  e.preventDefault();if(pendingRequest)return;pendingRequest=true;$('entry-submit').disabled=true;$('create-tab').disabled=true;$('join-tab').disabled=true;
  const name=$('nickname').value.trim(),code=$('room-code').value.trim().toUpperCase();
  try{
    if(entryTab==='join'&&!/^[A-HJ-NP-Z2-9]{6}$/.test(code))throw new Error('请输入六位有效字母数字房间号');
    const data=await request(entryTab==='create'?'rooms':`rooms/${code}/join`,{method:'POST',body:JSON.stringify({name,side:document.querySelector('input[name=side]:checked').value})});
    storage.set('xiangqi.name',name);await enterOnline(data);
  }catch(error){$('entry-error').textContent=error.message;}
  finally{pendingRequest=false;$('entry-submit').disabled=false;$('create-tab').disabled=false;$('join-tab').disabled=false;renderUI();}
};
async function enterOnline(data){stopNetwork();session=data.session;saveSession();mode='online';flipped=false;latestVersion=-1;room=null;game=null;clearSelection();await receive(data.room);connect(networkEpoch);}
function receive(next){
  if(mode!=='online'||next.code!==session?.code||next.version<=latestVersion)return queue;
  latestVersion=next.version;const epoch=networkEpoch;
  queue=queue.then(async()=>{
    if(epoch!==networkEpoch)return;
    const previous=room;room=next;
    if(next.phase==='closed'){modal('房间已关闭','房主已退出，请重新创建或加入房间。',[{label:'返回大厅',run:lobby}]);return;}
    if(next.phase==='waiting'){game=null;renderWaiting();return;}
    const motion=previous?.round===next.round&&previous.version+1===next.version&&next.lastEvent?.kind==='move'?next.lastEvent:null;
    await showGame(next.game,motion);if(previous?.proposal&&!next.proposal&&next.lastEvent?.kind==='response')notice(next.lastEvent.accepted?'对方已同意':'对方已拒绝');
  }).catch(error=>{console.error(error);notice('显示更新失败，请刷新恢复棋局');});return queue;
}
async function connect(epoch){
  let delay=1000;
  while(mode==='online'&&session&&epoch===networkEpoch){
    const controller=new AbortController();streamAbort=controller;let watchdog;
    try{
      const response=await fetch(new URL(`rooms/${session.code}/events`,api),{headers:{Authorization:'Bearer '+session.token},signal:controller.signal});
      if(!response.ok){const d=await response.json();if([401,404].includes(response.status)){modal('房间无法恢复',d.error,[{label:'返回大厅',run:lobby}]);return;}throw new Error('连接失败');}
      connected=true;delay=1000;renderUI();const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      const resetWatchdog=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>controller.abort(),35000);};resetWatchdog();
      while(true){const {done,value}=await reader.read();if(done)break;resetWatchdog();buffer+=decoder.decode(value,{stream:true});let end;
        while((end=buffer.indexOf('\n\n'))>=0){const packet=buffer.slice(0,end);buffer=buffer.slice(end+2);if(packet.includes('event: expired')){modal('房间已过期','请重新创建或加入房间。',[{label:'返回大厅',run:lobby}]);return;}const text=packet.split('\n').filter(l=>l.startsWith('data: ')).map(l=>l.slice(6)).join('\n');if(text)receive(JSON.parse(text));}
      }
    }catch(error){if(epoch===networkEpoch&&error.name!=='AbortError')console.warn('实时连接中断，正在重连');}
    finally{clearTimeout(watchdog);if(epoch===networkEpoch){connected=false;clearSelection();renderUI();}}
    if(epoch!==networkEpoch)return;await new Promise(resolve=>setTimeout(resolve,delay));delay=Math.min(delay*2,8000);
  }
}
async function action(type,fields={}){
  if(pendingRequest)throw new Error('上一步还在处理中');
  if(!session||!room)throw new Error('尚未进入房间');
  pendingRequest=true;renderUI();const b={type,...fields,expectedVersion:room.version,requestId:crypto.randomUUID()},epoch=networkEpoch;
  try{
    let data;for(let attempt=0;attempt<2;attempt++){try{data=await request(`rooms/${session.code}/actions`,{method:'POST',body:JSON.stringify(b)});break;}catch(e){if(e.status||attempt)throw e;}}
    if(epoch===networkEpoch&&type!=='leave')await receive(data.room);return data;
  }catch(error){
    if(error.status===409){try{const d=await request(`rooms/${session.code}`);await receive(d.room);}catch{}}
    throw error;
  }finally{pendingRequest=false;renderUI();}
}
function renderWaiting(){setScreen('waiting');$('wait-code').textContent=room.code;$('seats').replaceChildren();for(const side of ['red','black']){
  const p=room.players[side],filled=p&&!p.left,div=document.createElement('div');div.className='seat';div.innerHTML=`<img src="${sprite({side,type:'K'})}" alt="${sideName(side)}"><div><strong>${filled?escape(p.name):'等待好友'} · ${sideName(side)}</strong><small>${filled?(p.id===room.host?'房主 · 已入座':'已入座'):'虚位以待'}</small></div>`;$('seats').append(div);
  }
  const ready=room.players.red&&!room.players.red.left&&room.players.black&&!room.players.black.left,isHost=session.playerId===room.host;
  $('wait-hint').textContent=!connected?'正在连接房间…':ready?(isHost?'双方已入座，可以开始了。':'等待房主开始对局。'):'好友加入后即可开始对局。';$('start-game').disabled=!ready||!isHost||!connected||pendingRequest;$('start-game').textContent=isHost?'开始对局':'等待房主开始';
}
$('start-game').onclick=()=>action('start').catch(e=>notice(e.message));
$('copy-invite').onclick=async()=>{const link=new URL(base);link.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(link.href);notice('邀请链接已复制');}catch{const input=document.createElement('input');input.value=link.href;input.readOnly=true;modal('复制邀请链接',input);input.select();}};
function localStart(resume=false){stopNetwork();mode='local';room=null;session=null;saveSession();flipped=false;clearSelection();showGame(resume?savedGame():createGame());saveLocal();}
$('local-start').onclick=()=>{if(savedGame()?.status==='playing')modal('开始新的同屏对局？','上次未完成的同屏棋局将被替换。',[{label:'继续上局',secondary:true,run:()=>localStart(true)},{label:'开始新局',run:()=>localStart()}]);else localStart();};
$('local-resume').onclick=()=>localStart(true);
function renderBoard(keepCaptured=null){
  if(!game)return;const live=new Set();
  game.board.forEach((p,i)=>{if(!p)return;live.add(p.id);let el=pieces.get(p.id);
    if(!el){el=document.createElement('button');el.className='piece';el.dataset.id=p.id;const img=document.createElement('img');img.src=sprite(p);img.alt='';img.draggable=false;el.append(img);el.onclick=()=>choose(Number(el.dataset.index));$('pieces').append(el);pieces.set(p.id,el);}
    el.dataset.index=i;el.setAttribute('aria-label',`${sideName(p.side)}${GLYPHS[p.side][p.type]}，${coord(i)}`);el.setAttribute('aria-pressed',i===selected);point(el,i);el.classList.toggle('selected',i===selected);el.disabled=animating;
  });
  for(const[id,el]of pieces)if(!live.has(id)&&id!==keepCaptured){el.remove();pieces.delete(id);}
  const legal=selected!==null?new Set(legalMoves(game,selected)):new Set(),last=game.history.at(-1);
  for(const el of $('intersections').children){const i=Number(el.dataset.index);point(el,i);el.classList.toggle('legal',legal.has(i));el.classList.toggle('last',last?.from===i||last?.to===i);el.tabIndex=legal.has(i)?0:-1;el.setAttribute('aria-label',`${coord(i)}${legal.has(i)?'，可走':'，交叉点'}`);}
  $('preview').hidden=target===null;if(target!==null&&selected!==null){$('preview').replaceChildren(Object.assign(document.createElement('img'),{src:sprite(game.board[selected]),alt:''}));point($('preview'),target);}
}
for(let i=0;i<90;i++){const el=document.createElement('button');el.className='intersection';el.dataset.index=i;el.tabIndex=-1;el.onclick=()=>choose(i);$('intersections').append(el);}
function playerStrip(el,side){const p=mode==='local'?{name:sideName(side)}:room.players[side];el.className='player-strip '+side+(game.turn===side&&game.status==='playing'?' current':'');el.innerHTML=`<img src="${sprite({side,type:'K'})}" alt=""><strong>${escape(p?.name??sideName(side))}${mode==='online'?' · '+sideName(side):''}</strong><span class="player-state">${p?.left?'已离开':game.status==='ended'?'本局结束':game.turn===side?'当前回合':'等待回合'}</span>`;}
function renderProposal(box=$('proposal')){box.hidden=!room?.proposal;if(!room?.proposal)return;const q=room.proposal,mine=q.from===session.side;box.replaceChildren();const p=document.createElement('p');const labels={undo:'悔棋',draw:'和棋',rematch:'再来一局'};p.textContent=mine?`已发出${labels[q.type]}请求，等待对方回应。`:`对方请求${labels[q.type]}。`;box.append(p);const row=document.createElement('div');row.className='action-row';for(const [label,type,fields]of mine?[['取消请求','cancel',{}]]:[['拒绝','respond',{accept:false}],['同意','respond',{accept:true}]]){const b=document.createElement('button');b.className=label==='同意'?'primary':'quiet';b.textContent=label;b.disabled=pendingRequest;b.onclick=()=>action(type,fields).catch(e=>notice(e.message));row.append(b);}box.append(row);}
function renderUI(){
  if(mode==='online'&&room?.phase==='waiting'){renderWaiting();return;}if(!game||mode==='lobby')return;
  $('mode-label').textContent=mode==='local'?'同屏对弈':`在线对弈 · ${room.code}`;
  $('connection').textContent=mode==='local'?'保存在本机':connected?'已连接':'正在重新连接…';$('connection').classList.toggle('offline',mode==='online'&&!connected);
  playerStrip($('top-player'),flipped?'red':'black');playerStrip($('bottom-player'),flipped?'black':'red');
  const ended=game.status==='ended',mine=ownSide()===game.turn;
  $('turn-title').textContent=ended?(game.winner?sideName(game.winner)+'获胜':(game.reason==='双方同意和棋'?'本局和棋':'对局结束')):`${sideName(game.turn)}${game.history.length?'走棋':'先行'}`;
  $('turn-help').textContent=ended?game.reason:animating?'落子中…':mode==='online'&&!connected?'连接恢复后继续对弈':room?.proposal?'请先处理当前协商':!mine?'等待对方走棋':target!==null?`${coord(selected)} → ${coord(target)}，再次点击确认`:selected!==null?'':' ';
  $('confirm').disabled=locked()||!mine||target===null;$('confirm').textContent=pendingRequest?'正在提交…':'确认走棋';
  $('undo').disabled=locked()||!game.history.length||(mode==='online'&&(game.history.at(-1)?.side!==session.side||room.undoUsed[session.side]>=2));$('undo').title=mode==='online'?`每局两次，剩余 ${2-room.undoUsed[session.side]} 次`:'';
  $('draw').disabled=locked();$('resign').disabled=locked();$('flip').disabled=animating;$('restart-local').hidden=mode!=='local';$('restart-local').disabled=animating;
  renderProposal();renderProposal($('settlement-proposal'));$('move-count').textContent=game.history.length+' 手';const list=$('history');list.replaceChildren();
  if(!game.history.length){const li=document.createElement('li');li.className='empty';li.textContent='走棋后将在这里记录';list.append(li);}else game.history.forEach((m,i)=>{const li=document.createElement('li');li.className=m.side;li.textContent=`${i+1}. ${m.notation}`;list.append(li);});
  $('export').hidden=!game.history.length;list.scrollTop=list.scrollHeight;
  if(ended&&game.winner){$('settlement-rematch').disabled=pendingRequest||!!room?.proposal||(mode==='online'&&Object.values(room.players).some(p=>!p||p.left));$('settlement-rematch').textContent=room?.proposal?.type==='rematch'?'等待对方回应…':'再来一局';}
  $('result').hidden=!ended||animating;if(ended){$('result-title').textContent=game.winner?sideName(game.winner)+'获胜':(game.reason==='双方同意和棋'?'本局和棋':'对局结束');$('result-reason').textContent=game.reason;$('result-piece').src=sprite({side:game.winner??'red',type:'K'});$('rematch').textContent=mode==='local'?'再来一局':'邀请再来一局';$('rematch').disabled=pendingRequest||!!room?.proposal||(mode==='online'&&Object.values(room.players).some(p=>!p||p.left));}
}
async function showGame(next,motion=null){
  if(!next)return;const firstWin=next.winner&&(game?.status!=='ended'||game?.winner!==next.winner||game?.history.length!==next.history.length);await boardAssets;setScreen(!$('settlement').hidden&&next.status==='ended'?'settlement':'play');clearSelection();game=next;animating=!!motion&&!reduced.matches&&!document.hidden;renderBoard(animating?motion.captured?.id:null);renderUI();
  if(animating){const el=pieces.get(motion.piece.id),victim=motion.captured&&pieces.get(motion.captured.id);if(el){const rect=$('board').getBoundingClientRect(),delta=displacement(motion.from,motion.to,rect.width,rect.height,flipped),duration=moveDuration(motion.from,motion.to);el.style.zIndex='6';const tasks=[el.animate([{transform:`translate(-50%, -50%) translate(${delta.x}px, ${delta.y}px)`},{transform:'translate(-50%, -50%) translate(0, 0)'}],{duration,easing:'cubic-bezier(.22,.68,.25,1)'}).finished.catch(()=>{})];if(victim)tasks.push(victim.animate([{opacity:1},{opacity:0}],{duration:duration*.25,delay:duration*.75,fill:'forwards'}).finished.catch(()=>{}));await Promise.all(tasks);el.style.zIndex='';}}
  animating=false;renderBoard();renderUI();saveLocal();if(firstWin)showSettlement();
}
function showSettlement(){
  if(!game?.winner)return;
  if($('dialog').open)$('dialog').close();
  const side=game.winner,player=mode==='online'?room.players[side]?.name:sideName(side);
  $('settlement').dataset.side=side;
  $('settlement-piece').src=sprite({side,type:'K'});
  $('settlement-title').textContent=sideName(side)+'获胜';
  $('settlement-player').textContent=mode==='online'?player+' · 执'+(side==='red'?'红':'黑'):'同屏对弈';
  $('settlement-reason').textContent=game.reason;
  $('settlement-moves').textContent=game.history.length;
  $('settlement-captures').textContent=game.history.filter(m=>m.captured).length;
  setScreen('settlement');window.scrollTo({top:0,behavior:'instant'});$('settlement-title').focus({preventScroll:true});
}
$('settlement-review').onclick=()=>{setScreen('play');window.scrollTo({top:0,behavior:'instant'});};
$('settlement-home').onclick=leave;
$('settlement-rematch').onclick=()=>{if(mode==='local')localStart();else restart();};
function shake(i,message){$('game-error').textContent=message;const p=game?.board[i],el=p&&pieces.get(p.id);if(!el)return;for(const a of el.getAnimations())a.cancel();el.classList.add('invalid');if(!reduced.matches)el.animate(shakeFrames(),{duration:SHAKE_MS,easing:'ease-in-out'});setTimeout(()=>el.classList.remove('invalid'),650);setTimeout(()=>{if($('game-error').textContent===message)$('game-error').textContent='';},1600);}
function choose(i){
  if(!game)return;if(locked()){if(!animating)shake(selected??i,game.status==='ended'?'本局已经结束':room?.proposal?'请先处理当前协商':'请等待连接或操作完成');return;}
  const p=game.board[i];if(ownSide()!==game.turn){shake(selected??i,'还没有轮到你');return;}
  if(p?.side===game.turn){if(selected===i){clearSelection();}else{selected=i;target=null;$('game-error').textContent='';}renderBoard();renderUI();return;}
  if(selected===null){if(p)shake(i,'请选择自己的棋子');return;}
  const error=moveError(game,selected,i,ownSide());if(error){target=null;shake(selected,error);renderBoard();renderUI();return;}
  if(target===i){submitMove();return;}target=i;$('game-error').textContent='';renderBoard();renderUI();
}
async function submitMove(){if(locked()||selected===null||target===null)return;const from=selected,to=target;
  try{if(mode==='online')await action('move',{from,to});else{const next=playMove(game,from,to);await showGame(next,{from,to,piece:game.board[from],captured:game.board[to]});}}
  catch(error){shake(from,error.message);renderUI();}
}
$('confirm').onclick=submitMove;$('flip').onclick=()=>{if(animating)return;flipped=!flipped;clearSelection();renderBoard();renderUI();};
$('undo').onclick=()=>{if(locked())return;if(mode==='online')action('undo').catch(e=>notice(e.message));else modal('撤回上一步？','将恢复上一步之前的棋局。',[{label:'继续对局',secondary:true},{label:'确认悔棋',run:()=>showGame(undoMove(game))}]);};
$('draw').onclick=()=>{if(locked())return;if(mode==='online')action('draw').catch(e=>notice(e.message));else modal('双方同意和棋？','确认后，本局以和棋结束。',[{label:'继续对局',secondary:true},{label:'同意和棋',run:()=>showGame(finishGame(game,null,'双方同意和棋'))}]);};
$('resign').onclick=()=>{if(locked())return;modal('结束本局？','双方均不计胜负。',[{label:'继续对局',secondary:true},{label:'确认结束',run:()=>mode==='online'?action('resign').catch(e=>notice(e.message)):showGame(finishGame(game,null,'主动结束对局'))}]);};
function restart(){if(mode==='online')action('rematch').catch(e=>notice(e.message));else modal('开始新一局？','当前同屏棋局将被新的棋局替换。',[{label:'暂不',secondary:true},{label:'开始新局',run:()=>localStart()}]);}
$('restart-local').onclick=restart;$('rematch').onclick=restart;
$('export').onclick=()=>{const content=['中国象棋棋谱',game.status==='ended'?`${game.winner?sideName(game.winner)+'获胜':'和棋'}：${game.reason}`:'进行中',...game.history.map((m,i)=>`${i+1}. ${sideName(m.side)} ${m.notation}`)].join('\n');const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='中国象棋棋谱.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('dialog').open){clearSelection();renderBoard();renderUI();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const node of pieces.values())for(const a of node.getAnimations())a.finish();});
window.addEventListener('pagehide',saveLocal);
window.addEventListener('offline',()=>{if(mode==='online'){connected=false;streamAbort?.abort();clearSelection();renderUI();}});
async function init(){
  $('nickname').value=storage.get('xiangqi.name')??'';$('local-resume').hidden=!savedGame();if(innerWidth<1050)$('history-details').open=false;
  const invite=new URL(location.href).searchParams.get('room');if(invite){chooseTab('join');$('room-code').value=invite.toUpperCase();}
  let saved;try{saved=JSON.parse(sessionStorage.getItem('xiangqi.session.v1'));}catch{}
  if(saved?.code&&saved?.token&&(!invite||invite.toUpperCase()===saved.code)){
    session=saved;try{const data=await request(`rooms/${session.code}`);await enterOnline({room:data.room,session:saved});}catch(error){
      session=null;
      if([401,404].includes(error.status)){saveSession();notice('上次房间无法恢复：'+error.message);}
      else modal('暂时无法恢复房间','已保留你的玩家身份。'+error.message,[{label:'稍后重试',secondary:true},{label:'重新连接',run:()=>init()}]);
    }
  }
}
init();
