export const RED = 'red';
export const BLACK = 'black';
export const other = side => side === RED ? BLACK : RED;
export const indexOf = (x, y) => y * 9 + x;
export const coord = i => `${'ABCDEFGHI'[i % 9]}${10 - Math.floor(i / 9)}`;
export const GLYPHS = { red: { K: '帥', A: '仕', B: '相', N: '馬', R: '車', C: '炮', P: '兵' }, black: { K: '將', A: '士', B: '象', N: '馬', R: '車', C: '炮', P: '卒' } };
export const sideName = side => side === RED ? '红方' : '黑方';
const inside = i => Number.isInteger(i) && i >= 0 && i < 90;
const palace = (side, x, y) => x >= 3 && x <= 5 && (side === RED ? y >= 7 && y <= 9 : y >= 0 && y <= 2);

export function initialBoard() {
  const board = Array(90).fill(null);
  for (const side of [BLACK, RED]) {
    const back = side === BLACK ? 0 : 9, cannon = side === BLACK ? 2 : 7, pawn = side === BLACK ? 3 : 6;
    for (const [x, type] of ['R','N','B','A','K','A','B','N','R'].entries()) board[indexOf(x, back)] = { id: `${side}-${type}-${x}`, type, side };
    for (const x of [1,7]) board[indexOf(x,cannon)] = { id: `${side}-C-${x}`, type: 'C', side };
    for (const x of [0,2,4,6,8]) board[indexOf(x,pawn)] = { id: `${side}-P-${x}`, type: 'P', side };
  }
  return board;
}

export function positionKey(board, turn) {
  return turn + ':' + board.map(p => p ? (p.side === RED ? p.type : p.type.toLowerCase()) : '.').join('');
}

export function createGame(board = initialBoard(), turn = RED) {
  return { board: structuredClone(board), turn, status: 'playing', winner: null, reason: null, check: inCheck(board, turn), quiet: 0, history: [], keys: [positionKey(board, turn)] };
}

function between(board, from, to) {
  const fx = from % 9, fy = Math.floor(from / 9), tx = to % 9, ty = Math.floor(to / 9);
  if (fx !== tx && fy !== ty) return -1;
  const step = fx === tx ? Math.sign(ty - fy) * 9 : Math.sign(tx - fx);
  if (!step) return -1;
  let count = 0;
  for (let i = from + step; i !== to; i += step) if (board[i]) count++;
  return count;
}

// Casual capture-the-general rules: validate movement geometry and blockers only.
export function geometryError(board, from, to) {
  if (!inside(from) || !inside(to)) return '落点不在棋盘上';
  const p = board[from], target = board[to];
  if (!p) return '请先选择棋子';
  if (from === to) return '请走到另一个交叉点';
  if (target?.side === p.side) return '这里已有己方棋子';
  const x = from % 9, y = Math.floor(from / 9), tx = to % 9, ty = Math.floor(to / 9);
  const dx = tx - x, dy = ty - y, ax = Math.abs(dx), ay = Math.abs(dy);
  switch (p.type) {
    case 'K':
      if (target?.type === 'K' && dx === 0 && between(board, from, to) === 0) return null;
      if (!palace(p.side, tx, ty)) return '将帅不能离开己方九宫';
      return ax + ay === 1 ? null : '将帅只能横走或竖走一格';
    case 'A':
      if (!palace(p.side, tx, ty)) return '士仕不能离开己方九宫';
      return ax === 1 && ay === 1 ? null : '士仕只能斜走一格';
    case 'B':
      if (p.side === RED ? ty < 5 : ty > 4) return '相象不能过河';
      if (ax !== 2 || ay !== 2) return '相象走田字，斜走两格';
      return board[indexOf(x + dx / 2, y + dy / 2)] ? '象眼被挡住了' : null;
    case 'N':
      if (!((ax === 2 && ay === 1) || (ax === 1 && ay === 2))) return '马走日字';
      return board[indexOf(x + (ax === 2 ? Math.sign(dx) : 0), y + (ay === 2 ? Math.sign(dy) : 0))] ? '马腿被挡住了' : null;
    case 'R':
      if (dx !== 0 && dy !== 0) return '车只能横走或竖走';
      return between(board, from, to) === 0 ? null : '车的行进路径有棋子阻挡';
    case 'C': {
      if (dx !== 0 && dy !== 0) return '炮只能横走或竖走';
      const count = between(board, from, to);
      return target ? (count === 1 ? null : '炮吃子必须恰好隔一枚棋子') : (count === 0 ? null : '炮不吃子时不能越子');
    }
    case 'P': {
      const forward = p.side === RED ? -1 : 1;
      const crossed = p.side === RED ? y <= 4 : y >= 5;
      if (dy === forward && dx === 0) return null;
      if (crossed && dy === 0 && ax === 1) return null;
      return crossed ? '兵卒只能向前或左右走一格，不能后退' : '兵卒过河前只能向前走一格';
    }
    default: return '未知棋子';
  }
}

export function inCheck(board, side) {
  const king = board.findIndex(p => p?.side === side && p.type === 'K');
  if (king < 0) return true;
  return board.some((p, i) => p?.side === other(side) && geometryError(board, i, king) === null);
}

function movedBoard(board, from, to) {
  const next = board.slice(); next[to] = next[from]; next[from] = null; return next;
}

export function moveError(game, from, to, side = game.turn) {
  if (game.status !== 'playing') return '本局已经结束';
  if (side !== game.turn) return '还没有轮到你';
  if (!inside(from) || !inside(to)) return '落点不在棋盘上';
  if (!game.board[from]) return '请先选择棋子';
  if (game.board[from].side !== side) return '请选择自己的棋子';
  const error = geometryError(game.board, from, to);
  if (error) return error;
  return null;
}

export function legalMoves(game, from) {
  if (!inside(from) || game.board[from]?.side !== game.turn || game.status !== 'playing') return [];
  return Array.from({ length: 90 }, (_, to) => to).filter(to => moveError(game, from, to) === null);
}

export function hasLegalMove(game) {
  for (let from = 0; from < 90; from++) {
    if (game.board[from]?.side !== game.turn) continue;
    for (let to = 0; to < 90; to++) if (!moveError(game, from, to)) return true;
  }
  return false;
}

export function finishGame(game, winner, reason) {
  return { ...game, status: 'ended', winner, reason };
}

export function playMove(game, from, to, side = game.turn) {
  const error = moveError(game, from, to, side);
  if (error) throw new Error(error);
  const piece = game.board[from], captured = game.board[to];
  const board = movedBoard(game.board, from, to), turn = other(side), check = inCheck(board, turn);
  const before = { board: game.board, turn: game.turn, quiet: game.quiet, check: game.check };
  const move = { from, to, piece, captured, side, check, before, notation: `${GLYPHS[side][piece.type]} ${coord(from)} → ${coord(to)}${captured ? ' 吃' + GLYPHS[captured.side][captured.type] : ''}` };
  let next = { ...game, board, turn, check, quiet: captured ? 0 : game.quiet + 1, history: [...game.history, move], keys: [...game.keys, positionKey(board, turn)] };
  if (captured?.type === 'K') return finishGame(next, side, `吃掉${sideName(captured.side)}${GLYPHS[captured.side].K}`);
  return next;
}

export function undoMove(game) {
  const last = game.history.at(-1);
  if (!last) throw new Error('还没有可以撤回的走棋');
  return { ...game, ...last.before, status: 'playing', winner: null, reason: null, history: game.history.slice(0, -1), keys: game.keys.slice(0, -1) };
}
