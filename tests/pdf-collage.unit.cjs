'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../pdf-collage-model-v1.js');

test('mixed row counts keep equal widths inside each row and top-align items',()=>{
  const rows=[[{aspect:1},{aspect:2}],[{aspect:.5},{aspect:1},{aspect:3}]],layout=M.calculate(rows,{mode:'fit',margin:18,gap:8});
  assert.equal(layout.placements.length,5);
  const first=layout.placements.filter(p=>p.row===0),second=layout.placements.filter(p=>p.row===1);
  assert.equal(first[0].width,first[1].width);assert.equal(second[0].width,second[1].width);assert.ok(first[0].width>second[0].width);
  assert.equal(first[0].top,first[1].top);assert.equal(second[0].top,second[2].top);
  assert.ok(first[0].height>first[1].height);assert.ok(second[0].height>second[2].height);
});

test('empty cells remain valid while only populated cells are drawn',()=>{
  const marker={aspect:4/3},layout=M.calculate([[marker,null],[null,null,marker]],{mode:'fit'});
  assert.equal(layout.placements.length,2);assert.deepEqual(layout.placements.map(p=>[p.row,p.column]),[[0,0],[1,2]]);assert.ok(layout.height>0);
});

test('content-fit grows vertically and A4 modes stay fixed',()=>{
  const rows=[[{aspect:.5},{aspect:.5}],[{aspect:.5},{aspect:.5}]],fit=M.calculate(rows,{mode:'fit'}),portrait=M.calculate(rows,{mode:'portrait'}),landscape=M.calculate(rows,{mode:'landscape'});
  assert.equal(fit.width,595.28);assert.ok(fit.height>841.89);assert.deepEqual([portrait.width,portrait.height],M.A4.portrait);assert.deepEqual([landscape.width,landscape.height],M.A4.landscape);assert.ok(portrait.scale<1);assert.ok(landscape.scale<1);
});

test('layout is bounded for extreme source ratios',()=>{
  const rows=Array.from({length:6},()=>Array.from({length:4},()=>({aspect:.001}))),layout=M.calculate(rows,{mode:'fit'});
  assert.ok(layout.height<=5000);assert.ok(layout.scale<1);for(const p of layout.placements){assert.ok(p.x>=0);assert.ok(p.y>=layout.margin-1e-6);assert.ok(p.y+p.height<=layout.height-layout.margin+1e-6);assert.ok(p.x+p.width<=layout.width)}
});

test('PDF coordinates place the first row at the top of the page instead of below it',()=>{
  const layout=M.calculate([[{aspect:.8},{aspect:.7}]],{mode:'fit',margin:20,gap:8});
  assert.equal(layout.placements[0].y,layout.placements[0].top-layout.placements[0].height);
  assert.equal(layout.placements[1].y,layout.placements[1].top-layout.placements[1].height);
  assert.ok(layout.placements.every(p=>p.y>=20&&p.y+p.height<=layout.height-20));
});

test('a PDF path overrides an incorrect storage MIME type',()=>{
  assert.equal(M.mediaType({type:'text/plain'},'recent/uploaded.PDF'),'application/pdf');
  assert.equal(M.mediaType({type:'application/octet-stream'},'recent/image.png'),'image/png');
  assert.equal(M.mediaType({type:'application/octet-stream'},'recent/photo.avif'),'image/avif');
  assert.equal(M.mediaType({type:'application/octet-stream'},'recent/scan.tiff'),'image/tiff');
});

test('free layouts preserve up to twenty independently configured rows',()=>{
  const rows=Array.from({length:12},(_,index)=>Array((index%4)+1).fill(null));
  assert.deepEqual(M.normalizeRows(rows).map(row=>row.length),rows.map(row=>row.length));
});

test('column layout supports one tall item beside two stacked wide items',()=>{
  const tall={aspect:.65},wideTop={aspect:1.5},wideBottom={aspect:1.6};
  const layout=M.calculate([[tall],[wideTop,wideBottom]],{axis:'columns',mode:'fit',margin:16,gap:8});
  const [left,topRight,bottomRight]=layout.placements;
  assert.equal(layout.axis,'columns');
  assert.equal(left.column,0);assert.equal(topRight.column,1);assert.equal(bottomRight.column,1);
  assert.equal(topRight.x,bottomRight.x);assert.equal(left.top,topRight.top);
  assert.ok(bottomRight.y<topRight.y);assert.ok(left.height>topRight.height);
  for(const placement of layout.placements){assert.ok(placement.x>=0);assert.ok(placement.y>=0);assert.ok(placement.x+placement.width<=layout.width+.001);assert.ok(placement.y+placement.height<=layout.height+.001)}
});
