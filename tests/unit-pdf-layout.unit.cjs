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
  assert.ok(choice.items.some(i=>i.imageId==='img1'));assert.equal(JSON.stringify(q),before);
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
