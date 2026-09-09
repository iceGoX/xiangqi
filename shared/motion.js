export const MOVE_MIN = 240;
export const MOVE_MAX = 420;
export const SHAKE_MS = 320;
export function moveDuration(from,to){return Math.min(MOVE_MAX,MOVE_MIN+Math.hypot(to%9-from%9,Math.floor(to/9)-Math.floor(from/9))*22);}
export function shakeFrames(){return [0,-5,5,0,-5,5,0].map(x=>({transform:`translate(-50%, -50%) translateX(${x}px)`}));}
export function displacement(from,to,width,height,flipped=false){const sign=flipped?-1:1;return {x:(from%9-to%9)*width*(965/1097/8)*sign,y:(Math.floor(from/9)-Math.floor(to/9))*height*(1087/1210/9)*sign};}
export function boardPoint(i,flipped=false){const x=i%9,y=Math.floor(i/9),cx=flipped?8-x:x,cy=flipped?9-y:y;return {x:(66+cx*965/8)/1097*100,y:(53+cy*1087/9)/1210*100};}
