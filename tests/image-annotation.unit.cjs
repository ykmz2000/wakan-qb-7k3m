'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../image-annotation-model-v1.js');
test('palette is exactly the seven agreed colors',()=>assert.deepEqual(M.colors.map(c=>c.name),['赤','青','オレンジ','緑','水色','ピンク','黄色']));
test('rectangle can be dragged in every direction without an aspect lock',()=>{
  assert.deepEqual(M.rect({x:300,y:100},{x:20,y:140}),{x:20,y:100,w:280,h:40});
});
test('lasso selects whole strokes and multiple objects, without partial intersections',()=>{
  const items=[{id:'a',type:'pen',width:2,points:[{x:10,y:10},{x:90,y:90}]},{id:'b',type:'rect',x:30,y:40,w:20,h:10},{id:'c',type:'pen',points:[{x:50,y:50},{x:150,y:50}],width:2}];
  assert.deepEqual(M.lasso(items,[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]),['a','b']);
  const moved=items.slice(0,2).map(i=>M.transform(i,{x:0,y:0,w:100,h:100},{x:200,y:50,w:200,h:200}));
  assert.deepEqual(moved[0].points,[{x:220,y:70},{x:380,y:230}]);assert.equal(moved[0].width,4);assert.equal(moved[1].w,40);assert.equal(items[0].points[0].x,10);
});
test('long handwriting does not exceed argument limits',()=>{
  const points=Array.from({length:150000},(_,i)=>({x:i/1000,y:i%200}));
  assert.equal(M.bounds({points,width:2}).h,201);
});
test('undo and redo restore a full scene including image crop and page margins',()=>{
  const initial={width:800,height:600,items:[{type:'image',assetId:'original',x:0,y:0,w:400,h:300}]},h=new M.History(initial),changed=M.copy(initial);changed.items[0].assetId='cropped';changed.width=1000;h.push(changed);
  assert.deepEqual(h.undo(),initial);assert.deepEqual(h.redo(),changed);h.undo();h.push({...initial,height:900});assert.equal(h.future.length,0);
});
test('large exports preserve all content within canvas dimensions',()=>{
  const d=M.fitSize(1200,60000);assert.ok(d.width*d.height<=12000000);assert.ok(d.height<=16384);assert.ok(Math.abs(d.width/d.height-.02)<.001);assert.throws(()=>M.fitSize(0,50));
});
