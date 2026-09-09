import test from 'node:test';
import assert from 'node:assert/strict';
import {boardPoint,displacement,moveDuration,shakeFrames} from '../shared/motion.js';

test('movement starts at the previous intersection in either board orientation',()=>{
  for(const flipped of [false,true])for(const [from,to]of [[54,45],[82,65],[19,25]]){
    const width=366,height=width*1210/1097,a=boardPoint(from,flipped),b=boardPoint(to,flipped),delta=displacement(from,to,width,height,flipped);
    assert.ok(Math.abs(b.x*width/100+delta.x-a.x*width/100)<1e-9);
    assert.ok(Math.abs(b.y*height/100+delta.y-a.y*height/100)<1e-9);
  }
});
test('motion remains bounded and illegal feedback returns to center twice',()=>{
  assert.ok(moveDuration(54,45)>=240);assert.ok(moveDuration(0,89)<=420);
  assert.ok(moveDuration(0,81)>moveDuration(0,9));
  const offsets=shakeFrames().map(frame=>Number(frame.transform.match(/translateX\((-?\d+)px\)/)[1]));
  assert.deepEqual(offsets,[0,-5,5,0,-5,5,0]);
});
