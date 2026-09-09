import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, initialBoard, indexOf as at, moveError, geometryError, inCheck, legalMoves, playMove, undoMove, hasLegalMove } from '../shared/engine.js';

function position(pieces, turn = 'red') {
  const board = Array(90).fill(null);
  pieces.forEach(([side,type,x,y],i) => board[at(x,y)] = {id:String(i),side,type});
  return createGame(board,turn);
}
const kings = [['red','K',4,9],['black','K',3,0]];
test('32 pieces occupy the exact standard 9x10 opening',()=>{
  const b=initialBoard();assert.equal(b.length,90);assert.equal(b.filter(Boolean).length,32);
  assert.equal(b[at(4,0)].type,'K');assert.equal(b[at(4,9)].side,'red');
  for(const x of [1,7]){assert.equal(b[at(x,2)].type,'C');assert.equal(b[at(x,7)].type,'C');}
  assert.equal(legalMoves(createGame(),at(1,9)).length,2);
  const g=createGame();let total=0;for(let i=0;i<90;i++) total+=legalMoves(g,i).length;assert.equal(total,44);
});
test('horse leg obstructs both moves on the long-axis side',()=>{
  const g=position([...kings,['red','N',4,5],['black','P',4,4]]);
  assert.match(moveError(g,at(4,5),at(3,3)),/马腿/);assert.match(moveError(g,at(4,5),at(5,3)),/马腿/);
  assert.equal(moveError(g,at(4,5),at(2,4)),null);
});
test('elephant eye and river, advisor and general palaces',()=>{
  let g=position([...kings,['red','B',2,9],['red','P',3,8]]);
  assert.match(moveError(g,at(2,9),at(4,7)),/象眼/);
  g=position([...kings,['red','B',2,5]]);assert.match(moveError(g,at(2,5),at(4,3)),/过河/);
  g=position([...kings,['red','A',3,9]]);assert.equal(moveError(g,at(3,9),at(4,8)),null);
  assert.match(moveError(g,at(3,9),at(2,8)),/九宫/);assert.match(moveError(g,at(4,9),at(5,8)),/一格/);
});
test('cannon needs exactly one screen to capture and none to move',()=>{
  const g=position([...kings,['red','C',0,6],['red','P',0,4],['black','R',0,1]]);
  assert.equal(moveError(g,at(0,6),at(0,1)),null);
  assert.match(moveError(g,at(0,6),at(0,2)),/不能越子/);
  const noScreen=structuredClone(g);noScreen.board[at(0,4)]=null;assert.match(moveError(noScreen,at(0,6),at(0,1)),/隔一枚/);
  const two=structuredClone(g);two.board[at(0,3)]={side:'black',type:'P'};assert.match(moveError(two,at(0,6),at(0,1)),/隔一枚/);
});
test('rook blockers and own-piece destination',()=>{
  const g=position([...kings,['red','R',0,9],['red','P',0,6]]);
  assert.match(moveError(g,at(0,9),at(0,3)),/阻挡/);assert.match(moveError(g,at(0,9),at(0,6)),/己方/);
  assert.equal(moveError(g,at(0,9),at(0,7)),null);
});
test('soldiers cross the river but never retreat or promote',()=>{
  const g=position([...kings,['red','P',0,5],['black','P',8,4]]);
  assert.match(moveError(g,at(0,5),at(1,5)),/过河前/);
  const moved=playMove(g,at(0,5),at(0,4));moved.turn='red';assert.equal(moveError(moved,at(0,4),at(1,4)),null);
  assert.match(moveError(moved,at(0,4),at(0,5)),/后退/);
  assert.equal(geometryError(g.board,at(8,4),at(8,5)),null);assert.match(geometryError(g.board,at(8,4),at(7,4)),/过河前/);
});
test('moving the screen away may expose facing kings',()=>{
  const g=position([['red','K',4,9],['black','K',4,0],['red','R',4,5]]);
  assert.equal(inCheck(g.board,'red'),false);assert.equal(moveError(g,at(4,5),at(5,5)),null);
  assert.equal(moveError(g,at(4,5),at(4,4)),null);
});
test('may ignore check and move king into an attack',()=>{
  const g=position([...kings,['black','R',4,3],['red','P',0,6]]);
  assert.equal(inCheck(g.board,'red'),true);assert.equal(moveError(g,at(0,6),at(0,5)),null);
  assert.equal(moveError(g,at(4,9),at(5,9)),null);
});
test('only actual general capture wins; mate and stalemate never auto-end',()=>{
  const mate=position([['red','K',3,9],['black','K',4,0],['red','R',3,1],['red','R',5,1],['red','R',4,3]]);
  const m=playMove(mate,at(4,3),at(4,2));assert.equal(m.status,'playing');assert.equal(m.winner,null);
  const exposed=playMove(m,at(4,0),at(5,0));assert.equal(exposed.status,'playing');
  const captured=playMove(exposed,at(5,1),at(5,0));assert.equal(captured.winner,'red');assert.equal(captured.reason,'吃掉黑方將');assert.equal(captured.status,'ended');
  assert.match(moveError(captured,at(3,1),at(3,2)),/结束/);
  const blocked=[['red','K',3,9],['red','R',0,6]];
  for(let y=0;y<3;y++)for(let x=3;x<=5;x++)blocked.push(['black',x===4&&y===0?'K':'A',x,y]);
  const next=playMove(position(blocked),at(0,6),at(0,5));
  assert.equal(hasLegalMove(next),false);assert.equal(next.status,'playing');
});
test('facing generals may capture each other; no material or quiet-clock automatic draw',()=>{
 const g=position([['red','K',4,9],['black','K',4,0]]);
 assert.equal(playMove(g,at(4,9),at(4,0)).winner,'red');
 const quiet=position(kings);quiet.quiet=119;assert.equal(playMove(quiet,at(4,9),at(5,9)).status,'playing');
 const black=position([['red','K',4,9],['black','K',3,0],['black','R',4,3]],'black');assert.equal(playMove(black,at(4,3),at(4,9)).winner,'black');
});
test('capture and undo restore piece, turn, repetition keys and counters without mutating input',()=>{
  const g=position([...kings,['red','R',0,5],['black','P',0,3]]);const saved=structuredClone(g);
  const after=playMove(g,at(0,5),at(0,3));assert.deepEqual(g,saved);assert.equal(after.history[0].captured.type,'P');
  const restored=undoMove(after);assert.deepEqual(restored,g);assert.equal(after.board[at(0,3)].type,'R');
});
test('third repetition does not interrupt the game',()=>{
  let g=createGame();for(let n=0;n<2;n++)for(const [a,b]of [[at(1,9),at(2,7)],[at(1,0),at(2,2)],[at(2,7),at(1,9)],[at(2,2),at(1,0)]])g=playMove(g,a,b);
  assert.equal(g.status,'playing');assert.equal(g.winner,null);assert.equal(moveError(g,at(0,6),at(0,5)),null);
});
test('turn, empty and out of bounds validation is explicit',()=>{
  const g=createGame();assert.match(moveError(g,0,9),/自己的/);assert.match(moveError(g,54,45,'black'),/轮到/);
  for(const invalid of [-1,90,NaN,2.5,'54'])assert.match(moveError(g,invalid,45),/棋盘/);
});
