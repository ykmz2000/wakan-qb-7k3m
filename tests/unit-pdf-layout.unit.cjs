'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../unit-pdf-layout-v1.js');
const ctx={font:'',measureText(s){return{width:[...s].length*(this.font.startsWith('800')?11:10)}}};
test('whole sections move to a fresh page; every item stays inside A4',()=>{
  const groups=[{id:'stem',items:[{height:740}]},{id:'overview',items:[{height:35,keepNext:true},{height:260}]},{id:'choice-a',items:[{height:200}]}];
  const pages=L.paginate(groups);assert.equal(pages.length,2);assert.deepEqual(pages[0].items.map(i=>i.group),['stem']);assert.deepEqual(pages[1].items.map(i=>i.group),['overview','overview','choice-a']);
  for(const p of pages)for(const i of p.items)assert.ok(i.y>=L.PAGE.top&&i.y+i.height<=L.PAGE.bottom);
});
test('oversized section splits between whole images, keeping headings with content',()=>{
  const pages=L.paginate([{id:'overview',items:[{type:'heading',height:36,keepNext:true},{type:'image',height:700},{type:'image',height:700}]}]);
  assert.equal(pages.length,2);assert.deepEqual(pages[0].items.map(i=>i.type),['heading','image']);assert.equal(pages[1].items.length,1);
});
test('oversized prose remains complete and fits, with no orphan heading',()=>{
  const text='段落の途中もすべて保持します。'.repeat(1200);
  const atoms=L.textAtoms(ctx,text),pages=L.paginate([{id:'long',items:[L.heading(ctx,'問題文のポイント'),...atoms]}]);
  assert.ok(pages.length>1);assert.ok(pages[0].items.length>1);
  assert.equal(atoms.flatMap(a=>a.lines).flatMap(l=>l.runs).map(r=>r.char).join(''),text);
  pages.forEach(p=>p.items.forEach(i=>assert.ok(i.y+i.height<=L.PAGE.bottom)));
});
test('formatting preserves UTF-16 boundaries and bold affects measured wrapping',()=>{
  const text='😀金属異物 MRI',format={version:1,source_text:text,ranges:[{start:2,end:6,kind:'bold'},{start:2,end:6,kind:'underline'},{start:2,end:6,kind:'accent'}]};
  const runs=L.textLines(ctx,text,{format,width:44}).flatMap(l=>l.runs);
  assert.equal(runs.map(r=>r.char).join(''),text);assert.equal(runs.filter(r=>r.bold).map(r=>r.char).join(''),'金属異物');
  assert.equal(L.rangesFor(text,{...format,source_text:'outdated'}).length,0);
});
test('full explanations keep correction, choice and associated pictures in one group',()=>{
  const q={stem:'問題',answer_mode:'single',choices:[{id:'a',choice_key:'a',choice_text:'選択肢',is_correct:false,correction_text:'訂正語',explanation:'解説'}],explanation_overview:'ポイント'};
  const imgs=[{id:'img1',placement:'choice_explanation',choice_id:'a',image:{width:400,height:300},caption:'説明'}];
  const before=JSON.stringify(q),groups=L.buildGroups(ctx,q,imgs),choice=groups.find(g=>g.id==='choice-a');
  assert.ok(choice.items.some(i=>i.cells?.some(c=>c.imageId==='img1')));assert.equal(JSON.stringify(q),before);
  assert.ok(!L.buildGroups(ctx,q,[],'questions').some(g=>g.id==='answer'));assert.ok(!L.buildGroups(ctx,q,[],'answers').some(g=>g.id==='explanation_overview'));
  assert.throws(()=>L.buildGroups(ctx,q,[{...imgs[0],placement:'unknown'}]),/配置/);
});
test('each call for a new question starts a fresh page, including a short final section',()=>{
  const one=L.paginate([{id:'one',items:[{height:35}]}]),two=L.paginate([{id:'two',items:[{height:35}]}]);
  assert.equal(one.length+two.length,2);assert.equal(two[0].items[0].y,L.PAGE.top);
});
test('answer origins, text fallback and multiple blanks stay explicit',()=>{
  assert.match(L.answerText({answer_mode:'single',choices:[{choice_key:'a',is_correct:true}],question_occurrences:[{official_answer:['b']}]}),/管理者またはAI.*a\n\n配布された過去問.*b/);
  assert.equal(L.answerText({answer_mode:'fill_blank',answer_fields:['A','B'],source_answer:{A:'一',B:'二',IMAGE_REQUIRED:'yes'}}),'A → 一\nB → 二');
});

const picture=(id,width=900,height=1000,extra={})=>({id,placement:'explanation_overview',image:{width,height},caption:'画像の説明',...extra});
test('images use at most three columns and 50mm height, preserving order and aspect ratios',()=>{
  const images=[1,2,3,4,5,6,7].map(n=>picture(String(n)));
  const rows=L.buildGroups(ctx,{stem:'問題'},images).find(g=>g.id==='explanation_overview').items.filter(i=>i.type==='imageRow');
  assert.deepEqual(rows.map(r=>r.cells.length),[3,3,1]);assert.deepEqual(rows.flatMap(r=>r.cells.map(c=>c.imageId)),images.map(i=>i.id));
  rows.forEach(r=>{let right=L.PAGE.left;for(const c of r.cells){assert.ok(c.x>=right);right=c.x+c.width;assert.ok(right<=L.PAGE.width-L.PAGE.right);assert.ok(c.imageHeight<=L.PAGE.height*50/297);assert.ok(Math.abs(c.width/c.imageHeight-.9)<1e-8);assert.ok(c.width<230)}});
});
test('wide images occupy multiple columns without cropping, and choices remain separate',()=>{
  const images=[picture('a'),picture('wide',3600,1200),picture('b'),picture('choice',900,1000,{placement:'choice_explanation',choice_id:'c'})];
  const groups=L.buildGroups(ctx,{stem:'問題',choices:[{id:'c',choice_key:'a',choice_text:'選択肢'}]},images);
  const rows=groups.find(g=>g.id==='explanation_overview').items.filter(i=>i.type==='imageRow');
  assert.deepEqual(rows.map(r=>r.cells.map(c=>c.imageId)),[['a'],['wide'],['b']]);assert.equal(rows[1].cells[0].span,3);assert.ok(Math.abs(rows[1].cells[0].width/rows[1].cells[0].imageHeight-3)<1e-8);
  assert.equal(groups.find(g=>g.id==='choice-c').items.at(-1).cells[0].imageId,'choice');
});
test('image rows and their individual wrapped captions travel together across page breaks',()=>{
  const groups=L.buildGroups(ctx,{stem:'問題',explanation_overview:'ポイント'},Array.from({length:16},(_,n)=>picture(String(n),900,1000,{caption:'説明文を画像の下に配置します。'.repeat(2)})));
  const pages=L.paginate(groups),rows=pages.flatMap(p=>p.items).filter(i=>i.type==='imageRow');assert.ok(pages.length>1);
  assert.equal(rows.flatMap(r=>r.cells).length,16);
  rows.forEach(r=>{assert.ok(r.y+r.height<=L.PAGE.bottom);r.cells.forEach(c=>{assert.ok(r.height>=c.imageHeight+6+c.caption.length*20.8);c.caption.forEach(l=>assert.ok(l.runs.reduce((n,x)=>n+x.width,0)<=c.cellWidth))})});
});
