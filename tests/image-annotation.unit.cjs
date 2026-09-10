'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../image-annotation-model-v1.js');
test('stabilization zero preserves input and strength reduces jitter with bounded lag',()=>{const p={x:0,y:0},q={x:2,y:3};assert.deepEqual(M.stabilize(p,q,0),q);assert.ok(M.stabilize(p,q,100).y<M.stabilize(p,q,20).y);let previous=p;for(let x=1;x<100;x++){const raw={x,y:x%2?2:-2};previous=M.stabilize(previous,raw,100);assert.ok(Math.hypot(previous.x-raw.x,previous.y-raw.y)<8)}const scaled=M.stabilize(p,{x:4,y:6},100,.5),base=M.stabilize(p,q,100,1);assert.ok(Math.abs(scaled.x-base.x*2)<1e-10)});
test('palette includes the agreed seven colors plus black and white',()=>assert.deepEqual(M.colors.map(c=>c.name),['赤','青','オレンジ','緑','水色','ピンク','黄色','黒','白']));
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

test('axis endpoints preserve the starting coordinate including reverse drags',()=>{
  const a={x:300,y:200},b={x:50,y:40};
  assert.deepEqual(M.lineEnd(a,b,'horizontal'),{x:50,y:200});
  assert.deepEqual(M.lineEnd(a,b,'vertical'),{x:300,y:40});
  assert.deepEqual(M.lineEnd(a,b,'straight'),b);
  assert.deepEqual(a,{x:300,y:200});
});
test('circle locks equal dimensions in all drag directions; ellipse remains unrestricted',()=>{
  const a={x:300,y:300};
  for(const sx of [-1,1])for(const sy of [-1,1]){
    const b={x:300+sx*100,y:300+sy*60},c=M.shapeRect(a,b,'circle');
    assert.equal(c.w,100);assert.equal(c.h,100);
    assert.equal(c.x,sx<0?200:300);assert.equal(c.y,sy<0?200:300);
    assert.deepEqual(M.shapeRect(a,b,'ellipse'),M.rect(a,b));
  }
  const circle={id:'circle',type:'circle',...M.shapeRect(a,{x:400,y:360},'circle'),width:4};
  const moved=M.transform(circle,M.bounds(circle),{x:10,y:20,w:200,h:200});
  assert.equal(moved.w,moved.h);assert.equal(moved.x,10);assert.equal(moved.y,20);
});

// A hollow frame must not intercept handwriting in its interior.
test('rectangle hit testing follows all four strokes, with bounded edge tolerance',()=>{
  const r={type:'rect',x:100,y:100,w:240,h:120,width:8};
  for(const p of [{x:100,y:160},{x:340,y:160},{x:220,y:100},{x:220,y:220},{x:100,y:100}])assert.equal(M.hit(r,p,6),true);
  assert.equal(M.hit(r,{x:220,y:160},6),false);
  assert.equal(M.hit(r,{x:220,y:109},6),true);
  assert.equal(M.hit(r,{x:220,y:111},6),false);
  assert.equal(M.hit(r,{x:89,y:160},6),false);
  assert.equal(M.hit({...r,type:'image'},{x:220,y:160},6),true);
});

test('layer order supports one-step and absolute movement while preserving selected order',()=>{
  const items=['a','b','c','d'].map(id=>({id,type:'image',x:0,y:0,w:10,h:10}));
  assert.deepEqual(M.reorder(items,['b'],'forward').map(x=>x.id),['a','c','b','d']);
  assert.deepEqual(M.reorder(items,['c'],'backward').map(x=>x.id),['a','c','b','d']);
  assert.deepEqual(M.reorder(items,['b','c'],'front').map(x=>x.id),['a','d','b','c']);
  assert.deepEqual(M.reorder(items,['b','c'],'back').map(x=>x.id),['b','c','a','d']);
});

test('snap move aligns matching edges and centers using screen-pixel tolerance',()=>{
  const items=[{id:'move',type:'image',x:10,y:20,w:100,h:80},{id:'fixed',type:'image',x:210,y:120,w:100,h:80}];
  const x=M.snapMove(items,['move'],198,0,600,400,1,10);assert.equal(x.dx,200);assert.deepEqual(x.guides,[{axis:'x',value:210}]);
  const differentSize=[items[0],{...items[1],y:60,h:200}];
  const center=M.snapMove(differentSize,['move'],0,82,600,400,.5,10);assert.equal(center.dy,100);assert.ok(center.guides.some(g=>g.axis==='y'&&g.value===160));
  const outside=M.snapMove(differentSize,['move'],0,82,600,400,2,10);assert.equal(outside.dy,82);
});

test('counter labels keep lowercase words and explicit integer starts',()=>{assert.equal(M.counterLabel(26,'letter'),'z');assert.equal(M.counterLabel(27,'letter'),'aa');assert.equal(M.counterValue('aa','letter'),27);assert.equal(M.counterValue('3'),3);assert.equal(M.counterValue('A','letter'),null);assert.equal(M.counterValue('0'),null)});

test('native export includes pasted-image density, margins, resized objects and base pixels',()=>{
 const scene={width:1000,height:600,base:{assetId:'base',x:0,y:0,w:800,h:600},items:[{id:'a',type:'image',assetId:'paste',x:800,y:0,w:200,h:150}]};
 const size=id=>id==='base'?{width:800,height:600}:{width:1600,height:1200};
 assert.deepEqual(M.nativeExportPlan(scene,size),{width:8000,height:4800,scale:8});
 const smaller=M.copy(scene);smaller.items[0].w=100;smaller.items[0].h=75;
 assert.equal(M.nativeExportPlan(smaller,size).scale,16);
 assert.deepEqual(M.nativeExportPlan({...scene,items:[]},size),{width:1000,height:600,scale:1});
 assert.throws(()=>M.nativeExportPlan(scene,()=>null));
});
test('ellipse and circle only hit their outline, not their blank interior',()=>{
 for(const type of ['circle','ellipse']){const i={type,x:100,y:100,w:200,h:100,width:4};assert.equal(M.hit(i,{x:200,y:150},6),false);assert.equal(M.hit(i,{x:200,y:100},6),true);assert.equal(M.hit(i,{x:200,y:85},6),false)}
});
